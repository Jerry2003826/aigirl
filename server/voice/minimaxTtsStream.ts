import WebSocket from "ws";

export type TtsChunk = {
  seq: number;
  audioBase64: string;
  contentType: string;
  done: boolean;
};

export type MinimaxTtsStreamOptions = {
  apiKey?: string;
  streamTtsUrl?: string;
  text: string;
  voiceId?: string;
  sampleRate?: number;
  format?: "mp3" | "wav" | "pcm" | "flac";
  languageBoost?: string;
  model?: string;
};

/**
 * MiniMax TTS WebSocket 官方协议：
 * 1. 连接后等待服务端 event === "connected_success"
 * 2. 发送 event "task_start"（model, voice_setting, audio_setting）
 * 3. 等待 event === "task_started"
 * 4. 发送 event "task_continue"（text）
 * 5. 接收 data.audio（hex 编码），is_final 时结束
 * 6. 关闭前发送 event "task_finish"
 */
export async function* minimaxTtsStream(opts: MinimaxTtsStreamOptions): AsyncGenerator<TtsChunk> {
  const apiKey = (opts.apiKey || process.env.MINIMAX_API_KEY || "").trim();
  const url = (opts.streamTtsUrl || process.env.MINIMAX_STREAM_TTS_URL || "wss://api.minimax.io/ws/v1/t2a_v2").trim();
  if (!apiKey) throw new Error("MINIMAX_API_KEY missing for TTS");

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const TTS_CONNECT_TIMEOUT_MS = 15000;
  let seq = 0;
  const queue: Array<TtsChunk> = [];
  let streamEnded = false;
  let connected = false;
  let taskStarted = false;
  let firstChunkAt: number | null = null;

  const done = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      if (!connected) {
        reject(new Error("TTS WebSocket connection timeout"));
      }
    }, TTS_CONNECT_TIMEOUT_MS);

    ws.on("open", () => {
      // 不在此处发任何业务消息，等 connected_success
    });

    ws.on("message", (data: WebSocket.RawData) => {
      try {
        const raw = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
        const msg = JSON.parse(raw.toString("utf8"));
        const event = msg.event;

        if (event === "connected_success") {
          connected = true;
          clearTimeout(t);
          const taskStartPayload = {
            event: "task_start",
            model: opts.model || process.env.MINIMAX_TTS_MODEL || "speech-2.8-hd",
            voice_setting: {
              voice_id: opts.voiceId || process.env.MINIMAX_TTS_DEFAULT_VOICE_ID || "male-qn-qingse",
              speed: 1,
              vol: 1,
              pitch: 0,
              english_normalization: false,
            },
            audio_setting: {
              sample_rate: opts.sampleRate || Number(process.env.MINIMAX_TTS_DEFAULT_SAMPLE_RATE) || 32000,
              bitrate: 128000,
              format: opts.format || (process.env.MINIMAX_TTS_DEFAULT_FORMAT as string) || "mp3",
              channel: 1,
            },
          };
          ws.send(JSON.stringify(taskStartPayload));
          return;
        }

        if (event === "task_started") {
          taskStarted = true;
          const taskContinuePayload = {
            event: "task_continue",
            text: opts.text,
          };
          ws.send(JSON.stringify(taskContinuePayload));
          return;
        }

        // 流式音频：data.audio 为 hex 字符串
        if (msg.data && typeof msg.data.audio === "string" && msg.data.audio.length > 0) {
          if (firstChunkAt === null) firstChunkAt = Date.now();
          try {
            const audioBuf = Buffer.from(msg.data.audio, "hex");
            const audioBase64 = audioBuf.toString("base64");
            queue.push({
              seq: seq++,
              audioBase64,
              contentType: "audio/mpeg",
              done: false,
            });
          } catch (e) {
            // ignore single chunk decode error
          }
        }

        if (msg.is_final === true) {
          streamEnded = true;
          if (firstChunkAt !== null) {
            console.log("[voice-ai] TTS first_chunk_ms:", Date.now() - firstChunkAt);
          }
          queue.push({
            seq: seq++,
            audioBase64: "",
            contentType: "audio/mpeg",
            done: true,
          });
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

  // 等待 connected_success 被处理（会触发 task_start）
  while (!connected) {
    await new Promise((r) => setTimeout(r, 20));
    if (streamEnded) break;
  }
  while (!taskStarted && !streamEnded) {
    await new Promise((r) => setTimeout(r, 20));
  }

  while (!streamEnded || queue.length) {
    while (queue.length) {
      const item = queue.shift()!;
      yield item;
    }
    if (!streamEnded) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  try {
    ws.send(JSON.stringify({ event: "task_finish" }));
    ws.close();
  } catch {
    // ignore on close
  }
  await done;
}
