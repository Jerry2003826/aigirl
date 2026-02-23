import { Server } from "http";
import { parse } from "cookie";
import { WebSocket, WebSocketServer } from "ws";
import { sessionStore } from "../routes";
import { storage } from "../storage";
import { generateAIResponse } from "../aiService";
import { minimaxTtsToBuffer } from "./minimaxTts";
import { minimaxTtsStream } from "./minimaxTtsStream";
import { transcribePcmStream } from "./minimaxAsrStream";

type VoiceWsMessage =
  | { type: "start"; payload: { conversationId: string; personaId?: string } }
  | { type: "user_text"; payload: { text: string } }
  | { type: "ping" }
  | { type: "end" };

export type VoiceSessionStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

type VoiceWsClient = WebSocket & {
  userId?: string;
  conversationId?: string;
  personaId?: string;
  pcmBuffers?: Buffer[];
  voiceStatus?: VoiceSessionStatus;
};

function toBuffer(raw: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw);
  return Buffer.from(raw);
}

function voiceLog(event: string, detail?: Record<string, unknown>) {
  const payload = detail ? { event, ...detail } : { event };
  console.log("[voice-ai]", new Date().toISOString(), JSON.stringify(payload));
}

function sendVoiceStatus(ws: VoiceWsClient, status: VoiceSessionStatus) {
  (ws as VoiceWsClient).voiceStatus = status;
  try {
    ws.send(JSON.stringify({ type: "voice_status", payload: { status } }));
  } catch {
    // ignore
  }
}

async function resolveMinimaxApiKey(userId?: string): Promise<string | undefined> {
  if (!userId) return process.env.MINIMAX_API_KEY;
  const userSettings = await storage.getAiSettings(userId);
  return userSettings?.minimaxApiKey ?? process.env.MINIMAX_API_KEY ?? undefined;
}

async function resolveMinimaxStreamUrls(userId?: string): Promise<{ asrUrl?: string; ttsUrl?: string }> {
  if (!userId) {
    return {
      asrUrl: process.env.MINIMAX_STREAM_ASR_URL || "wss://api.minimax.io/ws/v1/asr",
      ttsUrl: process.env.MINIMAX_STREAM_TTS_URL || "wss://api.minimax.io/ws/v1/t2a_v2",
    };
  }
  const userSettings = await storage.getAiSettings(userId);
  return {
    asrUrl:
      userSettings?.minimaxStreamAsrUrl ||
      process.env.MINIMAX_STREAM_ASR_URL ||
      "wss://api.minimax.io/ws/v1/asr",
    ttsUrl:
      userSettings?.minimaxStreamTtsUrl ||
      process.env.MINIMAX_STREAM_TTS_URL ||
      "wss://api.minimax.io/ws/v1/t2a_v2",
  };
}

async function authenticate(ws: VoiceWsClient, req: any): Promise<string | null> {
  const cookies = req.headers?.cookie ? parse(req.headers.cookie) : {};
  const sessionId = cookies["connect.sid"];
  if (!sessionId) return null;
  const sid = sessionId.startsWith("s:") ? sessionId.slice(2).split(".")[0] : sessionId;
  const sessionData = await new Promise<any>((resolve, reject) => {
    sessionStore.get(sid, (err: any, session: any) => {
      if (err) reject(err);
      else resolve(session);
    });
  });
  if (!sessionData?.user?.id) return null;
  ws.userId = sessionData.user.id;
  return ws.userId ?? null;
}

async function resolvePersona(conversationId: string): Promise<string | null> {
  const participants = await storage.getConversationParticipants(conversationId);
  if (participants && participants.length > 0) return participants[0].personaId ?? null;
  const conv = await storage.getConversation(conversationId);
  return conv?.userId ?? null;
}

export function setupVoiceWebSocket(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws/voice-ai",
    perMessageDeflate: false, // avoid RSV1/compression issues behind proxies
  });

  wss.on("connection", async (ws: VoiceWsClient, req) => {
    const connAt = Date.now();
    try {
      const userId = await authenticate(ws, req);
      if (!userId) {
        voiceLog("connection_rejected", { reason: "no_user" });
        ws.close(1008, "Authentication required");
        return;
      }
      voiceLog("connection_ok", { userId: userId.slice(0, 8), ms: Date.now() - connAt });
      ws.send(JSON.stringify({ type: "ready" }));
    } catch (err) {
      voiceLog("connection_error", { error: (err as Error)?.message });
      console.error("[voice-ai] auth error", err);
      ws.close(1011, "Auth failed");
      return;
    }

    ws.on("message", async (raw, isBinary) => {
      // Binary audio frames
      if (isBinary) {
        ws.pcmBuffers = ws.pcmBuffers || [];
        ws.pcmBuffers.push(toBuffer(raw));
        ws.send(JSON.stringify({ type: "asr_partial", payload: { note: "收到音频帧" } }));
        return;
      }

      let msg: VoiceWsMessage | null = null;
      try {
        msg = JSON.parse(toBuffer(raw).toString("utf8"));
      } catch {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Invalid JSON" } }));
        return;
      }

      if (!msg) return;

      switch (msg.type) {
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        case "start": {
          const { conversationId, personaId } = msg.payload || {};
          if (!conversationId) {
            ws.send(JSON.stringify({ type: "error", payload: { message: "conversationId is required" } }));
            return;
          }
          ws.conversationId = conversationId;
          ws.personaId = personaId || (await resolvePersona(conversationId)) || undefined;
          ws.pcmBuffers = [];
          voiceLog("session_start", { conversationId: conversationId.slice(0, 8) });
          sendVoiceStatus(ws, "listening");
          ws.send(
            JSON.stringify({
              type: "started",
              payload: { conversationId: ws.conversationId, personaId: ws.personaId },
            })
          );
          return;
        }
        case "user_text": {
          if (!ws.conversationId) {
            ws.send(JSON.stringify({ type: "error", payload: { message: "Call not started" } }));
            return;
          }
          const text = (msg.payload?.text || "").trim();
          if (!text) {
            ws.send(JSON.stringify({ type: "error", payload: { message: "Empty text" } }));
            return;
          }
          const personaId = ws.personaId || (await resolvePersona(ws.conversationId));
          if (!personaId) {
            ws.send(JSON.stringify({ type: "error", payload: { message: "No persona found" } }));
            return;
          }
          try {
            await handleAiTurn(ws, text, personaId);
          } catch (err: any) {
            console.error("[voice-ai] error", err);
            ws.send(JSON.stringify({ type: "error", payload: { message: err?.message || "Server error" } }));
          }
          return;
        }
        case "end": {
          try {
            sendVoiceStatus(ws, "thinking");
            const pcm = Buffer.concat(ws.pcmBuffers || []);
            ws.pcmBuffers = [];
            if (!ws.conversationId) {
              ws.close(1000, "ended");
              return;
            }
            if (pcm.length === 0) {
              voiceLog("asr_skip", { reason: "no_audio" });
              sendVoiceStatus(ws, "listening");
              ws.close(1000, "ended");
              return;
            }
            const asrStart = Date.now();
            const personaId = ws.personaId || (await resolvePersona(ws.conversationId));
            const apiKey = await resolveMinimaxApiKey(ws.userId);
            const urls = await resolveMinimaxStreamUrls(ws.userId);
            const asr = await transcribePcmStream(pcm, {
              apiKey,
              streamAsrUrl: urls.asrUrl,
              sampleRate: 16000,
              language: "zh",
            });
            voiceLog("asr_done", { ms: Date.now() - asrStart, hasFinal: !!asr.final, hasPartial: !!asr.partial });
            if (asr.partial) ws.send(JSON.stringify({ type: "asr_partial", payload: { text: asr.partial } }));
            if (asr.final) ws.send(JSON.stringify({ type: "asr_final", payload: { text: asr.final } }));
            const text = asr.final || asr.partial || "";
            if (text) {
              await handleAiTurn(ws, text, personaId || undefined);
            } else {
              sendVoiceStatus(ws, "error");
              ws.send(JSON.stringify({ type: "error", payload: { message: "未识别到语音" } }));
            }
            ws.close(1000, "ended");
          } catch (err: any) {
            voiceLog("asr_error", { error: err?.message });
            sendVoiceStatus(ws, "error");
            const rawMessage = err?.message || "Server error";
            const message =
              typeof rawMessage === "string" && rawMessage.includes("MINIMAX_API_KEY")
                ? "请先在设置中配置 MiniMax API Key"
                : rawMessage;
            ws.send(JSON.stringify({ type: "error", payload: { message } }));
            ws.close(1011, "server error");
          }
          return;
        }
        default:
          ws.send(JSON.stringify({ type: "error", payload: { message: "Unknown message type" } }));
      }
    });
  });

  console.log("[voice-ai] WebSocket server ready at /ws/voice-ai");
}

async function handleAiTurn(ws: VoiceWsClient, userText: string, personaId?: string) {
  const llmStart = Date.now();
  const aiText = await generateAIResponse({
    conversationId: ws.conversationId!,
    personaId: personaId || ws.personaId!,
    userMessage: userText,
    contextLimit: 30,
  });
  voiceLog("llm_done", { ms: Date.now() - llmStart, textLen: aiText?.length ?? 0 });
  ws.send(JSON.stringify({ type: "asr_final", payload: { text: userText } }));
  ws.send(JSON.stringify({ type: "ai_text", payload: { text: aiText } }));

  sendVoiceStatus(ws, "speaking");
  const ttsStart = Date.now();
  let seq = 0;
  const apiKey = await resolveMinimaxApiKey(ws.userId);
  const urls = await resolveMinimaxStreamUrls(ws.userId);
  for await (const chunk of minimaxTtsStream({ text: aiText, apiKey, streamTtsUrl: urls.ttsUrl })) {
    ws.send(
      JSON.stringify({
        type: "tts_chunk",
        payload: {
          seq: chunk.seq ?? seq,
          audioBase64: chunk.audioBase64,
          contentType: chunk.contentType,
          done: chunk.done,
          text: aiText,
        },
      })
    );
    seq += 1;
  }
  voiceLog("tts_done", { ms: Date.now() - ttsStart, chunks: seq });
  ws.send(JSON.stringify({ type: "tts_end" }));
}

