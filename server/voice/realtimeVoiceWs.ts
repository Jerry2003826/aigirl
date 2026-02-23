import { Server } from "http";
import { parse } from "cookie";
import { WebSocket, WebSocketServer } from "ws";
import { sessionStore } from "../routes";
import { storage } from "../storage";
import { generateAIResponseStream } from "../aiService";
import { MinimaxAsrSession } from "./minimaxAsrSession";
import { MinimaxTtsSession } from "./minimaxTtsSession";

type RealtimeVoiceMessage =
  | { type: "start"; payload: { conversationId: string; personaId?: string } }
  | { type: "vad_start" }
  | { type: "vad_end" }
  | { type: "interrupt" }
  | { type: "ping" }
  | { type: "end" };

export type RealtimeVoiceStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

type RealtimeVoiceClient = WebSocket & {
  userId?: string;
  conversationId?: string;
  personaId?: string;
  voiceStatus?: RealtimeVoiceStatus;
};

function toBuffer(raw: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw);
  return Buffer.from(raw);
}

function voiceLog(event: string, detail?: Record<string, unknown>) {
  console.log("[voice-realtime]", new Date().toISOString(), JSON.stringify(detail ? { event, ...detail } : { event }));
}

function sendStatus(ws: RealtimeVoiceClient, status: RealtimeVoiceStatus) {
  (ws as RealtimeVoiceClient).voiceStatus = status;
  try {
    ws.send(JSON.stringify({ type: "voice_status", payload: { status } }));
  } catch (_) {}
}

async function resolveMinimaxApiKey(userId?: string): Promise<string | undefined> {
  if (!userId) return process.env.MINIMAX_API_KEY;
  const s = await storage.getAiSettings(userId);
  return s?.minimaxApiKey ?? process.env.MINIMAX_API_KEY ?? undefined;
}

async function resolveMinimaxUrls(userId?: string): Promise<{ asrUrl: string; ttsUrl: string }> {
  const defaultAsr = process.env.MINIMAX_STREAM_ASR_URL || "wss://api.minimax.io/ws/v1/asr";
  const defaultTts = process.env.MINIMAX_STREAM_TTS_URL || "wss://api.minimax.io/ws/v1/t2a_v2";
  if (!userId) return { asrUrl: defaultAsr, ttsUrl: defaultTts };
  const s = await storage.getAiSettings(userId);
  return {
    asrUrl: s?.minimaxStreamAsrUrl ?? defaultAsr,
    ttsUrl: s?.minimaxStreamTtsUrl ?? defaultTts,
  };
}

async function authenticate(ws: RealtimeVoiceClient, req: any): Promise<string | null> {
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
  if (participants?.length) return participants[0].personaId ?? null;
  const conv = await storage.getConversation(conversationId);
  return conv?.userId ?? null;
}

/** Extract text delta from a provider stream chunk (Gemini or OpenAI shape). */
function getTextFromChunk(chunk: any): string {
  if (typeof chunk?.text === "string") return chunk.text;
  const delta = chunk?.choices?.[0]?.delta?.content;
  return typeof delta === "string" ? delta : "";
}

/** Split by sentence boundaries (CJK and Western). */
function splitSentences(acc: string): { sentences: string[]; remainder: string } {
  const re = /[。！？\n.!?]+/g;
  const sentences: string[] = [];
  let remainder = acc;
  let m: RegExpExecArray | null;
  let lastIndex = 0;
  while ((m = re.exec(acc)) !== null) {
    const end = m.index + m[0].length;
    const segment = acc.slice(lastIndex, end).trim();
    if (segment) sentences.push(segment);
    lastIndex = end;
  }
  remainder = acc.slice(lastIndex).trim();
  return { sentences, remainder };
}

export function setupRealtimeVoiceWebSocket(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws/voice-realtime",
    perMessageDeflate: false,
  });

  wss.on("connection", async (ws: RealtimeVoiceClient, req) => {
    try {
      const userId = await authenticate(ws, req);
      if (!userId) {
        voiceLog("connection_rejected", { reason: "no_user" });
        ws.close(1008, "Authentication required");
        return;
      }
      ws.send(JSON.stringify({ type: "ready" }));
    } catch (err) {
      voiceLog("connection_error", { error: (err as Error)?.message });
      ws.close(1011, "Auth failed");
      return;
    }

    let state: RealtimeVoiceStatus = "idle";
    let asrSession: MinimaxAsrSession | null = null;
    let ttsSession: MinimaxTtsSession | null = null;
    let llmAborted = false;
    let sentenceAcc = "";

    const setState = (s: RealtimeVoiceStatus) => {
      state = s;
      sendStatus(ws, s);
    };

    const cleanupAsr = () => {
      if (asrSession) {
        asrSession.abort();
        asrSession = null;
      }
    };

    const cleanupTts = () => {
      if (ttsSession) {
        ttsSession.abort();
        ttsSession = null;
      }
    };

    ws.on("message", async (raw, isBinary) => {
      if (isBinary) {
        const buf = toBuffer(raw);
        if (state === "listening" && asrSession) asrSession.feedAudio(buf);
        return;
      }

      let msg: RealtimeVoiceMessage | null = null;
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
            ws.send(JSON.stringify({ type: "error", payload: { message: "conversationId required" } }));
            return;
          }
          ws.conversationId = conversationId;
          ws.personaId = personaId || (await resolvePersona(conversationId)) || undefined;
          setState("listening");
          ws.send(
            JSON.stringify({
              type: "started",
              payload: { conversationId: ws.conversationId, personaId: ws.personaId },
            })
          );
          return;
        }
        case "vad_start": {
          if (!ws.conversationId) return;
          cleanupAsr();
          const apiKey = await resolveMinimaxApiKey(ws.userId);
          const urls = await resolveMinimaxUrls(ws.userId);
          if (!apiKey) {
            ws.send(
              JSON.stringify({ type: "error", payload: { message: "请先在设置中配置 MiniMax API Key" } })
            );
            return;
          }
          asrSession = new MinimaxAsrSession({
            apiKey,
            streamAsrUrl: urls.asrUrl,
            sampleRate: 16000,
            language: "zh",
            onPartial: (text) => {
              try {
                ws.send(JSON.stringify({ type: "asr_partial", payload: { text } }));
              } catch (_) {}
            },
            onFinal: (text) => {
              try {
                ws.send(JSON.stringify({ type: "asr_final", payload: { text } }));
              } catch (_) {}
            },
          });
          await asrSession.start();
          setState("listening");
          return;
        }
        case "vad_end": {
          if (!asrSession || !ws.conversationId) {
            setState("listening");
            return;
          }
          setState("thinking");
          const userText = await asrSession.finish().catch(() => "");
          cleanupAsr();
          if (!userText.trim()) {
            setState("listening");
            return;
          }
          const personaId = ws.personaId || (await resolvePersona(ws.conversationId));
          if (!personaId) {
            ws.send(JSON.stringify({ type: "error", payload: { message: "No persona" } }));
            setState("listening");
            return;
          }
          const apiKey = await resolveMinimaxApiKey(ws.userId);
          const urls = await resolveMinimaxUrls(ws.userId);
          if (!apiKey) {
            ws.send(
              JSON.stringify({ type: "error", payload: { message: "请先在设置中配置 MiniMax API Key" } })
            );
            setState("listening");
            return;
          }
          llmAborted = false;
          sentenceAcc = "";
          ttsSession = new MinimaxTtsSession({
            apiKey,
            streamTtsUrl: urls.ttsUrl,
          });
          setState("speaking");
          try {
            const stream = await generateAIResponseStream({
              conversationId: ws.conversationId,
              personaId,
              userMessage: userText,
              contextLimit: 30,
            });
            for await (const chunk of stream) {
              if (llmAborted) break;
              const delta = getTextFromChunk(chunk);
              if (!delta) continue;
              try {
                ws.send(JSON.stringify({ type: "ai_text_delta", payload: { text: delta } }));
              } catch (_) {
                break;
              }
              sentenceAcc += delta;
              const { sentences, remainder } = splitSentences(sentenceAcc);
              sentenceAcc = remainder;
              for (const sentence of sentences) {
                if (llmAborted || !ttsSession) break;
                for await (const ttsChunk of ttsSession.synthesizeSentence(sentence)) {
                  if (llmAborted) break;
                  try {
                    ws.send(
                      JSON.stringify({
                        type: "tts_audio",
                        payload: {
                          audioBase64: ttsChunk.audioBase64,
                          seq: ttsChunk.seq,
                          done: ttsChunk.done,
                        },
                      })
                    );
                  } catch (_) {
                    break;
                  }
                }
              }
            }
            if (sentenceAcc.trim() && !llmAborted && ttsSession) {
              for await (const ttsChunk of ttsSession.synthesizeSentence(sentenceAcc)) {
                try {
                  ws.send(
                    JSON.stringify({
                      type: "tts_audio",
                      payload: {
                        audioBase64: ttsChunk.audioBase64,
                        seq: ttsChunk.seq,
                        done: ttsChunk.done,
                      },
                    })
                  );
                } catch (_) {}
              }
            }
          } catch (err: any) {
            voiceLog("pipeline_error", { error: err?.message });
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { message: err?.message || "Server error" },
              })
            );
          }
          cleanupTts();
          setState("listening");
          return;
        }
        case "interrupt": {
          llmAborted = true;
          cleanupTts();
          cleanupAsr();
          try {
            ws.send(JSON.stringify({ type: "interrupted" }));
          } catch (_) {}
          setState("listening");
          return;
        }
        case "end": {
          cleanupAsr();
          cleanupTts();
          ws.close(1000, "ended");
          return;
        }
        default:
          ws.send(JSON.stringify({ type: "error", payload: { message: "Unknown message type" } }));
      }
    });

    ws.on("close", () => {
      cleanupAsr();
      cleanupTts();
    });
  });

  console.log("[voice-realtime] WebSocket server ready at /ws/voice-realtime");
}
