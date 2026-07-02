/* ============================================================
   Valiant AI — rule-based assistant brain.
   Movement-aware canned answers (dues, NIN, wallet, meetings,
   structure, values…). Swap for a real LLM call later — the
   surface only depends on `valiantReply(text)`.
   ============================================================ */

export const AI_GREETING =
  "Hi, I'm Valiant AI — your movement assistant. 🦅 What can I do for you?";

export const WAKE_GREETING = "What can I do for you?";

export const QUICK_PROMPTS = [
  "How do membership dues work?",
  "Explain NIN verification",
  "How do I deposit to my wallet?",
  "Schedule a meeting",
  "What are the movement's values?",
  "How do I start a call?",
];

interface Rule {
  match: RegExp;
  reply: string;
}

const RULES: Rule[] = [
  {
    match: /\b(hi|hello|hey|good (morning|afternoon|evening)|how are you)\b/,
    reply: "Hello, and welcome to the Valiant Movement. 🦅 I can help with dues, your wallet, NIN verification, meetings, communities and more. What would you like to do?",
  },
  {
    match: /\b(dues|subscription|monthly fee|pay(ment)?|split|50\/20)\b/,
    reply:
      "Membership dues are debited monthly from your wallet by category — Student is free, Regular ₦2,000, Professional ₦10,000. Every payment is split down the structure: 50% to your Ward, 20% LGA, 20% State, 10% National — so the grassroots keeps the largest share. If your balance is short, you're simply marked as owing and auto-settled on your next deposit.",
  },
  {
    match: /\b(wallet|deposit|withdraw|top.?up|balance|fund)\b/,
    reply:
      "Your Valiant Wallet has a balance with two actions: Deposit (card or bank transfer) and Withdraw (to a real bank account). Open Finance from your dashboard, tap Deposit or Withdraw, choose an amount and method, and confirm — every transaction is recorded for full transparency.",
  },
  {
    match: /\b(nin|verif(y|ication)|nimc|identity)\b/,
    reply:
      "Verification is the heart of the movement — every member is confirmed against their National Identity Number (NIN). You enter your NIN at sign-up and our Listener Agent syncs your verified record from NIMC without blocking registration. We never store your raw NIN — only a secure hash. The field is captured but disabled until the NIMC API is live.",
  },
  {
    match: /\b(meeting|schedule|convene|excos?|coordinators?)\b/,
    reply:
      "Super Admins and coordinators can schedule meetings from the Meetings module — pick a date, time and audience (National Excos, State Coordinators or LGA Coordinators) and everyone in scope is invited. Calls are automatically transcribed for the record. Want me to point you there?",
  },
  {
    match: /\b(call|voice call|video call|dial|ring)\b/,
    reply:
      "Open Messages, choose a conversation, and tap the video or phone icon to start a call. Calls use your real camera and mic, and every call is auto-transcribed by speech-to-text and saved for records.",
  },
  {
    match: /\b(community|communities|feed|post|group)\b/,
    reply:
      "The community has two surfaces: a national feed where every verified member can post, and groups organised by geography — your State, LGA and Ward — that you're auto-joined to at registration. Official broadcasts from leaders only reach members inside their boundary.",
  },
  {
    match: /\b(structure|ward|lga|state|polling|jurisdiction|chapter)\b/,
    reply:
      "The movement is built on Nigeria's civic geography: State › LGA › Ward › Polling Unit. Your single placement decides your community groups, where your dues flow, which announcements reach you, and which dashboards a leader holds. It's deliberately bottom-heavy — the ward gets the most members, money and action.",
  },
  {
    match: /\b(value|motto|tagline|courage|character|service|principle)\b/,
    reply:
      "Our motto is Courage. Character. Service. — and our tagline, Courage to Lead. Eight core values anchor the culture: Truth, Courage, Discipline, Excellence, Service, Justice, Responsibility and Unity.",
  },
  {
    match: /\b(founder|convener|who (runs|leads|founded)|valentine|ozigbo)\b/,
    reply: "The Valiant Movement was founded by its Convener, Valentine Chineto Ozigbo. Learn more at valiants.me.",
  },
  {
    match: /\b(member ?ship|join|register|sign ?up|categor)\b/,
    reply:
      "Membership is open to Nigerians 18 and over. Registration is a quick 3-step wizard — Identity, Origin (State › LGA › Ward › Polling Unit), and Security — and on completion we create your wallet and auto-join you to your national, state, LGA and ward groups. Categories: Student (free), Regular (₦2,000), Professional (₦10,000), Diaspora, Honorary and Institutional Partner.",
  },
  {
    match: /\b(reward|recognition|valiant of the year|award)\b/,
    reply:
      "Recognition has teeth — outstanding members can be rewarded financially. A coordinator credits the member's wallet from a structure account: a real, logged payout they can withdraw. Awards include Valiant of the Year and the Emerging Leader Award.",
  },
  {
    match: /\b(transparen|ledger|account|finance report|where.*money)\b/,
    reply:
      "Every naira lives on an immutable double-entry ledger. Members see their chapter's finances live — current balance and every inflow and outflow — because it's simply the ward account's history, read-only. Transparency by default.",
  },
  {
    match: /\b(thank|thanks|cheers|appreciate)\b/,
    reply: "You're most welcome. 🦅 Courage to lead — ask me anything else whenever you need.",
  },
  {
    match: /\b(help|what can you do|capabilities|assist|features)\b/,
    reply:
      "I'm Valiant AI. I can explain dues and the 50/20/20/10 split, walk you through your wallet (deposit/withdraw), NIN verification, scheduling meetings, starting calls, communities and the movement's structure and values. You can type to me, tap the mic to talk, or attach a photo or file. Just say “Hey Valiant AI” anytime.",
  },
];

const FALLBACKS = [
  "I'm still learning, but I can help with dues, your wallet, NIN verification, meetings, calls, communities and the movement's structure. Which would you like?",
  "I didn't quite catch that. Try asking about membership dues, deposits and withdrawals, NIN verification, or scheduling a meeting.",
];

export function valiantReply(input: string): string {
  const q = input.trim().toLowerCase();
  if (!q) return FALLBACKS[0];
  for (const rule of RULES) {
    if (rule.match.test(q)) return rule.reply;
  }
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
}

export function acknowledgeAttachment(name: string, isImage: boolean): string {
  return isImage
    ? `Thanks — I've received your image “${name}”. Once document intelligence is live I'll read and summarise attachments. For now, tell me what you'd like to do with it.`
    : `Got your file “${name}”. I'll be able to analyse documents soon. Meanwhile, how can I help — verification, finance, meetings?`;
}
