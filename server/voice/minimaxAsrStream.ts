import { randomUUID } from "crypto";
import WebSocket from "ws";

export type AsrResult = {
  partial?: string;
  final?: string;
};

export type MinimaxAsrOptions = {
  apiKey?: string;
  streamAsrUrl?: string;
  sampleRate: number;
  language?: string;
};

/** 20ms 帧大小：16kHz * 0.02s * 2 bytes = 640 */
const ASR_FRAME_MS = 20;
const ASR_FRAME_BYTES = Math.floor((16000 * ASR_FRAME_MS) / 1000) * 2;

/**
 * MiniMax 流式 ASR：分帧发送 PCM（20ms 一帧），避免一次性整包。
 * 建立 WS → 发送 start 配置 → 按帧发送 PCM → 发送 end → 收 partial_result/result/end。
 */
export async function transcribePcmStream(pcm: Buffer, opts: MinimaxAsrOptions): Promise<AsrResult> {
  const apiKey = (opts.apiKey || process.env.MINIMAX_API_KEY || "").trim();
  const url = (opts.streamAsrUrl || process.env.MINIMAX_STREAM_ASR_URL || "wss://api.minimax.io/ws/v1/asr").trim();
  if (!apiKey) throw new Error("MINIMAX_API_KEY missing for ASR");

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const partials: string[] = [];
  let final: string | undefined;
  const sessionId = randomUUID();

  const done = new Promise<void>((resolve, reject) => {
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "start",
          data: {
            session_id: sessionId,
            format: "pcm",
            sample_rate: opts.sampleRate || 16000,
            language: opts.language || "zh",
          },
        })
      );
      // 按 20ms 帧分片发送 PCM，再发 end
      for (let i = 0; i < pcm.length; i += ASR_FRAME_BYTES) {
        const chunk = pcm.subarray(i, Math.min(i + ASR_FRAME_BYTES, pcm.length));
        if (chunk.length) ws.send(chunk);
      }
      ws.send(JSON.stringify({ type: "end" }));
    });

    ws.on("message", (data: WebSocket.RawData) => {
      try {
        const raw = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
        const msg = JSON.parse(raw.toString("utf8"));
        if (msg.type === "partial_result" && msg.text) {
          partials.push(msg.text);
        }
        if (msg.type === "result" && msg.text) {
          final = msg.text;
        }
        if (msg.type === "end") {
          resolve();
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on("close", () => resolve());
    ws.on("error", (err) => reject(err));
  });

  await done;

  return {
    partial: partials.length ? partials[partials.length - 1] : undefined,
    final,
  };
}
