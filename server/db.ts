import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { loadAndApplyConfig } from "./config";

// Ensure JSON config is applied before any DATABASE_URL checks.
// In ESM module loading, db.ts can be evaluated before server/index.ts runs.
loadAndApplyConfig();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
