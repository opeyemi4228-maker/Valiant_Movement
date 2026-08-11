"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Megaphone, ImagePlus, Loader2, X, MapPin, Send } from "lucide-react";
import { getMyActivities, postCoordinatorActivity } from "@/app/actions/activities";
import type { ActivityDTO } from "@/lib/activities-db";

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const LEVEL_TINT: Record<string, string> = {
  national: "var(--color-brand-strong)",
  state: "var(--color-green)",
  lga: "#0ea5e9",
  ward: "#7c3aed",
};

/** A coordinator's field-activity dashboard: log what you did in your
 *  jurisdiction (photo + a few words); it saves here and surfaces in the
 *  members' general feed. */
export function ActivityDashboard() {
  const [items, setItems] = useState<ActivityDTO[] | null>(null);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    getMyActivities().then((a) => alive && setItems(a));
    return () => { alive = false; };
  }, []);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setImage(await readImage(f));
  }

  async function submit() {
    if (body.trim().length < 3 || posting) return;
    setPosting(true);
    setError(null);
    const res = await postCoordinatorActivity(body, image ?? undefined);
    setPosting(false);
    if (res.ok && res.activity) {
      setItems((prev) => [res.activity!, ...(prev ?? [])]);
      setBody("");
      setImage(null);
    } else {
      setError(res.error ?? "Couldn't save — try again.");
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-[var(--color-line)] p-4">
        <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
          <Megaphone className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-bold text-[var(--color-navy)]">Field activity</h3>
          <p className="text-[11px] text-[var(--color-faint)]">Log what you did in your jurisdiction — it posts to the members&apos; feed.</p>
        </div>
      </div>

      {/* Composer */}
      <div className="border-b border-[var(--color-line)] p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={image ? 3 : 2}
          placeholder="What did you do today? e.g. Held a ward town-hall on voter registration…"
          className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3 text-sm outline-none transition focus:border-[var(--color-brand)] focus:bg-white"
        />
        {image && (
          <div className="relative mt-2 w-fit">
            <img src={image} alt="" className="max-h-48 rounded-xl border border-[var(--color-line)]" />
            <button onClick={() => setImage(null)} className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-xs font-medium text-[var(--color-danger)]">{error}</p>}
        <div className="mt-2.5 flex items-center justify-between">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-[var(--color-brand-strong)] transition hover:bg-[var(--color-brand-tint)]"
          >
            <ImagePlus className="h-4 w-4" /> Add photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
          <button
            onClick={submit}
            disabled={body.trim().length < 3 || posting}
            className="flex items-center gap-2 rounded-full gradient-brand px-5 py-2 text-sm font-bold text-white shadow-sm transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {posting ? "Saving…" : "Post activity"}
          </button>
        </div>
      </div>

      {/* Log */}
      <div className="max-h-[28rem] divide-y divide-[var(--color-line-soft)] overflow-y-auto">
        {items === null ? (
          <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[var(--color-brand)]" /></div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center text-[13px] text-[var(--color-muted)]">
            No activities logged yet. Your first one will appear here and in the members&apos; feed.
          </div>
        ) : (
          items.map((a) => (
            <div key={a.id} className="p-4">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="rounded-full px-2 py-0.5 font-bold uppercase tracking-wide text-white" style={{ backgroundColor: LEVEL_TINT[a.level] ?? "var(--color-brand-strong)" }}>
                  {a.level}
                </span>
                <span className="flex items-center gap-1 text-[var(--color-muted)]">
                  <MapPin className="h-3 w-3" /> {a.jurisdiction}
                </span>
                <span className="ml-auto text-[var(--color-faint)]">
                  {new Date(a.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-soft)]">{a.body}</p>
              {a.image && <img src={a.image} alt="" className="mt-2 max-h-56 w-full rounded-xl border border-[var(--color-line)] object-cover" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
