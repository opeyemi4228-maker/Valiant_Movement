# The Valiant Movement — Project Overview

**A NIN-verified civic membership platform for Nigeria.**
*Courage to Lead.* 🦅

This document describes what the project is, how it's built, and — in detail —
what actually works today versus what is still illustrative/mock data. It
supersedes earlier progress snapshots; treat this as the current source of
truth for "what is this app."

---

## 1. The idea

Valiant Movement is a membership platform for a Nigerian civic/political
movement, built around one principle: **one verified identity, organized by
real geography, carrying every product surface a movement needs** — social
feed, messaging, calls, communities, and a personal wallet — instead of
scattering members across WhatsApp groups, a separate donation page, and a
spreadsheet of dues.

The organizing idea is the **Nigerian administrative hierarchy**:

```
State → LGA (Local Government Area) → Ward → Polling Unit
```

Every member registers with a National Identification Number (NIN) and a
home address down to polling-unit level. That placement is not just profile
metadata — it automatically:

- drops the member into four nested communities (their State chapter, their
  LGA group, their Ward group, their Polling Unit group), each with its own
  group chat;
- scopes a coordinator's admin dashboard to exactly the jurisdiction they
  lead (a Ward Captain sees their ward; an LGA Coordinator sees every ward
  under their LGA; and so on up to National);
- re-places the member automatically if they update their address later
  (they leave the old geo groups and join the new ones, with no admin
  action needed).

On top of that placement sits a real-time social layer (feed, stories,
1:1 and group chat, voice/video calls, group "huddles") and a real financial
layer (a wallet with actual Naira deposits/withdrawals via a payment gateway,
and monthly membership dues collected automatically from that wallet).

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions, Turbopack) |
| Language | TypeScript, strict |
| Database | PostgreSQL via [Neon](https://neon.tech) (serverless, HTTP driver) |
| ORM | Drizzle ORM (`drizzle-orm/neon-http`) |
| Styling | Tailwind CSS v4 |
| Auth | Custom email/password + hashed session tokens (no third-party auth provider) |
| Payments | [Monnify](https://monnify.com) (Nigerian NGN payment gateway) |
| Calls | WebRTC (peer-to-peer for 1:1; a signaling mesh for group huddles), STUN/TURN |
| Email | [Resend](https://resend.com) |
| Icons | Lucide, Carbon, React Icons |

**No database required to try it.** If `DATABASE_URL` isn't set, the entire
member-facing app runs on an in-memory demo backend (`src/lib/demo-store.ts`)
seeded with two demo members — real-time chat, feed, and calls all work
between two browser sessions on the same dev server. This is a deliberate
design: **every server action checks `usesDb(id)` and routes between Postgres
and the demo store per-request**, so the demo and the real backend are
never mixed for the same user.

---

## 3. Identity model

One `users` row per member (email + hashed password), with:

- **`identities`** — the NIN, stored as a keyed hash (`nin_hash`) plus an
  envelope-encryption slot for the ciphertext; the raw NIN is never stored in
  plaintext. `verification_status` tracks pending/verified/failed/manual, fed
  by a **Listener Agent** pattern: a `nin_sync_jobs` queue plus a
  `nin_verification_log` audit trail, designed for a background worker to
  call the NIMC verification API once that integration exists (currently the
  job is enqueued at registration but not yet consumed — see §8).
- **`profiles`** — display identity (name, username, avatar, cover, bio) plus
  the geo placement (`state_id`, `lga_id` as real foreign keys; `ward` and
  `polling_unit` as text, pending the official INEC ward/PU dataset).
- **`sessions`** — hashed session tokens (30-day expiry), looked up on every
  request; a short in-process cache (a few seconds) dedupes the burst of
  session checks that fire when a dashboard tab mounts, so a single page load
  doesn't pay for the same auth query five times over.

Registration collects: full name, email, phone, password, NIN, and a
cascading State → LGA → Ward → Polling Unit picker. On submit, the member is
created **active immediately** (email verification and NIN verification both
run in the background rather than gating first use — a deliberate
launch-phase choice, reversible once both external integrations are live),
auto-joined to their four geo communities, and signed in.

Admins (National/State/LGA/Ward coordinators) sign in through the **same
login form** — the email is checked against a hardcoded admin-role table
(`src/lib/admin-auth.ts`) before falling through to the member database, and
routes to a separately scoped `/admin` dashboard.

---

## 4. Feature inventory

Each feature below is marked:

- 🟢 **Real** — backed by Postgres, works for actual members, persists.
- 🟡 **Real, needs config** — the code path is real; it needs an external
  service's API keys to be fully live (currently the Finance/wallet
  payment gateway).
- ⚪ **Demo/mock** — illustrative UI over static or generated data; not wired
  to real records yet.

### 4.1 Feed & Stories 🟢

- Text + photo posts, persisted in Postgres (`posts` table) — **posts no
  longer disappear on server restart**, which was a real bug fixed this
  cycle (the feed previously lived only in server memory).
- Likes, reposts, bookmarks, and threaded comments, each with live
  notifications to the post's author.
- **Stories** — 24-hour status posts (photo + caption), auto-expired and
  swept from the database after 24 hours, shown in a stories rail with your
  own story leading.
- Clicking a post opens a **focused single-post view** (just that post and
  its comment thread), rather than mixing it into the scrolling feed.
- Skeleton loading state on first paint instead of a bare "Loading…" string.
- A "new post" notification fans out to other members when someone posts.

### 4.2 Communities 🟢

- Every member is automatically placed in **State → LGA → Ward → Polling
  Unit** communities based on their registration address (`src/lib/communities.ts`).
- Communities are deterministic by slug (idempotent to create/join), with a
  live `member_count`.
- Each community has a **WhatsApp-style group chat** — same composer, same
  attachments/voice notes, same read receipts as 1:1 messaging (they share
  a component library, `chat-shared.tsx`, so a feature added to one lands in
  both).
- A "member joined" system message appears in the group thread exactly once
  per member (idempotent even under concurrent joins).
- **Group voice/video calls ("huddles")** — any member can start a huddle
  from a community's chat; every other member gets notified and a live
  "N in the room — Join" banner appears in the thread. Calling in a
  community rings/joins the *whole community*, distinct from 1:1 calls.
  Media flows over a signaling mesh (one WebRTC connection per participant
  pair — see §4.4).
- If a member's registered address changes, they are automatically removed
  from communities that no longer match and joined to the new ones.

### 4.3 Messaging 🟢

- Real member-to-member direct messages, persisted in Postgres, polling for
  near-real-time delivery (~2.5s).
- Emoji picker, photo/file attachments (≤5MB, stored as data URLs), and
  **recorded voice notes** — the full Composer is shared between 1:1 chat
  and community group chat.
- Read receipts (single tick = sent, double tick = delivered, blue double
  tick = the other member has actually opened the thread).
- A member picker to start new conversations, with each member's real
  avatar/name.
- Reporting a member for moderation is available from any 1:1 thread
  (harassment, spam, impersonation, hate, violence, other), stored in a
  `member_reports` table for admin review, with a partial-unique constraint
  so a member can't spam-report the same person twice while a report is open.
- A lightweight moderation scanner flags concerning language and alerts the
  sender's Ward Captain/LGA Coordinator automatically (message still
  delivered).

### 4.4 Calls 🟢

- **1:1 voice/video calls** between members over real WebRTC (camera +
  microphone), with actual ringing (an incoming-call screen with
  accept/decline, ringtone), reconnection handling if the network drops
  mid-call, and screen sharing.
- **Group huddles** inside a community — a mesh topology (every participant
  connects directly to every other participant; the lower of the two user
  IDs in a pair is always the offer side, so roles never need negotiating,
  and late joiners connect to everyone already in the room).
- Calls that end are reflected on **both sides immediately** — if one member
  hangs up, the other side's screen closes automatically within a couple of
  seconds instead of hanging in a dead call.
- Every call that reaches a terminal state (missed, declined, completed) is
  logged as a message in the relevant chat thread — a missed call shows up
  exactly like a missed WhatsApp call, with duration for completed calls and
  a one-tap "call back."
- Optional in-call recording (only for meetings/huddles) and live
  speech-to-text transcription, saved as a downloadable text file.

### 4.5 Notifications 🟢

A unified notification center (`notifications` table) covers:

- Social: likes, comments, reposts, new posts, community joins.
- Messages: an unread-message alert (throttled to one per sender per 10
  minutes so a burst of messages doesn't spam the bell).
- Calls: incoming and missed-call alerts.
- **Finance**: deposit and withdrawal confirmations, fired only from
  server-verified events (never from a client's claim that a payment
  succeeded).
- **Membership dues**: reminders at 5, 4, 3, 2, and 1 day(s) before the
  monthly due date, then either a "dues deducted" confirmation or an
  "insufficient funds — deposit now" prompt on the due date itself.

### 4.6 Finance / Wallet 🟡 — real, needs Monnify keys to fully activate

This is the most substantial system added this cycle, and the one place in
the app where real money moves. It replaces what was previously 100%
client-side mock state (a `useState` balance and a hardcoded transaction
list that reset on every page refresh) with a genuine ledger.

**Why not Exness?** Exness is a forex/CFD trading broker for personal
trading accounts — it has no merchant API for collecting deposits or paying
out withdrawals on a website, so it cannot serve this purpose. The wallet
integrates with **[Monnify](https://monnify.com)**, a Nigerian payment
gateway built for exactly this (NGN deposits via card/bank transfer/USSD,
and bank-transfer withdrawals), with sandbox credentials that are free and
instant to obtain, and a switch to production that's a config change, not a
code change.

**The ledger** (`wallets` + `payments` tables, `src/lib/wallet-db.ts`):

- `wallets.balance` is a materialized running total per member (O(1) balance
  reads), the same pattern already used elsewhere in the schema
  (`communities.member_count`, `posts.like_count`).
- `payments` is an append-only audit trail of every naira that moves:
  deposits, withdrawals, monthly dues, and adjustments — each with a status
  (`pending` → `completed`/`failed`/`reversed`), our own idempotency
  reference, and the gateway's transaction reference.
- Every balance change is built from individually atomic, race-free SQL
  statements (a single conditional `UPDATE ... WHERE balance >= amount`),
  ordered so that a crash mid-operation can never silently lose track of
  money — worst case is a `pending` row a reconciliation pass can resolve,
  never a debit with no explanation or a duplicate credit.
- **Deposits**: a pending ledger row is created before the payment gateway
  is ever contacted; the deposit is only ever credited from a
  server-verified source — Monnify's webhook, or a status check when the
  member returns from checkout — never from anything the client claims.
  Both paths share one idempotent `finalizeDeposit` function, so whichever
  arrives first wins and the other is a safe no-op (verified live: a
  duplicate "webhook delivery" credits exactly once).
- **Withdrawals**: the amount is reserved (debited) the instant a withdrawal
  request is created — so the same funds can never be withdrawn twice in
  parallel — then either confirmed or refunded if the transfer ultimately
  fails. The destination bank account is resolved and its registered name
  shown to the member *before* they can submit, so a mistyped account
  number is caught up front rather than sending money to the wrong person.
- **Monthly dues** (₦5,000/month, 28th of the month): deducted directly from
  the ledger, made idempotent per calendar month via a unique reference
  (`dues_<userId>_<yyyy-mm>`) — a database constraint, not a promise the
  code keeps to itself.
- All of the above is verified end-to-end against the live database:
  exactly-once deposit crediting under duplicate webhooks, exactly-once
  refund under duplicate failure notifications, an oversized withdrawal
  rejected with zero balance impact, and dues correctly rejected (never
  going negative) when the wallet can't cover them.

**What needs to happen to go fully live:** add three Monnify environment
variables (API key, secret key, contract code — see `.env.example`) to turn
on deposits, and a fourth (the disbursement account) to turn on automated
withdrawals. Monnify also gates payouts behind 2FA by default; fully
automated instant withdrawals (as configured here, per an explicit product
decision) require asking Monnify support to disable 2FA on the disbursement
wallet, otherwise transfers will sit waiting for manual OTP approval.
Without any keys configured, the Finance dashboard still shows real
balance/history — it just disables the Deposit/Withdraw buttons with a
clear "not connected yet" message instead of faking a payment flow.

The dashboard also carries a "Causes you can back" campaigns section,
explicitly labeled **Preview** — illustrative fundraising-campaign data, not
wired to the wallet (a natural next feature on top of the same payment
rails, not yet built).

### 4.7 Profile 🟢

- A digital membership ID card (member code, ward, NIN-verified badge).
- Editable name, username, bio, avatar, and cover photo — changes propagate
  everywhere immediately (chat, feed authorship, the sidebar) since every
  surface reads the same `profiles` row rather than caching a stale copy.
- Editing your State/LGA/Ward/Polling Unit here triggers the same automatic
  community re-placement described in §4.2.
- Real post history, community memberships, and impact stats (computed from
  the actual feed/ledger, not hardcoded numbers).

### 4.8 Valiant AI assistant ⚪ demo

A voice-and-text assistant available app-wide (`src/components/ai/`). It is
a **scripted response engine** (`replies.ts` matches quick prompts and
keywords to canned, on-brand answers), not a live LLM API integration. Voice
input/output uses the browser's native Web Speech API (speech-to-text and
text-to-speech), including an optional "Hey Valiant AI" wake-word listener.
Genuinely useful as a guided FAQ/demo experience; would need to be pointed
at a real LLM API to handle open-ended questions.

### 4.9 Admin / Super Admin dashboards ⚪ demo

`src/components/admin/` (Dashboard Overview, Finance Module, Meetings
Manager, Members Database, Community management) is a fully designed
coordinator-facing UI — treasury overview with cashflow charts, a member
directory, meeting scheduling, community moderation — but it currently runs
entirely on **static mock data** (`src/data/finance.ts`, `mock-members.ts`,
`meetings.ts`, etc.), not live queries against the real `users`/`payments`
tables the member side now writes to. The role-scoping concept (a Ward
Captain sees only their ward; an LGA Coordinator sees every ward in their
LGA) is designed into the mock data's shape but not yet enforced against
real jurisdiction data. This is the largest remaining gap between "what the
admin side shows" and "what's actually happening on the member side" —
wiring it to real data is the natural next major milestone.

### 4.10 Geo data 🟢 (partially real)

All 37 Nigerian states (36 + FCT) and 774 LGAs are the real official list,
seeded into Postgres (`npm run db:seed`). Wards and polling units are
**deterministically generated** (stable per state/LGA/ward, so the same
address always produces the same options) as a placeholder for the official
INEC ward/polling-unit dataset — swapping in the real dataset later requires
no UI change, just replacing `getWards`/`getPollingUnits` in
`src/data/nigeria.ts` with real lookups.

---

## 5. What's real vs. mock — quick reference

| Area | Status |
|---|---|
| Feed, stories, likes/reposts/bookmarks/comments | 🟢 Real (Postgres) |
| Communities + geo auto-placement | 🟢 Real (Postgres) |
| 1:1 chat + community group chat | 🟢 Real (Postgres) |
| Voice/video calls (1:1) + group huddles | 🟢 Real (WebRTC + Postgres signaling) |
| Notifications (social, message, call, finance, dues) | 🟢 Real (Postgres) |
| Wallet ledger (balance, transaction history) | 🟢 Real (Postgres) |
| Wallet deposits/withdrawals (Monnify) | 🟡 Real code, needs API keys configured |
| Monthly dues deduction | 🟢 Real (Postgres) |
| Member reports / moderation queue | 🟢 Real (Postgres) |
| Profile | 🟢 Real (Postgres) |
| States + LGAs | 🟢 Real data |
| Wards + polling units | ⚪ Generated placeholder (stable, not the official INEC list) |
| NIN verification (NIMC lookup) | ⚪ Queued but not consumed — no live NIMC integration yet |
| Email verification | 🟡 Real code (Resend), doesn't yet gate first login |
| Valiant AI assistant | ⚪ Scripted responses, not a live LLM |
| Admin/Super Admin dashboards | ⚪ Fully designed, mock data throughout |
| Campaign giving ("Causes you can back") | ⚪ Preview UI, not wired to the wallet |
 
---

## 6. Architecture notes worth knowing

- **Demo store vs. Postgres, per request.** `usesDb(id)` checks both that a
  database is configured *and* that the id in hand is a real UUID (demo
  accounts use readable slugs like `m_amara`) — this is what lets a demo
  session and a real registered account coexist safely without a demo id
  ever reaching a `uuid` column.
- **Everything polls, nothing pushes (yet).** Real-time-feeling updates
  (feed, chat, presence, calls) are short-interval polling (2–2.5s for most
  surfaces, faster for active call signaling), not websockets/SSE. This
  keeps the whole stack serverless-friendly (Neon HTTP driver, Vercel-style
  functions) at the cost of some latency versus a push-based system — a
  reasonable trade for the current scale, worth revisiting if usage grows
  enough that polling volume becomes the bottleneck.
- **UUIDv7 primary keys**, generated app-side, so inserts append to the
  right edge of every index instead of scattering — deliberate for
  eventual scale, not just today's needs.
- **Session lookups are cached briefly in-process** (a few seconds) because
  a single dashboard tab mount fires several server actions at once, each
  of which used to independently re-run the same auth query.
- **Every list endpoint is meant to be cursor/limit-bounded**, not an
  unbounded `SELECT *` — a discipline applied consistently as new tables
  were added.

---

## 7. Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL at minimum
npm run db:migrate
npm run db:seed              # loads real Nigerian states + LGAs
npm run dev
```

Without `DATABASE_URL` set, the app still runs fully on the in-memory demo
backend — useful for trying the social/chat/call features without any setup.
See `.env.example` for every optional integration (Resend for email, TURN
servers for calls across restrictive networks, Monnify for the wallet).

---

## 8. Honest list of what's not built yet

- NIN verification against the real NIMC API (the job queue and audit
  trail exist; nothing consumes the queue yet — this needs an actual NIMC
  API relationship, which is outside what code alone can provide).
- The official INEC ward/polling-unit dataset (currently generated).
- Admin dashboards wired to real data instead of mock data.
- A live LLM behind the Valiant AI assistant.
- Campaign/cause donations wired to the real wallet ledger.
- True multi-party (not mesh-limited) group video at large participant
  counts — the huddle mesh works well for small-to-medium rooms; a very
  large simultaneous video call would want an SFU (selective forwarding
  unit) instead of a full mesh.
- A push-based real-time transport (websockets/SSE) in place of polling,
  if usage ever makes polling volume a real cost.
