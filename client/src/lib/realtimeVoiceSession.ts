/**
 * Full-duplex realtime voice session: VAD + stream PCM during speech,
 * receive ASR partial/final, stream TTS audio, support interrupt.
 */

import { createVoiceActivitySession } from "./voiceActivityDetection";

export type RealtimeVoiceStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended"
  | "error";

export type RealtimeVoiceCallbacks = {
  onStatus?: (s: RealtimeVoiceStatus) => void;
  onUserText?: (text: string) => void;
  onAiTextDelta?: (text: string) => void;
  onError?: (msg: string) => void;
  onMouthLevel?: (level: number) => void;
};

const VALID_STATUSES: RealtimeVoiceStatus[] = [
  "idle",
  "connecting",
  "ready",
  "listening",
  "thinking",
  "speaking",
  "ended",
  "error",
];

export class RealtimeVoiceSession {
  private ws: WebSocket | null = null;
  private vadSession: Awaited<ReturnType<typeof createVoiceActivitySession>> | null = null;
  private playbackCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private stopAnimation?: () => void;
  private ttsQueue: Array<{ audioBase64: string }> = [];
  private playing = false;
  private status: RealtimeVoiceStatus = "idle";

  constructor(
    private conversationId: string,
    private personaId: string | undefined,
    private callbacks: RealtimeVoiceCallbacks
  ) {}

  private setStatus(s: RealtimeVoiceStatus) {
    this.status = s;
    this.callbacks.onStatus?.(s);
  }

  private isValidStatus(s: string): s is RealtimeVoiceStatus {
    return VALID_STATUSES.includes(s as RealtimeVoiceStatus);
  }

  async start(): Promise<void> {
    if (this.ws) return;
    this.setStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/voice-realtime`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "start",
          payload: { conversationId: this.conversationId, personaId: this.personaId },
        })
      );
    };

    ws.onclose = () => {
      this.setStatus("ended");
      this.cleanup();
    };

    ws.onerror = () => {
      this.setStatus("error");
      this.callbacks.onError?.("WebSocket error");
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      try {
        const data = JSON.parse(ev.data);
        switch (data.type) {
          case "ready":
            this.setStatus("ready");
            break;
          case "started":
            this.setStatus("listening");
            this.startVad();
            break;
          case "voice_status":
            if (data.payload?.status && this.isValidStatus(data.payload.status)) {
              this.setStatus(data.payload.status);
            }
            break;
          case "asr_partial":
          case "asr_final":
            if (data.payload?.text) this.callbacks.onUserText?.(data.payload.text);
            break;
          case "ai_text_delta":
            if (data.payload?.text) this.callbacks.onAiTextDelta?.(data.payload.text);
            break;
          case "tts_audio":
            this.enqueueTts(data.payload?.audioBase64, data.payload?.done);
            break;
          case "interrupted":
            this.stopPlaybackAndQueue();
            this.setStatus("listening");
            break;
          case "error":
            this.callbacks.onError?.(data.payload?.message || "语音服务错误");
            this.setStatus("error");
            break;
          case "pong":
            break;
        }
      } catch (e) {
        console.error("[realtime-voice] parse error", e);
      }
    };

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("close", onClose);
        resolve();
      };
      const onClose = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("close", onClose);
        reject(new Error("WebSocket closed before started"));
      };
      ws.addEventListener("open", onOpen);
      ws.addEventListener("close", onClose);
      if (ws.readyState === WebSocket.OPEN) resolve();
    }).catch(() => {});
  }

  private async startVad(): Promise<void> {
    if (this.vadSession || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const ws = this.ws;
    this.vadSession = await createVoiceActivitySession({
      onSpeechStart: () => {
        if (this.status === "speaking") this.interrupt();
        try {
          ws.send(JSON.stringify({ type: "vad_start" }));
        } catch (_) {}
      },
      onSpeechEnd: () => {
        try {
          ws.send(JSON.stringify({ type: "vad_end" }));
        } catch (_) {}
      },
      onAudioFrame: (pcm: ArrayBuffer) => {
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
        } catch (_) {}
      },
    });
    await this.vadSession.start();
    this.setStatus("listening");
  }

  private enqueueTts(audioBase64: string | undefined, done?: boolean): void {
    if (audioBase64) this.ttsQueue.push({ audioBase64 });
    if (done) void this.playFromQueue();
  }

  private stopPlaybackAndQueue(): void {
    this.ttsQueue = [];
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (_) {}
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.stopAnimation) {
      this.stopAnimation();
      this.stopAnimation = undefined;
    }
    this.callbacks.onMouthLevel?.(0);
    this.playing = false;
  }

  private async playFromQueue(): Promise<void> {
    if (this.playing || !this.ttsQueue.length) return;
    this.playing = true;
    while (this.ttsQueue.length) {
      const { audioBase64 } = this.ttsQueue.shift()!;
      if (!audioBase64) continue;
      await this.playOneChunk(audioBase64);
    }
    this.playing = false;
  }

  private async playOneChunk(audioBase64: string): Promise<void> {
    if (!this.playbackCtx) {
      this.playbackCtx = new AudioContext();
    }
    if (this.playbackCtx.state === "suspended") {
      try {
        await this.playbackCtx.resume();
      } catch (_) {}
    }
    if (!this.analyser) {
      this.analyser = this.playbackCtx.createAnalyser();
      this.analyser.fftSize = 2048;
    }
    const data = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([data], { type: "audio/mpeg" });
    const arrayBuffer = await blob.arrayBuffer();
    let buffer: AudioBuffer;
    try {
      buffer = await this.playbackCtx.decodeAudioData(arrayBuffer.slice(0));
    } catch (_) {
      return;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (_) {}
    }
    const src = this.playbackCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser);
    this.analyser.connect(this.playbackCtx.destination);
    this.sourceNode = src;
    this.setStatus("speaking");
    this.startMeter();
    await new Promise<void>((resolve) => {
      src.onended = () => {
        this.stopMeter();
        resolve();
      };
      src.start(0);
    });
  }

  private startMeter(): void {
    if (!this.analyser) return;
    const dataArray = new Uint8Array(this.analyser.fftSize);
    let raf = 0;
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      this.callbacks.onMouthLevel?.(Math.min(1, rms * 4));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    this.stopAnimation = () => cancelAnimationFrame(raf);
  }

  private stopMeter(): void {
    if (this.stopAnimation) {
      this.stopAnimation();
      this.stopAnimation = undefined;
    }
    this.callbacks.onMouthLevel?.(0);
  }

  /**
   * Call when user starts speaking during AI playback (interrupt).
   */
  interrupt(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "interrupt" }));
      } catch (_) {}
    }
    this.stopPlaybackAndQueue();
  }

  private async cleanup(): Promise<void> {
    this.stopPlaybackAndQueue();
    if (this.vadSession) {
      await this.vadSession.stop();
      this.vadSession = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (_) {}
      this.analyser = null;
    }
    if (this.playbackCtx) {
      try {
        await this.playbackCtx.close();
      } catch (_) {}
      this.playbackCtx = null;
    }
  }

  stop(): void {
    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: "end" }));
      } catch (_) {}
      this.ws.close();
      this.ws = null;
    }
    void this.cleanup();
    this.setStatus("ended");
  }
}
