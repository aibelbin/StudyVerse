import type { SoundKind } from './kinds';
import { VOICES } from './voices';

let shared: AudioContext | null = null;

/** The page's one AudioContext, created and resumed on the first key or click. */
export function audioCtx(): AudioContext | null {
  try {
    shared ??= new AudioContext();
    if (shared.state === 'suspended') void shared.resume();
    return shared;
  } catch {
    return null;
  }
}
if (typeof window !== 'undefined') {
  for (const ev of ['keydown', 'pointerdown'] as const) window.addEventListener(ev, () => audioCtx(), { once: true });
}

const NEAR = 4;
const FAR = 25;

export function gainForDistance(d: number): number {
  if (d <= NEAR) return 1;
  if (d >= FAR) return 0;
  const u = (d - NEAR) / (FAR - NEAR);
  return (1 - u) * (1 - u);
}

export function panFor(dx: number): number {
  return Math.max(-1, Math.min(1, dx / 12));
}

/** A steady sound source in the world (jukebox, water, fire). Connect voices to `input`. */
export interface Emitter {
  x: number;
  z: number;
  /** Extra volume on top of distance, 0..1. */
  level: number;
  input: GainNode;
}

const MUTE_KEY = 'sv-muted';

/** Positional sound for the town: distance falloff, left/right pan, a mute switch, silent indoors. */
export class AudioEngine {
  muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  private bus: GainNode | null = null;
  private listener = { x: 0, z: 0 };
  private outdoors = true;
  private emitters: { e: Emitter; gain: GainNode; pan: StereoPannerNode }[] = [];

  ctx(): AudioContext | null {
    const c = audioCtx();
    if (c && !this.bus) {
      this.bus = c.createGain();
      this.bus.connect(c.destination);
      this.applyBus();
    }
    return c;
  }

  private applyBus(): void {
    if (this.bus) this.bus.gain.value = this.muted || !this.outdoors ? 0 : 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    this.applyBus();
  }

  setScene(id: string): void {
    this.outdoors = id === 'town';
    this.applyBus();
  }

  setListener(x: number, z: number): void {
    this.listener = { x, z };
  }

  /** The bus for sounds that come from everywhere (crickets, birdsong). */
  ambient(): GainNode | null {
    this.ctx();
    return this.bus;
  }

  playAt(kind: SoundKind, x: number, z: number, arg?: number): void {
    const c = this.ctx();
    if (!c || !this.bus || this.muted || !this.outdoors) return;
    const g = gainForDistance(Math.hypot(x - this.listener.x, z - this.listener.z));
    if (g <= 0.001) return;
    const out = c.createGain();
    out.gain.value = g;
    const pan = c.createStereoPanner();
    pan.pan.value = panFor(x - this.listener.x);
    out.connect(pan).connect(this.bus);
    VOICES[kind](c, out, arg);
    setTimeout(() => pan.disconnect(), 4000);
  }

  emitter(x: number, z: number): Emitter | null {
    const c = this.ctx();
    if (!c || !this.bus) return null;
    const input = c.createGain();
    const gain = c.createGain();
    gain.gain.value = 0;
    const pan = c.createStereoPanner();
    input.connect(gain).connect(pan).connect(this.bus);
    const e: Emitter = { x, z, level: 1, input };
    this.emitters.push({ e, gain, pan });
    return e;
  }

  /** Call every frame: steers emitter volumes and pans towards the listener. */
  update(): void {
    const c = shared;
    if (!c) return;
    for (const { e, gain, pan } of this.emitters) {
      const g = gainForDistance(Math.hypot(e.x - this.listener.x, e.z - this.listener.z)) * e.level;
      gain.gain.setTargetAtTime(g, c.currentTime, 0.15);
      pan.pan.setTargetAtTime(panFor(e.x - this.listener.x), c.currentTime, 0.15);
    }
  }
}
