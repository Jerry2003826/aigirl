import session from "express-session";
import connectPg from "connect-pg-simple";

// ========== Session配置 ==========
const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
const pgStore = connectPg(session);

export const sessionStore = new pgStore({
  conString: process.env.DATABASE_URL,
  createTableIfMissing: false,
  ttl: sessionTtl,
  tableName: "sessions",
});

function readBoolEnv(key: string, defaultValue: boolean): boolean {
  const v = (process.env[key] || "").toLowerCase().trim();
  if (!v) return defaultValue;
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return defaultValue;
}

function readStringEnv(key: string): string | undefined {
  const v = process.env[key];
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : undefined;
}

function readSameSiteEnv(): "lax" | "strict" | "none" {
  const v = (process.env.COOKIE_SAMESITE || "").toLowerCase().trim();
  if (v === "strict") return "strict";
  if (v === "none") return "none";
  return "lax";
}

export function getSession() {
  const isProd = process.env.NODE_ENV === "production";
  const secure = readBoolEnv("COOKIE_SECURE", isProd);
  const sameSite = readSameSiteEnv();
  const domain = readStringEnv("COOKIE_DOMAIN");

  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure,
      sameSite,
      ...(domain ? { domain } : {}),
      maxAge: sessionTtl,
    },
  });
}

