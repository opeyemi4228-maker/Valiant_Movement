/* ============================================================
   Valiant Movement — scoped admin roles
   One dashboard shell, filtered by jurisdiction. Each coordinator
   sees only their level: National › State › LGA › Ward.
   Mock credentials live here until real appointments exist in the DB.
   ============================================================ */

import { MEMBERS, type Member } from "./mock-members";

export type ScopeLevel = "national" | "state" | "lga" | "ward";

export interface AdminScope {
  level: ScopeLevel;
  state?: string;
  lga?: string;
  ward?: string;
}

export interface AdminRole {
  key: ScopeLevel;
  email: string;
  password: string;
  /** Display title — "Ward Captain". */
  title: string;
  /** Short context word — "State". */
  roleName: string;
  /** Where they sit — "Lagos State". */
  jurisdiction: string;
  /** Topbar avatar initials. */
  chip: string;
  scope: AdminScope;
  /** Subtitle under the jurisdiction. */
  tagline: string;
}

/** Deterministic pseudo-ward for a member (mock data has no ward column yet). */
export function wardOf(m: Member): string {
  const n = ([...m.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 12) + 1;
  return "Ward " + String(n).padStart(2, "0");
}

/** Filter the member set down to a coordinator's jurisdiction. */
export function scopeMembers(scope: AdminScope, members: Member[] = MEMBERS): Member[] {
  return members.filter((m) => {
    if (scope.state && m.state !== scope.state) return false;
    if (scope.lga && m.lga !== scope.lga) return false;
    if (scope.ward && wardOf(m) !== scope.ward) return false;
    return true;
  });
}

/* --- derive populous jurisdictions so every dashboard has real data --- */

function topBy<T extends string>(items: T[]): T {
  const counts = new Map<T, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const TOP_STATE = topBy(MEMBERS.map((m) => m.state));
const STATE_MEMBERS = MEMBERS.filter((m) => m.state === TOP_STATE);
const TOP_LGA = topBy(STATE_MEMBERS.map((m) => m.lga));
const LGA_MEMBERS = STATE_MEMBERS.filter((m) => m.lga === TOP_LGA);
const TOP_WARD = topBy(LGA_MEMBERS.map(wardOf));
const WARD_MEMBERS = LGA_MEMBERS.filter((m) => wardOf(m) === TOP_WARD);
const LGAS_IN_STATE = new Set(STATE_MEMBERS.map((m) => m.lga)).size;

const num = (n: number) => n.toLocaleString();

export const ADMIN_ROLES: Record<ScopeLevel, AdminRole> = {
  national: {
    key: "national",
    email: "superadmin@valiantmovement.com",
    password: "SuperAdmin",
    title: "Super Admin",
    roleName: "National",
    jurisdiction: "National",
    chip: "SA",
    scope: { level: "national" },
    tagline: `All states · ${num(MEMBERS.length)} members`,
  },
  state: {
    key: "state",
    email: "state@valiantmovement.com",
    password: "StateCoord",
    title: "State Coordinator",
    roleName: "State",
    jurisdiction: `${TOP_STATE} State`,
    chip: "SC",
    scope: { level: "state", state: TOP_STATE },
    tagline: `${LGAS_IN_STATE} LGAs · ${num(STATE_MEMBERS.length)} members`,
  },
  lga: {
    key: "lga",
    email: "lga@valiantmovement.com",
    password: "LGACoord",
    title: "LGA Coordinator",
    roleName: "LGA",
    jurisdiction: `${TOP_LGA} LGA`,
    chip: "LC",
    scope: { level: "lga", state: TOP_STATE, lga: TOP_LGA },
    tagline: `${TOP_STATE} State · ${num(LGA_MEMBERS.length)} members`,
  },
  ward: {
    key: "ward",
    email: "ward@valiantmovement.com",
    password: "WardCaptain",
    title: "Ward Captain",
    roleName: "Ward",
    jurisdiction: `${TOP_WARD}, ${TOP_LGA}`,
    chip: "WC",
    scope: { level: "ward", state: TOP_STATE, lga: TOP_LGA, ward: TOP_WARD },
    tagline: `${TOP_LGA} LGA · ${num(WARD_MEMBERS.length)} members`,
  },
};

export const ADMIN_ROLE_LIST: AdminRole[] = [
  ADMIN_ROLES.national,
  ADMIN_ROLES.state,
  ADMIN_ROLES.lga,
  ADMIN_ROLES.ward,
];

export function adminRoleByKey(key: string): AdminRole | null {
  return (ADMIN_ROLES as Record<string, AdminRole>)[key] ?? null;
}
