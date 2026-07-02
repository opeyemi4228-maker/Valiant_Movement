// Loads .env* files for tooling that runs outside the Next.js runtime
// (drizzle-kit config, seed scripts). See Next.js "Environment Variables" guide.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
