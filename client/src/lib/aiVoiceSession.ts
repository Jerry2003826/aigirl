type Status =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended"
  | "error";

export type AiVoiceCallbacks = {
  onStatus?: (s: Status) => void;
  onUserText?: (text: string) => void;
  onAiText?: (text: string) => void;
  onError?: (msg: string) => void;
  onMouthLevel?: (level: number) => void;
};

export class AiVoiceSession {
  private ws: WebSocket | null = null;
  private conversationId: string;
  private personaId?: string;
  private callbacks: AiVoiceCallbacks;
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private stopAnimation?: () => void;
  private status: Status = "idle";
  private aiTextBuffer = "";
  private vadState = {
    speaking: false,
    lastVoiceAt: 0,
    lastFrameAt: 0,
  };

  constructor(conversationId: string, personaId: string | undefined, callbacks: AiVoiceCallbacks) {
    this.conversationId = conversationId;
    this.personaId = personaId;
    this.callbacks = callbacks;
  }

  private setStatus(s: Status) {
    this.status = s;
    this.callbacks.onStatus?.(s);
  }

  async start() {
    if (this.ws) return;
    this.setStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/voice-ai`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.setStatus("ready");
      ws.send(
        JSON.stringify({
          type: "start",
          payload: { conversationId: this.conversationId, personaId: this.personaId },
        })
      );
    };

    ws.onclose = () => {
      this.setStatus("ended");
      this.cleanupAudio();
    };

    ws.onerror = () => {
      this.setStatus("error");
      this.callbacks.onError?.("WebSocket error");
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        switch (data.type) {
          case "ready":
          case "started":
            this.setStatus("ready");
            break;
          case "listening":
            this.setStatus("listening");
            break;
          case "asr_partial":
            if (data.payload?.text) this.callbacks.onUserText?.(data.payload.text);
            break;
          case "asr_final":
            if (data.payload?.text) this.callbacks.onUserText?.(data.payload.text);
            break;
          case "ai_text_start":
            this.aiTextBuffer = "";
            this.callbacks.onAiText?.("");
            break;
          case "ai_text_delta":
            this.aiTextBuffer += data.payload?.text || "";
            this.callbacks.onAiText?.(this.aiTextBuffer);
            break;
          case "ai_text_final":
            this.aiTextBuffer = data.payload?.text || this.aiTextBuffer;
            this.callbacks.onAiText?.(this.aiTextBuffer);
            break;
          case "tts_chunk":
            this.enqueueTtsChunk(
              data.payload?.audioBase64,
              data.payload?.contentType || "audio/mpeg",
              data.payload?.done
            );
            break;
          case "tts_end":
            // no-op,队列消费完成后自动结束
            break;
          case "ai_interrupt":
          case "interrupted":
            this.stopTtsPlayback();
            this.setStatus("ready");
            break;
          case "error":
            this.callbacks.onError?.(data.payload?.message || "语音服务错误");
            this.setStatus("error");
            break;
          case "pong":
            break;
        }
      } catch (e) {
        console.error("[ai-voice] parse message error", e);
      }
    };

    await this.startCapture();
  }

  startListening() {
    // 捕获在 startCapture 已启动
  }

  sendText(_text: string) {
    // 文本发送在后端 ASR 完成后触发，这里保留接口兼容
  }

  private async startCapture() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000 },
      video: false,
    });
    this.mediaStream = stream;
    const ctx = new AudioContext({ sampleRate: 16000 });
    this.audioCtx = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        sum += s * s;
      }
      const rms = Math.sqrt(sum / input.length);
      const now = performance.now();
      const vadThreshold = 0.012;
      const silenceMs = 400;
      const isVoice = rms > vadThreshold;
      if (isVoice) {
        if (!this.vadState.speaking) {
          this.vadState.speaking = true;
          this.vadState.lastVoiceAt = now;
          this.sendJson({ type: "speech_start" });
          this.stopTtsPlayback();
        } else {
          this.vadState.lastVoiceAt = now;
        }
      } else if (this.vadState.speaking && now - this.vadState.lastVoiceAt > silenceMs) {
        this.vadState.speaking = false;
        this.sendJson({ type: "speech_end" });
      }

      if (this.vadState.speaking && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(pcm.buffer);
      }
      this.vadState.lastFrameAt = now;
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    this.processor = processor;
    this.setStatus("listening");
  }

  private setupAnalyser() {
    if (this.audioCtx) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    this.audioCtx = ctx;
    this.analyser = analyser;
  }

  private ttsQueue: Array<{ b64: string; contentType: string; text?: string }> = [];
  private playing = false;
  private visemeTimer: number | null = null;

  private enqueueTtsChunk(audioBase64: string, contentType: string, done?: boolean, text?: string) {
    if (!audioBase64) return;
    this.ttsQueue.push({ b64: audioBase64, contentType, text });
    if (!this.playing) {
      this.playFromQueue();
    }
  }

  private async playFromQueue() {
    if (this.playing) return;
    this.playing = true;
    while (this.ttsQueue.length) {
      const chunk = this.ttsQueue.shift()!;
      await this.playTts(chunk.b64, chunk.contentType, chunk.text);
    }
    this.playing = false;
  }

  private stopTtsPlayback() {
    this.ttsQueue = [];
    this.playing = false;
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {}
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.stopMeter();
    this.stopVisemeFallback();
  }

  private playTts(audioBase64: string, contentType: string, text?: string) {
    const data = Uint8Array.from(atob(audioBase64 || ""), (c) => c.charCodeAt(0));
    const blob = new Blob([data], { type: contentType || "audio/mpeg" });
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      this.setupAnalyser();
      if (!this.audioCtx || !this.analyser) return;
      this.audioCtx.decodeAudioData(
        arrayBuffer.slice(0),
        (buffer) => {
          if (this.sourceNode) {
            try {
              this.sourceNode.stop();
            } catch {}
          }
          const src = this.audioCtx!.createBufferSource();
          src.buffer = buffer;
          src.connect(this.analyser!);
          this.analyser!.connect(this.audioCtx!.destination);
          src.start(0);
          this.sourceNode = src;
          this.setStatus("speaking");
          this.startMeter();
          this.startVisemeFallback(text, buffer.duration);
          src.onended = () => {
            this.stopMeter();
            this.stopVisemeFallback();
            this.setStatus("ready");
          };
        },
        (err) => {
          console.error("[ai-voice] decode error", err);
          this.callbacks.onError?.("语音播放失败");
        }
      );
    };
    reader.readAsArrayBuffer(blob);
  }

  private startMeter() {
    if (!this.analyser) return;
    const analyser = this.analyser;
    const dataArray = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
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

  private stopMeter() {
    if (this.stopAnimation) {
      this.stopAnimation();
      this.stopAnimation = undefined;
    }
    this.callbacks.onMouthLevel?.(0);
  }

  private cleanupAudio() {
    this.stopMeter();
    this.stopVisemeFallback();
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {}
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch {}
      this.processor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }

  private startVisemeFallback(text?: string, duration?: number) {
    this.stopVisemeFallback();
    const vowels = (text || "")
      .toLowerCase()
      .split("")
      .filter((c) => /[aeiou]/.test(c));
    if (!vowels.length || !duration) return;
    const start = performance.now();
    const total = Math.max(duration * 1000, 300);
    const step = 80; // ms
    let i = 0;
    const tick = () => {
      const now = performance.now();
      const elapsed = now - start;
      if (elapsed > total) {
        this.callbacks.onMouthLevel?.(0);
        return;
      }
      const v = vowels[i % vowels.length];
      const level = v ? 0.6 + Math.random() * 0.3 : 0.2;
      this.callbacks.onMouthLevel?.(Math.min(1, level));
      i += 1;
      this.visemeTimer = window.setTimeout(tick, step);
    };
    this.visemeTimer = window.setTimeout(tick, step);
  }

  private stopVisemeFallback() {
    if (this.visemeTimer) {
      clearTimeout(this.visemeTimer);
      this.visemeTimer = null;
    }
  }

  stop() {
    this.cleanupAudio();
    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: "end" }));
      } catch {}
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.setStatus("ended");
  }

  private sendJson(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }
}
