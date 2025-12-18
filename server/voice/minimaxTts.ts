import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export type MinimaxTtsRequest = {
  text: string;
  apiKey?: string;
  model?: string;
  languageBoost?: string;
  voiceId?: string;
  speed?: number;
  vol?: number;
  pitch?: number;
  sampleRate?: number;
  bitrate?: number;
  format?: "mp3" | "wav" | "pcm" | "flac";
  channel?: number;
  timeoutMs?: number;
};

type MinimaxTtsError = Error & { debugFile?: string; cwd?: string };

function createMinimaxTtsError(message: string, debugFile?: string): MinimaxTtsError {
  const err = new Error(message) as MinimaxTtsError;
  err.debugFile = debugFile;
  err.cwd = process.cwd();
  return err;
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function contentTypeFor(format: string): string {
  if (format === "mp3") return "audio/mpeg";
  if (format === "wav") return "audio/wav";
  if (format === "flac") return "audio/flac";
  return "application/octet-stream";
}

async function runPython(stdinJson: string, timeoutMs: number): Promise<{ audio: Buffer; debugFile?: string }> {
  const scriptPath = path.resolve(process.cwd(), "scripts", "minimax_tts.py");
  if (!fs.existsSync(scriptPath)) {
    throw createMinimaxTtsError("Python script not found: " + scriptPath);
  }

  const pythonCmd =
    (process.env.MINIMAX_PYTHON || process.env.PYTHON || "").trim() ||
    (process.platform === "win32" ? "python" : "python3");

  return await new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, ["-u", scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const out: Buffer[] = [];
    const err: Buffer[] = [];

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      try {
        child.kill();
      } catch {}
      reject(createMinimaxTtsError("Python TTS timeout"));
    }, timeoutMs);

    child.on("error", (e: any) => {
      clearTimeout(timer);
      if (e?.code === "ENOENT") {
        reject(createMinimaxTtsError("Python not found (command: " + pythonCmd + "). Set MINIMAX_PYTHON to python.exe."));
        return;
      }
      reject(e);
    });

    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));

    child.on("close", (code) => {
      clearTimeout(timer);
      finished = true;

      const audio = Buffer.concat(out);
      const stderr = Buffer.concat(err).toString("utf8");
      const m = stderr.match(/DEBUG_FILE=(.+)\r?\n/);
      const debugFile = m?.[1]?.trim();

      if (code === 0 && audio.length > 0) {
        resolve({ audio, debugFile });
        return;
      }

      const msg = (stderr || "").trim() || ("Python exit code " + (code ?? "unknown"));
      reject(createMinimaxTtsError(msg, debugFile));
    });

    child.stdin.write(stdinJson);
    child.stdin.end();
  });
}

// FORCE: Python-only TTS
export async function minimaxTtsToBuffer(
  req: MinimaxTtsRequest,
): Promise<{ audio: Buffer; contentType: string }> {
  const apiKey = req.apiKey || process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("MINIMAX API key is missing");

  const text = (req.text || "").trim();
  if (!text) throw new Error("text is required");
  if (text.length > 2000) throw new Error("text too long (max 2000 chars)");

  const url = process.env.MINIMAX_T2A_HTTP_URL?.trim() || "https://api.minimax.io/v1/t2a_v2";

  const model = req.model || process.env.MINIMAX_TTS_DEFAULT_MODEL || "speech-2.6-hd";
  const languageBoost = req.languageBoost || process.env.MINIMAX_TTS_DEFAULT_LANGUAGE_BOOST || "auto";
  const voiceId = req.voiceId || process.env.MINIMAX_TTS_DEFAULT_VOICE_ID || "English_expressive_narrator";

  const format =
    req.format ||
    (process.env.MINIMAX_TTS_DEFAULT_FORMAT as MinimaxTtsRequest["format"] | undefined) ||
    "mp3";

  const sampleRate = req.sampleRate ?? numEnv("MINIMAX_TTS_DEFAULT_SAMPLE_RATE", 32000);
  const bitrate = req.bitrate ?? numEnv("MINIMAX_TTS_DEFAULT_BITRATE", 128000);
  const channel = req.channel ?? numEnv("MINIMAX_TTS_DEFAULT_CHANNEL", 1);

  const speed = req.speed ?? 1;
  const vol = req.vol ?? 1;
  const pitch = req.pitch ?? 0;
  const timeoutMs = req.timeoutMs ?? 30000;

  const stdinJson = JSON.stringify({
    url,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    payload: {
      model,
      text,
      stream: false,
      language_boost: languageBoost,
      output_format: "hex",
      voice_setting: {
        voice_id: voiceId,
        speed,
        vol,
        pitch,
      },
      audio_setting: {
        sample_rate: sampleRate,
        bitrate,
        format,
        channel,
      },
    },
    timeoutMs,
  });

  const { audio } = await runPython(stdinJson, timeoutMs);
  return { audio, contentType: contentTypeFor(format) };
}

