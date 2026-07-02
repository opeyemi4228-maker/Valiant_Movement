"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  MapPin,
  CalendarDays,
  BadgeCheck,
  Settings,
  Heart,
  Repeat2,
  MessageCircle,
  Share2,
  Bookmark,
  QrCode,
  Users,
  Wallet,
  Trophy,
  ChevronRight,
  Globe2,
  PartyPopper,
  Camera,
  Loader2,
  X,
} from "lucide-react";
import { posts, communities } from "@/data/community";
import { naira } from "@/data/finance";
import { getMyProfile, updateMyProfile } from "@/app/actions/profile";
import type { ProfileDTO } from "@/lib/demo-store";
import { Avatar } from "./Avatar";

function fmt(n: number) {
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

const TABS = ["Posts", "Communities", "Media", "Likes"] as const;

export function Profile({
  user,
}: {
  user: { fullName: string | null; email: string; status: string };
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Posts");
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getMyProfile().then((p) => p && setProfile(p));
  }, []);

  const name = profile?.fullName ?? user.fullName ?? "Member";
  const handle = profile?.username ?? name.toLowerCase().replace(/\s+/g, "_");
  const bio =
    profile?.bio ||
    "Verified member of the Valiant Movement. Building a Nigeria led by real, accountable people. Courage to Lead. 🦅";
  const avatar = profile?.avatar ?? null;
  const cover = profile?.cover || "/highlights/02-movement.jpg";
  const color = profile?.color ?? "#e07400";
  const geoParts = profile
    ? ([
        profile.state && `${profile.state} State`,
        profile.lga && `${profile.lga} LGA`,
        profile.ward,
        profile.pollingUnit,
      ].filter(Boolean) as string[])
    : [];
  const geo = geoParts.length ? geoParts : ["Lagos State", "Ikeja LGA", "Ward 04", "PU 012"];

  function onSaved(p: ProfileDTO) {
    setProfile(p);
    setEditing(false);
    router.refresh(); // propagate the new name to the shell (sidebar/user chip)
  }

  const joined = communities.filter((c) => c.joined);
  const myPosts = posts.map((p) => ({ ...p, author: { ...p.author, name, handle, color: "#e07400", verified: true } }));
  const mediaPosts = myPosts.filter((p) => p.image);

  return (
    <div className="no-scrollbar h-full overflow-y-auto">
      {editing && profile && (
        <EditProfileModal profile={profile} onClose={() => setEditing(false)} onSaved={onSaved} />
      )}
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 sm:px-6 lg:px-8 lg:py-6">
        {/* ============================ Header card ============================ */}
        <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
          {/* Cover */}
          <div className="relative h-40 sm:h-52 xl:h-64">
            <img src={cover} alt="" className="size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
            <button
              onClick={() => setEditing(true)}
              className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-1.5 text-sm font-semibold text-[var(--color-ink)] backdrop-blur transition hover:bg-white"
            >
              <Settings className="h-4 w-4" /> Edit
            </button>
          </div>

          {/* Identity */}
          <div className="px-5 pb-5">
            <div className="-mt-12 mb-3">
              <span className="inline-block rounded-full ring-4 ring-white">
                <Avatar name={name} color={color} photo={avatar ?? undefined} size={92} online />
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-navy)]">{name}</h1>
              <BadgeCheck className="h-5 w-5 text-[var(--color-brand)]" />
            </div>
            <p className="text-[15px] text-[var(--color-faint)]">@{handle}</p>

            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-ink-soft)]">
              {bio}
            </p>

            {/* Geo breadcrumb */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-[var(--color-ink-soft)]">
              <MapPin className="h-3.5 w-3.5 text-[var(--color-brand-strong)]" />
              {geo.map((g, i) => (
                <span key={g} className="flex items-center gap-1.5">
                  <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5">{g}</span>
                  {i < geo.length - 1 && <ChevronRight className="h-3 w-3 text-[var(--color-faint)]" />}
                </span>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-[13px] text-[var(--color-muted)]">
              <CalendarDays className="h-4 w-4" /> Member since June 2026
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-4 divide-x divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)]">
              <Stat value="312" label="Following" />
              <Stat value="1.9K" label="Followers" />
              <Stat value={String(joined.length)} label="Communities" />
              <Stat value={naira(55_000, true)} label="Given" />
            </div>
          </div>
        </div>

        {/* ===================== Two-column body ===================== */}
        <div className="grid gap-5 xl:grid-cols-3">
          {/* Side column — membership ID, impact, communities */}
          <aside className="space-y-5 xl:order-2">
            {/* ========================= Digital membership ID ========================= */}
            <div className="relative overflow-hidden rounded-2xl gradient-brand p-5 text-white shadow-sm">
          <div className="absolute -right-10 -top-12 size-44 rounded-full bg-white/10" />
          <div className="absolute -bottom-14 right-20 size-36 rounded-full bg-white/10" />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex bg-white p-1 ring-1 ring-black/10">
                  <img src="/valiant-logo.png" alt="" className="h-5 w-auto" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/90">
                  Member ID
                </span>
              </div>
              <div className="mt-4 text-xl font-extrabold tracking-tight">{name}</div>
              <div className="mt-0.5 font-mono text-sm tracking-widest text-white/85">VM-LA-04817</div>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
                <Field label="Status" value="Active" />
                <Field label="Ward" value="Lagos · 04" />
                <Field label="Verified" value="NIN ✓" />
              </div>
            </div>
            <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <QrCode className="h-9 w-9 text-white" />
            </div>
          </div>
          <div className="relative mt-4 flex items-center gap-2 border-t border-white/20 pt-3 text-[12px] text-white/85">
            <ShieldCheck className="h-4 w-4" />
            Identity verified against the National Identity Number (NIN).
          </div>
        </div>

        {/* ============================ Impact stats ============================ */}
        <div className="grid grid-cols-2 gap-3">
          <Impact icon={<MessageCircle className="h-5 w-5" />} value={String(myPosts.length)} label="Posts" />
          <Impact icon={<Users className="h-5 w-5" />} value="14" label="Gatherings" />
          <Impact icon={<Wallet className="h-5 w-5" />} value={naira(55_000, true)} label="Contributed" />
          <Impact icon={<Trophy className="h-5 w-5" />} value="3" label="Milestones" />
        </div>

        {/* ============================ Communities ============================ */}
        {joined.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-line)] bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-[var(--color-brand-strong)]" />
              <h3 className="font-bold text-[var(--color-navy)]">Communities</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {joined.map((c) => (
                <span
                  key={c.id}
                  className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] py-1 pl-1 pr-3 text-sm font-medium text-[var(--color-ink-soft)]"
                >
                  <img src={c.cover} alt="" className="size-6 rounded-full object-cover" />
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}
          </aside>

          {/* Main column — tabs / posts */}
          <div className="space-y-5 xl:col-span-2 xl:order-1">
            {/* ============================== Tabs ============================== */}
            <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
          <div className="flex border-b border-[var(--color-line)]">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="relative flex-1 py-3.5 text-sm font-semibold transition hover:bg-[var(--color-surface-2)]"
              >
                <span className={tab === t ? "text-[var(--color-ink)]" : "text-[var(--color-muted)]"}>{t}</span>
                {tab === t && (
                  <span className="absolute bottom-0 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--color-brand)]" />
                )}
              </button>
            ))}
          </div>

          <div className="divide-y divide-[var(--color-line)]">
            {tab === "Posts" &&
              myPosts.map((p) => <ProfilePost key={p.id} post={p} name={name} handle={handle} />)}

            {tab === "Media" && (
              <div className="grid grid-cols-2 gap-1 p-1 sm:grid-cols-3">
                {mediaPosts.map((p) => (
                  <div key={p.id} className="aspect-square overflow-hidden rounded-lg">
                    <img src={p.image} alt="" className="size-full object-cover transition hover:scale-105" />
                  </div>
                ))}
              </div>
            )}

            {tab === "Communities" && (
              <div className="space-y-1 p-2">
                {joined.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-[var(--color-surface-2)]">
                    <img src={c.cover} alt="" className="size-11 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-[var(--color-ink)]">{c.name}</div>
                      <div className="text-xs text-[var(--color-faint)]">{fmt(c.members)} members · {c.scope}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[var(--color-faint)]" />
                  </div>
                ))}
              </div>
            )}

            {tab === "Likes" && (
              <div className="grid place-items-center px-6 py-16 text-center">
                <Heart className="mb-2 h-7 w-7 text-[var(--color-faint)]" />
                <p className="text-sm text-[var(--color-muted)]">Posts you like will appear here.</p>
              </div>
            )}
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- pieces -------------------------------- */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="py-3 text-center">
      <div className="text-lg font-extrabold text-[var(--color-navy)]">{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-faint)]">{label}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/60">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function Impact({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
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

function ProfilePost({
  post,
  name,
  handle,
}: {
  post: (typeof posts)[number];
  name: string;
  handle: string;
}) {
  const [liked, setLiked] = useState(!!post.liked);
  const likes = post.likes + (liked && !post.liked ? 1 : 0);
  return (
    <article className="px-4 py-4">
      <div className="flex items-start gap-3">
        <Avatar name={name} color="#e07400" size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px]">
            <span className="font-bold text-[var(--color-ink)]">{name}</span>
            <BadgeCheck className="h-4 w-4 text-[var(--color-brand)]" />
            <span className="text-[var(--color-faint)]">@{handle} · {post.time}</span>
          </div>
          {post.milestone && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--color-green)]/10 px-2 py-0.5 text-[11px] font-bold text-[var(--color-green)]">
              <PartyPopper className="h-3 w-3" /> Milestone
            </span>
          )}
          <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-ink-soft)]">{post.text}</p>
          {post.image && (
            <div className="mt-3 overflow-hidden rounded-xl border border-[var(--color-line)]">
              <img src={post.image} alt="" className="max-h-80 w-full object-cover" />
            </div>
          )}
          <div className="mt-3 flex items-center gap-1.5 text-[13px] text-[var(--color-muted)]">
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition hover:bg-[#0ea5e9]/8 hover:text-[#0ea5e9]">
              <MessageCircle className="h-[17px] w-[17px]" /> {fmt(post.comments)}
            </span>
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition hover:bg-[var(--color-green)]/8 hover:text-[var(--color-green)]">
              <Repeat2 className="h-[17px] w-[17px]" /> {fmt(post.reposts)}
            </span>
            <button
              onClick={() => setLiked((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition ${liked ? "bg-[var(--color-danger)]/10 text-[var(--color-danger)]" : "hover:bg-[var(--color-danger)]/8 hover:text-[var(--color-danger)]"}`}
            >
              <Heart className={`h-[17px] w-[17px] ${liked ? "fill-current" : ""}`} /> {fmt(likes)}
            </button>
            <div className="flex-1" />
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition hover:bg-[var(--color-brand)]/8 hover:text-[var(--color-brand-strong)]">
              <Bookmark className="h-[17px] w-[17px]" />
            </span>
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]">
              <Share2 className="h-[17px] w-[17px]" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* --------------------------- Edit profile modal --------------------------- */

/** Downscale + encode a picked image so stored data URLs stay small. */
function readImage(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) return reject(new Error("no-canvas"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad-image"));
    };
    img.src = url;
  });
}

function EditProfileModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: ProfileDTO;
  onClose: () => void;
  onSaved: (p: ProfileDTO) => void;
}) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [state, setState] = useState(profile.state);
  const [lga, setLga] = useState(profile.lga);
  const [ward, setWard] = useState(profile.ward);
  const [pu, setPu] = useState(profile.pollingUnit);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar);
  const [cover, setCover] = useState<string | null>(profile.cover);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>, kind: "avatar" | "cover") {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    try {
      const url = await readImage(f, kind === "avatar" ? 512 : 1280);
      if (kind === "avatar") setAvatar(url);
      else setCover(url);
    } catch {
      setError("Couldn't read that image.");
    }
  }

  async function save() {
    if (!fullName.trim()) {
      setError("Your name can't be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updateMyProfile({ fullName, username, bio, avatar, cover, state, lga, ward, pollingUnit: pu });
    setSaving(false);
    if (res.ok && res.profile) onSaved(res.profile);
    else setError(res.error ?? "Could not save your changes.");
  }

  const coverSrc = cover || "/highlights/02-movement.jpg";

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="my-auto w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3.5">
          <h2 className="text-lg font-extrabold text-[var(--color-navy)]">Edit profile</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {/* Cover + avatar */}
          <div className="relative h-36">
            <img src={coverSrc} alt="" className="size-full object-cover" />
            <div className="absolute inset-0 bg-black/25" />
            <button
              onClick={() => coverRef.current?.click()}
              className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/70"
            >
              <Camera className="h-4 w-4" /> Cover
            </button>
            <input ref={coverRef} type="file" accept="image/*" hidden onChange={(e) => pick(e, "cover")} />
            <button
              onClick={() => avatarRef.current?.click()}
              className="absolute -bottom-8 left-5 grid size-20 place-items-center overflow-hidden rounded-full ring-4 ring-white"
              style={{ backgroundColor: profile.color }}
              title="Change photo"
            >
              {avatar ? (
                <img src={avatar} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-white">
                  {fullName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                </span>
              )}
              <span className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition hover:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </span>
            </button>
            <input ref={avatarRef} type="file" accept="image/*" hidden onChange={(e) => pick(e, "avatar")} />
          </div>

          {/* Fields */}
          <div className="space-y-4 px-5 pb-5 pt-12">
            <EditField label="Full name">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} className={inputCls} />
            </EditField>
            <EditField label="Username">
              <div className="flex items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pl-3 focus-within:border-[var(--color-brand)] focus-within:bg-white">
                <span className="text-[var(--color-faint)]">@</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} className="w-full bg-transparent px-1.5 py-2.5 text-[15px] outline-none" />
              </div>
            </EditField>
            <EditField label="Bio">
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} className={`${inputCls} resize-none`} />
              <div className="mt-1 text-right text-[11px] text-[var(--color-faint)]">{bio.length}/280</div>
            </EditField>
            <div className="grid grid-cols-2 gap-3">
              <EditField label="State"><input value={state} onChange={(e) => setState(e.target.value)} className={inputCls} /></EditField>
              <EditField label="LGA"><input value={lga} onChange={(e) => setLga(e.target.value)} className={inputCls} /></EditField>
              <EditField label="Ward"><input value={ward} onChange={(e) => setWard(e.target.value)} className={inputCls} /></EditField>
              <EditField label="Polling unit"><input value={pu} onChange={(e) => setPu(e.target.value)} className={inputCls} /></EditField>
            </div>

            {error && <p className="text-sm font-medium text-[var(--color-danger)]">{error}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] px-5 py-3.5">
          <button onClick={onClose} className="rounded-full border border-[var(--color-line)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-full gradient-brand px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-95 disabled:opacity-60"
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[15px] outline-none transition focus:border-[var(--color-brand)] focus:bg-white";

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">{label}</span>
      {children}
    </label>
  );
}
