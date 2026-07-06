# Valiant Movement — Database Architecture

A blueprint for the platform's data layer. It's built to scale to millions of
NIN-verified members and to carry three product surfaces on one identity:

- **Feed** (X-style posts / reposts / likes)
- **Chat** (WhatsApp-style 1:1 and group messaging)
- **Communities** (Facebook-style groups, organized down to polling-unit level)

> **Recommended stack:** PostgreSQL 16 as the system of record, Redis for
> presence/sessions, and an object store (S3-compatible) for media. The schema
> below is normalized 3NF with deliberate denormalized counters for hot reads.

---

## 1. Identity & verification

The cornerstone is **NIN verification**. A member enters their NIN at sign-up;
a background **Listener Agent** (see §6) calls the NIMC API, pulls the verified
record, and syncs it into our store. Until the NIMC API is provisioned, the NIN
field is captured but `verification_status = 'pending'`.

```sql
-- A user account (auth identity)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  phone           VARCHAR(20) UNIQUE,
  password_hash   TEXT NOT NULL,                 -- argon2id
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'pending'  -- pending | active | suspended | banned
                  CHECK (status IN ('pending','active','suspended','banned')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NIN identity, kept in its own table (sensitive, encrypted at rest)
CREATE TABLE identities (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  nin_hash             BYTEA UNIQUE,             -- hash of NIN (never store raw NIN in plaintext)
  nin_ciphertext       BYTEA,                    -- envelope-encrypted NIN (KMS)
  verification_status  TEXT NOT NULL DEFAULT 'pending'
                       CHECK (verification_status IN ('pending','verified','failed','manual')),
  verified_at          TIMESTAMPTZ,
  -- fields synced from NIMC once verified:
  legal_first_name     TEXT,
  legal_last_name      TEXT,
  date_of_birth        DATE,
  gender               TEXT,
  source               TEXT DEFAULT 'manual'     -- manual | nimc_sync
);

-- Public-facing profile
CREATE TABLE profiles (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name      TEXT NOT NULL,
  username       CITEXT UNIQUE,
  avatar_url     TEXT,
  bio            TEXT,
  polling_unit_id UUID REFERENCES polling_units(id),  -- denormalized "home"
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Email verification (post sign-up)

```sql
CREATE TABLE email_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  BYTEA NOT NULL,           -- store hash, email the raw token
  expires_at  TIMESTAMPTZ NOT NULL,     -- e.g. now() + interval '24 hours'
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON email_verifications (user_id) WHERE consumed_at IS NULL;
```

---

## 2. Geo hierarchy (State → LGA → Ward → Polling Unit)

This is reference data shared across registration, communities, and analytics.
It mirrors the official INEC/NIMC administrative tree. Each level references its
parent so the cascading registration form is a simple keyed lookup.

```sql
CREATE TABLE states (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL UNIQUE,
  capital   TEXT,
  zone      TEXT          -- geopolitical zone
);

CREATE TABLE lgas (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id  UUID NOT NULL REFERENCES states(id),
  name      TEXT NOT NULL,
  UNIQUE (state_id, name)
);

CREATE TABLE wards (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id    UUID NOT NULL REFERENCES lgas(id),
  name      TEXT NOT NULL,
  code      TEXT,
  UNIQUE (lga_id, name)
);

CREATE TABLE polling_units (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id   UUID NOT NULL REFERENCES wards(id),
  name      TEXT NOT NULL,
  code      TEXT,         -- INEC PU code
  UNIQUE (ward_id, code)
);

CREATE INDEX ON lgas (state_id);
CREATE INDEX ON wards (lga_id);
CREATE INDEX ON polling_units (ward_id);
```

> The frontend currently reads this tree from `src/data/nigeria.ts` (states +
> LGAs are real; wards/PUs are generated). Swap that module for an API backed by
> these tables once the INEC dataset is loaded — the cascading UI is unchanged.

---

## 3. Communities (Facebook-style)

```sql
CREATE TABLE communities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          CITEXT UNIQUE NOT NULL,
  description   TEXT,
  scope         TEXT NOT NULL,   -- national | state | lga | ward | polling_unit | interest
  scope_ref_id  UUID,            -- points at states/lgas/wards/polling_units when geo-scoped
  visibility    TEXT NOT NULL DEFAULT 'public'
                CHECK (visibility IN ('public','private','secret')),
  member_count  INTEGER NOT NULL DEFAULT 0,   -- denormalized counter
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE community_members (
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member'  -- owner | admin | moderator | member
                CHECK (role IN ('owner','admin','moderator','member')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX ON community_members (user_id);
```

---

## 4. Feed (X-style posts)

```sql
CREATE TABLE posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id  UUID REFERENCES communities(id),  -- null = global timeline
  parent_id     UUID REFERENCES posts(id),        -- reply threading
  body          TEXT,
  media         JSONB DEFAULT '[]',
  like_count    INTEGER NOT NULL DEFAULT 0,        -- denormalized
  reply_count   INTEGER NOT NULL DEFAULT 0,
  repost_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON posts (author_id, created_at DESC);
CREATE INDEX ON posts (community_id, created_at DESC);

CREATE TABLE post_reactions (
  post_id   UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type      TEXT NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, type)
);

-- Social graph
CREATE TABLE follows (
  follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
```

---

## 5. Chat (WhatsApp-style)

```sql
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL DEFAULT 'direct'  -- direct | group
              CHECK (type IN ('direct','group')),
  title       TEXT,                            -- for groups
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  body            TEXT,
  media           JSONB,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON messages (conversation_id, created_at DESC);
```

---

## 6. NIN Listener Agent (sync pipeline)

The flow the user described: **NIN entered → NIMC lookup → details synced into
our DB**, run asynchronously so registration never blocks on a slow external API.

```
  Register form ──▶ users + identities(status='pending')
                         │
                         ▼  (enqueue job)
                 nin_sync_jobs (queue)
                         │
                         ▼
              ┌──────────────────────┐
              │   Listener Agent      │  worker process / cron
              │  - reads pending jobs │
              │  - calls NIMC API     │
              │  - maps response      │
              │  - writes identities  │
              └──────────────────────┘
                         │
            success ─────┴───── failure
              ▼                    ▼
   identities.verification     retry w/ backoff,
   _status='verified',         then 'manual' review
   profile fields synced
```

```sql
CREATE TABLE nin_sync_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'queued'   -- queued | running | done | failed
                CHECK (status IN ('queued','running','done','failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX ON nin_sync_jobs (status, scheduled_at);

-- Immutable audit trail of every NIMC interaction (compliance)
CREATE TABLE nin_verification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  request_ref TEXT,
  result      TEXT,            -- verified | mismatch | not_found | error
  raw_meta    JSONB,           -- redacted NIMC response metadata (no raw PII)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Security notes**
- Never store the raw NIN in plaintext. Persist a keyed hash for uniqueness and
  an envelope-encrypted ciphertext (KMS-managed DEK) for the value.
- The Listener Agent runs with a least-privilege service role scoped to the NIMC
  integration; PII access is logged in `nin_verification_log`.
- Rate-limit and circuit-break the NIMC calls; degrade to `manual` review on
  repeated failure rather than blocking registration.

---

## 7. Registration → first login (end-to-end)

1. User submits the register form (NIN captured, identity, **State → LGA → Ward →
   Polling Unit**, password).
2. API creates `users` (status `pending`), `profiles`, `identities`
   (`verification_status='pending'`), and an `email_verifications` token.
3. A verification email is sent; in parallel a `nin_sync_jobs` row is enqueued.
4. User clicks the email link → `users.email_verified=true`, `status='active'`.
5. Listener Agent verifies the NIN out-of-band and flips
   `identities.verification_status='verified'`, syncing legal name / DOB.
6. User is auto-joined to their polling-unit / ward / LGA / state communities.

---

## 8. Scaling to 200M+ users

Nigeria has ~220M people; the schema is built so nothing has to be redesigned
on the way there. The principles below are already implemented in
`src/db/schema.ts`; the roadmap items are staged so each is adopted only when
its trigger is hit.

### 8.1 Already implemented (day one)

**Time-ordered primary keys (UUIDv7).** All PKs are UUIDv7, generated app-side
(`src/db/id.ts`), with `gen_random_uuid()` kept as the DB-side fallback.
Random v4 UUIDs scatter inserts across the whole B-tree — at hundreds of
millions of rows every insert dirties a random index page (write
amplification, buffer-cache misses, WAL bloat). v7 keys are
millisecond-prefixed, so inserts append at the right edge like a `bigserial`
while staying globally unique and unguessable.

**Keyset pagination, never OFFSET.** `OFFSET n` reads and discards `n` rows;
at feed scale that's a table scan per page. Hot list indexes end in
`(created_at DESC, id DESC)` so queries paginate with
`WHERE (created_at, id) < ($cursor_ts, $cursor_id) ORDER BY created_at DESC, id DESC LIMIT 50`
— constant-time regardless of depth. UUIDv7 ids make the tiebreaker
time-consistent.

**Both directions of every relationship are indexed.** Composite PKs only
serve one lookup direction; the reverse lookups each have a dedicated index:
`follows (followee_id)` (follower lists), `conversation_members (user_id)`
("my chats"), `post_reactions (user_id)` ("posts I liked"),
`posts (parent_id) WHERE parent_id IS NOT NULL` (reply threads),
`profiles (state_id)` / `(lga_id)` (geo rollups),
`communities (scope, scope_ref_id)` (geo auto-join).

**Ephemeral data can be purged without scans.** `sessions (expires_at)`,
`email_verifications (expires_at)` and `call_signals (updated_at)` are indexed
so sweeper jobs delete in small indexed batches
(`DELETE ... WHERE expires_at < now() LIMIT 10_000` in a loop). Run sweepers
from a cron (Vercel Cron / worker), never inline in requests.

**Partial indexes for hot subsets.** Live email tokens
(`WHERE consumed_at IS NULL`) and reply posts (`WHERE parent_id IS NOT NULL`)
are indexed as partial indexes — the index stays small no matter how large the
table grows.

**Integrity is enforced in the database, not just the app:**
`follows_no_self` CHECK, `polling_units UNIQUE (ward_id, code)`, and a real FK
on `posts.parent_id` (cascade delete of reply subtrees).

### 8.2 Connections (critical on serverless)

Serverless functions fan out to thousands of concurrent instances; raw
Postgres caps out at a few hundred connections. The app uses the **Neon HTTP
driver** (`drizzle-orm/neon-http`) — each query is a stateless HTTP request
through Neon's proxy, so there is no connection pool to exhaust. Rules:

- Multi-statement atomic writes use `db.batch([...])` (single HTTP round-trip,
  atomic on the server).
- If a TCP/session driver is ever introduced (e.g. `pg` for a long-lived
  worker like the NIN Listener), it must use the **pooled** connection string
  (`...-pooler.neon.tech`) — PgBouncer in transaction mode.
- Set `statement_timeout` (e.g. 10s) and `idle_in_transaction_session_timeout`
  on the app role so one bad query can't pile up.

### 8.3 Denormalized counters — staged plan

`like_count` / `reply_count` / `member_count` are updated inline today, which
is correct and fine to ~1M users. A viral post turns its counter row into a
lock hotspot. Triggers, in order of adoption:

1. **Now → first hotspots:** keep inline `UPDATE ... SET x = x + 1`; it's a
   single-row atomic increment, no read-modify-write races.
2. **Hotspot stage:** buffer increments in Redis
   (`INCR post:{id}:likes`), flush to Postgres every few seconds from a
   worker. Reads take counts from Redis with Postgres as fallback.
3. **Full scale:** counters become materialized aggregates recomputed from the
   reaction/member tables by scheduled jobs; the columns become caches with a
   staleness budget instead of sources of truth.

### 8.4 Table growth — partitioning roadmap

Row-count triggers, not calendar dates. Postgres handles single tables into
the low billions of rows when indexes fit access patterns; partition when the
table's *maintenance* (vacuum, index rebuilds) hurts, not before.

| Table | Expected shape at 200M users | Plan when >~500M rows |
|---|---|---|
| `messages` | largest table by far | range-partition by `created_at` (monthly). Old partitions are cold — detach + archive to object storage |
| `posts` | second largest | range-partition by `created_at`; feed queries always carry a time cursor so partition pruning applies |
| `post_reactions` | wide but shallow rows | hash-partition by `post_id` |
| `sessions`, `email_verifications`, `call_signals` | steady-state small | never — sweepers keep them bounded |
| `users`, `identities`, `profiles` | capped at ~220M rows | no partitioning needed; single-row PK lookups stay O(log n) |

Partition DDL is raw SQL (Drizzle doesn't model partitioned tables) — when the
trigger hits, the table is recreated as partitioned in a custom migration and
the schema file is unchanged from the app's point of view.

### 8.5 Read path & caching

- **Read replicas** (Neon read replicas / standby Postgres): route feed reads,
  profile views, and community listings to replicas; only auth and writes hit
  the primary. Tolerate ~100ms replica lag everywhere except session checks.
- **Redis** in front of Postgres for: sessions (token → user, TTL = session
  expiry), presence/typing, rate-limit counters, and the hot-counter buffer
  from §8.3.
- **Fan-out on read** for the home feed (query followees' recent posts via
  `posts_author_idx`) until follower graphs get heavy; move top accounts to
  fan-out-on-write (precomputed timeline lists in Redis) only when p99 feed
  latency demands it.
- **Media never touches Postgres** — object storage + CDN; the DB stores URLs
  and metadata (already the case: `media JSONB`).

### 8.6 Operational guardrails

- Migrations that add indexes to big tables must use
  `CREATE INDEX CONCURRENTLY` (hand-edit the generated migration; it takes no
  write lock).
- Autovacuum: lower `autovacuum_vacuum_scale_factor` (e.g. 0.02) on
  `messages`, `posts`, `sessions` once they're large — the default 20%
  threshold means millions of dead tuples between vacuums.
- Every list endpoint takes a cursor + bounded `LIMIT` (≤100) at the API
  layer; no unbounded reads.
- `pg_stat_statements` on from day one; alert on any query whose mean time
  crosses 50ms.
