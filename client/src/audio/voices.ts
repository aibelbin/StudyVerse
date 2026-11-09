import type { SoundKind } from './kinds';

type Voice = (c: AudioContext, out: AudioNode, arg?: number, at?: number) => void;

const SCALE = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25]; // C4..C5

function env(c: AudioContext, out: AudioNode, at: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(out);
  return g;
}

function tone(c: AudioContext, out: AudioNode, type: OscillatorType, freq: number, at: number, peak: number, decay: number, detune = 0): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.connect(env(c, out, at, peak, 0.005, decay));
  o.start(at);
  o.stop(at + decay + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** A filtered noise burst. Optional sweep moves the filter from freq to sweepTo. */
export function burst(c: AudioContext, out: AudioNode, at: number, freq: number, q: number, peak: number, decay: number, sweepTo?: number): void {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, at);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + decay);
  f.Q.value = q;
  src.connect(f).connect(env(c, out, at, peak, 0.01, decay));
  src.start(at, Math.random());
  src.stop(at + decay + 0.05);
}

function chirp(c: AudioContext, out: AudioNode, from: number, to: number, at: number, peak: number, dur: number, type: OscillatorType = 'sine'): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + dur);
  o.connect(env(c, out, at, peak, 0.01, dur));
  o.start(at);
  o.stop(at + dur + 0.05);
}

export const VOICES: Record<SoundKind, Voice> = {
  note(c, out, arg = 0, at = c.currentTime) {
    const f = SCALE[Math.max(0, Math.min(7, arg))];
    tone(c, out, 'triangle', f, at, 0.18, 1.2, -4);
    tone(c, out, 'triangle', f, at, 0.18, 1.2, 4);
    tone(c, out, 'sine', f * 2, at, 0.05, 0.6);
  },
  bell(c, out, _arg, at = c.currentTime) {
    for (const [k, g] of [[1, 0.25], [2.76, 0.12], [5.4, 0.06]]) tone(c, out, 'sine', 660 * k, at, g, 2.5);
  },
  chime(c, out, _arg, at = c.currentTime) {
    const penta = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093];
    for (let i = 0; i < 4; i++) tone(c, out, 'sine', penta[Math.floor(Math.random() * penta.length)], at + i * 0.09 + Math.random() * 0.05, 0.09, 1.8);
  },
  splash(c, out, _arg, at = c.currentTime) {
    burst(c, out, at, 900, 0.7, 0.4, 0.5, 300);
  },
  coin(c, out, _arg, at = c.currentTime) {
    tone(c, out, 'sine', 1800, at, 0.12, 0.25);
    tone(c, out, 'sine', 2400, at + 0.06, 0.1, 0.3);
  },
  plop(c, out, _arg, at = c.currentTime) {
    chirp(c, out, 700, 140, at, 0.3, 0.14);
    burst(c, out, at, 1200, 1, 0.12, 0.15);
  },
  skip(c, out, arg = 0, at = c.currentTime) {
    chirp(c, out, 900 + arg * 120, 300, at, 0.18 / (1 + arg * 0.3), 0.09);
  },
  whoosh(c, out, _arg, at = c.currentTime) {
    burst(c, out, at, 400, 1.2, 0.25, 1.2, 1800);
  },
  honk(c, out, _arg, at = c.currentTime) {
    for (const d of [0, 0.22]) {
      for (const f of [392, 494]) {
        const o = c.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800;
        o.connect(lp).connect(env(c, out, at + d, 0.06, 0.01, 0.17));
        o.start(at + d);
        o.stop(at + d + 0.2);
      }
    }
  },
  quack(c, out, _arg, at = c.currentTime) {
    for (const d of [0, 0.22]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(320, at + d);
      o.frequency.exponentialRampToValueAtTime(190, at + d + 0.16);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      o.connect(f).connect(env(c, out, at + d, 0.12, 0.01, 0.16));
      o.start(at + d);
      o.stop(at + d + 0.2);
    }
  },
};

export { chirp, tone };
