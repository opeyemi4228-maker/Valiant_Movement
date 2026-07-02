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
  Megaphone,
  Building2,
  Sparkles,
} from "lucide-react";
import {
  AUDIENCES,
  seedMeetings,
  invitedCount,
  audienceById,
  formatMeetingDate,
  formatTimeRange,
  type Meeting,
  type AudienceId,
} from "@/data/meetings";
import { CallRoom, type CallConfig } from "@/components/call/CallRoom";

const DURATIONS = [30, 60, 90, 120];

const ROSTER: Record<AudienceId, { name: string; role: string; color: string }[]> = {
  national_excos: [
    { name: "Adaeze Okonkwo", role: "National Secretary", color: "#e07400" },
    { name: "Ibrahim Suleiman", role: "National Organizer", color: "#1faa59" },
    { name: "Aisha Mohammed", role: "National Youth Lead", color: "#0d9488" },
  ],
  state_coordinators: [
    { name: "Tunde Bakare", role: "Lagos Coordinator", color: "#0ea5e9" },
    { name: "Fatima Abubakar", role: "Kaduna Coordinator", color: "#e23d4e" },
    { name: "Chiamaka Eze", role: "Anambra Coordinator", color: "#7c3aed" },
  ],
  lga_coordinators: [
    { name: "Emeka Nwosu", role: "Owerri LGA", color: "#f5a524" },
    { name: "Segun Adeyemi", role: "Ibadan North LGA", color: "#db2777" },
    { name: "Musa Danjuma", role: "Kano Municipal LGA", color: "#1faa59" },
  ],
};

function rosterFor(ids: AudienceId[]) {
  return ids.flatMap((id) => ROSTER[id]).slice(0, 3);
}

export function MeetingsManager() {
  const [meetings, setMeetings] = useState<Meeting[]>(seedMeetings);
  const [showForm, setShowForm] = useState(false);
  const [call, setCall] = useState<CallConfig | null>(null);

  const upcoming = meetings.filter((m) => m.status !== "ended");
  const past = meetings.filter((m) => m.status === "ended");

  const totalInvited = useMemo(
    () => upcoming.reduce((s, m) => Math.max(s, invitedCount(m.audiences)), 0),
    [upcoming],
  );

  function schedule(m: Meeting) {
    setMeetings((prev) => [m, ...prev]);
    setShowForm(false);
  }

  function startMeeting(m: Meeting) {
    setMeetings((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: "live" } : x)));
    setCall({
      mode: "video",
      kind: "meeting",
      title: m.title,
      subtitle: m.audiences.map((a) => audienceById(a).short).join(" · "),
      participants: rosterFor(m.audiences).map((p) => ({ name: p.name, color: p.color, role: p.role })),
    });
  }

  return (
    <div className="space-y-5">
      {call && <CallRoom config={call} onClose={() => setCall(null)} />}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<CalendarClock className="h-5 w-5" />} value={String(upcoming.length)} label="Upcoming" />
        <Stat icon={<Users className="h-5 w-5" />} value={totalInvited.toLocaleString()} label="Max reach" />
        <Stat icon={<Megaphone className="h-5 w-5" />} value={String(AUDIENCES.length)} label="Audiences" />
        <Stat icon={<FileText className="h-5 w-5" />} value={String(past.length)} label="Records" />
      </div>

      {/* Header + schedule */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-navy)]">Scheduled meetings</h2>
          <p className="text-sm text-[var(--color-muted)]">Convene leadership across every tier of the movement.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl gradient-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-95"
        >
          {showForm ? <X className="h-4 w-4" /> : <CalendarPlus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Schedule meeting"}
        </button>
      </div>

      {showForm && <ScheduleForm onSubmit={schedule} onCancel={() => setShowForm(false)} />}

      {/* Upcoming list */}
      <div className="space-y-3">
        {upcoming.map((m) => (
          <MeetingCard key={m.id} m={m} onStart={() => startMeeting(m)} />
        ))}
      </div>

      {/* Past / records */}
      {past.length > 0 && (
        <div>
          <h3 className="mb-3 mt-2 text-sm font-bold uppercase tracking-wide text-[var(--color-faint)]">Records</h3>
          <div className="space-y-3">
            {past.map((m) => (
              <MeetingCard key={m.id} m={m} past />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ schedule form ------------------------------ */

function ScheduleForm({ onSubmit, onCancel }: { onSubmit: (m: Meeting) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("2026-07-04");
  const [time, setTime] = useState("14:00");
  const [duration, setDuration] = useState(60);
  const [mode, setMode] = useState<"online" | "physical">("online");
  const [location, setLocation] = useState("");
  const [audiences, setAudiences] = useState<AudienceId[]>(["national_excos"]);

  const reach = invitedCount(audiences);
  const valid = title.trim() && date && time && audiences.length > 0 && (mode === "online" || location.trim());

  function toggle(id: AudienceId) {
    setAudiences((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function submit() {
    if (!valid) return;
    onSubmit({
      id: "mtg-" + Date.now(),
      title: title.trim(),
      description: description.trim() || undefined,
      date,
      time,
      durationMins: duration,
      mode,
      location: mode === "physical" ? location.trim() : undefined,
      audiences,
      status: "scheduled",
      host: "Super Admin",
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
          <CalendarPlus className="h-5 w-5" />
        </span>
        <h3 className="font-bold text-[var(--color-navy)]">New meeting</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Labeled label="Meeting title" className="md:col-span-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. National Executive Meeting"
            className="field px-4"
          />
        </Labeled>

        <Labeled label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field px-4" />
        </Labeled>
        <Labeled label="Start time">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field px-4" />
        </Labeled>

        <Labeled label="Duration">
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
                  duration === d
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"
                    : "border-[var(--color-line)] text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
                }`}
              >
                {d}m
              </button>
            ))}
          </div>
        </Labeled>

        <Labeled label="Location">
          <div className="flex gap-2">
            <button
              onClick={() => setMode("online")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition ${
                mode === "online" ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]" : "border-[var(--color-line)] text-[var(--color-ink-soft)]"
              }`}
            >
              <Globe2 className="h-4 w-4" /> Online
            </button>
            <button
              onClick={() => setMode("physical")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition ${
                mode === "physical" ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]" : "border-[var(--color-line)] text-[var(--color-ink-soft)]"
              }`}
            >
              <Building2 className="h-4 w-4" /> Physical
            </button>
          </div>
        </Labeled>

        {mode === "physical" && (
          <Labeled label="Venue" className="md:col-span-2">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. National Secretariat, Abuja"
              className="field px-4"
            />
          </Labeled>
        )}

        <Labeled label="Description" className="md:col-span-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Agenda or notes (optional)"
            className="field resize-none px-4"
          />
        </Labeled>
      </div>

      {/* Audience picker */}
      <div className="mt-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">Invite audience</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {AUDIENCES.map((a) => {
            const on = audiences.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggle(a.id)}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                  on ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)]" : "border-[var(--color-line)] hover:bg-[var(--color-surface-2)]"
                }`}
              >
                <span
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border"
                  style={on ? { backgroundColor: a.color, borderColor: a.color } : { borderColor: "var(--color-line)" }}
                >
                  {on && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--color-ink)]">{a.short}</span>
                  <span className="block text-[11px] text-[var(--color-faint)]">{a.count.toLocaleString()} people</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] pt-4">
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
          <Users className="h-4 w-4 text-[var(--color-brand-strong)]" />
          Inviting <strong className="text-[var(--color-ink)]">{reach.toLocaleString()}</strong> members
          across {audiences.length} {audiences.length === 1 ? "group" : "groups"}
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="rounded-xl border border-[var(--color-line)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid}
            className="flex items-center gap-2 rounded-xl gradient-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" /> Schedule & invite
          </button>
        </div>
      </div>
    </div>
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

/* ------------------------------ meeting card ------------------------------ */

function MeetingCard({ m, onStart, past }: { m: Meeting; onStart?: () => void; past?: boolean }) {
  const reach = invitedCount(m.audiences);
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-line)] bg-white p-4 shadow-sm sm:flex-row sm:items-center">
      {/* Date block */}
      <div className="flex w-full items-center gap-3 sm:w-auto">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--color-brand-tint)] text-center">
          <span className="text-lg font-extrabold leading-none text-[var(--color-brand-strong)]">
            {m.date.split("-")[2]}
          </span>
          <span className="text-[10px] font-bold uppercase text-[var(--color-brand-strong)]/70">
            {formatMeetingDate(m.date).split(" ")[2]}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-bold text-[var(--color-navy)]">{m.title}</h3>
            {m.status === "live" && (
              <span className="flex items-center gap-1 rounded-full bg-[var(--color-danger)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-danger)]">
                <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-danger)]" /> LIVE
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted)]">
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatTimeRange(m.time, m.durationMins)}</span>
            <span className="flex items-center gap-1">
              {m.mode === "online" ? <Globe2 className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
              {m.mode === "online" ? "Online" : m.location}
            </span>
          </div>
        </div>
      </div>

      {/* Audiences + reach */}
      <div className="flex flex-1 flex-wrap items-center gap-1.5 sm:justify-center">
        {m.audiences.map((a) => {
          const aud = audienceById(a);
          return (
            <span
              key={a}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: `color-mix(in srgb, ${aud.color} 14%, transparent)`, color: aud.color }}
            >
              {aud.short}
            </span>
          );
        })}
        <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-faint)]">
          <Users className="h-3.5 w-3.5" /> {reach.toLocaleString()}
        </span>
      </div>

      {/* Action */}
      <div className="shrink-0">
        {past ? (
          <button className="flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
            <FileText className="h-4 w-4" /> View record
            {m.recordLines ? <span className="text-[var(--color-faint)]">· {m.recordLines} lines</span> : null}
          </button>
        ) : (
          <button
            onClick={onStart}
            className="flex w-full items-center justify-center gap-2 rounded-xl gradient-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-95 sm:w-auto"
          >
            {m.status === "live" ? <Video className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {m.status === "live" ? "Join" : "Start"}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-4">
      <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
        {icon}
      </span>
      <div className="mt-3 text-xl font-extrabold text-[var(--color-navy)]">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-faint)]">{label}</div>
    </div>
  );
}
