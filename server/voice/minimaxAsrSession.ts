import { randomUUID } from "crypto";
import WebSocket from "ws";

export type MinimaxAsrSessionOptions = {
  apiKey?: string;
  streamAsrUrl?: string;
  sampleRate: number;
  language?: string;
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
};

/**
 * MiniMax ASR WebSocket session for real-time streaming: feed audio incrementally,
 * get partial results as the user speaks, and call finish() when VAD detects speech end.
 */
export class MinimaxAsrSession {
  private ws: WebSocket | null = null;
  private readonly opts: MinimaxAsrSessionOptions;
  private readonly sessionId = randomUUID();
  private finished = false;
  private resolveFinish: ((finalText: string) => void) | null = null;
  private rejectFinish: ((err: Error) => void) | null = null;
  private finalPromise: Promise<string> | null = null;
  private lastFinal: string = "";

  constructor(opts: MinimaxAsrSessionOptions) {
    this.opts = opts;
  }

  /**
   * Connect and send start config. Call this before feedAudio.
   */
  async start(): Promise<void> {
    const apiKey = (this.opts.apiKey || process.env.MINIMAX_API_KEY || "").trim();
    const url = (
      this.opts.streamAsrUrl ||
      process.env.MINIMAX_STREAM_ASR_URL ||
      "wss://api.minimax.io/ws/v1/asr"
    ).trim();
    if (!apiKey) throw new Error("MINIMAX_API_KEY missing for ASR");

    this.finalPromise = new Promise<string>((resolve, reject) => {
      this.resolveFinish = resolve;
      this.rejectFinish = reject;
    });

    this.ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    return new Promise((resolve, reject) => {
      this.ws!.on("open", () => {
        this.ws!.send(
          JSON.stringify({
            type: "start",
            data: {
              session_id: this.sessionId,
              format: "pcm",
              sample_rate: this.opts.sampleRate ?? 16000,
              language: this.opts.language ?? "zh",
            },
          })
        );
        resolve();
      });

      this.ws!.on("message", (data: WebSocket.RawData) => {
        try {
          const raw = Buffer.isBuffer(data)
            ? data
            : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data as Buffer)]);
          const msg = JSON.parse(raw.toString("utf8"));
          if (msg.type === "partial_result" && msg.text) {
            this.opts.onPartial?.(msg.text);
          }
          if (msg.type === "result" && msg.text) {
            this.lastFinal = msg.text;
            this.opts.onFinal?.(msg.text);
          }
          if (msg.type === "end") {
            this.finished = true;
            this.resolveFinish?.(this.lastFinal);
          }
        } catch {
          // ignore parse errors
        }
      });

      this.ws!.on("close", () => {
        if (!this.finished) {
          this.finished = true;
          this.resolveFinish?.(this.lastFinal);
        }
      });

      this.ws!.on("error", (err) => {
        this.finished = true;
        this.rejectFinish?.(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  /**
   * Feed a chunk of PCM (16kHz, 16bit mono). Can be called many times until finish().
   */
  feedAudio(chunk: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.finished) return;
    if (chunk.length) this.ws.send(chunk);
  }

  /**
   * Signal end of user speech (e.g. after VAD speech_end). Resolves with final ASR text.
   */
  async finish(): Promise<string> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return this.lastFinal;
    }
    this.ws.send(JSON.stringify({ type: "end" }));
    const result = await this.finalPromise!.catch((e) => {
      throw e;
    });
    this.cleanup();
    return result;
  }

  /**
   * Abort the session without waiting for final (e.g. on user interrupt).
   */
  abort(): void {
    this.finished = true;
    this.resolveFinish?.(this.lastFinal);
    this.cleanup();
  }

  private cleanup(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
  }
}
