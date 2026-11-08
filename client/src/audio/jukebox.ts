import type { ToyState } from '../../../shared/toys';
import type { AudioEngine, Emitter } from './engine';
import { burst, tone } from './voices';

export const BPM = 80;
export const STEPS_PER_BAR = 8; // eighth notes
export const BARS = 4;
export const STEP_MS = 60_000 / BPM / 2;
const LOOP_STEPS = STEPS_PER_BAR * BARS;

/** Steps whose start time lies in [fromMs, toMs), counted from the song start. */
export function stepsBetween(fromMs: number, toMs: number): { index: number; atMs: number }[] {
  const out: { index: number; atMs: number }[] = [];
  for (let k = Math.ceil(fromMs / STEP_MS); k * STEP_MS < toMs; k++) out.push({ index: ((k % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS, atMs: k * STEP_MS });
  return out;
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

interface Song {
  /** Chord per bar as MIDI notes (root first). */
  chords: number[][];
  /** Which eighth notes of a bar get a chord stab. */
  stabs: number[];
  /** Melody: step index in the loop -> MIDI note. */
  lead: Record<number, number>;
  wave: OscillatorType;
}

const SONGS: Song[] = [
  { // warm Fmaj7 - Em7 - Dm7 - Cmaj7
    chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],
    stabs: [0, 3, 6], wave: 'triangle',
    lead: { 2: 72, 5: 76, 10: 74, 13: 71, 18: 72, 21: 69, 26: 67, 29: 71 },
  },
  { // dreamy Am7 - Fmaj7 - C - G
    chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 60], [55, 59, 62, 66]],
    stabs: [0, 2, 4, 6], wave: 'sine',
    lead: { 1: 76, 4: 79, 7: 76, 9: 72, 12: 74, 17: 72, 20: 71, 25: 74, 28: 79 },
  },
  { // bouncy Cmaj7 - Am7 - Dm7 - G7
    chords: [[48, 52, 55, 59], [45, 48, 52, 55], [50, 53, 57, 60], [43, 47, 50, 53]],
    stabs: [1, 3, 5, 7], wave: 'square',
    lead: { 0: 72, 3: 74, 6: 76, 8: 77, 11: 76, 14: 74, 16: 72, 19: 69, 24: 71, 27: 74, 30: 79 },
  },
];

/** Plays the jukebox's current loop, in step with everyone via the shared startedAt. */
export class JukeboxPlayer {
  private state: { track: number; startedAt: number } = { track: 0, startedAt: 0 };
  private scheduledTo = 0;
  private out: Emitter | null = null;

  constructor(private engine: AudioEngine, private x: number, private z: number) {}

  set(s: ToyState | undefined): void {
    if (s?.kind !== 'jukebox') return;
    if (s.track !== this.state.track || s.startedAt !== this.state.startedAt) {
      this.state = { track: s.track, startedAt: s.startedAt };
      this.scheduledTo = 0;
    }
  }

  tick(serverNowMs: number): void {
    const { track, startedAt } = this.state;
    if (!track) return;
    const c = this.engine.ctx();
    if (!c) return;
    this.out ??= this.engine.emitter(this.x, this.z);
    if (!this.out) return;
    const elapsed = serverNowMs - startedAt;
    const from = Math.max(this.scheduledTo, elapsed);
    const to = elapsed + 250;
    if (to <= from) return;
    const song = SONGS[track - 1];
    for (const s of stepsBetween(from, to)) this.play(c, song, s.index, c.currentTime + (s.atMs - elapsed) / 1000);
    this.scheduledTo = to;
  }

  private play(c: AudioContext, song: Song, index: number, at: number): void {
    const out = this.out!.input;
    const bar = Math.floor(index / STEPS_PER_BAR);
    const step = index % STEPS_PER_BAR;
    const chord = song.chords[bar];
    if (step === 0 || step === 4) tone(c, out, 'sine', midi(chord[0] - 12), at, 0.16, 0.6);
    if (song.stabs.includes(step)) for (const n of chord.slice(1)) tone(c, out, song.wave, midi(n), at, song.wave === 'square' ? 0.018 : 0.04, 0.45);
    const lead = song.lead[index];
    if (lead) tone(c, out, 'triangle', midi(lead), at, 0.07, 0.5);
    burst(c, out, at, 7000, 1.5, step % 2 ? 0.025 : 0.04, 0.05);
    if (step === 2 || step === 6) burst(c, out, at, 1800, 0.8, 0.06, 0.12);
  }
}
