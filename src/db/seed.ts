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
import { NIGERIA } from "../data/nigeria";
import { lgas, states } from "./schema";

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
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
