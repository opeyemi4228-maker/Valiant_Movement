/* ============================================================
   Lightweight message safety scanner.

   Flags messages that contain scam / fraud or threat / violence
   language so the sender's Ward Captain and LGA Coordinator are
   alerted automatically. Rule-based and dependency-free — swap
   for a real classifier later; callers only depend on scan().
   ============================================================ */

export type ModerationCategory = "scam" | "threat" | "harassment";

export interface ModerationHit {
  flagged: boolean;
  categories: ModerationCategory[];
  matched: string[];
}

const PATTERNS: { category: ModerationCategory; re: RegExp }[] = [
  // Scam / fraud / social-engineering
  {
    category: "scam",
    re: /\b(send (me )?(money|cash|₦|naira)|gift ?card|bitcoin|crypto|forex|ponzi|wire transfer|western union|bank (details|account|otp|pin)|account number|your otp|activation fee|processing fee|clearance fee|you(?:'ve| have) won|claim your (prize|reward)|double your (money|investment)|urgent(?:ly)? (transfer|send)|verify your (account|bvn|nin) (now|urgently))\b/i,
  },
  // Threats / violence
  {
    category: "threat",
    re: /\b(i(?:'| a)?m? ?(will|gonna|going to)? ?(kill|hurt|beat|harm|destroy|finish|deal with|eliminate|attack) (you|u|him|her|them)|kill you|shoot you|stab|bomb|burn (you|your|down)|come for you|watch your back|you(?:'ll| will) (regret|pay|suffer))\b/i,
  },
  // Harassment / abuse (kept conservative)
  {
    category: "harassment",
    re: /\b(stupid fool|useless (idiot|fool)|i hate you|shut up (idiot|fool)|worthless)\b/i,
  },
];

/** Scan a message body. Returns which categories (if any) were triggered. */
export function scanMessage(text: string | null | undefined): ModerationHit {
  const body = (text ?? "").trim();
  if (!body) return { flagged: false, categories: [], matched: [] };

  const categories = new Set<ModerationCategory>();
  const matched: string[] = [];
  for (const { category, re } of PATTERNS) {
    const m = body.match(re);
    if (m) {
      categories.add(category);
      matched.push(m[0]);
    }
  }
  return { flagged: categories.size > 0, categories: [...categories], matched };
}

export function categoryLabel(c: ModerationCategory): string {
  return c === "scam"
    ? "Possible scam / fraud"
    : c === "threat"
    ? "Threat / violence"
    : "Harassment";
}
