import { Server } from "http";
import { parse } from "cookie";
import { WebSocket, WebSocketServer } from "ws";
import { sessionStore } from "../session";
import { storage } from "../storage";
import { generateAIResponse } from "../aiService";
import { minimaxTtsStream } from "./minimaxTtsStream";
import { transcribePcmStream } from "./minimaxAsrStream";

type VoiceWsMessage =
  | { type: "start"; payload: { conversationId: string; personaId?: string } }
  | { type: "user_text"; payload: { text: string } }
  | { type: "ping" }
  | { type: "end" };

type VoiceWsClient = WebSocket & {
  userId?: string;
  conversationId?: string;
  personaId?: string;
  pcmBuffers?: Buffer[];
};

type MinimaxRuntimeConfig = {
  apiKey?: string;
  streamAsrUrl?: string;
  streamTtsUrl?: string;
};

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
  return ws.userId;
}

async function resolvePersona(conversationId: string): Promise<string | null> {
  const participants = await storage.getConversationParticipants(conversationId);
  if (participants && participants.length > 0) return participants[0].personaId;
  const conv = await storage.getConversation(conversationId);
  return conv?.userId || null;
}

async function getMinimaxConfig(userId?: string): Promise<MinimaxRuntimeConfig> {
  if (!userId) {
    return {
      apiKey: process.env.MINIMAX_API_KEY,
      streamAsrUrl: process.env.MINIMAX_STREAM_ASR_URL,
      streamTtsUrl: process.env.MINIMAX_STREAM_TTS_URL,
    };
  }
  const settings = await storage.getAiSettings(userId);
  return {
    apiKey: settings?.minimaxApiKey || process.env.MINIMAX_API_KEY,
    streamAsrUrl: process.env.MINIMAX_STREAM_ASR_URL,
    streamTtsUrl: process.env.MINIMAX_STREAM_TTS_URL,
  };
}

export function setupVoiceWebSocket(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws/voice-ai",
    perMessageDeflate: false, // avoid RSV1/compression issues behind proxies
  });

  wss.on("connection", async (ws: VoiceWsClient, req) => {
    try {
      const userId = await authenticate(ws, req);
      if (!userId) {
        ws.close(1008, "Authentication required");
        return;
      }
      ws.send(JSON.stringify({ type: "ready" }));
    } catch (err) {
      console.error("[voice-ai] auth error", err);
      ws.close(1011, "Auth failed");
      return;
    }

    ws.on("message", async (raw, isBinary) => {
      // Binary audio frames
      if (isBinary) {
        ws.pcmBuffers = ws.pcmBuffers || [];
        ws.pcmBuffers.push(Buffer.from(raw));
        ws.send(JSON.stringify({ type: "asr_partial", payload: { note: "收到音频帧" } }));
        return;
      }

      let msg: VoiceWsMessage | null = null;
      try {
        msg = JSON.parse(raw.toString());
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
          const minimaxConfig = await getMinimaxConfig(ws.userId);
          if (!minimaxConfig.apiKey) {
            ws.send(JSON.stringify({ type: "error", payload: { message: "未配置 MINIMAX_API_KEY，请在设置中填写。" } }));
            return;
          }
          try {
            await handleAiTurn(ws, text, personaId, minimaxConfig);
          } catch (err: any) {
            console.error("[voice-ai] error", err);
            ws.send(JSON.stringify({ type: "error", payload: { message: err?.message || "Server error" } }));
          }
          return;
        }
        case "end": {
          const pcm = Buffer.concat(ws.pcmBuffers || []);
          ws.pcmBuffers = [];
          if (!ws.conversationId) {
            ws.close(1000, "ended");
            return;
          }
          if (pcm.length === 0) {
            ws.close(1000, "ended");
            return;
          }
          const personaId = ws.personaId || (await resolvePersona(ws.conversationId));
          const minimaxConfig = await getMinimaxConfig(ws.userId);
          if (!minimaxConfig.apiKey) {
            ws.send(JSON.stringify({ type: "error", payload: { message: "未配置 MINIMAX_API_KEY，请在设置中填写。" } }));
            ws.close(1000, "ended");
            return;
          }
          const asr = await transcribePcmStream(pcm, {
            apiKey: minimaxConfig.apiKey,
            streamAsrUrl: minimaxConfig.streamAsrUrl,
            sampleRate: 16000,
            language: "zh",
          });
          if (asr.partial) ws.send(JSON.stringify({ type: "asr_partial", payload: { text: asr.partial } }));
          if (asr.final) ws.send(JSON.stringify({ type: "asr_final", payload: { text: asr.final } }));
          const text = asr.final || asr.partial || "";
          if (text) {
            try {
              await handleAiTurn(ws, text, personaId || undefined, minimaxConfig);
            } catch (err: any) {
              ws.send(JSON.stringify({ type: "error", payload: { message: err?.message || "Server error" } }));
            }
          } else {
            ws.send(JSON.stringify({ type: "error", payload: { message: "未识别到语音" } }));
          }
          ws.close(1000, "ended");
          return;
        }
        default:
          ws.send(JSON.stringify({ type: "error", payload: { message: "Unknown message type" } }));
      }
    });
  });

  console.log("[voice-ai] WebSocket server ready at /ws/voice-ai");
}

async function handleAiTurn(
  ws: VoiceWsClient,
  userText: string,
  personaId: string | undefined,
  minimaxConfig: MinimaxRuntimeConfig,
) {
  const aiText = await generateAIResponse({
    conversationId: ws.conversationId!,
    personaId: personaId || ws.personaId!,
    userMessage: userText,
    contextLimit: 30,
  });
  ws.send(JSON.stringify({ type: "asr_final", payload: { text: userText } }));
  ws.send(JSON.stringify({ type: "ai_text", payload: { text: aiText } }));

  let seq = 0;
  for await (const chunk of minimaxTtsStream({
    text: aiText,
    apiKey: minimaxConfig.apiKey,
    streamTtsUrl: minimaxConfig.streamTtsUrl,
  })) {
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
  ws.send(JSON.stringify({ type: "tts_end" }));
}
