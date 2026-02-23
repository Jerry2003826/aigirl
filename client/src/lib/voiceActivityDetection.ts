/**
 * Browser-side Voice Activity Detection (VAD) for realtime voice pipeline.
 * Uses @ricky0123/vad-web (Silero VAD) to detect speech start/end and
 * forwards PCM frames only during speech segments (16kHz, 16bit mono).
 */

import { MicVAD, getDefaultRealTimeVADOptions } from "@ricky0123/vad-web";

/** CDN base for VAD worklet and ONNX model (avoids Vite asset 404s). */
const VAD_CDN_BASE = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/";

const SAMPLE_RATE = 16000;
const CAPTURE_FRAME_LENGTH = 4096;

export type VoiceActivityCallbacks = {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  /** Called with PCM Int16 frames only while user is speaking. 16kHz, mono. */
  onAudioFrame: (pcm: ArrayBuffer) => void;
};

export type VoiceActivitySessionOptions = VoiceActivityCallbacks & {
  /** Minimum speech duration in ms before firing onSpeechEnd (default 400). */
  minSpeechMs?: number;
};

export interface VoiceActivitySession {
  start(): Promise<MediaStream>;
  stop(): Promise<void>;
  /** Whether currently inside a speech segment. */
  readonly isSpeaking: boolean;
}

function float32ToPcm16(float32: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm.buffer;
}

/**
 * Creates a VAD session that uses the same microphone stream for both
 * Silero VAD (start/end) and PCM capture. PCM is forwarded only during speech.
 */
export async function createVoiceActivitySession(
  options: VoiceActivitySessionOptions
): Promise<VoiceActivitySession> {
  const { onSpeechStart, onSpeechEnd, onAudioFrame, minSpeechMs = 400 } = options;

  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let vad: InstanceType<typeof MicVAD> | null = null;
  let isSpeaking = false;

  const start = async (): Promise<MediaStream> => {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: SAMPLE_RATE },
      video: false,
    });

    const defaultOpts = getDefaultRealTimeVADOptions("legacy");
    vad = await MicVAD.new({
      ...defaultOpts,
      baseAssetPath: VAD_CDN_BASE,
      onnxWASMBasePath: VAD_CDN_BASE,
      getStream: () => Promise.resolve(stream!),
      onSpeechStart: () => {
        isSpeaking = true;
        onSpeechStart();
      },
      onSpeechEnd: () => {
        isSpeaking = false;
        onSpeechEnd();
      },
      minSpeechMs,
      startOnLoad: false,
    });
    await vad.start();

    // Capture PCM from the same stream; only send when VAD says we're speaking
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(CAPTURE_FRAME_LENGTH, 1, 1);
    processor.onaudioprocess = (event) => {
      if (!isSpeaking) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = float32ToPcm16(input);
      onAudioFrame(pcm);
    };
    source.connect(processor);
    processor.connect(audioContext.destination);

    return stream;
  };

  const stop = async (): Promise<void> => {
    isSpeaking = false;
    if (processor && source && audioContext) {
      try {
        processor.disconnect();
        source.disconnect();
      } catch (_) {}
      processor = null;
      source = null;
      try {
        await audioContext.close();
      } catch (_) {}
      audioContext = null;
    }
    if (vad) {
      try {
        await vad.destroy();
      } catch (_) {}
      vad = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  };

  return {
    start,
    stop,
    get isSpeaking() {
      return isSpeaking;
    },
  };
}
