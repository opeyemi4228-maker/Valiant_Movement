/**
 * Seeds the geo hierarchy (states + LGAs) from src/data/nigeria.ts.
 * Wards / polling units are generated client-side for now and loaded later from
 * the official INEC dataset. Idempotent — safe to run repeatedly.
 *
 * Run with:  npm run db:seed
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, inArray } from "drizzle-orm";
import { NIGERIA } from "../data/nigeria";
import { conversationMembers, conversations, lgas, messages, profiles, states, users } from "./schema";
import { hashPassword } from "../lib/password";

type Db = ReturnType<typeof drizzle>;

/**
 * Seed the ready-to-use demo members as REAL database accounts so they behave
 * exactly like registered users (persistent, cross-device chat & calls).
 * Sign in with either email + password "Valiant2026". Idempotent.
 */
const DEMO_MEMBERS = [
  { email: "member@valiantmovement.com", fullName: "Chidi Okafor", username: "chidi_okafor" },
  { email: "amara@valiantmovement.com", fullName: "Amara Eze", username: "amara_eze" },
];
const DEMO_PASSWORD = "Valiant2026";

/** Geo placement for the demo members — drives their auto-joined communities
 *  (State › LGA › Ward › Polling Unit), same as a real registration. */
const DEMO_PLACEMENT = { state: "Lagos", lga: "Ikeja", ward: "Ward 04", pollingUnit: "PU 012" };

async function seedDemoMembers(db: Db) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const ids: string[] = [];

  // Resolve the demo placement to real geo rows (seeded above).
  const [state] = await db.select({ id: states.id }).from(states).where(eq(states.name, DEMO_PLACEMENT.state)).limit(1);
  const [lga] = state
    ? await db
        .select({ id: lgas.id })
        .from(lgas)
        .where(and(eq(lgas.stateId, state.id), eq(lgas.name, DEMO_PLACEMENT.lga)))
        .limit(1)
    : [undefined];

  for (const m of DEMO_MEMBERS) {
    const [u] = await db
      .insert(users)
      .values({ email: m.email, passwordHash, emailVerified: true, status: "active" })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash, emailVerified: true, status: "active" },
      })
      .returning({ id: users.id });
    ids.push(u.id);
    const profile = {
      fullName: m.fullName,
      username: m.username,
      stateId: state?.id ?? null,
      lgaId: lga?.id ?? null,
      ward: DEMO_PLACEMENT.ward,
      pollingUnit: DEMO_PLACEMENT.pollingUnit,
    };
    await db
      .insert(profiles)
      .values({ userId: u.id, ...profile })
      // Update so accounts seeded before placement existed get their geo.
      .onConflictDoUpdate({ target: profiles.userId, set: profile });
  }

  // A starter direct conversation between them (only if one doesn't exist yet).
  const [a, b] = ids;
  const mine = await db
    .select({ c: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, a));
  const aConvos = mine.map((r) => r.c);
  let convoId: string | null = null;
  if (aConvos.length) {
    const [shared] = await db
      .select({ c: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.userId, b), inArray(conversationMembers.conversationId, aConvos)))
      .limit(1);
    convoId = shared?.c ?? null;
  }
  if (!convoId) {
    const [conv] = await db.insert(conversations).values({ type: "direct" }).returning({ id: conversations.id });
    convoId = conv.id;
    await db.insert(conversationMembers).values([
      { conversationId: convoId, userId: a },
      { conversationId: convoId, userId: b },
    ]);
    await db.insert(messages).values({
      conversationId: convoId,
      senderId: b,
      body: "Welcome to Valiant! 🦅 Message me back — it's live.",
      deliveredAt: new Date(),
    });
  }
  console.log(`✓ Seeded ${DEMO_MEMBERS.length} demo members (login with password "${DEMO_PASSWORD}").`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set. Add it to .env.local first.");

  const db = drizzle(neon(url));
  let stateCount = 0;
  let lgaCount = 0;

  for (const state of NIGERIA) {
    const [stateRow] = await db
      .insert(states)
      .values({ name: state.name, capital: state.capital, zone: state.zone })
      .onConflictDoUpdate({
        target: states.name,
        set: { capital: state.capital, zone: state.zone },
      })
      .returning({ id: states.id });
    stateCount++;

    for (const lga of state.lgas) {
      await db
        .insert(lgas)
        .values({ stateId: stateRow.id, name: lga })
        .onConflictDoNothing();
      lgaCount++;
    }
  }

  console.log(`✓ Seeded ${stateCount} states and ${lgaCount} LGAs.`);

  await seedDemoMembers(db);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
