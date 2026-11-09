import type { IceServer } from '../../../shared/protocol';
import type { SceneDef } from '../../../shared/scenes/types';
import { audioCtx, gainForDistance, panFor } from '../audio/engine';
import { stageGain } from '../toys/parkMath';

/** Someone who could be on the call: where they are and whether they've opted in. */
export interface VoicePeerInfo {
  id: string;
  x: number;
  z: number;
  voice: boolean;
  dnd: boolean;
}

interface Peer {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audio?: HTMLAudioElement;
  gain?: GainNode;
  pan?: StereoPannerNode;
  analyser?: AnalyserNode;
}

const SPEAK_RMS = 0.04;

/** Should these two be connected? Both opted in, neither in do-not-disturb. */
export function wantsLink(me: { voice: boolean; dnd: boolean }, other: { voice: boolean; dnd: boolean }): boolean {
  return me.voice && !me.dnd && other.voice && !other.dnd;
}

/**
 * Proximity voice: a WebRTC mesh between everyone in the scene who turned voice on, signalled through
 * the game server (perfect negotiation), each voice fading with distance like the toys do.
 */
export class Voice {
  stream: MediaStream | null = null;
  muted = false;
  /** The current scene's stage, if any (set by the game on entering a scene). */
  stage: SceneDef['stage'];
  private peers = new Map<string, Peer>();
  private speaking = new Set<string>();
  private localAnalyser: AnalyserNode | null = null;
  private buf = new Float32Array(512);
  ice: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  constructor(private myId: () => string | null, private signal: (to: string, data: string) => void) {}

  get on(): boolean {
    return this.stream !== null;
  }

  /** Asks for the microphone. Throws a friendly message if the page can't use one. */
  async enable(): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Voice needs the town served over https:// (or opened on localhost). Ask whoever hosts it to set TLS_CERT/TLS_KEY.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.setMuted(false);
    const c = audioCtx();
    if (c) {
      this.localAnalyser = c.createAnalyser();
      this.localAnalyser.fftSize = 512;
      c.createMediaStreamSource(this.stream).connect(this.localAnalyser);
    }
  }

  disable(): void {
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.localAnalyser = null;
    this.speaking.clear();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !m));
  }

  isSpeaking(id: string): boolean {
    return this.speaking.has(id);
  }

  /** Call every frame with who's in the scene: opens and closes links, and steers each voice's volume. */
  update(me: VoicePeerInfo | null, others: VoicePeerInfo[]): void {
    const want = new Set(me && this.on ? others.filter((o) => wantsLink(me, o)).map((o) => o.id) : []);
    for (const id of [...this.peers.keys()]) if (!want.has(id)) this.drop(id);
    for (const id of want) if (!this.peers.has(id)) this.connect(id);
    const c = audioCtx();
    this.speaking.clear();
    if (me && this.localAnalyser && !this.muted && rms(this.localAnalyser, this.buf) > SPEAK_RMS) this.speaking.add(me.id);
    if (!c || !me) return;
    for (const o of others) {
      const p = this.peers.get(o.id);
      if (!p?.gain || !p.pan) continue;
      const normal = gainForDistance(Math.hypot(o.x - me.x, o.z - me.z));
      const g = stageGain(this.stage, o, me, normal); // the stage carries to every seat
      p.gain.gain.setTargetAtTime(g, c.currentTime, 0.1);
      p.pan.pan.setTargetAtTime(g !== normal ? 0 : panFor(o.x - me.x), c.currentTime, 0.1);
      if (p.analyser && rms(p.analyser, this.buf) > SPEAK_RMS) this.speaking.add(o.id);
    }
  }

  /** A signalling message from another player. */
  async onSignal(from: string, data: string): Promise<void> {
    if (!this.on) return;
    let msg: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    const p = this.peers.get(from) ?? this.connect(from);
    try {
      if (msg.description) {
        const collision = msg.description.type === 'offer' && (p.makingOffer || p.pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        await p.pc.setRemoteDescription(msg.description);
        if (msg.description.type === 'offer') {
          await p.pc.setLocalDescription();
          this.signal(from, JSON.stringify({ description: p.pc.localDescription }));
        }
      } else if (msg.candidate) {
        try {
          await p.pc.addIceCandidate(msg.candidate);
        } catch (err) {
          if (!p.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.warn('voice signalling', err);
    }
  }

  private connect(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const p: Peer = { pc, polite: (this.myId() ?? '') < id, makingOffer: false, ignoreOffer: false };
    this.peers.set(id, p);
    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.signal(id, JSON.stringify({ description: pc.localDescription }));
      } catch (err) {
        console.warn('voice offer', err);
      } finally {
        p.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signal(id, JSON.stringify({ candidate }));
    };
    pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      const c = audioCtx();
      if (!stream || !c || p.gain) return;
      // Chrome only pulls remote WebRTC audio into WebAudio if a media element is also playing it.
      p.audio = new Audio();
      p.audio.muted = true;
      p.audio.srcObject = stream;
      void p.audio.play().catch(() => {});
      const src = c.createMediaStreamSource(stream);
      p.gain = c.createGain();
      p.gain.gain.value = 0;
      p.pan = c.createStereoPanner();
      p.analyser = c.createAnalyser();
      p.analyser.fftSize = 512;
      src.connect(p.analyser);
      src.connect(p.gain).connect(p.pan).connect(c.destination);
    };
    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
    return p;
  }

  private drop(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.gain?.disconnect();
    p.pan?.disconnect();
    if (p.audio) p.audio.srcObject = null;
    this.peers.delete(id);
  }
}

function rms(a: AnalyserNode, buf: Float32Array): number {
  a.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.sqrt(sum / buf.length);
}
