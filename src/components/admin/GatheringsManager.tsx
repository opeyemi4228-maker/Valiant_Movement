"use client";

import { useMemo, useState } from "react";
import {
  CalendarPlus,
  Video,
  Users,
  Clock,
  MapPin,
  Globe2,
  Check,
  X,
  Play,
  FileText,
  CalendarClock,
  Building2,
  Sparkles,
  ChevronRight,
  UserCheck,
  BadgeCheck,
  Download,
  Radio,
  Layers,
  CircleDot,
} from "lucide-react";
import { STATE_NAMES, getLgas, getWards, getPollingUnits } from "@/data/nigeria";
import { MEMBERS, type Member } from "@/data/mock-members";
import { type AdminScope, type AdminRole } from "@/data/admin-roles";
import { CallRoom, type CallConfig } from "@/components/call/CallRoom";

/** This manager is still mock-data demo scaffolding (not yet wired into
 *  AdminShell's live sections), so it keeps its own tiny mock-scoping
 *  helpers rather than sharing them with the real, DB-backed admin actions. */
function wardOf(m: Member): string {
  const n = ([...m.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 12) + 1;
  return "Ward " + String(n).padStart(2, "0");
}
function scopeMembers(scope: AdminScope, members: Member[] = MEMBERS): Member[] {
  return members.filter((m) => {
    if (scope.state && m.state !== scope.state) return false;
    if (scope.lga && m.lga !== scope.lga) return false;
    if (scope.ward && wardOf(m) !== scope.ward) return false;
    return true;
  });
}

/* --------------------------------- types --------------------------------- */

type Level = "national" | "state" | "lga" | "ward" | "polling_unit";

interface GeoTarget {
  level: Level;
  state?: string;
  lga?: string;
  ward?: string;
  pollingUnit?: string;
}

type AttendStatus = "invited" | "rsvp" | "attended";

interface Attendee {
  id: string;
  name: string;
  color: string;
  role: string;
  status: AttendStatus;
}

interface Gathering {
  id: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  durationMins: number;
  mode: "online" | "physical";
  location?: string;
  target: GeoTarget;
  status: "scheduled" | "live" | "ended";
  attendees: Attendee[];
  recording?: string[];
}

const LEVELS: { id: Level; label: string; icon: typeof Globe2 }[] = [
  { id: "national", label: "National", icon: Globe2 },
  { id: "state", label: "State", icon: Layers },
  { id: "lga", label: "LGA", icon: CircleDot },
  { id: "ward", label: "Ward", icon: MapPin },
  { id: "polling_unit", label: "Polling Unit", icon: MapPin },
];

const LEVEL_RANK: Record<Level, number> = { national: 0, state: 1, lga: 2, ward: 3, polling_unit: 4 };
const DURATIONS = [30, 60, 90, 120];
const COLORS = ["#e07400", "#1faa59", "#0ea5e9", "#7c3aed", "#e23d4e", "#f5a524", "#0d9488", "#db2777"];

/* ------------------------------- helpers -------------------------------- */

function targetToScope(t: GeoTarget): AdminScope {
  return { level: t.level === "polling_unit" ? "ward" : t.level, state: t.state, lga: t.lga, ward: t.ward };
}

function targetLabel(t: GeoTarget): string {
  if (t.level === "national") return "National · all members";
  const parts = [t.state, t.lga, t.ward?.split("—")[0].trim(), t.pollingUnit?.split("—")[0].trim()].filter(Boolean);
  return parts.join(" › ");
}

const ROLES = ["Member", "Ward Coordinator", "LGA Coordinator", "State Coordinator", "National Exec"];

function makeAttendees(target: GeoTarget, seed: number): Attendee[] {
  const pool = scopeMembers(targetToScope(target)).slice(0, 12);
  const src = pool.length ? pool : MEMBERS.slice(0, 12);
  return src.map((m, i) => {
    const r = (seed + i * 7) % 10;
    const status: AttendStatus = r < 5 ? "attended" : r < 8 ? "rsvp" : "invited";
    return {
      id: m.id,
      name: m.name,
      color: COLORS[(seed + i) % COLORS.length],
      role: m.role ?? ROLES[i % ROLES.length],
      status,
    };
  });
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" });
}

function fmtRange(time: string, mins: number) {
  const [h, m] = time.split(":").map(Number);
  const start = new Date(); start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + mins * 60000);
  const f = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${f(start)} – ${f(end)}`;
}

/* -------------------------------- seed ---------------------------------- */

const RECORD_LINES = [
  "Good afternoon everyone, thank you for joining this gathering.",
  "Verification numbers are up 18% week on week across the chapter.",
  "Lagos and Kano wards are leading the mobilization drive.",
  "Let's finalize the ward town-hall schedule before Friday.",
  "Motion to adopt the new membership playbook — seconded.",
  "Courage to lead. Let's keep the momentum going.",
];

function seedGatherings(): Gathering[] {
  return [
    {
      id: "g1",
      title: "National Executive Assembly",
      description: "Quarterly review with all state coordinators.",
      date: "2026-07-04",
      time: "14:00",
      durationMins: 90,
      mode: "online",
      target: { level: "national" },
      status: "scheduled",
      attendees: makeAttendees({ level: "national" }, 3),
    },
    {
      id: "g2",
      title: "Lagos State Coordination Meeting",
      description: "State + LGA coordinators sync on the ward drive.",
      date: "2026-07-06",
      time: "16:00",
      durationMins: 60,
      mode: "physical",
      location: "State Secretariat, Ikeja",
      target: { level: "lga", state: "Lagos", lga: "Ikeja" },
      status: "scheduled",
      attendees: makeAttendees({ level: "lga", state: "Lagos", lga: "Ikeja" }, 7),
    },
    {
      id: "g3",
      title: "Kano Ward Captains Briefing",
      date: "2026-06-20",
      time: "10:00",
      durationMins: 60,
      mode: "online",
      target: { level: "state", state: "Kano" },
      status: "ended",
      attendees: makeAttendees({ level: "state", state: "Kano" }, 2),
      recording: RECORD_LINES,
    },
  ];
}

/* ------------------------------ component -------------------------------- */

export function GatheringsManager({ role }: { role?: AdminRole }) {
  const [gatherings, setGatherings] = useState<Gathering[]>(seedGatherings);
  const [showForm, setShowForm] = useState(false);
  const [call, setCall] = useState<CallConfig | null>(null);
  const [detail, setDetail] = useState<Gathering | null>(null);
  const [record, setRecord] = useState<Gathering | null>(null);

  const upcoming = gatherings.filter((g) => g.status !== "ended");
  const past = gatherings.filter((g) => g.status === "ended");

  const stats = useMemo(() => {
    const all = gatherings.flatMap((g) => g.attendees);
    const rsvps = all.filter((a) => a.status !== "invited").length;
    const checkedIn = all.filter((a) => a.status === "attended").length;
    return { upcoming: upcoming.length, rsvps, checkedIn, records: past.length };
  }, [gatherings, upcoming.length, past.length]);

  function schedule(g: Gathering) {
    setGatherings((prev) => [g, ...prev]);
    setShowForm(false);
  }
  function start(g: Gathering) {
    setGatherings((prev) => prev.map((x) => (x.id === g.id ? { ...x, status: "live" } : x)));
    setCall({
      mode: "video",
      kind: "meeting",
      title: g.title,
      subtitle: targetLabel(g.target),
      participants: g.attendees.slice(0, 4).map((a) => ({ name: a.name, color: a.color, role: a.role })),
    });
  }
  function toggleCheckIn(gid: string, aid: string) {
    setGatherings((prev) =>
      prev.map((g) =>
        g.id !== gid
          ? g
          : {
              ...g,
              attendees: g.attendees.map((a) =>
                a.id !== aid ? a : { ...a, status: a.status === "attended" ? "rsvp" : "attended" },
              ),
            },
      ),
    );
    setDetail((d) =>
      !d || d.id !== gid
        ? d
        : { ...d, attendees: d.attendees.map((a) => (a.id !== aid ? a : { ...a, status: a.status === "attended" ? "rsvp" : "attended" })) },
    );
  }

  return (
    <div className="space-y-5">
      {call && <CallRoom config={call} onClose={() => setCall(null)} />}
      {detail && <AttendanceDrawer g={detail} onClose={() => setDetail(null)} onToggle={(aid) => toggleCheckIn(detail.id, aid)} />}
      {record && <RecordingModal g={record} onClose={() => setRecord(null)} />}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<CalendarClock className="h-5 w-5" />} value={String(stats.upcoming)} label="Upcoming" />
        <Stat icon={<UserCheck className="h-5 w-5" />} value={String(stats.rsvps)} label="RSVPs" />
        <Stat icon={<BadgeCheck className="h-5 w-5" />} value={String(stats.checkedIn)} label="Checked in" />
        <Stat icon={<FileText className="h-5 w-5" />} value={String(stats.records)} label="Recordings" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-navy)]">Gatherings</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Convene leaders — from the national assembly down to a single polling unit.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl gradient-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-95"
        >
          {showForm ? <X className="h-4 w-4" /> : <CalendarPlus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Schedule gathering"}
        </button>
      </div>

      {showForm && <ScheduleForm role={role} onSubmit={schedule} onCancel={() => setShowForm(false)} />}

      {/* Upcoming */}
      <div className="space-y-3">
        {upcoming.map((g) => (
          <GatheringCard key={g.id} g={g} onStart={() => start(g)} onDetail={() => setDetail(g)} />
        ))}
      </div>

      {/* Recordings */}
      {past.length > 0 && (
        <div>
          <h3 className="mb-3 mt-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--color-faint)]">
            <FileText className="h-4 w-4" /> Meeting recordings
          </h3>
          <div className="space-y-3">
            {past.map((g) => (
              <GatheringCard key={g.id} g={g} past onDetail={() => setDetail(g)} onRecord={() => setRecord(g)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- schedule form ----------------------------- */

function ScheduleForm({
  role,
  onSubmit,
  onCancel,
}: {
  role?: AdminRole;
  onSubmit: (g: Gathering) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("2026-07-10");
  const [time, setTime] = useState("14:00");
  const [duration, setDuration] = useState(60);
  const [mode, setMode] = useState<"online" | "physical">("online");
  const [location, setLocation] = useState("");

  // Geo target — coordinators are floor-limited to their own level.
  const floor = role?.scope.level ?? "national";
  const [level, setLevel] = useState<Level>(floor);
  const [state, setState] = useState(role?.scope.state ?? "");
  const [lga, setLga] = useState(role?.scope.lga ?? "");
  const [ward, setWard] = useState(role?.scope.ward ?? "");
  const [pu, setPu] = useState("");

  const lgas = state ? getLgas(state) : [];
  const wards = state && lga ? getWards(state, lga) : [];
  const pus = state && lga && ward ? getPollingUnits(state, lga, ward) : [];

  const target: GeoTarget = { level, state: state || undefined, lga: lga || undefined, ward: ward || undefined, pollingUnit: pu || undefined };
  const rank = LEVEL_RANK[level];

  // validity: each required tier for the chosen level must be filled
  const geoValid =
    level === "national" ||
    (rank >= 1 && !!state && (rank < 2 || !!lga) && (rank < 3 || !!ward) && (rank < 4 || !!pu));
  const valid = title.trim() && date && time && geoValid && (mode === "online" || location.trim());

  const reach = useMemo(() => scopeMembers(targetToScope(target)).length, [target]);

  function submit() {
    if (!valid) return;
    onSubmit({
      id: "g-" + Date.now(),
      title: title.trim(),
      description: description.trim() || undefined,
      date,
      time,
      durationMins: duration,
      mode,
      location: mode === "physical" ? location.trim() : undefined,
      target,
      status: "scheduled",
      attendees: makeAttendees(target, Date.now() % 10),
    });
  }

  const canPick = (lv: Level) => LEVEL_RANK[lv] >= LEVEL_RANK[floor];

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
          <CalendarPlus className="h-5 w-5" />
        </span>
        <h3 className="font-bold text-[var(--color-navy)]">New gathering</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Labeled label="Title" className="md:col-span-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. State Coordinators Assembly" className="field px-4" />
        </Labeled>
        <Labeled label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field px-4" /></Labeled>
        <Labeled label="Start time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field px-4" /></Labeled>
        <Labeled label="Duration">
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button key={d} onClick={() => setDuration(d)}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${duration === d ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]" : "border-[var(--color-line)] text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"}`}>
                {d}m
              </button>
            ))}
          </div>
        </Labeled>
        <Labeled label="Location">
          <div className="flex gap-2">
            <button onClick={() => setMode("online")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition ${mode === "online" ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]" : "border-[var(--color-line)] text-[var(--color-ink-soft)]"}`}>
              <Globe2 className="h-4 w-4" /> Online
            </button>
            <button onClick={() => setMode("physical")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition ${mode === "physical" ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]" : "border-[var(--color-line)] text-[var(--color-ink-soft)]"}`}>
              <Building2 className="h-4 w-4" /> Physical
            </button>
          </div>
        </Labeled>
        {mode === "physical" && (
          <Labeled label="Venue" className="md:col-span-2">
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. National Secretariat, Abuja" className="field px-4" />
          </Labeled>
        )}
        <Labeled label="Description" className="md:col-span-2">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Agenda or notes (optional)" className="field resize-none px-4" />
        </Labeled>
      </div>

      {/* Jurisdiction target */}
      <div className="mt-5 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-4">
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
          <Layers className="h-3.5 w-3.5" /> Who to invite — jurisdiction
        </label>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {LEVELS.map((lv) => {
            const Icon = lv.icon;
            const on = level === lv.id;
            const disabled = !canPick(lv.id);
            return (
              <button
                key={lv.id}
                disabled={disabled}
                onClick={() => setLevel(lv.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                  on ? "gradient-brand border-transparent text-white shadow-sm"
                    : disabled ? "cursor-not-allowed border-[var(--color-line)] text-[var(--color-faint)] opacity-50"
                    : "border-[var(--color-line)] bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {lv.label}
              </button>
            );
          })}
        </div>

        {/* cascading selects appear as you go deeper */}
        {rank >= 1 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Select label="State" value={state} disabled={!!role?.scope.state} placeholder="Select state"
              options={STATE_NAMES} onChange={(v) => { setState(v); setLga(""); setWard(""); setPu(""); }} />
            {rank >= 2 && (
              <Select label="LGA" value={lga} disabled={!state || !!role?.scope.lga} placeholder="Select LGA"
                options={lgas} onChange={(v) => { setLga(v); setWard(""); setPu(""); }} />
            )}
            {rank >= 3 && (
              <Select label="Ward" value={ward} disabled={!lga} placeholder="Select ward"
                options={wards} onChange={(v) => { setWard(v); setPu(""); }} />
            )}
            {rank >= 4 && (
              <Select label="Polling Unit" value={pu} disabled={!ward} placeholder="Select polling unit"
                options={pus} onChange={setPu} />
            )}
          </div>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-[var(--color-muted)]">
          <MapPin className="h-3.5 w-3.5 text-[var(--color-brand-strong)]" />
          Target: <strong className="text-[var(--color-ink)]">{targetLabel(target)}</strong>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] pt-4">
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
          <Users className="h-4 w-4 text-[var(--color-brand-strong)]" />
          Inviting <strong className="text-[var(--color-ink)]">{reach.toLocaleString()}</strong> members in this jurisdiction
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="rounded-xl border border-[var(--color-line)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">Cancel</button>
          <button onClick={submit} disabled={!valid}
            className="flex items-center gap-2 rounded-xl gradient-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40">
            <Sparkles className="h-4 w-4" /> Schedule & invite
          </button>
        </div>
      </div>
    </div>
  );
}

function Select({
  label, value, options, placeholder, disabled, onChange,
}: {
  label: string; value: string; options: string[]; placeholder: string; disabled?: boolean; onChange: (v: string) => void;
}) {
  return (
    <Labeled label={label}>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="field px-4 disabled:opacity-60">
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Labeled>
  );
}

function Labeled({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">{label}</label>
      {children}
    </div>
  );
}

/* ----------------------------- gathering card ---------------------------- */

function GatheringCard({
  g, onStart, onDetail, onRecord, past,
}: {
  g: Gathering; onStart?: () => void; onDetail?: () => void; onRecord?: () => void; past?: boolean;
}) {
  const rsvps = g.attendees.filter((a) => a.status !== "invited").length;
  const attended = g.attendees.filter((a) => a.status === "attended").length;
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Date + title */}
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--color-brand-tint)] text-center">
            <span className="text-lg font-extrabold leading-none text-[var(--color-brand-strong)]">{g.date.split("-")[2]}</span>
            <span className="text-[10px] font-bold uppercase text-[var(--color-brand-strong)]/70">{fmtDate(g.date).split(" ")[2]}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-bold text-[var(--color-navy)]">{g.title}</h3>
              {g.status === "live" && (
                <span className="flex items-center gap-1 rounded-full bg-[var(--color-danger)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-danger)]">
                  <Radio className="h-2.5 w-2.5" /> LIVE
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted)]">
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {fmtRange(g.time, g.durationMins)}</span>
              <span className="flex items-center gap-1">{g.mode === "online" ? <Globe2 className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}{g.mode === "online" ? "Online" : g.location}</span>
            </div>
          </div>
        </div>

        {/* target pill */}
        <div className="flex flex-1 items-center gap-2 sm:justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-[12px] font-semibold text-[var(--color-ink-soft)]">
            <Layers className="h-3.5 w-3.5 text-[var(--color-brand-strong)]" /> {targetLabel(g.target)}
          </span>
        </div>

        {/* actions */}
        <div className="flex shrink-0 items-center gap-2">
          {past ? (
            <>
              <button onClick={onRecord} className="flex items-center gap-1.5 rounded-xl gradient-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-95">
                <Play className="h-4 w-4" /> Recording
              </button>
              <button onClick={onDetail} className="flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-3 py-2.5 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
                <Users className="h-4 w-4" /> Attendance
              </button>
            </>
          ) : (
            <>
              <button onClick={onStart} className="flex items-center gap-2 rounded-xl gradient-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-95">
                {g.status === "live" ? <Video className="h-4 w-4" /> : <Play className="h-4 w-4" />}{g.status === "live" ? "Join" : "Start"}
              </button>
              <button onClick={onDetail} className="flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-3 py-2.5 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
                <UserCheck className="h-4 w-4" /> RSVPs
              </button>
            </>
          )}
        </div>
      </div>

      {/* attendance summary */}
      <button onClick={onDetail} className="mt-3 flex w-full items-center gap-3 border-t border-[var(--color-line-soft)] pt-3 text-left">
        <div className="flex -space-x-2">
          {g.attendees.slice(0, 5).map((a) => (
            <span key={a.id} className="grid size-7 place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-white" style={{ background: a.color }}>
              {initials(a.name)}
            </span>
          ))}
        </div>
        <span className="text-[13px] text-[var(--color-muted)]">
          <strong className="text-[var(--color-ink)]">{rsvps}</strong> RSVP’d
          {past ? <> · <strong className="text-[var(--color-green)]">{attended}</strong> attended</> : null}
        </span>
        <ChevronRight className="ml-auto h-4 w-4 text-[var(--color-faint)]" />
      </button>
    </div>
  );
}

/* --------------------------- attendance drawer --------------------------- */

const STATUS_META: Record<AttendStatus, { label: string; cls: string }> = {
  attended: { label: "Attended", cls: "bg-[var(--color-green)]/12 text-[var(--color-green)]" },
  rsvp: { label: "RSVP’d", cls: "bg-[#0ea5e9]/12 text-[#0284c7]" },
  invited: { label: "Invited", cls: "bg-[var(--color-surface-2)] text-[var(--color-muted)]" },
};

function AttendanceDrawer({ g, onClose, onToggle }: { g: Gathering; onClose: () => void; onToggle: (aid: string) => void }) {
  const attended = g.attendees.filter((a) => a.status === "attended").length;
  const rsvps = g.attendees.filter((a) => a.status !== "invited").length;
  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-black/40 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--color-line)] p-5">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-[var(--color-navy)]">{g.title}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--color-muted)]">
              <Layers className="h-3.5 w-3.5" /> {targetLabel(g.target)}
            </p>
          </div>
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-[var(--color-line)] border-b border-[var(--color-line)] text-center">
          <MiniStat value={g.attendees.length} label="Invited" />
          <MiniStat value={rsvps} label="RSVP’d" />
          <MiniStat value={attended} label="Checked in" accent />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {g.attendees.map((a) => {
            const meta = STATUS_META[a.status];
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--color-surface-2)]">
                <span className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: a.color }}>{initials(a.name)}</span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{a.name}</div>
                  <div className="truncate text-xs text-[var(--color-faint)]">{a.role}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>
                <button
                  onClick={() => onToggle(a.id)}
                  title="Toggle check-in"
                  className={`grid size-8 place-items-center rounded-lg border transition ${a.status === "attended" ? "border-[var(--color-green)] bg-[var(--color-green)] text-white" : "border-[var(--color-line)] text-[var(--color-faint)] hover:bg-[var(--color-surface-2)]"}`}
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="py-3">
      <div className={`text-xl font-extrabold ${accent ? "text-[var(--color-green)]" : "text-[var(--color-navy)]"}`}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-faint)]">{label}</div>
    </div>
  );
}

/* ---------------------------- recording modal ---------------------------- */

function RecordingModal({ g, onClose }: { g: Gathering; onClose: () => void }) {
  const lines = g.recording ?? [];
  function download() {
    const body = `${g.title}\n${targetLabel(g.target)}\n${fmtDate(g.date)} · ${fmtRange(g.time, g.durationMins)}\n${"=".repeat(40)}\n\n${lines.join("\n")}`;
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${g.title.replace(/\s+/g, "-").toLowerCase()}-recording.txt`; a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--color-line)] p-5">
          <div>
            <h3 className="text-lg font-bold text-[var(--color-navy)]">{g.title}</h3>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">{fmtDate(g.date)} · {fmtRange(g.time, g.durationMins)} · {targetLabel(g.target)}</p>
          </div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"><X className="h-4 w-4" /></button>
        </div>

        {/* video placeholder */}
        <div className="relative grid h-44 place-items-center bg-[#0b0b0f] text-white">
          <button className="grid size-14 place-items-center rounded-full bg-white/15 ring-1 ring-white/30 transition hover:bg-white/25"><Play className="h-6 w-6 fill-current" /></button>
          <div className="absolute inset-x-4 bottom-3">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/20"><span className="block h-full w-1/3 rounded-full bg-[var(--color-brand)]" /></div>
            <div className="mt-1 flex justify-between text-[10px] text-white/60"><span>08:12</span><span>{Math.round(g.durationMins)}:00</span></div>
          </div>
          <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-[var(--color-danger)]/80 px-2 py-0.5 text-[10px] font-bold"><FileText className="h-3 w-3" /> Recorded</span>
        </div>

        {/* transcript */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--color-navy)]"><FileText className="h-4 w-4 text-[var(--color-brand-strong)]" /> Transcript</h4>
          <div className="space-y-2.5">
            {lines.map((l, i) => (
              <p key={i} className="text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
                <span className="mr-2 font-mono text-[11px] text-[var(--color-faint)]">{String(i * 2 + 1).padStart(2, "0")}:{String((i * 13) % 60).padStart(2, "0")}</span>{l}
              </p>
            ))}
          </div>
        </div>

        <div className="flex gap-2 border-t border-[var(--color-line)] p-4">
          <button onClick={download} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] py-3 text-sm font-bold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
            <Download className="h-4 w-4" /> Download transcript
          </button>
          <button onClick={onClose} className="flex-1 rounded-xl gradient-brand py-3 text-sm font-bold text-white transition hover:opacity-95">Done</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-4">
      <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">{icon}</span>
      <div className="mt-3 text-xl font-extrabold text-[var(--color-navy)]">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-faint)]">{label}</div>
    </div>
  );
}
