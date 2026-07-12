/**
 * Valiant Movement — Drizzle schema (PostgreSQL / Neon)
 *
 * Mirrors DATABASE.md. One verified identity carries three product surfaces:
 * Feed (posts), Chat (messages) and Communities (groups), all organized down
 * to the polling-unit level of the Nigerian geo hierarchy.
 */
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "./id";

/**
 * Primary keys are UUIDv7: generated app-side (time-ordered, keeps B-tree
 * inserts append-only at scale) with gen_random_uuid() as the DB-side
 * fallback for raw SQL inserts. See src/db/id.ts.
 */
const pk = () => uuid("id").primaryKey().defaultRandom().$defaultFn(uuidv7);

/* ----------------------------- enums ----------------------------- */

export const userStatus = pgEnum("user_status", [
  "pending",
  "active",
  "suspended",
  "banned",
]);
export const verificationStatus = pgEnum("verification_status", [
  "pending",
  "verified",
  "failed",
  "manual",
]);
export const ninJobStatus = pgEnum("nin_job_status", [
  "queued",
  "running",
  "done",
  "failed",
]);
export const communityScope = pgEnum("community_scope", [
  "national",
  "state",
  "lga",
  "ward",
  "polling_unit",
  "interest",
]);
export const communityVisibility = pgEnum("community_visibility", [
  "public",
  "private",
  "secret",
]);
export const memberRole = pgEnum("member_role", [
  "owner",
  "admin",
  "moderator",
  "member",
]);
export const conversationType = pgEnum("conversation_type", ["direct", "group"]);

/* --------------------------- geo hierarchy --------------------------- */

export const states = pgTable("states", {
  id: pk(),
  name: text("name").notNull().unique(),
  capital: text("capital"),
  zone: text("zone"),
});

export const lgas = pgTable(
  "lgas",
  {
    id: pk(),
    stateId: uuid("state_id")
      .notNull()
      .references(() => states.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [unique().on(t.stateId, t.name), index("lgas_state_idx").on(t.stateId)],
);

export const wards = pgTable(
  "wards",
  {
    id: pk(),
    lgaId: uuid("lga_id")
      .notNull()
      .references(() => lgas.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
  },
  (t) => [unique().on(t.lgaId, t.name), index("wards_lga_idx").on(t.lgaId)],
);

export const pollingUnits = pgTable(
  "polling_units",
  {
    id: pk(),
    wardId: uuid("ward_id")
      .notNull()
      .references(() => wards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
  },
  (t) => [
    unique().on(t.wardId, t.code),
    index("polling_units_ward_idx").on(t.wardId),
  ],
);

/* ----------------------------- identity ----------------------------- */

export const users = pgTable("users", {
  id: pk(),
  email: text("email").notNull().unique(), // stored lowercased
  phone: varchar("phone", { length: 20 }).unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  status: userStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const identities = pgTable("identities", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  ninHash: text("nin_hash").unique(), // keyed hash of NIN (never store raw)
  ninCiphertext: text("nin_ciphertext"), // envelope-encrypted NIN
  verificationStatus: verificationStatus("verification_status")
    .notNull()
    .default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  legalFirstName: text("legal_first_name"),
  legalLastName: text("legal_last_name"),
  dateOfBirth: date("date_of_birth"),
  gender: text("gender"),
  source: text("source").default("manual"), // manual | nimc_sync
});

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    username: text("username").unique(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    stateId: uuid("state_id").references(() => states.id),
    lgaId: uuid("lga_id").references(() => lgas.id),
    // ward & polling unit captured as text until the official INEC dataset is
    // loaded into the `wards` / `polling_units` tables, then promoted to FKs.
    ward: text("ward"),
    pollingUnit: text("polling_unit"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // geo rollups: "members in my state / LGA"
    index("profiles_state_idx").on(t.stateId),
    index("profiles_lga_idx").on(t.lgaId),
  ],
);

/* --------------------- sessions & verification --------------------- */

export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(), // sha-256 of cookie token
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    // batch-purging expired sessions must not scan the table
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(), // sha-256 of emailed token
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // partial: only live tokens are looked up; consumed rows drop out of the index
    index("email_verifications_user_idx")
      .on(t.userId)
      .where(sql`consumed_at IS NULL`),
    index("email_verifications_expires_idx").on(t.expiresAt),
  ],
);

/* ----------------------- NIN sync (listener) ----------------------- */

export const ninSyncJobs = pgTable(
  "nin_sync_jobs",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: ninJobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("nin_jobs_status_idx").on(t.status, t.scheduledAt)],
);

export const ninVerificationLog = pgTable(
  "nin_verification_log",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestRef: text("request_ref"),
    result: text("result"), // verified | mismatch | not_found | error
    rawMeta: jsonb("raw_meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("nin_log_user_idx").on(t.userId, t.createdAt.desc())],
);

/* ----------------------------- communities ----------------------------- */

export const communities = pgTable(
  "communities",
  {
    id: pk(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    scope: communityScope("scope").notNull(),
    scopeRefId: uuid("scope_ref_id"),
    visibility: communityVisibility("visibility").notNull().default("public"),
    memberCount: integer("member_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // geo auto-join: "find the community for this ward/LGA/state"
    index("communities_scope_idx").on(t.scope, t.scopeRefId),
  ],
);

export const communityMembers = pgTable(
  "community_members",
  {
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.communityId, t.userId] }),
    index("community_members_user_idx").on(t.userId),
  ],
);

/* ------------------------------- feed ------------------------------- */

export const posts = pgTable(
  "posts",
  {
    id: pk(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    communityId: uuid("community_id").references(() => communities.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => posts.id, {
      onDelete: "cascade",
    }),
    body: text("body"),
    media: jsonb("media").default(sql`'[]'::jsonb`),
    likeCount: integer("like_count").notNull().default(0),
    replyCount: integer("reply_count").notNull().default(0),
    repostCount: integer("repost_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // (…, created_at DESC, id DESC) supports keyset pagination with a stable
    // tiebreaker — never OFFSET at this table's size
    index("posts_author_idx").on(t.authorId, t.createdAt.desc(), t.id.desc()),
    index("posts_community_idx").on(t.communityId, t.createdAt.desc(), t.id.desc()),
    // reply threads; partial keeps top-level posts out of the index
    index("posts_parent_idx")
      .on(t.parentId, t.createdAt)
      .where(sql`parent_id IS NOT NULL`),
  ],
);

export const postReactions = pgTable(
  "post_reactions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("like"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId, t.type] }),
    // "posts I liked" — reverse lookup the PK can't serve
    index("post_reactions_user_idx").on(t.userId, t.createdAt.desc()),
  ],
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    // follower lists / follower counts — reverse of the PK ordering
    index("follows_followee_idx").on(t.followeeId, t.createdAt.desc()),
    check("follows_no_self", sql`follower_id <> followee_id`),
  ],
);

/* ------------------------------- chat ------------------------------- */

export const conversations = pgTable("conversations", {
  id: pk(),
  type: conversationType("type").notNull().default("direct"),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    // "list my conversations" — reverse of the PK ordering
    index("conversation_members_user_idx").on(t.userId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: pk(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    body: text("body"),
    media: jsonb("media"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_idx").on(
      t.conversationId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
  ],
);

/* ---- calls: status + WebRTC signaling, shared across serverless instances ---- */
export const callSignals = pgTable(
  "call_signals",
  {
    id: pk(),
    callerId: uuid("caller_id").notNull().references(() => users.id),
    calleeId: uuid("callee_id").notNull().references(() => users.id),
    callerName: text("caller_name").notNull(),
    callerColor: text("caller_color").notNull(),
    calleeName: text("callee_name").notNull(),
    mode: text("mode").notNull(), // "voice" | "video"
    status: text("status").notNull().default("ringing"), // ringing|accepted|declined|missed|ended
    answeredAt: timestamp("answered_at", { withTimezone: true }), // set on accept; duration = ended - answered
    offer: text("offer"),
    answer: text("answer"),
    iceCaller: jsonb("ice_caller").notNull().default(sql`'[]'::jsonb`),
    iceCallee: jsonb("ice_callee").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("call_signals_callee_idx").on(t.calleeId, t.status),
    // signaling rows are ephemeral; this drives the stale-call sweeper
    index("call_signals_updated_idx").on(t.updatedAt),
  ],
);

/* ---- notifications: social & system alerts surfaced in the bell ---- */
export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    userId: uuid("user_id") // recipient
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // like|comment|repost|follow|mention|call|system|verified
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    body: text("body").notNull(),
    href: text("href"), // in-app destination (a tab id)
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/* ----------------------------- relations ----------------------------- */

export const usersRelations = relations(users, ({ one, many }) => ({
  identity: one(identities, {
    fields: [users.id],
    references: [identities.userId],
  }),
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  sessions: many(sessions),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
  state: one(states, { fields: [profiles.stateId], references: [states.id] }),
  lga: one(lgas, { fields: [profiles.lgaId], references: [lgas.id] }),
}));
