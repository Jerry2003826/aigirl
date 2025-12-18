/**
 * WebRTC utilities for voice/video calls
 */

export type CallState = "idle" | "inviting" | "ringing" | "connecting" | "connected" | "ended" | "error";

export interface WebRTCConfig {
  stunServers: Array<{ urls: string }>;
  turnServers: Array<{ urls: string; username?: string; credential?: string }>;
  minimax: {
    streamAsrUrl: string;
    streamTtsUrl: string;
  };
}

export interface CallOptions {
  callId: string;
  conversationId: string;
  calleeId: string;
  withVideo?: boolean;
  onStateChange?: (state: CallState) => void;
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onError?: (error: Error) => void;
  ws: WebSocket;
  webrtcConfig: WebRTCConfig;
}

export class WebRTCCall {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private state: CallState = "idle";
  private callId: string;
  private conversationId: string;
  private calleeId: string;
  private withVideo: boolean;
  private onStateChange?: (state: CallState) => void;
  private onLocalStream?: (stream: MediaStream) => void;
  private onRemoteStream?: (stream: MediaStream) => void;
  private onError?: (error: Error) => void;
  private ws: WebSocket;
  private webrtcConfig: WebRTCConfig;
  private isCaller = false;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];

  constructor(options: CallOptions) {
    this.callId = options.callId;
    this.conversationId = options.conversationId;
    this.calleeId = options.calleeId;
    this.withVideo = options.withVideo ?? false;
    this.onStateChange = options.onStateChange;
    this.onLocalStream = options.onLocalStream;
    this.onRemoteStream = options.onRemoteStream;
    this.onError = options.onError;
    this.ws = options.ws;
    this.webrtcConfig = options.webrtcConfig;
  }

  private setState(newState: CallState) {
    if (this.state !== newState) {
      this.state = newState;
      this.onStateChange?.(newState);
    }
  }

  private createPeerConnection(): RTCPeerConnection {
    const config: RTCConfiguration = {
      iceServers: [...this.webrtcConfig.stunServers, ...this.webrtcConfig.turnServers],
    };
    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(
          JSON.stringify({
            type: "call_candidate",
            payload: { callId: this.callId, candidate: event.candidate.toJSON() },
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") this.setState("connected");
      if (state === "disconnected" || state === "failed" || state === "closed") this.setState("ended");
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.onRemoteStream?.(this.remoteStream);
      }
    };

    return pc;
  }

  async startCall(): Promise<void> {
    try {
      this.isCaller = true;
      this.setState("inviting");
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: this.withVideo });
      this.onLocalStream?.(this.localStream);
      this.pc = this.createPeerConnection();
      this.localStream.getTracks().forEach((track) => this.pc!.addTrack(track, this.localStream!));
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.ws.send(
        JSON.stringify({
          type: "call_invite",
          payload: { callId: this.callId, calleeId: this.calleeId, conversationId: this.conversationId, withVideo: this.withVideo },
        })
      );
      setTimeout(() => {
        this.ws.send(JSON.stringify({ type: "call_offer", payload: { callId: this.callId, offer: offer.toJSON() } }));
      }, 100);
      this.setState("ringing");
    } catch (error: any) {
      this.handleError(error);
    }
  }

  async acceptCall(offer: RTCSessionDescriptionInit): Promise<void> {
    try {
      this.isCaller = false;
      this.setState("connecting");
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: this.withVideo });
      this.onLocalStream?.(this.localStream);
      this.pc = this.createPeerConnection();
      this.localStream.getTracks().forEach((track) => this.pc!.addTrack(track, this.localStream!));
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      for (const c of this.iceCandidatesQueue) await this.pc.addIceCandidate(new RTCIceCandidate(c));
      this.iceCandidatesQueue = [];
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.ws.send(JSON.stringify({ type: "call_accept", payload: { callId: this.callId } }));
      this.ws.send(JSON.stringify({ type: "call_answer", payload: { callId: this.callId, answer: answer.toJSON() } }));
    } catch (error: any) {
      this.handleError(error);
    }
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) {
      await this.acceptCall(offer);
    } else {
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) {
      this.handleError(new Error("Peer connection not initialized"));
      return;
    }
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) {
      this.iceCandidatesQueue.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn("[WebRTC] addIceCandidate failed", err);
    }
  }

  hangup(): void {
    this.ws.send(JSON.stringify({ type: "call_hangup", payload: { callId: this.callId } }));
    this.cleanup();
    this.setState("ended");
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const t = this.localStream.getAudioTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      return t.enabled;
    }
    return false;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return false;
    const t = this.localStream.getVideoTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      return t.enabled;
    }
    return false;
  }

  private handleError(error: any) {
    this.setState("error");
    this.onError?.(error instanceof Error ? error : new Error(String(error)));
  }

  private cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.iceCandidatesQueue = [];
  }

  destroy() {
    this.cleanup();
    this.setState("idle");
  }
}


