import { randomUUID } from "crypto";

/**
 * Unique per-process instance ID.
 * Used to dedupe cross-instance real-time events (Postgres LISTEN/NOTIFY).
 */
export const INSTANCE_ID = process.env.INSTANCE_ID || randomUUID();

