/**
 * Mock member directory for the Super Admin dashboard.
 * Generated deterministically so the list is stable across renders.
 * Swap `MEMBERS` for a query against `users` + `profiles` when the DB is live.
 */
import { NIGERIA } from "./nigeria";

export type MemberRole =
  | "Member"
  | "Ward Coordinator"
  | "LGA Coordinator"
  | "State Coordinator"
  | "National Exec";

export type MemberStatus = "active" | "pending" | "suspended";

export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  state: string;
  lga: string;
  role: MemberRole;
  status: MemberStatus;
  ninVerified: boolean;
  joined: string; // ISO date
}

const FIRST = [
  "Chidozie", "Amaka", "Emeka", "Ngozi", "Tunde", "Folake", "Ibrahim", "Aisha",
  "Olusegun", "Chiamaka", "Yusuf", "Halima", "Obinna", "Funmi", "Suleiman",
  "Zainab", "Kelechi", "Adaeze", "Musa", "Blessing", "Uche", "Temitope",
  "Abdullahi", "Chioma", "Segun", "Hauwa", "Ikenna", "Damilola", "Bashir",
  "Nneka", "Gbenga", "Maryam", "Chinedu", "Yetunde", "Sani", "Ifeoma",
  "Oluwaseun", "Fatima", "Nnamdi", "Bukola", "Ahmed", "Ogechi", "Tobi",
  "Rukayat", "Chukwuemeka", "Adesola", "Bello", "Ezinne",
];

const LAST = [
  "Okafor", "Adeyemi", "Okonkwo", "Bello", "Eze", "Balogun", "Mohammed",
  "Nwosu", "Olawale", "Abubakar", "Okoro", "Adebayo", "Ibrahim", "Chukwu",
  "Lawal", "Onyeka", "Sani", "Ogunleye", "Aliyu", "Nwachukwu", "Ojo",
  "Danjuma", "Anyanwu", "Oladipo",
];

const ROLES: MemberRole[] = [
  "Member", "Member", "Member", "Member", "Member", "Member",
  "Ward Coordinator", "Ward Coordinator",
  "LGA Coordinator", "State Coordinator", "National Exec",
];

const STATUSES: MemberStatus[] = [
  "active", "active", "active", "active", "active", "pending", "pending", "suspended",
];

function seeded(n: number) {
  // simple LCG for stable pseudo-random sequence
  let s = n >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function generate(count: number): Member[] {
  const rng = seeded(20260623);
  const out: Member[] = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST[Math.floor(rng() * FIRST.length)];
    const last = LAST[Math.floor(rng() * LAST.length)];
    const state = NIGERIA[Math.floor(rng() * NIGERIA.length)];
    const lga = state.lgas[Math.floor(rng() * state.lgas.length)];
    const role = ROLES[Math.floor(rng() * ROLES.length)];
    const status = STATUSES[Math.floor(rng() * STATUSES.length)];
    const ninVerified = status === "active" ? rng() > 0.25 : rng() > 0.7;
    const daysAgo = Math.floor(rng() * 420);
    const joined = new Date(2026, 5, 23);
    joined.setDate(joined.getDate() - daysAgo);

    out.push({
      id: `VM-${String(10247 + i)}`,
      name: `${first} ${last}`,
      email: `${first}.${last}`.toLowerCase() + `${i}@valiant.ng`,
      phone: `0${[7, 8, 9][Math.floor(rng() * 3)]}0${Math.floor(10000000 + rng() * 89999999)}`,
      state: state.name,
      lga,
      role,
      status,
      ninVerified,
      joined: joined.toISOString().slice(0, 10),
    });
  }
  return out;
}

export const MEMBERS: Member[] = generate(54);

export const MEMBER_STATES = Array.from(new Set(MEMBERS.map((m) => m.state))).sort();
export const MEMBER_ROLES: MemberRole[] = [
  "Member",
  "Ward Coordinator",
  "LGA Coordinator",
  "State Coordinator",
  "National Exec",
];
