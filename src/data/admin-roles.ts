/* ============================================================
   Valiant Movement — scoped admin roles
   One dashboard shell, filtered by jurisdiction. Each coordinator
   sees only their level: National › State › LGA › Ward.

   This file is imported by both server code (admin-auth.ts) and
   client components, so it must stay a plain, synchronous, DB-free
   module — the actual member/community data behind these scopes is
   fetched live from Postgres in src/app/actions/admin.ts, keyed off
   `scope.state` / `scope.lga` / `scope.ward` below.

   Jurisdiction is configurable via env (COORDINATOR_STATE/LGA/WARD)
   so a real deployment can point each single-account level at
   whichever state/LGA/ward it's actually coordinating, without a
   code change. This is intentionally ONE account per level for now
   (matching how login works today) — scaling to a distinct
   coordinator per state/LGA/ward nationwide needs a real
   appointments table (map a member account → jurisdiction), which
   is a separate, larger project than this file covers.
   ============================================================ */

import { MEMBERS, type Member } from "./mock-members";

export type ScopeLevel = "national" | "state" | "lga" | "ward";

export interface AdminScope {
  level: ScopeLevel;
  state?: string;
  lga?: string;
  ward?: string;
}

/* Compat shim (mock-only, no DB — keeps this module synchronous and
   client-importable). The Dashboard/Members admin views still read the mock
   member set filtered by jurisdiction while they migrate to the live queries
   in actions/admin.ts; this keeps the build green in the meantime. */
export function wardOf(m: Member): string {
  const n = ([...m.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 12) + 1;
  return "Ward " + String(n).padStart(2, "0");
}

export function scopeMembers(scope: AdminScope, members: Member[] = MEMBERS): Member[] {
  return members.filter((m) => {
    if (scope.state && m.state !== scope.state) return false;
    if (scope.lga && m.lga !== scope.lga) return false;
    if (scope.ward && wardOf(m) !== scope.ward) return false;
    return true;
  });
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

const STATE = process.env.COORDINATOR_STATE?.trim() || "Ekiti";
const LGA = process.env.COORDINATOR_LGA?.trim() || "Ekiti South-West";
const WARD = process.env.COORDINATOR_WARD?.trim() || "Ward 01";

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
    tagline: "Every state, LGA and ward · full movement",
  },
  state: {
    key: "state",
    email: "state@valiantmovement.com",
    password: "StateCoord",
    title: "State Coordinator",
    roleName: "State",
    jurisdiction: `${STATE} State`,
    chip: "SC",
    scope: { level: "state", state: STATE },
    tagline: `${STATE} State chapter`,
  },
  lga: {
    key: "lga",
    email: "lga@valiantmovement.com",
    password: "LGACoord",
    title: "LGA Coordinator",
    roleName: "LGA",
    jurisdiction: `${LGA} LGA`,
    chip: "LC",
    scope: { level: "lga", state: STATE, lga: LGA },
    tagline: `${STATE} State · ${LGA} LGA`,
  },
  ward: {
    key: "ward",
    email: "ward@valiantmovement.com",
    password: "WardCaptain",
    title: "Ward Captain",
    roleName: "Ward",
    jurisdiction: `${WARD}, ${LGA}`,
    chip: "WC",
    scope: { level: "ward", state: STATE, lga: LGA, ward: WARD },
    tagline: `${LGA} LGA · ${WARD}`,
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
