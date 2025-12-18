import WebSocket from "ws";

type TtsChunk = {
  seq: number;
  audioBase64: string;
  contentType: string;
  done: boolean;
};

type MinimaxTtsStreamOptions = {
  apiKey?: string;
  streamTtsUrl?: string;
  text: string;
  voiceId?: string;
  sampleRate?: number;
  format?: "mp3" | "wav" | "pcm" | "flac";
  languageBoost?: string;
};

/**
 * 使用 Minimax 流式 TTS：返回音频 chunk 序列，方便实时下发到前端。
 * 这里假设 Minimax WS 会依次返回 audio_chunk，最后 end。
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

  let seq = 0;
  let opened = false;

  const queue: Array<TtsChunk> = [];
  let ended = false;

  const done = new Promise<void>((resolve, reject) => {
    ws.on("open", () => {
      opened = true;
      const payload = {
        type: "start",
        data: {
          text: opts.text,
          stream: true,
          language_boost: opts.languageBoost || process.env.MINIMAX_TTS_DEFAULT_LANGUAGE_BOOST || "auto",
          voice_setting: {
            voice_id: opts.voiceId || process.env.MINIMAX_TTS_DEFAULT_VOICE_ID || "English_expressive_narrator",
          },
          audio_setting: {
            sample_rate: opts.sampleRate || Number(process.env.MINIMAX_TTS_DEFAULT_SAMPLE_RATE) || 32000,
            format: opts.format || (process.env.MINIMAX_TTS_DEFAULT_FORMAT as any) || "mp3",
            channel: Number(process.env.MINIMAX_TTS_DEFAULT_CHANNEL) || 1,
          },
        },
      };
      ws.send(JSON.stringify(payload));
    });

    ws.on("message", (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "audio_chunk" && msg.data?.audio) {
          queue.push({
            seq: seq++,
            audioBase64: msg.data.audio,
            contentType: "audio/mpeg", // Minimax 默认 mp3; 若返回格式不同可从 msg.data 读取
            done: false,
          });
        }
        if (msg.type === "end") {
          queue.push({
            seq: seq++,
            audioBase64: "",
            contentType: "audio/mpeg",
            done: true,
          });
          ended = true;
          resolve();
        }
      } catch (err) {
        reject(err);
      }
    });

    ws.on("close", () => {
      if (!ended) {
        ended = true;
        resolve();
      }
    });

    ws.on("error", (err) => reject(err));
  });

  while (!opened) {
    await new Promise((r) => setTimeout(r, 10));
  }

  while (!ended || queue.length) {
    while (queue.length) {
      const item = queue.shift()!;
      yield item;
    }
    if (!ended) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  await done;
}

