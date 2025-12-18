import WebSocket from "ws";
import { v4 as uuid } from "uuid";

export type AsrResult = {
  partial?: string;
  final?: string;
};

export type MinimaxAsrOptions = {
  apiKey?: string;
  streamAsrUrl?: string;
  sampleRate: number; // e.g., 16000
  language?: string; // zh / en
};

/**
 * 基于 Minimax 流式 ASR 的简单实现：
 * - 建立 WS，发送 start/config
 * - 发送完整 PCM（此处未分片；若需严格20ms帧，可在外部分片逐帧 send）
 * - 监听 partial_result/result/end
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
  const sessionId = uuid();

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
      ws.send(pcm);
      ws.send(JSON.stringify({ type: "end" }));
    });

    ws.on("message", (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "partial_result" && msg.text) {
          partials.push(msg.text);
        }
        if (msg.type === "result" && msg.text) {
          final = msg.text;
        }
        if (msg.type === "end") {
          resolve();
        }
      } catch (err) {
        reject(err);
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

