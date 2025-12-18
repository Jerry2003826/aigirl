/**
 * MiniMax streaming ASR/TTS adapter (simplified)
 */

export interface MiniMaxStreamOptions {
  apiKey: string;
  streamAsrUrl: string;
  streamTtsUrl: string;
  voiceId?: string;
  languageBoost?: string;
  onAsrText?: (text: string, isFinal: boolean) => void;
  onTtsAudio?: (audio: ArrayBuffer) => void;
  onError?: (error: Error) => void;
}

export class MiniMaxStream {
  private asrWs: WebSocket | null = null;
  private ttsWs: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private options: MiniMaxStreamOptions;

  constructor(options: MiniMaxStreamOptions) {
    this.options = options;
  }

  async startAsr(stream: MediaStream) {
    const wsUrl = `${this.options.streamAsrUrl}?api_key=${encodeURIComponent(this.options.apiKey)}`;
    this.asrWs = new WebSocket(wsUrl);
    this.asrWs.onopen = () => {
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      this.mediaRecorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0 && this.asrWs?.readyState === WebSocket.OPEN) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(",")[1];
            this.asrWs?.send(JSON.stringify({ type: "audio", data: base64 }));
          };
          reader.readAsDataURL(e.data);
        }
      };
      this.mediaRecorder.start(100);
    };
    this.asrWs.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.text) this.options.onAsrText?.(data.text, !!data.is_final);
      } catch {}
    };
    this.asrWs.onerror = () => this.options.onError?.(new Error("ASR WebSocket error"));
  }

  async startTts(text: string) {
    const wsUrl = `${this.options.streamTtsUrl}?api_key=${encodeURIComponent(this.options.apiKey)}`;
    this.ttsWs = new WebSocket(wsUrl);
    this.ttsWs.onopen = () => {
      this.ttsWs?.send(
        JSON.stringify({
          type: "tts",
          text,
          voice_id: this.options.voiceId || "male-qn-qingse",
          language_boost: this.options.languageBoost || "Chinese",
          stream: true,
        })
      );
    };
    this.ttsWs.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.audio) {
          const audio = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0)).buffer;
          this.options.onTtsAudio?.(audio);
          await this.playAudio(audio);
        }
      } catch {}
    };
    this.ttsWs.onerror = () => this.options.onError?.(new Error("TTS WebSocket error"));
  }

  private async playAudio(audioData: ArrayBuffer) {
    if (!this.audioContext) this.audioContext = new AudioContext({ sampleRate: 32000 });
    const buffer = await this.audioContext.decodeAudioData(audioData);
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start();
  }

  stopAsr() {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }
    if (this.asrWs) {
      this.asrWs.close();
      this.asrWs = null;
    }
  }

  stopTts() {
    if (this.ttsWs) {
      this.ttsWs.close();
      this.ttsWs = null;
    }
  }

  destroy() {
    this.stopAsr();
    this.stopTts();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}


