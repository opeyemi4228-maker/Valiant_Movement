# The Valiant Movement Platform

**A NIN-verified civic membership platform for Nigeria.** *Courage to Lead.* 🦅

One verified identity, placed by real geography (State → LGA → Ward → Polling Unit), carries everything a movement needs. That covers a social feed, messaging and calls, auto-joined community groups, a real Naira wallet with monthly dues, and leadership dashboards scoped to each coordinator's jurisdiction.

| | |
|---|---|
| **Repository** | `github.com/opeyemi4228-maker/Valiant_Movement` (branch `main`) |
| **Stack** | Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Neon Postgres · Drizzle ORM |
| **Integrations** | Monnify (payments) · Resend (email) · WebRTC (calls) · Web Speech API (voice) |
| **Started** | 22 June 2026 |
| **Document updated** | 27 September 2026 |

This file is the single, current reference for the project. It pulls together the older docs (`PROJECT_OVERVIEW.md`, `PROGRESS_REPORT.md`, `BACKEND.md`, `DATABASE.md`) and corrects them where the code has since moved on. Where they disagree, the code and this file win.

---

## Contents

1. [The idea](#1-the-idea)
2. [Who uses it](#2-who-uses-it)
3. [What works today](#3-what-works-today)
4. [The member app](#4-the-member-app)
5. [The coordinator console](#5-the-coordinator-console)
6. [Money: wallet, dues, treasuries and referrals](#6-money-wallet-dues-treasuries-and-referrals)
7. [Architecture](#7-architecture)
8. [Data model](#8-data-model)
9. [Server actions and routes](#9-server-actions-and-routes)
10. [Getting started](#10-getting-started)
11. [Environment variables](#11-environment-variables)
12. [Deploying to production](#12-deploying-to-production)
13. [Security and privacy](#13-security-and-privacy)
14. [Design system and UI conventions](#14-design-system-and-ui-conventions)
15. [Known gaps and roadmap](#15-known-gaps-and-roadmap)
16. [Project history](#16-project-history)

---

## 1. The idea

Most movements scatter their members across WhatsApp groups, a donation page and a spreadsheet of dues. Valiant puts all of it on one accountable identity.

**Structure is the product.** Nigeria's administrative hierarchy is the backbone of the system:

```
National
  └── State (36 + FCT)
        └── LGA (774)
              └── Ward
                    └── Polling Unit
```

A member registers with their NIN and a home address down to polling-unit level. That placement is not just profile data. It decides:

- **Communities:** the member is automatically joined to four nested groups (State chapter, LGA group, Ward group, Polling Unit group), each with a group chat.
- **Money:** their dues are split across the structures above them (Ward 50%, LGA 20%, State 20%, National 10%).
- **Authority:** a coordinator's dashboard shows only their own jurisdiction, and nothing leaks sideways.
- **Moves:** if a member changes their address, they leave the old groups and join the new ones automatically.

---

## 2. Who uses it

### Members (`/dashboard`)

Verified individuals. They post, chat, call, join their geographic communities, fund a wallet, pay monthly dues, and recruit others with a referral code.

### Coordinators (`/admin`)

Leaders sign in through the **same login form** as members. The email is checked against the admin role table before the member database, and admins are routed to `/admin`.

| Role | Sees | Default jurisdiction (configurable) |
|---|---|---|
| **Super Admin** | The entire movement | National |
| **State Coordinator** | One state | `COORDINATOR_STATE` (default Ekiti) |
| **LGA Coordinator** | One LGA | `COORDINATOR_LGA` (default Ekiti South-West) |
| **Ward Captain** | One ward | `COORDINATOR_WARD` (default Ward 01) |

There is currently **one account per level**, defined in `src/data/admin-roles.ts`. The jurisdiction can be changed through environment variables without a code change.

---

## 3. What works today

| Status | Meaning |
|---|---|
| 🟢 **Live** | Backed by Postgres; works for real members; persists |
| 🟡 **Live, needs keys** | Real code path; needs an external service configured |
| ⚪ **Sample data** | Designed UI over static or generated data; not wired to real records yet |

| Area | Status |
|---|---|
| Registration, login, sessions | 🟢 Live |
| Feed: posts, photos, likes, reposts, comments, bookmarks | 🟢 Live |
| Stories (24-hour) | 🟢 Live |
| Communities and automatic geo placement | 🟢 Live |
| Direct messages and community group chat | 🟢 Live |
| Voice and video calls (1:1) and group huddles | 🟢 Live (WebRTC; TURN recommended) |
| Notifications (social, messages, calls, finance, dues) | 🟢 Live |
| Wallet ledger, balance and history | 🟢 Live |
| Monthly dues deduction and reminders | 🟢 Live |
| Referral codes, reward tiers, leaderboard | 🟢 Live |
| Member reports and message moderation alerts | 🟢 Live |
| Profile, membership ID card, impact stats | 🟢 Live |
| Admin: members database, CSV export | 🟢 Live |
| Admin: treasury, community monitor, chapters, field activity log | 🟢 Live |
| Wallet deposits and withdrawals (Monnify) | 🟡 Needs Monnify keys |
| Email verification | 🟡 Needs Resend key (logs links to console without it); does not block first login |
| Admin: Finance module, Meetings, Gatherings | ⚪ Sample data |
| Finance: "Causes you can back" campaigns | ⚪ Sample data, labelled *Preview* |
| Valiant AI assistant | ⚪ Scripted answers, not a live AI model |
| NIN verification against NIMC | ⚪ Queued at registration; nothing processes the queue yet |
| Wards and polling units | ⚪ Generated placeholders, not the official INEC list |
| States and LGAs | 🟢 Real official data |

---

## 4. The member app

The member app lives at `/dashboard` and is one screen with seven tabs (`src/components/community/MemberShell.tsx`). The active tab is kept in the URL (`?tab=messages`), so a refresh lands on the same tab. Every tab you've opened stays loaded in the background, so switching back is instant.

**Navigation**

- **Desktop:** a left sidebar grouped as *The Movement* (Home, Communities, Messages) and *Your Space* (Finance, Notifications, Bookmarks, Profile).
- **Phone:** a bottom tab bar (Home, Communities, Messages, Finance, Notifications). Bookmarks and Profile sit in the top bar.

### 4.1 Home (feed)

- Text and photo posts, likes, reposts, bookmarks and threaded comments. Each one notifies the author.
- A welcome masthead with live counts, a stories rail, and a composer with quick prompts ("Share a win", "Post a milestone").
- Posts pinned by coordinators appear at the top.
- Coordinator field-activity reports appear in the feed as dispatches.
- Tapping a post opens a focused view of that post and its comments.

### 4.2 Communities

- The member's four geographic communities, with member counts and the coordinator role for each.
- Each has a WhatsApp-style group chat with the same composer as direct messages: emoji, attachments and voice notes.
- A "member joined" message is posted exactly once per member.
- **Huddles:** any member can start a group voice or video call. Everyone else sees a "huddle live, tap to join" banner anywhere in the app.

### 4.3 Messages

- Real direct messages, delivered in about 2.5 seconds.
- Photo and file attachments (up to 5 MB) and recorded voice notes.
- Read receipts: one tick means sent, two ticks mean delivered, and blue ticks mean the other person has opened the chat.
- Start a new chat from a member picker. The Valiant AI assistant appears as the first chat in the list.
- Report a member for harassment, spam, impersonation, hate, violence or other reasons. A member can't file duplicate reports against someone while a report is open.
- **Call gating:** two members must have exchanged a few messages before they can call each other, as an anti-abuse measure.

### 4.4 Calls

- 1:1 voice and video over WebRTC, with a ringing screen, accept/decline, a ringtone, screen sharing and reconnection handling.
- Group huddles use a mesh: every participant connects to every other one. This suits small and medium rooms.
- When one side hangs up, the other side closes within a couple of seconds.
- Every call is logged in the chat thread (missed, declined or completed with duration), with a one-tap call back.
- Optional live speech-to-text transcript, downloadable as a text file.

### 4.5 Finance

See [section 6](#6-money-wallet-dues-treasuries-and-referrals). The member sees:

- Wallet balance (can be hidden) with Deposit and Withdraw buttons.
- A personal dedicated bank account for funding by transfer.
- Totals for deposited, withdrawn and given, plus the current dues status.
- Membership dues details: amount, next due date and plan.
- The *Preview* campaigns list and recent transactions.

### 4.6 Notifications

One notification centre with All and Unread filters, grouped into Today, This week and Earlier. It covers:

- Social events: likes, comments, reposts, new posts.
- Messages: at most one alert per sender every 10 minutes.
- Calls: incoming and missed.
- Deposits and withdrawals.
- Dues: reminders 5, 4, 3, 2 and 1 days before the due date, then "deducted" or "insufficient funds" on the day.

New messages also play a sound and show a toast.

### 4.7 Bookmarks

Posts the member saved from Home. Only the member can see them.

### 4.8 Profile

- Cover photo, avatar, bio and geographic breadcrumb.
- Stats: posts, likes received, communities, and total given (the real sum of completed dues payments).
- A digital **Member ID card** showing member code, ward and NIN-verified badge.
- The **referral dashboard**: code, share button, count, progress to the next reward tier, and a list of recruits.
- Tabs for Posts (including reposts), Communities, Media and Likes.
- **Edit profile:** name, username, bio, avatar, cover and location. Changing location re-places the member in communities.
- Sign out.

### 4.9 Valiant AI assistant

A floating assistant available everywhere, for members and admins (`src/components/ai/`).

- Accepts typed or spoken questions and file attachments, and reads its answers aloud.
- An optional **"Hey Valiant AI"** wake word, remembered per device.
- **Important:** answers come from a scripted engine (`replies.ts`) that matches keywords to prepared on-brand answers about dues, the wallet, NIN, meetings, structure and values. It is not connected to an AI model, so it can't handle open-ended questions.

---

## 5. The coordinator console

`/admin` (`src/components/admin/AdminShell.tsx`) has a top bar, an icon rail with a detail panel (a drawer on phones), and a content area. Every view is filtered to the signed-in coordinator's jurisdiction.

| Section | What it does | Data |
|---|---|---|
| **Dashboard** | Welcome, "Add member", field activity log, member totals and growth, referral leaderboard | 🟢 Live (`admin`, `activities`, `referrals`) |
| **Members** | Searchable, filterable member database with verification status; CSV export; scoped recruitment leaderboard | 🟢 Live |
| **Community** | Community monitor, post moderation, roster and member roles | 🟢 Live, with some sample content |
| **Associations** | Chapters across the federation | 🟢 Live |
| **Treasury** | Structure treasury balances and dedicated accounts | 🟢 Live |
| **Finance** | Treasury, income and statements views | ⚪ Sample data (`src/data/finance.ts`) |
| **Meetings** | Schedule meetings for National Excos, State or LGA coordinators | ⚪ Sample data |
| **Gatherings** | Events, RSVPs, check-in | ⚪ Sample data |
| **Fundraising, Settings** | Placeholder screens | Not built |

**Field activity:** a coordinator logs what they did in their area, optionally with a photo. It appears in their activity list and in the members' feed.

---

## 6. Money: wallet, dues, treasuries and referrals

This is the only part of the app where real money moves. The ledger code is in `src/lib/wallet-db.ts`, and the gateway client is in `src/lib/monnify.ts`.

### 6.1 The ledger

- `wallets.balance` stores each member's running balance, so reading it is a single row lookup.
- `payments` is an append-only record of every naira that moves. Each row has a kind (deposit, withdrawal, dues, adjustment), a status (pending, completed, failed, reversed), our own idempotency reference, and the gateway's reference.
- A debit is a single conditional update (`UPDATE ... WHERE balance >= amount`), so a balance can never go negative and two requests can't race.
- If the process crashes partway, the worst case is a `pending` row that can be reconciled later. It can never leave an unexplained debit or a double credit.

### 6.2 Deposits

- **Hosted checkout** (card, bank transfer or USSD) through Monnify.
- **Dedicated account:** each member gets a personal bank account number (for example, a Wema Bank account). Transfers to it credit their wallet automatically.
- A pending ledger row is created **before** Monnify is contacted.
- Money is only credited from a server-verified source: Monnify's webhook, or a status check when the member returns from checkout. The app never trusts the browser's word that a payment succeeded.
- Both paths share one function that is safe to run twice. A duplicate webhook credits exactly once.

### 6.3 Withdrawals

- The destination account is looked up first, and its registered name is shown before the member can submit. This catches mistyped account numbers.
- Payout accounts can be saved for reuse.
- The amount is **reserved (debited) immediately**, so the same money can't be withdrawn twice. It is refunded if the transfer fails.
- Limits: minimum ₦500 and maximum ₦500,000 per transaction. The minimum deposit is ₦100.
- Monnify turns on 2FA for payouts by default. For instant automatic withdrawals, ask Monnify support to disable 2FA on the disbursement wallet. Otherwise payouts wait for manual OTP approval.

### 6.4 Membership dues

Dues are collected on the **28th of every month**, straight from the wallet (`src/lib/dues.ts`, `src/app/actions/finance.ts`).

| Category | Monthly dues |
|---|---|
| Regular (default) | ₦2,000 |
| Professional | ₦10,000 |
| Student, Honorary, Institutional | ₦0 |
| Diaspora | ₦0 (to be set; the handbook hasn't fixed a figure) |

- Each charge is unique per member per month (`dues_<userId>_<yyyy-mm>`). The database enforces this, so a month can never be charged twice.
- Reminders go out 5 to 1 days before the due date. On the day, the member gets a "deducted" or "insufficient funds" notification.
- The amounts are data in `DUES_BY_CATEGORY`. Changing a number affects future charges only; past charges stay as recorded.

### 6.5 The revenue split and structure treasuries

Every dues payment is shared up the structure. The split is stored in **basis points** so it can be audited and adjusted, and the app refuses to start if the shares don't add up to 100%.

| Level | Share |
|---|---|
| Ward | 50% |
| LGA | 20% |
| State | 20% |
| National | 10% |

Each structure has its own treasury (`structure_accounts`) with a balance and optionally its own dedicated bank account. Each share is recorded in `structure_payments`, including which member's dues produced it.

### 6.6 Referrals

Every member gets a code such as `VM-7QK4PH`. The characters 0/O and 1/I are never used, so codes are easy to read aloud.

- A new member can enter a code at registration, or open an invite link (`/register?ref=CODE`) that fills it in automatically.
- Counts come from `profiles.referred_by`. Reaching a tier pays a **one-off wallet bonus**, granted exactly once.

| Tier | Referrals | Bonus |
|---|---|---|
| 🌱 Recruit | 0 | none |
| 🤝 Mobilizer | 20 | ₦5,000 |
| 📣 Organizer | 50 | ₦15,000 |
| 🦅 Vanguard | 100 | ₦40,000 |
| 🏆 Champion | 200 | ₦100,000 |
| 👑 Movement Legend | 1,000 | ₦500,000 |

---

## 7. Architecture

### 7.1 Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2 (App Router, Server Actions, Turbopack) |
| UI | React 19.2, Tailwind CSS v4, framer-motion |
| Icons | lucide-react, @carbon/icons-react, react-icons |
| Language | TypeScript (strict) |
| Database | PostgreSQL on Neon, over the HTTP driver |
| ORM | Drizzle ORM and drizzle-kit (migrations in `drizzle/`) |
| Validation | Zod |
| Auth | Custom email and password (scrypt), sessions stored in the database |
| Payments | Monnify |
| Email | Resend |
| Calls | WebRTC with STUN/TURN; signalling through Postgres |
| Voice | Web Speech API (speech-to-text and text-to-speech), MediaRecorder, Web Audio |

> **Next.js 16 note:** this version has breaking changes compared with older Next.js. Read the relevant guide in `node_modules/next/dist/docs/` before changing framework-level code (see `AGENTS.md`).

### 7.2 Key design decisions

- **Two backends chosen per request.** If `DATABASE_URL` isn't set, the whole member app runs on an in-memory demo store (`src/lib/demo-store.ts`) with seeded demo members. Feed, chat and calls still work between two browsers on one dev server. Every server action calls `usesDb(id)`, which checks that a database is configured *and* that the ID is a real UUID. Demo IDs are readable slugs, so the two backends never mix for one user.
- **Polling, not push.** Feed, chat, presence and calls refresh every 1.5 to 2.5 seconds, with faster signalling during calls. This keeps the app fully serverless-friendly. If traffic grows, WebSockets or server-sent events would be the next step.
- **UUIDv7 primary keys**, generated in the app (`src/db/id.ts`), so new rows are added at the end of each index instead of scattered through it.
- **Short session cache:** a dashboard tab fires several actions at once, so the session lookup is cached in memory for a few seconds.
- **Retries on transient failures** (`src/lib/retry.ts`). If Neon is cold-starting, the dashboard shows a "Reconnecting…" screen and reloads itself, up to 3 times, instead of logging the member out.
- **Keep the last good data:** polled reads return `null` on failure, so the screen keeps its last-known state instead of flashing zeros.
- **Bounded lists:** list reads always use a limit or cursor, never an unbounded query.
- **Large request bodies:** Server Actions accept up to 10 MB (`next.config.ts`) because attachments and voice notes travel as data URLs.

### 7.3 Directory map

```
src/
├── app/
│   ├── page.tsx                 → "/" sends members to /dashboard, others to /login
│   ├── login/ register/         → auth pages
│   ├── dashboard/               → member app (+ reconnect screens)
│   ├── admin/                   → coordinator console
│   ├── actions/                 → all Server Actions (see section 9)
│   ├── api/auth/verify/         → email-verification link handler
│   ├── api/payments/monnify/    → webhook + checkout return
│   ├── layout.tsx               → root layout, fonts, viewport
│   └── globals.css              → design tokens + utilities
├── components/
│   ├── community/               → member app (shell, feed, chat, finance, profile…)
│   ├── admin/                   → coordinator console modules
│   ├── call/                    → call centre, 1:1 rooms, huddles, ringing UI
│   ├── ai/                      → Valiant AI (panel, launcher, scripted replies, speech)
│   ├── auth/                    → auth shell, fields, location picker
│   └── ui/                      → shared primitives (admin sidebar, tabs, emoji picker)
├── db/                          → Drizzle schema, client, UUIDv7, seed
├── data/                        → reference and sample data (Nigeria geo, roles, mock admin data)
└── lib/                         → domain logic: sessions, wallet, dues, referrals,
                                   communities, moderation, calls, notifications, email
```

**Unused code:** `components/community/Chat.tsx` and `Feed.tsx` are older versions that nothing imports any more. They're safe to delete.

---

## 8. Data model

There are 32 tables, all defined in `src/db/schema.ts` and applied through the migrations in `drizzle/` (0000 to 0014). `DATABASE.md` holds the original design notes.

| Group | Tables |
|---|---|
| **Geography** | `states`, `lgas`, `wards`, `polling_units` |
| **Identity and auth** | `users`, `identities` (hashed NIN), `profiles` (includes geo placement, `referral_code`, `referred_by`), `sessions`, `email_verifications` |
| **NIN verification** | `nin_sync_jobs` (queue), `nin_verification_log` (audit trail) |
| **Communities** | `communities`, `community_members` |
| **Feed** | `posts`, `post_reactions`, `follows`, `stories` |
| **Messaging** | `conversations` (direct or group), `conversation_members`, `messages` |
| **Calls** | `call_signals`, `huddles`, `huddle_peers`, `huddle_signals` |
| **Notifications and safety** | `notifications`, `member_reports` |
| **Money** | `wallets`, `payments`, `payout_accounts`, `structure_accounts`, `structure_payments` |
| **Coordinators** | `coordinator_activities` |

Enums: `conversation_type`, `payment_kind`, `payment_status`, `payment_provider` (`monnify`, `manual`), and `structure_level` (`ward`, `lga`, `state`, `national`).

Counts that are read often (`communities.member_count`, post like counts, `wallets.balance`) are stored directly on the row so reads stay cheap.

---

## 9. Server actions and routes

All data access goes through Server Actions in `src/app/actions/`.

| File | Actions |
|---|---|
| `auth.ts` | `registerMember`, `loginMember`, `resendVerification`, `logout`, `logoutAdmin` |
| `feed.ts` | `loadFeed`, `loadFeedBundle`, `publishPost`, `likePost`, `getPostLikers`, `repostPost`, `bookmarkPost`, `loadBookmarks`, `commentPost`, `loadStories`, `publishStory` |
| `chat.ts` | `loadChat`, `refreshConversations`, `startDirect`, `getMessages`, `sendMessage`, `markRead` |
| `communities.ts` | `getMyCommunities`, `getCommunityMembers`, `getCommunitiesUnread`, `openCommunityChat` |
| `realtime.ts` | calls (`startCall`, `answerCall`, `declineCall`, `hangupCall`, `sendOffer`, `sendAnswer`, `sendIce`, `getSignal`, `getCallStatus`, `callEligibility`), `pollPresence`, `getModerationAlerts` |
| `huddle.ts` | `startCommunityHuddle`, `getActiveHuddle`, `pollCommunityHuddle`, `leaveCommunityHuddle`, `endCommunityHuddle`, `sendHuddleSdp`, `sendHuddleIce` |
| `notifications.ts` | `getNotifications`, `getUnreadNotifCount`, `markNotificationsRead` |
| `profile.ts` | `getMyProfile`, `updateMyProfile` |
| `wallet.ts` | `getWalletSummary`, `getMyContributions`, `provisionMyReservedAccount`, `initializeDeposit`, `verifyDeposit`, `listWithdrawalBanks`, `resolveWithdrawalAccount`, `listPayoutAccounts`, `savePayoutAccount`, `deletePayoutAccount`, `requestWithdrawal` |
| `finance.ts` | `getDuesStatus`, `ensureDuesNotifications`, `notifyFinanceEvent` |
| `referrals.ts` | `getMyReferrals`, `getReferralLeaderboard` |
| `reports.ts` | `reportMember` |
| `admin.ts` | `getAdminMembers`, `exportAdminMembersCsv`, `getTreasury`, `provisionTreasuryAccount`, `getCommunityMonitor`, `moderatePost`, `setCommunityMemberRole`, `getAllCommunitiesAdmin`, `getCommunityRosterAdmin` |
| `activities.ts` | `postCoordinatorActivity`, `getMyActivities`, `getFeedActivities` |
| `associations.ts` | `getChapters` |

**Routes**

| Route | Purpose |
|---|---|
| `/login`, `/register` | Auth pages (register accepts `?ref=CODE`) |
| `/dashboard` | Member app (`?tab=home|communities|messages|finance|notifications|bookmarks|profile`) |
| `/admin` | Coordinator console |
| `GET /api/auth/verify` | Consumes an email-verification token |
| `POST /api/payments/monnify/webhook` | Monnify confirms deposits and withdrawals |
| `GET /api/payments/monnify/return` | Member returns from Monnify checkout |

---

## 10. Getting started

**Requirements:** Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local     # fill in at least DATABASE_URL (see section 11)
npm run db:setup               # push the schema + seed 37 states and 774 LGAs
npm run dev                    # http://localhost:3000
```

To try it without any setup, leave `DATABASE_URL` empty. The app runs on the in-memory demo store.

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Develop, build or serve |
| `npm run lint` | ESLint |
| `npm run db:generate` | Create a migration from schema changes |
| `npm run db:migrate` | Apply the migrations in `drizzle/` |
| `npm run db:push` | Push the schema directly (development) |
| `npm run db:seed` | Seed states and LGAs |
| `npm run db:setup` | Push the schema, then seed |
| `npm run db:studio` | Browse data in Drizzle Studio |

### Demo accounts

These accounts are built into the code for demos. **Change or remove them before a public launch** (see [section 13](#13-security-and-privacy)).

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@valiantmovement.com` | `SuperAdmin` |
| State Coordinator | `state@valiantmovement.com` | `StateCoord` |
| LGA Coordinator | `lga@valiantmovement.com` | `LGACoord` |
| Ward Captain | `ward@valiantmovement.com` | `WardCaptain` |
| Member (Chidi Okafor) | `member@valiantmovement.com` | `Valiant2026` |
| Member (Amara Eze) | `amara@valiantmovement.com` | `Valiant2026` |

**Five-minute demo:** open two browser windows (one normal, one private) and sign in as the two members. Post in one and watch it appear in the other. Message each other, then place a call, which rings the other window. Finally, ask Valiant AI "How do membership dues work?"

---

## 11. Environment variables

Set these in `.env.local` for development, or in your host's settings for production. The full template with comments is `.env.example`.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | For real data | Neon **pooled** connection string with `?sslmode=require`. Without it, the app uses the in-memory demo store. |
| `NIN_HASH_SECRET` | Yes | Secret for hashing NINs. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_SESSION_SECRET` | Recommended | Signs admin and demo sessions (falls back to `NIN_HASH_SECRET`) |
| `NEXT_PUBLIC_APP_URL` | Yes | Public base URL with no trailing slash; used in email links and payment returns |
| `RESEND_API_KEY` | For email | Without it, verification links are printed to the server console |
| `EMAIL_FROM` | For email | Verified sender address |
| `MONNIFY_BASE_URL` | For payments | `https://sandbox.monnify.com` for testing, then the live URL |
| `MONNIFY_API_KEY` | For deposits | Monnify API key |
| `MONNIFY_SECRET_KEY` | For deposits | Monnify secret key |
| `MONNIFY_CONTRACT_CODE` | For deposits | Monnify dashboard → Settings → Contract |
| `MONNIFY_DISBURSEMENT_ACCOUNT` | For withdrawals | The Monnify wallet that payouts come from |
| `NEXT_PUBLIC_TURN_URL` | Recommended | TURN relay URLs (comma-separated). Without them, calls across strict networks may fail. |
| `NEXT_PUBLIC_TURN_USERNAME` | With TURN | TURN username |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | With TURN | TURN password |
| `SUPER_ADMIN_EMAIL` | Optional | Replaces the built-in Super Admin email |
| `SUPER_ADMIN_PASSWORD` | Optional | Replaces the built-in Super Admin password |
| `DEMO_MEMBER_EMAIL` | Optional | Replaces the demo member email |
| `DEMO_MEMBER_PASSWORD` | Optional | Replaces the demo member password |
| `COORDINATOR_STATE` | Optional | State Coordinator's jurisdiction |
| `COORDINATOR_LGA` | Optional | LGA Coordinator's jurisdiction |
| `COORDINATOR_WARD` | Optional | Ward Captain's jurisdiction |

With no Monnify keys set, the Finance tab still shows the real balance and history. Deposit and Withdraw are disabled with a clear "not connected yet" message instead of pretending to work.

---

## 12. Deploying to production

The app is a standard Next.js app. It suits Vercel or any Node.js host.

1. **Database:** create a Neon project, set `DATABASE_URL`, then run `npm run db:migrate && npm run db:seed` against it.
2. **Secrets:** set `NIN_HASH_SECRET` and `ADMIN_SESSION_SECRET` to long random values. Never reuse the development ones.
3. **Admin access:** set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`. Set real coordinator jurisdictions.
4. **Email:** verify your domain with Resend and set `RESEND_API_KEY` and `EMAIL_FROM`.
5. **Payments:** add the Monnify keys and switch `MONNIFY_BASE_URL` to live. In the Monnify dashboard (Settings → Webhooks), register `https://<your-domain>/api/payments/monnify/webhook`. For instant withdrawals, ask Monnify to disable 2FA on the disbursement wallet.
6. **Calls:** set up a TURN service (for example Metered, Twilio or Cloudflare Calls) and set the three `NEXT_PUBLIC_TURN_*` variables.
7. **App URL:** set `NEXT_PUBLIC_APP_URL` to the production domain.
8. **Check:** register a new member, post, message, place a call between two devices, and make a small sandbox deposit before going live.

---

## 13. Security and privacy

**How sensitive data is protected**

- **Passwords:** hashed with scrypt and a per-user salt (`src/lib/password.ts`).
- **Sessions and email tokens:** only a SHA-256 hash is stored. The raw value lives only in the httpOnly cookie (`vm_session`) or the email link. Sessions last 30 days.
- **NIN:** stored only as a keyed HMAC (`nin_hash`), never as plain text. There is a slot for an encrypted copy.
- **Login errors:** one generic error message, so attackers can't find out which emails are registered.
- **Money:** balances change only on events the server has verified. Every step is safe to repeat, and the database enforces uniqueness for dues and deposits.
- **Moderation:** worrying message content alerts the sender's Ward Captain and LGA Coordinator, while the message is still delivered. Member reports are stored for review.
- **Call gating:** members can't call someone they haven't messaged back and forth with.

**Before a public launch**

- The demo and admin passwords in `src/data/admin-roles.ts` and `src/lib/demo-member.ts` are in source control. Override them with the environment variables, or remove the demo accounts.
- Admin sessions are HMAC-signed cookies for a single built-in account per level. Real coordinator accounts stored in the database are still to be built.
- Attachments and voice notes are stored as data URLs in the database. Moving them to object storage (S3-compatible) would reduce database size and cost.
- Accounts are active immediately. Neither email verification nor NIN verification blocks first use yet. This was a deliberate launch-phase choice.

---

## 14. Design system and UI conventions

### Brand

- **Primary colour:** orange (`#f7931e`), from the logo.
- **Text:** warm near-black on a warm off-white background.
- **Font:** Geist.
- **Tagline:** "Courage to Lead", with the eagle 🦅 as the emblem.

### Design tokens

All colours are CSS variables in `src/app/globals.css`, inside `@theme`. Always use the tokens rather than raw hex values.

| Token | Use |
|---|---|
| `--color-bg`, `--color-surface`, `--color-surface-2` | Page background, cards, subtle fills |
| `--color-ink`, `--color-ink-soft`, `--color-muted`, `--color-faint` | Text, from strongest to faintest |
| `--color-line`, `--color-line-soft` | Borders and dividers |
| `--color-brand`, `--color-brand-2`, `--color-brand-strong`, `--color-brand-tint` | Orange for fills, gradient ends, text on light backgrounds, and soft washes |
| `--color-green`, `--color-amber`, `--color-danger` | Success, warning, error |

Utility classes: `gradient-brand` (primary buttons and cards), `field` (form inputs), `animate-rise` and `animate-pop` (entrances), `no-scrollbar`, and `pb-fab` (see below).

### Mobile conventions

Follow these when building new screens.

- **Use `h-dvh`, never `h-screen`,** for full-height layouts. On phones, `100vh` ignores the browser's address bar. That pushed the bottom tab bar off-screen until the user scrolled, a bug fixed in September 2026.
- **Safe areas:** the viewport uses `viewport-fit=cover`, so the top bar and bottom tab bar pad themselves with `env(safe-area-inset-*)` to clear notches and the home indicator.
- **Keyboard:** `interactive-widget=resizes-content`, so the chat composer stays above the on-screen keyboard.
- **Inputs are at least 16px on touch devices,** because iOS zooms the page when a smaller field is focused. This is enforced globally.
- **Floating AI button:** add `pb-fab` to a tab's scroll container, so the last item can scroll clear of the button.
- **Full-screen chats:** call `useThreadMode(tab, open, close)` from `chat-shared.tsx` in any view with a conversation. On phones it hides the app bars, and the Back button closes the conversation instead of leaving the app.
- **Page headers:** use the shared `PageHeader` component (kicker, title, subtitle, actions) so every tab looks consistent.
- **Loading states:** show placeholders or skeletons until data arrives. Never show "0" or "not set" for data that simply hasn't loaded yet.
- **No dead controls:** don't ship a button that does nothing. Hide it until it works.
- **Accessibility:** icon-only buttons need an `aria-label`. Keyboard focus shows an orange outline. Animations are reduced when the user asks for reduced motion.

---

## 15. Known gaps and roadmap

**Needs outside partners**

1. **NIN verification:** the queue (`nin_sync_jobs`) and audit trail exist. The worker that calls the NIMC API needs an NIMC API agreement.
2. **Official INEC wards and polling units:** replace the generated `getWards` and `getPollingUnits` in `src/data/nigeria.ts`. No UI change is needed.
3. **Payments live:** production Monnify keys and webhook registration.

**Product work**

4. Connect the admin **Finance**, **Meetings** and **Gatherings** modules to real data. Build **Fundraising** and **Settings**.
5. Connect the "Causes you can back" campaigns to the wallet ledger.
6. Coordinator accounts stored in the database (more than one per level) instead of the built-in role table.
7. Connect Valiant AI to a real AI model so it can answer open questions.
8. Wire up the admin top-bar search and notification bell, which don't do anything yet.
9. Set the Diaspora dues amount once the handbook fixes it.
10. **Valiant Leadership Academy:** e-learning and certification, planned as a fourth product area.

**Scale**

11. Move from polling to WebSockets or server-sent events if traffic makes polling expensive.
12. Use a media server (SFU) for large video huddles instead of the mesh.
13. Move attachments and media to object storage.

**Housekeeping**

14. Delete the unused `Chat.tsx` and `Feed.tsx`.
15. Replace the default create-next-app `README.md` with a short pointer to this file.

---

## 16. Project history

There are 47 commits between 22 June and 27 September 2026. Main milestones:

| When | Milestone |
|---|---|
| Jun 2026 | Project created; auth, registration with the location picker, design system |
| Early Jul 2026 | Platform build: feed, communities, messaging, calls, AI assistant, admin roles; presentation build (see `PROGRESS_REPORT.md`) |
| Jul 2026 | Real WebRTC calls that work on serverless hosting; Postgres-backed feed, chat and notifications; stories; huddles |
| Jul–Aug 2026 | Wallet ledger with Monnify deposits, withdrawals and dedicated accounts; monthly dues; structure treasuries and the 50/20/20/10 split |
| Aug–Sep 2026 | Admin console: live members database, treasury, community monitor, associations; member sidebar and page-header redesign |
| Sep 2026 | Referrals: codes, reward tiers, profile dashboard, admin leaderboard, `?ref=` invite links; coordinator field-activity log |
| 27 Sep 2026 | Mobile UI/UX pass: fixed the hidden bottom tab bar (`h-dvh`), full-screen chats with working Back, real "Given" stat, loading states, iOS zoom fix, removed dead controls |

### Related documents

| File | Contents |
|---|---|
| `PROJECT_OVERVIEW.md` | Detailed feature narrative (dues figure and admin status are out of date) |
| `PROGRESS_REPORT.md` | July 2026 presentation build: pitch, demo script, talking points |
| `BACKEND.md` | Original backend setup guide |
| `DATABASE.md` | Original database design notes |
| `AGENTS.md` / `CLAUDE.md` | Notes for AI coding assistants (Next.js 16 warning) |

---

*The Valiant Movement. Courage to Lead.* 🦅
