/**
 * Valiant Movement — Drizzle schema (PostgreSQL / Neon)
 *
 * Mirrors DATABASE.md. One verified identity carries three product surfaces:
 * Feed (posts), Chat (messages) and Communities (groups), all organized down
 * to the polling-unit level of the Nigerian geo hierarchy.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
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
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  capital: text("capital"),
  zone: text("zone"),
});

export const lgas = pgTable(
  "lgas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    id: uuid("id").primaryKey().defaultRandom(),
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
    id: uuid("id").primaryKey().defaultRandom(),
    wardId: uuid("ward_id")
      .notNull()
      .references(() => wards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
  },
  (t) => [index("polling_units_ward_idx").on(t.wardId)],
);

/* ----------------------------- identity ----------------------------- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(), // stored lowercased
  phone: varchar("phone", { length: 20 }).unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  status: userStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const identities = pgTable("identities", {
  id: uuid("id").primaryKey().defaultRandom(),
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

export const profiles = pgTable("profiles", {
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
});

/* --------------------- sessions & verification --------------------- */

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(), // sha-256 of cookie token
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(), // sha-256 of emailed token
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_verifications_user_idx").on(t.userId)],
);

/* ----------------------- NIN sync (listener) ----------------------- */

export const ninSyncJobs = pgTable(
  "nin_sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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

export const ninVerificationLog = pgTable("nin_verification_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  requestRef: text("request_ref"),
  result: text("result"), // verified | mismatch | not_found | error
  rawMeta: jsonb("raw_meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------- communities ----------------------------- */

export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  scope: communityScope("scope").notNull(),
  scopeRefId: uuid("scope_ref_id"),
  visibility: communityVisibility("visibility").notNull().default("public"),
  memberCount: integer("member_count").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    communityId: uuid("community_id").references(() => communities.id),
    parentId: uuid("parent_id"),
    body: text("body"),
    media: jsonb("media").default(sql`'[]'::jsonb`),
    likeCount: integer("like_count").notNull().default(0),
    replyCount: integer("reply_count").notNull().default(0),
    repostCount: integer("repost_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("posts_author_idx").on(t.authorId, t.createdAt),
    index("posts_community_idx").on(t.communityId, t.createdAt),
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
  (t) => [primaryKey({ columns: [t.postId, t.userId, t.type] })],
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
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] })],
);

/* ------------------------------- chat ------------------------------- */

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
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
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
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
