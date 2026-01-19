import { Server } from "http";
import { parse } from "cookie";
import { WebSocket, WebSocketServer } from "ws";
import { sessionStore } from "../session";
import { storage } from "../storage";
import { generateAIResponseStream } from "../aiService";
import { minimaxTtsStream } from "./minimaxTtsStream";
import { transcribePcmStream } from "./minimaxAsrStream";

type VoiceWsMessage =
  | { type: "start"; payload: { conversationId: string; personaId?: string } }
  | { type: "speech_start" }
  | { type: "speech_end" }
  | { type: "user_text"; payload: { text: string } }
  | { type: "interrupt" }
  | { type: "ping" }
  | { type: "end" };

type VoiceWsClient = WebSocket & {
  userId?: string;
  conversationId?: string;
  personaId?: string;
  pcmBuffers?: Buffer[];
  isSpeechActive?: boolean;
  activeTurn?: VoiceTurn;
  turnCounter?: number;
};

type MinimaxRuntimeConfig = {
  apiKey?: string;
  streamAsrUrl?: string;
  streamTtsUrl?: string;
};

type VoiceTurn = {
  id: number;
  aborted: boolean;
  abort: () => void;
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
        if (ws.isSpeechActive) {
          ws.pcmBuffers = ws.pcmBuffers || [];
          ws.pcmBuffers.push(Buffer.from(raw));
        }
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
          ws.isSpeechActive = false;
          ws.send(
            JSON.stringify({
              type: "started",
              payload: { conversationId: ws.conversationId, personaId: ws.personaId },
            })
          );
          return;
        }
        case "speech_start": {
          ws.isSpeechActive = true;
          ws.pcmBuffers = [];
          abortActiveTurn(ws, "interrupt");
          ws.send(JSON.stringify({ type: "listening" }));
          return;
        }
        case "speech_end": {
          ws.isSpeechActive = false;
          await handleSpeechEnd(ws);
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
            await handleAiTurnStreaming(ws, text, personaId, minimaxConfig);
          } catch (err: any) {
            console.error("[voice-ai] error", err);
            ws.send(JSON.stringify({ type: "error", payload: { message: err?.message || "Server error" } }));
          }
          return;
        }
        case "interrupt": {
          abortActiveTurn(ws, "interrupt");
          ws.send(JSON.stringify({ type: "interrupted" }));
          return;
        }
        case "end": {
          abortActiveTurn(ws, "end");
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

function abortActiveTurn(ws: VoiceWsClient, reason: string) {
  if (ws.activeTurn && !ws.activeTurn.aborted) {
    ws.activeTurn.abort();
    ws.send(JSON.stringify({ type: "ai_interrupt", payload: { reason } }));
  }
}

function extractStreamDelta(chunk: any): string {
  if (!chunk) return "";
  if (typeof chunk === "string") return chunk;
  if (typeof chunk.text === "string") return chunk.text;
  if (typeof chunk.text === "function") return chunk.text();
  const openAiDelta = chunk.choices?.[0]?.delta?.content;
  if (openAiDelta) return openAiDelta;
  const candidateParts = chunk.candidates?.[0]?.content?.parts;
  if (Array.isArray(candidateParts)) {
    return candidateParts.map((part: any) => part?.text || "").join("");
  }
  return "";
}

function splitByPunctuation(text: string): { completed: string[]; rest: string } {
  const completed: string[] = [];
  let rest = text;
  const punctuation = /[。！？.!?，,]/;
  while (rest && punctuation.test(rest)) {
    let lastIndex = -1;
    for (let i = 0; i < rest.length; i += 1) {
      if (punctuation.test(rest[i])) lastIndex = i;
    }
    if (lastIndex === -1) break;
    const sentence = rest.slice(0, lastIndex + 1).trim();
    if (sentence) completed.push(sentence);
    rest = rest.slice(lastIndex + 1);
  }
  return { completed, rest };
}

async function handleSpeechEnd(ws: VoiceWsClient) {
  const pcm = Buffer.concat(ws.pcmBuffers || []);
  ws.pcmBuffers = [];
  if (!ws.conversationId) {
    return;
  }
  if (pcm.length === 0) {
    return;
  }
  const personaId = ws.personaId || (await resolvePersona(ws.conversationId));
  const minimaxConfig = await getMinimaxConfig(ws.userId);
  if (!minimaxConfig.apiKey) {
    ws.send(JSON.stringify({ type: "error", payload: { message: "未配置 MINIMAX_API_KEY，请在设置中填写。" } }));
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
      await handleAiTurnStreaming(ws, text, personaId || undefined, minimaxConfig);
    } catch (err: any) {
      ws.send(JSON.stringify({ type: "error", payload: { message: err?.message || "Server error" } }));
    }
  } else {
    ws.send(JSON.stringify({ type: "error", payload: { message: "未识别到语音" } }));
  }
}

async function handleAiTurnStreaming(
  ws: VoiceWsClient,
  userText: string,
  personaId: string | undefined,
  minimaxConfig: MinimaxRuntimeConfig,
) {
  abortActiveTurn(ws, "new_turn");
  const turnId = (ws.turnCounter || 0) + 1;
  ws.turnCounter = turnId;
  const ttsAbort = new AbortController();
  const turn: VoiceTurn = {
    id: turnId,
    aborted: false,
    abort: () => {
      turn.aborted = true;
      ttsAbort.abort();
    },
  };
  ws.activeTurn = turn;

  ws.send(JSON.stringify({ type: "asr_final", payload: { text: userText } }));
  ws.send(JSON.stringify({ type: "ai_text_start" }));

  const stream = await generateAIResponseStream({
    conversationId: ws.conversationId!,
    personaId: personaId || ws.personaId!,
    userMessage: userText,
    contextLimit: 60,
    forceFullMemoryContext: true,
  });

  let buffer = "";
  let fullText = "";
  let seq = 0;
  let ttsChain = Promise.resolve();

  const enqueueTts = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    ttsChain = ttsChain.then(async () => {
      if (turn.aborted) return;
      for await (const chunk of minimaxTtsStream({
        text: clean,
        apiKey: minimaxConfig.apiKey,
        streamTtsUrl: minimaxConfig.streamTtsUrl,
        signal: ttsAbort.signal,
      })) {
        if (turn.aborted) return;
        ws.send(
          JSON.stringify({
            type: "tts_chunk",
            payload: {
              seq: chunk.seq ?? seq,
              audioBase64: chunk.audioBase64,
              contentType: chunk.contentType,
              done: chunk.done,
              text: clean,
            },
          })
        );
        seq += 1;
      }
    });
  };

  for await (const chunk of stream) {
    if (turn.aborted) break;
    const delta = extractStreamDelta(chunk);
    if (!delta) continue;
    fullText += delta;
    ws.send(JSON.stringify({ type: "ai_text_delta", payload: { text: delta } }));
    buffer += delta;
    const { completed, rest } = splitByPunctuation(buffer);
    buffer = rest;
    completed.forEach((sentence) => enqueueTts(sentence));
  }

  if (!turn.aborted && buffer.trim()) {
    enqueueTts(buffer);
  }

  await ttsChain;

  if (!turn.aborted) {
    ws.send(JSON.stringify({ type: "ai_text_final", payload: { text: fullText } }));
    ws.send(JSON.stringify({ type: "tts_end" }));
  }
}
