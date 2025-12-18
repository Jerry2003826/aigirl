import { Resend } from "resend";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { ProxyAgent, setGlobalDispatcher } from "undici";

// Auto-load env files for this standalone script (same order as server):
// config/env.local -> config/env -> .env
const envLocal = path.resolve(process.cwd(), "config", "env.local");
const envDefault = path.resolve(process.cwd(), "config", "env");
const envDot = path.resolve(process.cwd(), ".env");

if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
if (fs.existsSync(envDefault)) dotenv.config({ path: envDefault });
if (fs.existsSync(envDot)) dotenv.config({ path: envDot });

// Force undici (Node fetch) to use proxy if configured (e.g., Clash).
const proxy =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy;
if (proxy) {
  try {
    setGlobalDispatcher(new ProxyAgent(proxy));
    console.log(`[Proxy] Using proxy: ${proxy}`);
  } catch (err) {
    console.warn("[Proxy] Failed to enable proxy:", err?.message || err);
  }
}

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM || "Acme <onboarding@resend.dev>";
const to = process.env.RESEND_TEST_TO || "delivered@resend.dev";

if (!apiKey) {
  console.error("Missing RESEND_API_KEY env var");
  process.exit(2);
}

const resend = new Resend(apiKey);

(async function () {
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Resend Test",
    html: "<strong>It works!</strong>",
  });

  if (error) {
    console.error("❌ Resend error:", error);
    process.exit(1);
  }

  console.log("✅ Sent:", data);
})();


