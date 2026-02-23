import WebSocket from "ws";

export type TtsChunk = {
  seq: number;
  audioBase64: string;
  contentType: string;
  done: boolean;
};

export type MinimaxTtsSessionOptions = {
  apiKey?: string;
  streamTtsUrl?: string;
  voiceId?: string;
  sampleRate?: number;
  format?: "mp3" | "wav" | "pcm" | "flac";
  model?: string;
};

const TTS_CONNECT_TIMEOUT_MS = 15000;

/**
 * MiniMax TTS session for sentence-level synthesis. Each sentence uses one WebSocket.
 * Supports abort() to close the current synthesis (e.g. on user interrupt).
 */
export class MinimaxTtsSession {
  private readonly opts: MinimaxTtsSessionOptions;
  private currentWs: WebSocket | null = null;
  private aborted = false;

  constructor(opts: MinimaxTtsSessionOptions) {
    this.opts = opts;
  }

  /**
   * Synthesize one sentence. Yields audio chunks as they arrive. Can be aborted via abort().
   */
  async *synthesizeSentence(text: string): AsyncGenerator<TtsChunk> {
    if (!text.trim()) return;

    const apiKey = (this.opts.apiKey || process.env.MINIMAX_API_KEY || "").trim();
    const url = (
      this.opts.streamTtsUrl ||
      process.env.MINIMAX_STREAM_TTS_URL ||
      "wss://api.minimax.io/ws/v1/t2a_v2"
    ).trim();
    if (!apiKey) throw new Error("MINIMAX_API_KEY missing for TTS");

    this.aborted = false;
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    this.currentWs = ws;

    let seq = 0;
    const queue: TtsChunk[] = [];
    let streamEnded = false;
    let connected = false;
    let taskStarted = false;

    const done = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        if (!connected) reject(new Error("TTS WebSocket connection timeout"));
      }, TTS_CONNECT_TIMEOUT_MS);

      ws.on("message", (data: WebSocket.RawData) => {
        if (this.aborted) return;
        try {
          const raw = Buffer.isBuffer(data)
            ? data
            : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data as Buffer)]);
          const msg = JSON.parse(raw.toString("utf8"));
          const event = msg.event;

          if (event === "connected_success") {
            connected = true;
            clearTimeout(t);
            ws.send(
              JSON.stringify({
                event: "task_start",
                model: this.opts.model || process.env.MINIMAX_TTS_MODEL || "speech-2.8-hd",
                voice_setting: {
                  voice_id: this.opts.voiceId || process.env.MINIMAX_TTS_DEFAULT_VOICE_ID || "male-qn-qingse",
                  speed: 1,
                  vol: 1,
                  pitch: 0,
                  english_normalization: false,
                },
                audio_setting: {
                  sample_rate: this.opts.sampleRate || Number(process.env.MINIMAX_TTS_DEFAULT_SAMPLE_RATE) || 32000,
                  bitrate: 128000,
                  format: (this.opts.format || process.env.MINIMAX_TTS_DEFAULT_FORMAT || "mp3") as string,
                  channel: 1,
                },
              })
            );
            return;
          }

          if (event === "task_started") {
            taskStarted = true;
            ws.send(JSON.stringify({ event: "task_continue", text: text.trim() }));
            return;
          }

          if (msg.data && typeof msg.data.audio === "string" && msg.data.audio.length > 0) {
            try {
              const audioBuf = Buffer.from(msg.data.audio, "hex");
              queue.push({
                seq: seq++,
                audioBase64: audioBuf.toString("base64"),
                contentType: "audio/mpeg",
                done: false,
              });
            } catch (_) {}
          }

          if (msg.is_final === true) {
            streamEnded = true;
            queue.push({ seq: seq++, audioBase64: "", contentType: "audio/mpeg", done: true });
            resolve();
          }
        } catch (err) {
          clearTimeout(t);
          if (!streamEnded) reject(err);
        }
      });

      ws.on("close", () => {
        clearTimeout(t);
        if (!streamEnded) {
          streamEnded = true;
          resolve();
        }
      });

      ws.on("error", (err) => {
        clearTimeout(t);
        if (!streamEnded) reject(err);
      });
    });

    // Wait for connected_success and task_started
    while (!connected && !this.aborted) {
      await new Promise((r) => setTimeout(r, 20));
    }
    while (!taskStarted && !streamEnded && !this.aborted) {
      await new Promise((r) => setTimeout(r, 20));
    }

    while ((!streamEnded || queue.length) && !this.aborted) {
      while (queue.length) {
        yield queue.shift()!;
      }
      if (!streamEnded) {
        await new Promise((r) => setTimeout(r, 20));
      }
    }

    try {
      ws.send(JSON.stringify({ event: "task_finish" }));
      ws.close();
    } catch (_) {}
    this.currentWs = null;
    await done;
  }

  /**
   * Abort the current sentence synthesis (e.g. user interrupted). Closes the WebSocket.
   */
  abort(): void {
    this.aborted = true;
    if (this.currentWs && this.currentWs.readyState === WebSocket.OPEN) {
      try {
        this.currentWs.close();
      } catch (_) {}
      this.currentWs = null;
    }
  }
}
