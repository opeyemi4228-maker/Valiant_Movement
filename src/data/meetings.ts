/* ============================================================
   Valiant Movement — Meetings & call records
   Super Admin schedules meetings for leadership tiers; each
   call is transcribed (speech-to-text) for the record.
   ============================================================ */

export type AudienceId = "national_excos" | "state_coordinators" | "lga_coordinators";

export interface Audience {
  id: AudienceId;
  label: string;
  short: string;
  description: string;
  count: number;
  color: string;
}

export const AUDIENCES: Audience[] = [
  {
    id: "national_excos",
    label: "National Executives (Excos)",
    short: "National Excos",
    description: "The national executive council",
    count: 24,
    color: "#e07400",
  },
  {
    id: "state_coordinators",
    label: "State Coordinators",
    short: "State Coordinators",
    description: "Leads across all 36 states + FCT",
    count: 37,
    color: "#1faa59",
  },
  {
    id: "lga_coordinators",
    label: "Local Government Coordinators",
    short: "LGA Coordinators",
    description: "Coordinators across all 774 LGAs",
    count: 774,
    color: "#7c3aed",
  },
];

export function audienceById(id: AudienceId): Audience {
  return AUDIENCES.find((a) => a.id === id)!;
}

export function invitedCount(ids: AudienceId[]): number {
  return ids.reduce((sum, id) => sum + audienceById(id).count, 0);
}

export type MeetingStatus = "scheduled" | "live" | "ended";

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  /** ISO date — YYYY-MM-DD */
  date: string;
  /** 24h time — HH:MM */
  time: string;
  durationMins: number;
  mode: "online" | "physical";
  location?: string;
  audiences: AudienceId[];
  status: MeetingStatus;
  host: string;
  /** Saved transcript line count once a meeting has been recorded. */
  recordLines?: number;
}

export const seedMeetings: Meeting[] = [
  {
    id: "mtg-1",
    title: "National Executive Meeting",
    description: "Quarterly strategy review and the 2026 mobilization roadmap.",
    date: "2026-06-27",
    time: "14:00",
    durationMins: 120,
    mode: "online",
    audiences: ["national_excos"],
    status: "scheduled",
    host: "Super Admin",
  },
  {
    id: "mtg-2",
    title: "State Coordinators Sync",
    description: "Weekly numbers review — verification drives by state.",
    date: "2026-06-30",
    time: "10:00",
    durationMins: 60,
    mode: "online",
    audiences: ["state_coordinators"],
    status: "scheduled",
    host: "Super Admin",
  },
  {
    id: "mtg-3",
    title: "LGA Mobilization Briefing",
    description: "Ward-by-ward playbook rollout for all local government areas.",
    date: "2026-07-02",
    time: "16:00",
    durationMins: 90,
    mode: "online",
    audiences: ["lga_coordinators", "state_coordinators"],
    status: "scheduled",
    host: "Super Admin",
  },
  {
    id: "mtg-0",
    title: "Leadership All-Hands",
    description: "Town hall across every tier of the movement.",
    date: "2026-06-20",
    time: "15:00",
    durationMins: 90,
    mode: "online",
    audiences: ["national_excos", "state_coordinators", "lga_coordinators"],
    status: "ended",
    host: "Super Admin",
    recordLines: 248,
  },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-06-27" -> "Sat, 27 Jun 2026" */
export function formatMeetingDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** ("14:00", 120) -> "2:00 – 4:00 PM" */
export function formatTimeRange(time: string, durationMins: number): string {
  const [h, min] = time.split(":").map(Number);
  const start = h * 60 + min;
  const end = start + durationMins;
  const label = (mins: number) => {
    const hh = Math.floor((mins % 1440) / 60);
    const mm = mins % 60;
    const ampm = hh >= 12 ? "PM" : "AM";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
  };
  const s = label(start);
  const e = label(end);
  // Drop the meridiem on the start time when both share it (2:00 – 4:00 PM).
  return s.slice(-2) === e.slice(-2) ? `${s.slice(0, -3)} – ${e}` : `${s} – ${e}`;
}
