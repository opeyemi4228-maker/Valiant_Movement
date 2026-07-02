# Valiant Movement — Backend Setup

Stack: **Next.js 16** (Server Actions + Route Handlers) · **Neon** (PostgreSQL) ·
**Drizzle ORM** · **Resend** (email) · scrypt password hashing · DB-backed
sessions. The full schema is documented in [DATABASE.md](./DATABASE.md).

## 1. Create the services

1. **Neon** — create a project at <https://neon.tech>, copy the **pooled**
   connection string (ends in `-pooler...`, include `?sslmode=require`).
2. **Resend** — create an API key at <https://resend.com/api-keys>. For real
   sending, verify your domain and set `EMAIL_FROM` to an address on it. For
   quick local testing you can leave the default `onboarding@resend.dev`.

## 2. Configure environment

Copy the example and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `RESEND_API_KEY` | Resend key. **If left empty, verification links are logged to the server console** instead of emailed — the flow still works locally. |
| `EMAIL_FROM` | Verified sender, e.g. `Valiant Movement <hello@yourdomain.com>` |
| `NEXT_PUBLIC_APP_URL` | Base URL for verification links (`http://localhost:3000` in dev) |
| `NIN_HASH_SECRET` | Long random string. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

## 3. Create the schema + seed geo data

```bash
npm run db:setup     # = drizzle-kit push  +  seed states/LGAs
```

Or run the steps individually:

```bash
npm run db:push      # apply the schema to Neon (or db:migrate to use SQL files in ./drizzle)
npm run db:seed      # load 36 states + FCT and their LGAs from src/data/nigeria.ts
npm run db:studio    # optional: browse data in Drizzle Studio
```

## 4. Run it

```bash
npm run dev
```

End-to-end flow:

1. **/register** → multi-step form calls the `registerMember` Server Action.
   Creates `users` (status `pending`) + `identities` + `profiles` +
   `email_verifications`, and enqueues a `nin_sync_jobs` row for the Listener
   Agent. A verification email is sent via Resend (or logged to console).
2. User clicks the link → **`GET /api/auth/verify`** consumes the token, sets
   `email_verified = true`, `status = active`, and redirects to
   `/login?verify=success`.
3. **/login** → `loginMember` verifies the password (scrypt), creates a
   DB-backed session, and sets an httpOnly `vm_session` cookie.
4. **/dashboard** → server component guarded by `getCurrentUser()`; sign-out
   calls the `logout` action.

## Where things live

| Path | What |
| --- | --- |
| `src/db/schema.ts` | Drizzle schema (all 19 tables) |
| `src/db/index.ts` | Neon + Drizzle client |
| `src/db/seed.ts` | Geo seed script |
| `src/app/actions/auth.ts` | `registerMember`, `loginMember`, `resendVerification`, `logout` |
| `src/app/api/auth/verify/route.ts` | Email-verification link handler |
| `src/lib/session.ts` | Session create/destroy + `getCurrentUser` |
| `src/lib/password.ts` | scrypt hash/verify |
| `src/lib/tokens.ts` | token + NIN hashing |
| `src/lib/email.ts` | Resend verification email |
| `src/lib/validation.ts` | Zod schemas |
| `drizzle/` | Generated SQL migrations |

## Security notes

- Passwords: scrypt with per-user salt (`scrypt$salt$hash`).
- Sessions & email tokens: only the **SHA-256 hash** is stored; the raw value
  lives in the cookie / email link.
- NIN: stored as a keyed **HMAC** (`nin_hash`) — never in plaintext. The NIMC
  lookup runs out-of-band via the `nin_sync_jobs` queue (Listener Agent) and is
  intentionally not wired yet.
- Login uses a constant generic error to avoid account enumeration.
