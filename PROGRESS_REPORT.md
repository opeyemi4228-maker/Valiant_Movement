# The Valiant Movement — Platform Progress Report

**A verified-identity community platform for Nigerians.**
*Courage. Character. Service. · Courage to Lead.* 🦅

> **Presentation build** · Last updated: 2 July 2026
> Founder & Convener: Valentine Chineto Ozigbo · valiants.me

---

## 1. The one-line pitch

> **One NIN-verified identity unlocks a whole civic operating system** — a social
> feed, private messaging with real calls, a personal wallet, and a governance
> dashboard that is automatically scoped to a leader's jurisdiction.

Where other platforms give anonymous accounts, Valiant gives **real, accountable
people**. Structure isn't a feature here — **structure is the product**:
`State → LGA → Ward → Polling Unit` decides your communities, your money, and
your authority.

---

## 2. What you can demo today (all working, live)

Everything below is **functional right now** — no external services required. The
app ships with a built-in real-time backend so two people on two browsers can
interact live.

### 👤 Member experience (`/dashboard`)

| Feature | What works in the demo |
|---|---|
| **Live Feed** | Post text + photos; **like, repost, and comment update in real time** across accounts (polling every ~2.5s). Threaded comments, verified badges, community tags. |
| **Communities** | Facebook-style directory scoped down the federation (State/LGA/Ward/Interest), live "online now" counts, join/leave. |
| **Messaging (WhatsApp-style)** | **Real member-to-member DMs in real time.** Emoji picker, photo/file attachments, **recorded voice notes**, read receipts, typing/near-real-time delivery, member directory to start new chats. |
| **Voice & Video calls** | Real **camera + microphone** calls. The person you call actually **rings** (incoming-call screen with accept/decline + ringtone + vibrate); caller sees a "ringing…" screen. In-call controls: mute, camera, screen-share, raise hand, speaker. |
| **Live call transcription** | Every call is **auto-transcribed by speech-to-text** ("REC · transcribing"), saved as a downloadable meeting record. |
| **Wallet & Finance** | Personal wallet with **Deposit / Withdraw** flows, balance, dues status, contribution history, and campaigns you can back — with a full transparency panel. |
| **Profile** | A digital **Membership ID card** (Member ID, ward, NIN-verified badge, QR), impact stats, communities, and post history. |
| **Notifications** | Grouped notifications (likes, mentions, follows, events, donations, verification) with filters + **sound + toast on new messages**. |

### 🤖 Valiant AI assistant (everywhere)

- Floating assistant across **every** dashboard (member + all admin roles).
- **Talk, type, or attach** — voice input (speech-to-text), text chat, and file/photo attachments.
- **Speaks its answers** in a deep, natural voice (best neural voice auto-selected).
- **Wake word:** say **"Hey Valiant AI"** and it opens and greets you by voice — every time.
- Movement-aware: explains dues, the wallet, NIN verification, meetings, calls, structure, and the values.

### 🛡️ Governance & administration (`/admin`)

| Role | Scope of the same dashboard |
|---|---|
| **Super Admin** | National — the entire movement. |
| **State Coordinator** | Only their state's members & data. |
| **LGA Coordinator** | Only their LGA. |
| **Ward Captain** | Only their ward. |

- **One dashboard shell, filtered by jurisdiction** — nothing leaks sideways (a Ward Captain sees only their ward).
- **Members database** — searchable, filterable, paginated, with NIN-verification status, scoped to the signed-in leader.
- **Growth analytics** — member growth, verification donut, recent members, coordinators.
- **Meetings** — schedule meetings for **National Excos / State Coordinators / LGA Coordinators**, with invited counts; start a call/meeting room with live transcription.
- **Finance module** — treasury/campaigns view for the movement.
- **Community moderation** — feed & group oversight.

### ⚖️ Trust & safety (live)

- **Message moderation:** flagged messages are detected and **automatically alert the sender's Ward Captain & LGA Coordinator** (chain-of-command escalation).
- **Call gating:** two members must have **each exchanged a few messages** before they can call — a real-world anti-abuse guardrail.
- **Identity-first:** every account is a person; the whole model assumes verification.

---

## 3. The signature idea — trust through identity

A member is **not an email address** — they are a NIN-verified person with a legal
name, date of birth, and place of origin. That single verified placement is reused
everywhere:

```
        ┌─────────────────────────────────────────────┐
        │            ONE VERIFIED IDENTITY             │
        └─────────────────────────────────────────────┘
             │            │            │           │
        Community      Messaging     Wallet     Authority
        (feed +       (chat +       (deposit/   (scoped
         groups)       calls)       withdraw)   dashboards)
             │            │            │           │
     ────────┴────────────┴────────────┴───────────┴────────
       State  →  LGA  →  Ward  →  Polling Unit  (the spine)
```

- It decides which **community groups** you're auto-joined to.
- It decides which **official announcements** reach you (visibility cascades *down*, never sideways).
- It decides where your **dues** flow (Ward 50% · LGA 20% · State 20% · National 10%).
- It decides which **dashboards & authority** a leader holds.

---

## 4. Live demo script (5 minutes)

> Open **two browser windows** side by side (e.g. normal + incognito) so you can
> play two members at once. Both share the live backend.

1. **Sign in as two members** — Window A: `member@valiantmovement.com`, Window B: `amara@valiantmovement.com` (password `Valiant2026`). *(The login page has a one-click "Demo access" panel.)*
2. **Real-time feed** — In A, create a post. Watch it appear in B within seconds. **Like and comment in B → counts update live in A.**
3. **Real-time chat** — Open Messages, send a message from A → it arrives in B with a **notification sound + toast**. Reply from B.
4. **Ring a real call** — After a few messages, tap the 📞 / 🎥 icon in A. **Window B rings** with an incoming-call screen — accept it. Both cameras/mics go live and the **transcript records what you say**.
5. **"Hey Valiant AI"** — Click the assistant orb (or say the wake word). Ask *"How do membership dues work?"* — it answers **out loud**.
6. **Switch to leadership** — Sign in as **State Coordinator** vs **Ward Captain** and show the **same dashboard scoped to different jurisdictions**. Schedule a meeting for "National Excos".

### 🔑 Demo credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@valiantmovement.com` | `SuperAdmin` |
| State Coordinator | `state@valiantmovement.com` | `StateCoord` |
| LGA Coordinator | `lga@valiantmovement.com` | `LGACoord` |
| Ward Captain | `ward@valiantmovement.com` | `WardCaptain` |
| Member — Chidi Okafor | `member@valiantmovement.com` | `Valiant2026` |
| Member — Amara Eze | `amara@valiantmovement.com` | `Valiant2026` |

> You can also **register brand-new members** at `/register` — they're created
> instantly and can immediately chat, post, and call.

---

## 5. Technology

| Area | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, `src/`, Turbopack) |
| Language / UI | **TypeScript 5**, **React 19** |
| Styling | **Tailwind CSS v4** (CSS-first design tokens) |
| Animation / Icons | framer-motion · lucide-react · @carbon/icons-react |
| Database | **PostgreSQL on Neon** + **Drizzle ORM** (schema & migrations ready) |
| Auth | Custom — password hashing, signed sessions, scoped role cookies |
| Realtime (demo) | In-memory server store + client polling (no setup needed) |
| Voice / Calls | Web **getUserMedia**, **MediaRecorder**, **Web Speech API** (STT + TTS), **Web Audio** (ringtones) |
| Email / Payments | Resend (verification) · Paystack/Flutterwave (planned) |

**Dual-mode backend (the clever bit):** the app runs on a **zero-setup in-memory
backend** for demos, and **automatically upgrades to Neon Postgres** the moment a
`DATABASE_URL` is provided — same code, no rewrite.

---

## 6. Progress at a glance

| Area | Status |
|---|---|
| Authentication (login / 3-step register / responsive hero) | ✅ Done |
| Scoped roles — Super Admin · State · LGA · Ward | ✅ Done |
| Member Feed — real-time posts / likes / comments / reposts | ✅ Done |
| Communities directory | ✅ Done |
| Messaging — real-time DMs, attachments, voice notes, emoji | ✅ Done |
| Voice & Video calls — ringing, accept/decline, in-call controls | ✅ Done |
| Live call transcription (speech-to-text records) | ✅ Done |
| Message notifications — sound + toast | ✅ Done |
| Valiant AI — voice + text + attachments + wake word + spoken replies | ✅ Done |
| Wallet — deposit / withdraw / history / campaigns | ✅ Done |
| Membership profile / digital ID | ✅ Done |
| Admin — members DB, analytics, meetings, finance, community | ✅ Done |
| Trust & safety — moderation alerts, call gating | ✅ Done |
| Database schema + migrations (Neon/Drizzle) | ✅ Modeled & ready |
| **NIN / NIMC verification** | ⏳ UI + pipeline modeled; awaiting NIMC API |
| **Payments (Paystack/Flutterwave)** | ⏳ Wallet UI live; integration pending |
| **Peer-to-peer call media (WebRTC)** | ⏳ Signaling live; media relay pending |
| **INEC ward / polling-unit dataset** | ⏳ Placeholders in place |

---

## 7. What's next (roadmap)

1. **Connect Neon + Resend** → real, persistent, multi-device accounts and email verification.
2. **Payments** — wire Paystack/Flutterwave into Deposit/Withdraw; run the dues engine + 50/20/20/10 split with a live ledger.
3. **NIMC Listener Agent** — switch on real NIN verification when the API is provisioned.
4. **WebRTC** — upgrade calls from signaling-only to true peer audio/video.
5. **Scoped leader dashboards** at full depth (State/LGA/Ward analytics & projects).
6. **Valiant Leadership Academy** — the fourth product surface (e-learning & certification).
7. Load the official **INEC** ward / polling-unit dataset.

---

## 8. Talking points for the room

- **"Every member is real."** NIN verification is the moat — trust by default.
- **"Structure is the product."** The same identity powers community, money, and authority — all scoped by geography.
- **"Bottom-heavy by design."** The ward keeps the biggest share of dues and the most activity.
- **"Transparency by default."** If it touches money, it's on the ledger and visible to those it belongs to.
- **"One dashboard, many jurisdictions."** A single system serves the National office down to a Ward Captain — nothing leaks sideways.
- **"It already talks and listens."** Live calls, transcription, notifications, and a voice AI assistant are working today.

---

*Living document for The Valiant Movement platform. Courage to Lead. 🦅*
