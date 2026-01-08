import type { PoolClient, Notification } from "pg";
import { eq } from "drizzle-orm";
import { aiPersonas, messages } from "@shared/schema";
import { db, pool } from "./db";
import { INSTANCE_ID } from "./instance";
import { broadcastNewMessage } from "./websocket";

const CHANNEL = "chat_message_created";

let started = false;
let client: PoolClient | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
const recent = new Map<string, number>(); // messageId -> ts

function markRecent(messageId: string) {
  const now = Date.now();
  recent.set(messageId, now);
  // cheap cleanup
  if (recent.size > 1000) {
    for (const [id, ts] of recent) {
      if (now - ts > 60_000) recent.delete(id);
    }
  }
}

function wasRecent(messageId: string): boolean {
  const ts = recent.get(messageId);
  if (!ts) return false;
  return Date.now() - ts < 60_000;
}

async function handleNotification(n: Notification) {
  if (n.channel !== CHANNEL) return;
  if (!n.payload) return;

  let payload: any;
  try {
    payload = JSON.parse(n.payload);
  } catch (err) {
    console.warn("[MessageBus] Invalid JSON payload:", n.payload);
    return;
  }

  const { instanceId, conversationId, messageId } = payload || {};
  if (!conversationId || !messageId) return;

  // Dedupe: ignore notifications from this same instance (we already broadcast locally)
  if (instanceId && instanceId === INSTANCE_ID) return;

  // Dedupe: ignore duplicates for a short window
  if (wasRecent(messageId)) return;
  markRecent(messageId);

  try {
    const rows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        senderType: messages.senderType,
        content: messages.content,
        imageData: messages.imageData,
        clientMessageId: messages.clientMessageId,
        mentionedPersonaId: messages.mentionedPersonaId,
        isRead: messages.isRead,
        status: messages.status,
        createdAt: messages.createdAt,
        personaName: aiPersonas.name,
        personaAvatar: aiPersonas.avatarUrl,
      })
      .from(messages)
      .leftJoin(aiPersonas, eq(messages.senderId, aiPersonas.id))
      .where(eq(messages.id, messageId))
      .limit(1);

    const message = rows[0] as any;
    if (!message) return;

    await broadcastNewMessage(conversationId, message);
  } catch (err) {
    console.error("[MessageBus] Failed to broadcast notified message:", err);
  }
}

async function connectAndListen() {
  try {
    client = await pool.connect();

    client.on("notification", (n) => {
      // Fire-and-forget; we dedupe by messageId
      void handleNotification(n);
    });

    client.on("error", (err) => {
      console.error("[MessageBus] Listener connection error:", err);
      cleanupAndReconnect();
    });

    await client.query(`LISTEN ${CHANNEL}`);

    console.log("[MessageBus] Listening", {
      channel: CHANNEL,
      instanceId: INSTANCE_ID,
    });
  } catch (err) {
    console.error("[MessageBus] Failed to start listener:", err);
    cleanupAndReconnect();
  }
}

function cleanupAndReconnect() {
  try {
    client?.removeAllListeners();
    client?.release();
  } catch {}
  client = null;

  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectAndListen();
  }, 2000);
}

/**
 * Start Postgres LISTEN/NOTIFY message bus.
 * Required for real-time messaging in multi-instance deployments.
 */
export function startMessageBus() {
  if (started) return;
  started = true;
  void connectAndListen();
}

