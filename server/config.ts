import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";

// Auto-load env file. Prefer config/env.local for this repo (works in environments that block .env edits).
// Safe if file doesn't exist.
dotenv.config({ path: path.resolve(process.cwd(), "config", "env.local") });
dotenv.config({ path: path.resolve(process.cwd(), "config", "env") });
dotenv.config(); // fallback to default ".env" if present

// Force all Node fetch (undici) traffic through proxy if configured (e.g., Clash).
// This is required because many libraries do NOT automatically honor system proxy settings on Windows.
(() => {
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;

  if (!proxy) return;

  try {
    setGlobalDispatcher(new ProxyAgent(proxy));
    console.log(`[Proxy] Global proxy enabled for fetch: ${proxy}`);
  } catch (err) {
    console.warn("[Proxy] Failed to enable global proxy:", (err as Error).message);
  }
})();

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type AppConfigFile = {
  server?: {
    port?: number;
    nodeEnv?: string;
    trustProxy?: number;
  };
  database?: {
    databaseUrl?: string;
  };
  session?: {
    sessionSecret?: string;
    cookieSecure?: boolean;
    cookieSameSite?: "lax" | "strict" | "none";
    cookieDomain?: string;
  };
  email?: {
    resendApiKey?: string;
    from?: string;
  };
  ai?: {
    googleAiApiKey?: string;
    integrations?: {
      geminiApiKey?: string;
      geminiBaseUrl?: string;
      openaiApiKey?: string;
      openaiBaseUrl?: string;
    };
  };
  objectStorage?: {
    mode?: "disabled" | "replit" | "s3";
    publicObjectSearchPaths?: string;
    privateObjectDir?: string;
  };
  s3?: {
    endpoint?: string;
    region?: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicBaseUrl?: string;
    forcePathStyle?: boolean;
    publicBucket?: boolean;
  };
  minimax?: {
    apiKey?: string;
    t2aWsUrl?: string;
    t2aHttpUrl?: string;
    streamAsrUrl?: string;
    streamTtsUrl?: string;
    preferHttp?: boolean;
    defaultVoiceId?: string;
    defaultLanguageBoost?: string;
    defaultSampleRate?: number;
    defaultBitrate?: number;
    defaultFormat?: "mp3" | "wav" | "pcm" | "flac";
    defaultChannel?: number;
  };
  webrtc?: {
    stunServers?: Array<{ urls: string }>;
    turnServers?: Array<{ urls: string; username?: string; credential?: string }>;
  };
};

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T extends JsonObject>(base: T, override: JsonObject): T {
  const out: JsonObject = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const existing = out[k];
    if (isObject(existing) && isObject(v)) {
      out[k] = deepMerge(existing, v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

function readJsonFileIfExists(filePath: string): JsonObject | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) {
      throw new Error("Config root must be a JSON object");
    }
    return parsed;
  } catch (err) {
    // Fail fast: config errors should be loud
    throw new Error(`Failed to read config file: ${filePath}\n${(err as Error).message}`);
  }
}

function boolToEnv(v: boolean | undefined): string | undefined {
  if (v === undefined) return undefined;
  return v ? "true" : "false";
}

function setEnvIfEmpty(key: string, value: string | undefined) {
  if (!value) return;
  if (process.env[key] === undefined || process.env[key] === "") {
    process.env[key] = value;
  }
}

function numberToEnv(v: number | undefined): string | undefined {
  if (typeof v !== "number" || Number.isNaN(v)) return undefined;
  return String(v);
}

function loadAppConfigFile(): AppConfigFile {
  const cwd = process.cwd();
  const configDir = path.resolve(cwd, "config");

  const primaryPath =
    process.env.APP_CONFIG_PATH?.trim() ||
    path.resolve(configDir, "app.config.json");
  const localOverridePath = path.resolve(configDir, "app.config.local.json");

  const primary = readJsonFileIfExists(primaryPath) || {};
  const localOverride = readJsonFileIfExists(localOverridePath) || {};

  const merged = deepMerge(primary, localOverride);
  return merged as unknown as AppConfigFile;
}

/**
 * Load JSON config (if present) and apply to process.env for backward compatibility.
 * This lets existing modules keep using process.env.* without being tied to Replit.
 */
export function loadAndApplyConfig() {
  const cfg = loadAppConfigFile();

  // Server
  setEnvIfEmpty("NODE_ENV", cfg.server?.nodeEnv);
  setEnvIfEmpty("PORT", numberToEnv(cfg.server?.port));
  setEnvIfEmpty("TRUST_PROXY", numberToEnv(cfg.server?.trustProxy));

  // Database
  setEnvIfEmpty("DATABASE_URL", cfg.database?.databaseUrl);

  // Session / cookies
  setEnvIfEmpty("SESSION_SECRET", cfg.session?.sessionSecret);
  setEnvIfEmpty("COOKIE_SECURE", boolToEnv(cfg.session?.cookieSecure));
  setEnvIfEmpty("COOKIE_SAMESITE", cfg.session?.cookieSameSite);
  setEnvIfEmpty("COOKIE_DOMAIN", cfg.session?.cookieDomain);

  // Email
  setEnvIfEmpty("RESEND_API_KEY", cfg.email?.resendApiKey);
  setEnvIfEmpty("RESEND_FROM", cfg.email?.from);

  // AI keys
  setEnvIfEmpty("GOOGLE_AI_API_KEY", cfg.ai?.googleAiApiKey);
  setEnvIfEmpty("AI_INTEGRATIONS_GEMINI_API_KEY", cfg.ai?.integrations?.geminiApiKey);
  setEnvIfEmpty("AI_INTEGRATIONS_GEMINI_BASE_URL", cfg.ai?.integrations?.geminiBaseUrl);
  setEnvIfEmpty("AI_INTEGRATIONS_OPENAI_API_KEY", cfg.ai?.integrations?.openaiApiKey);
  setEnvIfEmpty("AI_INTEGRATIONS_OPENAI_BASE_URL", cfg.ai?.integrations?.openaiBaseUrl);

  // Object storage (Replit-only sidecar). Default disabled outside Replit.
  setEnvIfEmpty("OBJECT_STORAGE_MODE", cfg.objectStorage?.mode);
  setEnvIfEmpty("PUBLIC_OBJECT_SEARCH_PATHS", cfg.objectStorage?.publicObjectSearchPaths);
  setEnvIfEmpty("PRIVATE_OBJECT_DIR", cfg.objectStorage?.privateObjectDir);

  // S3 storage configuration
  setEnvIfEmpty("S3_ENDPOINT", cfg.s3?.endpoint);
  setEnvIfEmpty("S3_REGION", cfg.s3?.region);
  setEnvIfEmpty("S3_BUCKET", cfg.s3?.bucket);
  setEnvIfEmpty("S3_ACCESS_KEY_ID", cfg.s3?.accessKeyId);
  setEnvIfEmpty("S3_SECRET_ACCESS_KEY", cfg.s3?.secretAccessKey);
  setEnvIfEmpty("S3_PUBLIC_BASE_URL", cfg.s3?.publicBaseUrl);
  setEnvIfEmpty("S3_FORCE_PATH_STYLE", boolToEnv(cfg.s3?.forcePathStyle));
  setEnvIfEmpty("S3_PUBLIC_BUCKET", boolToEnv(cfg.s3?.publicBucket));

  // MiniMax (Speech-2.6-Turbo)
  setEnvIfEmpty("MINIMAX_API_KEY", cfg.minimax?.apiKey);
  setEnvIfEmpty("MINIMAX_T2A_WS_URL", cfg.minimax?.t2aWsUrl);
  setEnvIfEmpty("MINIMAX_T2A_HTTP_URL", cfg.minimax?.t2aHttpUrl);
  setEnvIfEmpty("MINIMAX_STREAM_ASR_URL", cfg.minimax?.streamAsrUrl);
  setEnvIfEmpty("MINIMAX_STREAM_TTS_URL", cfg.minimax?.streamTtsUrl);
  setEnvIfEmpty("MINIMAX_PREFER_HTTP", boolToEnv(cfg.minimax?.preferHttp));
  setEnvIfEmpty("MINIMAX_TTS_DEFAULT_VOICE_ID", cfg.minimax?.defaultVoiceId);
  setEnvIfEmpty("MINIMAX_TTS_DEFAULT_LANGUAGE_BOOST", cfg.minimax?.defaultLanguageBoost);
  setEnvIfEmpty("MINIMAX_TTS_DEFAULT_SAMPLE_RATE", numberToEnv(cfg.minimax?.defaultSampleRate));
  setEnvIfEmpty("MINIMAX_TTS_DEFAULT_BITRATE", numberToEnv(cfg.minimax?.defaultBitrate));
  setEnvIfEmpty("MINIMAX_TTS_DEFAULT_FORMAT", cfg.minimax?.defaultFormat);
  setEnvIfEmpty("MINIMAX_TTS_DEFAULT_CHANNEL", numberToEnv(cfg.minimax?.defaultChannel));

  return cfg;
}


