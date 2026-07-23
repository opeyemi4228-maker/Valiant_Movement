import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { cookies } from "next/headers";
import type {
  ChatConversation,
  ChatMessageDTO,
  ChatMedia,
  ChatMember,
} from "@/app/actions/chat";
import type { FeedPost, FeedComment } from "./feed-types";
import type { CallSignal } from "./call-types";
import type { ModerationCategory } from "./moderation";
import type { NotifInput, NotifType, NotificationDTO } from "./notif-types";

/** How many messages EACH member must send before they can call each other. */
export const CALL_MIN_EACH = 3;

export interface ModerationAlert {
  id: string;
  convId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  categories: ModerationCategory[];
  excerpt: string;
  recipients: string[]; // roles automatically alerted
  at: number;
}

export interface CallEligibility {
  ok: boolean;
  sentByMe: number;
  sentByOther: number;
  need: number;
}

/* ============================================================
   In-memory demo backend.

   A single server-side store (cached on globalThis so it survives
   Hot Module Reload) that powers real member-to-member chat and a
   live feed WITHOUT a database. Because it lives in the dev server's
   memory, two different browser profiles that hit the same server
   share it — so two accounts can chat and post in real time.

   Data resets when the server restarts. When DATABASE_URL is set the
   app uses Postgres instead and this module is bypassed.
   ============================================================ */

const SECRET =
  process.env.ADMIN_SESSION_SECRET ?? process.env.NIN_HASH_SECRET ?? "dev-local-secret";
const COOKIE = "vm_local";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface Member {
  id: string;
  email: string;
  password: string;
  fullName: string;
  username: string;
  color: string;
  bio?: string;
  avatar?: string; // data URL
  cover?: string; // data URL
  state?: string;
  lga?: string;
  ward?: string;
  pollingUnit?: string;
}

export interface ProfileDTO {
  id: string;
  fullName: string;
  username: string;
  email: string;
  bio: string;
  avatar: string | null;
  cover: string | null;
  color: string;
  state: string;
  lga: string;
  ward: string;
  pollingUnit: string;
  memberSince: string | null; // ISO
}

export interface ProfilePatch {
  fullName?: string;
  username?: string;
  bio?: string;
  avatar?: string | null;
  cover?: string | null;
  state?: string;
  lga?: string;
  ward?: string;
  pollingUnit?: string;
}

interface Msg {
  id: string;
  convId: string;
  senderId: string;
  body: string | null;
  media: ChatMedia | null;
  at: number;
}

interface Convo {
  id: string;
  memberIds: [string, string];
  lastRead: Record<string, number>;
}

/** A call plus book-keeping the wire type doesn't carry. */
interface StoredCall extends CallSignal {
  answeredAtMs?: number; // set on accept; duration = ended - answered
  logged?: boolean; // its terminal outcome was written into the thread
}

export type { FeedPost, FeedComment };

interface Store {
  members: Map<string, Member>;
  convos: Convo[];
  messages: Msg[];
  posts: Array<{
    id: string;
    authorId: string;
    text: string;
    image?: string;
    community?: string;
    at: number;
    likedBy: Set<string>;
    repostedBy: Set<string>;
    bookmarkedBy: Set<string>;
    comments: Array<{ id: string; authorId: string; text: string; at: number }>;
  }>;
  calls: StoredCall[];
  alerts: ModerationAlert[];
  rtc: Map<string, CallRtc>;
  notifs: NotifRow[];
  reports?: MemberReport[];
}

interface NotifRow {
  id: string;
  userId: string;
  type: string;
  actorId?: string;
  actorName: string | null;
  body: string;
  href: string | null;
  read: boolean;
  at: number;
}

/** WebRTC signaling channel for a 1:1 call (SDP + trickled ICE candidates). */
interface CallRtc {
  offer?: string;
  answer?: string;
  iceFromCaller: string[];
  iceFromCallee: string[];
}

const g = globalThis as unknown as { __vmStore?: Store };

function seed(): Store {
  const chidi: Member = { id: "m_chidi", email: "member@valiantmovement.com", password: "Valiant2026", fullName: "Chidi Okafor", username: "chidi_okafor", color: "#e07400", bio: "Verified member of the Valiant Movement. Building a Nigeria led by real, accountable people. Courage to Lead. 🦅", state: "Lagos", lga: "Ikeja", ward: "Ward 04", pollingUnit: "PU 012" };
  const amara: Member = { id: "m_amara", email: "amara@valiantmovement.com", password: "Valiant2026", fullName: "Amara Eze", username: "amara_eze", color: "#1faa59", bio: "Ward organizer · rallying the youth for the movement. 💪", state: "Lagos", lga: "Surulere", ward: "Ward 07", pollingUnit: "PU 003" };

  const members = new Map<string, Member>([
    [chidi.id, chidi],
    [amara.id, amara],
  ]);

  // A starter conversation so a fresh login already has something to see.
  const convId = "c_seed";
  const now = Date.now();
  const convos: Convo[] = [
    { id: convId, memberIds: [chidi.id, amara.id], lastRead: { [chidi.id]: 0, [amara.id]: now } },
  ];
  const messages: Msg[] = [
    { id: "msg_1", convId, senderId: amara.id, body: "Welcome to Valiant! 🦅 Try messaging me back — it's live.", media: null, at: now - 60000 },
  ];

  const posts: Store["posts"] = [
    {
      id: "p_seed1",
      authorId: amara.id,
      text: "Just got verified ✅ Proud to officially be part of the movement. Who's joining the ward drive this weekend?",
      community: "Lagos State Chapter",
      at: now - 3600_000,
      likedBy: new Set(),
      repostedBy: new Set(),
      bookmarkedBy: new Set(),
      comments: [],
    },
    {
      id: "p_seed2",
      authorId: chidi.id,
      text: "Reminder: leadership town hall this Saturday, 10am. Bring a friend, bring your ideas. Courage to lead. 💪",
      at: now - 7200_000,
      likedBy: new Set([amara.id]),
      repostedBy: new Set(),
      bookmarkedBy: new Set(),
      comments: [{ id: "cm_1", authorId: amara.id, text: "Count me in! 🙌", at: now - 7000_000 }],
    },
  ];

  return { members, convos, messages, posts, calls: [], alerts: [], rtc: new Map(), notifs: [] };
}

function store(): Store {
  if (!g.__vmStore) g.__vmStore = seed();
  const s = g.__vmStore;
  // Self-heal a store cached (across HMR) before newer fields existed.
  s.calls ??= [];
  s.alerts ??= [];
  s.rtc ??= new Map();
  s.notifs ??= [];
  for (const p of s.posts) p.bookmarkedBy ??= new Set();
  return s;
}

/* ------------------------------ sessions ------------------------------ */

function sign(v: string) {
  return createHmac("sha256", SECRET).update(v).digest("hex");
}

export async function createLocalSession(memberId: string) {
  const token = `${memberId}|${sign(memberId)}`;
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearLocalSession() {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function getLocalMember(): Promise<Member | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  const sep = token.lastIndexOf("|");
  if (sep < 0) return null;
  const id = token.slice(0, sep);
  const sig = token.slice(sep + 1);
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return store().members.get(id) ?? null;
}

/* ------------------------------ accounts ------------------------------ */

const COLORS = ["#e07400", "#1faa59", "#7c3aed", "#0ea5e9", "#e23d4e", "#f5a524", "#0d9488", "#db2777"];

export function findByCredentials(email: string, password: string): Member | null {
  const e = email.trim().toLowerCase();
  for (const m of store().members.values()) {
    if (m.email.toLowerCase() === e && m.password === password) return m;
  }
  return null;
}

export function emailTaken(email: string): boolean {
  const e = email.trim().toLowerCase();
  for (const m of store().members.values()) if (m.email.toLowerCase() === e) return true;
  return false;
}

/** Ensure a member row exists for an id (e.g. a DB user using the demo feed). */
export function ensureMember(id: string, fullName: string, avatar?: string | null): Member {
  const s = store();
  let m = s.members.get(id);
  if (!m) {
    m = {
      id,
      email: "",
      password: "",
      fullName: fullName || "Member",
      username: (fullName || "member").toLowerCase().replace(/\s+/g, "_"),
      color: COLORS[s.members.size % COLORS.length],
    };
    s.members.set(id, m);
  }
  // Keep the mirror fresh so DB members' name/photo changes propagate into
  // surfaces served from this store (feed, stories).
  if (fullName && m.fullName !== fullName) m.fullName = fullName;
  if (avatar !== undefined && (avatar ?? undefined) !== m.avatar) m.avatar = avatar ?? undefined;
  return m;
}

export function getProfileDTO(id: string): ProfileDTO | null {
  const m = store().members.get(id);
  if (!m) return null;
  return {
    id: m.id,
    fullName: m.fullName,
    username: m.username,
    email: m.email,
    bio: m.bio ?? "",
    avatar: m.avatar ?? null,
    cover: m.cover ?? null,
    color: m.color,
    state: m.state ?? "",
    lga: m.lga ?? "",
    ward: m.ward ?? "",
    pollingUnit: m.pollingUnit ?? "",
    memberSince: null,
  };
}

/* --------------------------- member reports --------------------------- */

interface MemberReport {
  id: string;
  reporterId: string;
  reportedId: string;
  category: string;
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  at: number;
}

export function addMemberReport(input: {
  reporterId: string;
  reportedId: string;
  category: string;
  details?: string | null;
}): { ok: boolean; error?: string } {
  const s = store();
  s.reports ??= [];
  const dup = s.reports.find(
    (r) => r.reporterId === input.reporterId && r.reportedId === input.reportedId && r.status === "open",
  );
  if (dup) return { ok: false, error: "already-reported" };
  s.reports.push({
    id: "rep_" + randomUUID().slice(0, 8),
    reporterId: input.reporterId,
    reportedId: input.reportedId,
    category: input.category,
    details: input.details ?? null,
    status: "open",
    at: Date.now(),
  });
  return { ok: true };
}

export function updateProfile(id: string, patch: ProfilePatch): Member | null {
  const m = store().members.get(id);
  if (!m) return null;
  const str = (v?: string) => (typeof v === "string" ? v.trim() : undefined);

  const fullName = str(patch.fullName);
  if (fullName) m.fullName = fullName.slice(0, 80);
  const username = str(patch.username);
  if (username) m.username = username.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30);
  if (patch.bio !== undefined) m.bio = (patch.bio ?? "").slice(0, 280);
  if (patch.avatar !== undefined) m.avatar = patch.avatar ?? undefined;
  if (patch.cover !== undefined) m.cover = patch.cover ?? undefined;
  if (patch.state !== undefined) m.state = str(patch.state);
  if (patch.lga !== undefined) m.lga = str(patch.lga);
  if (patch.ward !== undefined) m.ward = str(patch.ward);
  if (patch.pollingUnit !== undefined) m.pollingUnit = str(patch.pollingUnit);
  return m;
}

export function addMember(input: { email: string; password: string; fullName: string }): Member {
  const s = store();
  const id = "m_" + randomUUID().slice(0, 8);
  const member: Member = {
    id,
    email: input.email.trim(),
    password: input.password,
    fullName: input.fullName.trim() || input.email.split("@")[0],
    username: input.fullName.trim().toLowerCase().replace(/\s+/g, "_") || input.email.split("@")[0],
    color: COLORS[s.members.size % COLORS.length],
  };
  s.members.set(id, member);
  return member;
}

/* -------------------------------- chat -------------------------------- */

function memberName(id: string): string {
  return store().members.get(id)?.fullName ?? "Member";
}

export function listMembers(meId: string): ChatMember[] {
  return [...store().members.values()]
    .filter((m) => m.id !== meId)
    .map((m) => ({ id: m.id, name: m.fullName, username: m.username, email: m.email, avatar: m.avatar ?? null }));
}

export function conversationsFor(meId: string): ChatConversation[] {
  const s = store();
  const result: ChatConversation[] = [];
  for (const convo of s.convos) {
    if (!convo.memberIds.includes(meId)) continue;
    const otherId = convo.memberIds.find((x) => x !== meId) ?? null;
    const msgs = s.messages.filter((m) => m.convId === convo.id).sort((a, b) => a.at - b.at);
    const last = msgs[msgs.length - 1];
    const lastRead = convo.lastRead[meId] ?? 0;
    const unread = msgs.filter((m) => m.senderId !== meId && m.at > lastRead).length;
    result.push({
      id: convo.id,
      type: "direct",
      otherId,
      otherAvatar: otherId ? s.members.get(otherId)?.avatar ?? null : null,
      title: otherId ? memberName(otherId) : "Conversation",
      lastBody: last?.body ?? null,
      lastHasMedia: !!last?.media,
      lastMedia: last?.media ?? null,
      lastAt: last ? new Date(last.at).toISOString() : null,
      unread,
    });
  }
  return result.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

export function loadChat(meId: string) {
  return { available: true, conversations: conversationsFor(meId), members: listMembers(meId) };
}

export function startDirect(meId: string, otherId: string): { ok: boolean; conversationId?: string; error?: string } {
  const s = store();
  if (meId === otherId) return { ok: false, error: "You can't message yourself." };
  if (!s.members.has(otherId)) return { ok: false, error: "Member not found." };
  const existing = s.convos.find((c) => c.memberIds.includes(meId) && c.memberIds.includes(otherId));
  if (existing) return { ok: true, conversationId: existing.id };
  const id = "c_" + randomUUID().slice(0, 8);
  s.convos.push({ id, memberIds: [meId, otherId], lastRead: { [meId]: Date.now(), [otherId]: 0 } });
  return { ok: true, conversationId: id };
}

function isMember(convId: string, meId: string): boolean {
  return !!store().convos.find((c) => c.id === convId && c.memberIds.includes(meId));
}

export function getMessages(
  meId: string,
  convId: string,
): { ok: boolean; messages: ChatMessageDTO[]; otherLastReadAt?: string | null; otherOnline?: boolean; error?: string } {
  if (!isMember(convId, meId)) return { ok: false, messages: [], error: "forbidden" };
  const s = store();
  const msgs = s.messages.filter((m) => m.convId === convId).sort((a, b) => a.at - b.at);
  const convo = s.convos.find((c) => c.id === convId)!;
  convo.lastRead[meId] = Date.now();
  const otherReads = convo.memberIds.filter((x) => x !== meId).map((x) => convo.lastRead[x] ?? 0);
  const otherLastReadAt =
    otherReads.length && otherReads.every((t) => t > 0)
      ? new Date(Math.min(...otherReads)).toISOString()
      : null;
  return {
    ok: true,
    otherLastReadAt,
    otherOnline: true, // demo/showcase peers are always "online"
    messages: msgs.map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderId === meId,
      senderId: m.senderId,
      senderName: m.senderId === meId ? "You" : memberName(m.senderId),
      senderAvatar: s.members.get(m.senderId)?.avatar ?? null,
      media: m.media,
      at: new Date(m.at).toISOString(),
    })),
  };
}

export function sendMessage(meId: string, convId: string, body: string, media?: ChatMedia | null): { ok: boolean; message?: ChatMessageDTO; error?: string } {
  if (!isMember(convId, meId)) return { ok: false, error: "forbidden" };
  const text = body.trim().slice(0, 4000);
  if (!text && !media) return { ok: false, error: "empty" };
  if (media?.kind === "call" || media?.kind === "system") {
    return { ok: false, error: "forbidden" }; // store-authored kinds only
  }
  const s = store();
  const msg: Msg = { id: "msg_" + randomUUID().slice(0, 8), convId, senderId: meId, body: text || null, media: media ?? null, at: Date.now() };
  s.messages.push(msg);
  const convo = s.convos.find((c) => c.id === convId)!;
  convo.lastRead[meId] = Date.now();
  return {
    ok: true,
    message: { id: msg.id, body: msg.body, mine: true, senderId: meId, senderName: "You", senderAvatar: null, media: msg.media, at: new Date(msg.at).toISOString() },
  };
}

export function markRead(meId: string, convId: string) {
  const convo = store().convos.find((c) => c.id === convId);
  if (convo) convo.lastRead[meId] = Date.now();
}

/* -------------------------------- feed -------------------------------- */

function toPostDTO(meId: string, p: Store["posts"][number]): FeedPost {
  const author = store().members.get(p.authorId);
  return {
    id: p.id,
    authorId: p.authorId,
    authorName: author?.fullName ?? "Member",
    authorColor: author?.color ?? "#7a7068",
    authorPhoto: author?.avatar,
    text: p.text,
    image: p.image,
    community: p.community,
    at: new Date(p.at).toISOString(),
    likes: p.likedBy.size,
    liked: p.likedBy.has(meId),
    reposts: p.repostedBy.size,
    reposted: p.repostedBy.has(meId),
    bookmarked: p.bookmarkedBy.has(meId),
    comments: p.comments
      .sort((a, b) => a.at - b.at)
      .map((c) => {
        const a = store().members.get(c.authorId);
        return { id: c.id, authorId: c.authorId, authorName: a?.fullName ?? "Member", authorColor: a?.color ?? "#7a7068", authorPhoto: a?.avatar, text: c.text, at: new Date(c.at).toISOString() };
      }),
  };
}

export function listPosts(meId: string): FeedPost[] {
  return store().posts
    .slice()
    .sort((a, b) => b.at - a.at)
    .map((p) => toPostDTO(meId, p));
}

export function addPost(meId: string, text: string, image?: string): FeedPost {
  const s = store();
  const p = { id: "p_" + randomUUID().slice(0, 8), authorId: meId, text: text.trim(), image, at: Date.now(), likedBy: new Set<string>(), repostedBy: new Set<string>(), bookmarkedBy: new Set<string>(), comments: [] };
  s.posts.unshift(p);
  return toPostDTO(meId, p);
}

export function toggleLike(meId: string, postId: string): FeedPost | null {
  const p = store().posts.find((x) => x.id === postId);
  if (!p) return null;
  if (p.likedBy.has(meId)) p.likedBy.delete(meId);
  else p.likedBy.add(meId);
  return toPostDTO(meId, p);
}

export function toggleRepost(meId: string, postId: string): FeedPost | null {
  const p = store().posts.find((x) => x.id === postId);
  if (!p) return null;
  if (p.repostedBy.has(meId)) p.repostedBy.delete(meId);
  else p.repostedBy.add(meId);
  return toPostDTO(meId, p);
}

/** Toggle a saved/bookmarked post for this member. */
export function toggleBookmark(meId: string, postId: string): FeedPost | null {
  const p = store().posts.find((x) => x.id === postId);
  if (!p) return null;
  if (p.bookmarkedBy.has(meId)) p.bookmarkedBy.delete(meId);
  else p.bookmarkedBy.add(meId);
  return toPostDTO(meId, p);
}

/** The member's saved posts, newest-saved first. */
export function listBookmarks(meId: string): FeedPost[] {
  return store()
    .posts.filter((p) => p.bookmarkedBy.has(meId))
    .sort((a, b) => b.at - a.at)
    .map((p) => toPostDTO(meId, p));
}

export function addComment(meId: string, postId: string, text: string): FeedPost | null {
  const t = text.trim();
  if (!t) return null;
  const p = store().posts.find((x) => x.id === postId);
  if (!p) return null;
  p.comments.push({ id: "cm_" + randomUUID().slice(0, 8), authorId: meId, text: t, at: Date.now() });
  return toPostDTO(meId, p);
}

/* --------------------------- call signaling --------------------------- */

const RING_TTL = 35_000; // a ringing call goes "missed" after this

/** Mirror of call-db's call log: a terminal call becomes a { kind: "call" }
 *  message in the pair's conversation. `logged` keeps it exactly-once. */
function logCallEvent(c: StoredCall) {
  if (c.logged) return;
  c.logged = true;
  const s = store();
  const convo = s.convos.find((x) => x.memberIds.includes(c.callerId) && x.memberIds.includes(c.calleeId));
  if (!convo) return;
  const media: ChatMedia = {
    kind: "call",
    callMode: c.mode,
    callStatus: c.answeredAtMs ? "completed" : c.status === "declined" ? "declined" : "missed",
  };
  if (c.answeredAtMs) media.duration = Math.max(1, Math.round((Date.now() - c.answeredAtMs) / 1000));
  s.messages.push({
    id: "msg_" + randomUUID().slice(0, 8),
    convId: convo.id,
    senderId: c.callerId, // missed calls count as unread for the callee
    body: null,
    media,
    at: Date.now(),
  });
}

function expire(c: StoredCall): StoredCall {
  if (c.status === "ringing" && Date.now() - c.at > RING_TTL) {
    c.status = "missed";
    logCallEvent(c);
  }
  return c;
}

export function placeCall(callerId: string, calleeId: string, mode: CallSignal["mode"]): CallSignal {
  const s = store();
  // retire any prior live calls involving the caller
  for (const c of s.calls) {
    if ((c.callerId === callerId || c.calleeId === callerId) && (c.status === "ringing" || c.status === "accepted")) {
      c.status = "ended";
      logCallEvent(c);
    }
  }
  const caller = s.members.get(callerId);
  const callee = s.members.get(calleeId);
  const sig: CallSignal = {
    id: "call_" + randomUUID().slice(0, 8),
    callerId,
    callerName: caller?.fullName ?? "Member",
    callerColor: caller?.color ?? "#e07400",
    calleeId,
    calleeName: callee?.fullName ?? "Member",
    mode,
    status: "ringing",
    at: Date.now(),
  };
  s.calls.push(sig);
  return sig;
}

export function getCallSignal(id: string): CallSignal | null {
  const c = store().calls.find((x) => x.id === id);
  return c ? expire(c) : null;
}

export function incomingCallFor(meId: string): CallSignal | null {
  return (
    store()
      .calls.filter((c) => c.calleeId === meId)
      .map(expire)
      .filter((c) => c.status === "ringing")
      .sort((a, b) => b.at - a.at)[0] ?? null
  );
}

export function answerCallSignal(id: string, meId: string): CallSignal | null {
  const c = store().calls.find((x) => x.id === id);
  if (!c) return null;
  expire(c);
  if (c.calleeId === meId && c.status === "ringing") {
    c.status = "accepted";
    c.answeredAtMs = Date.now();
  }
  return c;
}

export function declineCallSignal(id: string, meId: string): CallSignal | null {
  const c = getCallSignal(id);
  if (c && (c.calleeId === meId || c.callerId === meId) && (c.status === "ringing" || c.status === "accepted")) {
    c.status = "declined";
    logCallEvent(c as StoredCall);
  }
  return c;
}

export function endCallSignal(id: string): CallSignal | null {
  const c = store().calls.find((x) => x.id === id);
  if (c && (c.status === "ringing" || c.status === "accepted")) {
    c.status = "ended";
    logCallEvent(c);
  }
  return c ?? null;
}

/* --------------------------- moderation alerts --------------------------- */

export function recordModerationAlert(input: {
  convId: string;
  messageId: string;
  senderId: string;
  categories: ModerationCategory[];
  excerpt: string;
}): ModerationAlert {
  const s = store();
  const sender = s.members.get(input.senderId);
  const alert: ModerationAlert = {
    id: "alert_" + randomUUID().slice(0, 8),
    convId: input.convId,
    messageId: input.messageId,
    senderId: input.senderId,
    senderName: sender?.fullName ?? "Member",
    categories: input.categories,
    excerpt: input.excerpt.slice(0, 160),
    recipients: ["Ward Captain", "LGA Coordinator"],
    at: Date.now(),
  };
  s.alerts.unshift(alert);
  console.warn(
    `[moderation] ${alert.categories.join(", ")} flagged from ${alert.senderName} — alerted ${alert.recipients.join(" & ")}: "${alert.excerpt}"`,
  );
  return alert;
}

export function listModerationAlerts(limit = 50): ModerationAlert[] {
  return store().alerts.slice(0, limit);
}

/* ----------------------------- notifications ----------------------------- */

export function addNotification(userId: string, input: NotifInput): void {
  store().notifs.unshift({
    id: "ntf_" + randomUUID().slice(0, 8),
    userId,
    type: input.type,
    actorId: input.actorId,
    actorName: input.actorName ?? null,
    body: input.body,
    href: input.href ?? null,
    read: false,
    at: Date.now(),
  });
}

export function listNotifications(userId: string, limit = 50): NotificationDTO[] {
  return store()
    .notifs.filter((n) => n.userId === userId)
    .slice(0, limit)
    .map((n) => ({
      id: n.id,
      type: n.type as NotifType,
      actorName: n.actorName,
      body: n.body,
      href: n.href,
      read: n.read,
      at: new Date(n.at).toISOString(),
    }));
}

export function unreadNotifCount(userId: string): number {
  return store().notifs.filter((n) => n.userId === userId && !n.read).length;
}

export function markNotificationsRead(userId: string): void {
  for (const n of store().notifs) if (n.userId === userId) n.read = true;
}

/** Look up the conversation two members share (direct chat). */
function directConvo(aId: string, bId: string): Convo | undefined {
  return store().convos.find(
    (c) => c.memberIds.includes(aId) && c.memberIds.includes(bId),
  );
}

/** Gate: both members must have sent CALL_MIN_EACH messages before calling. */
export function callEligibility(meId: string, otherId: string): CallEligibility {
  const conv = directConvo(meId, otherId);
  if (!conv) return { ok: false, sentByMe: 0, sentByOther: 0, need: CALL_MIN_EACH };
  const msgs = store().messages.filter((m) => m.convId === conv.id);
  const sentByMe = msgs.filter((m) => m.senderId === meId).length;
  const sentByOther = msgs.filter((m) => m.senderId === otherId).length;
  return {
    ok: sentByMe >= CALL_MIN_EACH && sentByOther >= CALL_MIN_EACH,
    sentByMe,
    sentByOther,
    need: CALL_MIN_EACH,
  };
}

export function unreadFor(meId: string): number {
  return conversationsFor(meId).reduce((n, c) => n + c.unread, 0);
}

/* --------------------------- WebRTC signaling --------------------------- */

function rtcChannel(callId: string): CallRtc {
  const s = store();
  let r = s.rtc.get(callId);
  if (!r) {
    r = { iceFromCaller: [], iceFromCallee: [] };
    s.rtc.set(callId, r);
  }
  return r;
}

export function rtcSetOffer(callId: string, sdp: string) {
  rtcChannel(callId).offer = sdp;
}

export function rtcSetAnswer(callId: string, sdp: string) {
  rtcChannel(callId).answer = sdp;
}

export function rtcAddIce(callId: string, from: "caller" | "callee", candidate: string) {
  const r = rtcChannel(callId);
  (from === "caller" ? r.iceFromCaller : r.iceFromCallee).push(candidate);
}

export function rtcGet(callId: string): CallRtc {
  const r = rtcChannel(callId);
  return { offer: r.offer, answer: r.answer, iceFromCaller: [...r.iceFromCaller], iceFromCallee: [...r.iceFromCallee] };
}

export function rtcClear(callId: string) {
  store().rtc.delete(callId);
}
