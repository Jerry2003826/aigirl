import { defineConfig } from "drizzle-kit";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Auto-load env for drizzle-kit as well (it does not run server/index.ts)
dotenv.config({ path: path.resolve(process.cwd(), "config", "env.local") });
dotenv.config({ path: path.resolve(process.cwd(), "config", "env") });
dotenv.config();

function readJsonIfExists(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Allow DATABASE_URL to be sourced from config/app.config.json for deployments without server bootstrapping.
// drizzle-kit runs this file directly (without server/index.ts), so we load config here too.
if (!process.env.DATABASE_URL) {
  const cwd = process.cwd();
  const configDir = path.resolve(cwd, "config");
  const primaryPath = process.env.APP_CONFIG_PATH?.trim() || path.resolve(configDir, "app.config.json");
  const localOverridePath = path.resolve(configDir, "app.config.local.json");

  const primary = readJsonIfExists(primaryPath) || {};
  const localOverride = readJsonIfExists(localOverridePath) || {};
  const merged = { ...primary, ...localOverride };

  const databaseUrl =
    merged?.database?.databaseUrl ||
    localOverride?.database?.databaseUrl ||
    primary?.database?.databaseUrl;

  if (typeof databaseUrl === "string" && databaseUrl.trim()) {
    process.env.DATABASE_URL = databaseUrl.trim();
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
