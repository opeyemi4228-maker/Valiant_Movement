import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Neon HTTP driver — ideal for serverless/edge request handlers and Server
 * Actions. Atomic multi-statement writes use `db.batch([...])`.
 *
 * A syntactically-valid placeholder keeps `next build` working before real
 * credentials are set; actual queries only run at request time.
 */
const connectionString =
  env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost/placeholder";

const sql = neon(connectionString);

export const db = drizzle(sql, { schema });

export { schema };
