import type { Drink } from '../../../shared/types';

/**
 * Barista mini-steps as small pure models (inspired by barista games such as Good Coffee, Great
 * Coffee: dose, tamp, pull the shot, steam, pour, latte art). The panel in barista.ts draws them.
 */
export type StepKind = 'grind' | 'sift' | 'melt' | 'whisk' | 'tamp' | 'shot' | 'steam' | 'pour' | 'art';
export type StepType = 'crank' | 'tamp' | 'fill' | 'heat' | 'pour' | 'art';

export const RECIPES: Record<Drink, StepKind[]> = {
  espresso: ['grind', 'tamp', 'shot'],
  latte: ['grind', 'tamp', 'shot', 'steam', 'pour', 'art'],
  matcha: ['sift', 'whisk', 'steam', 'pour', 'art'],
  cocoa: ['melt', 'steam', 'pour', 'art'],
};

export const STEPS: Record<StepKind, { type: StepType; label: string; hint: string; turns?: number }> = {
  grind: { type: 'crank', label: 'Grind the beans', hint: 'Drag round and round to turn the handle. Stop on the line.', turns: 3 },
  sift: { type: 'crank', label: 'Sift the matcha', hint: 'Drag in circles to sift. Stop on the line.', turns: 2 },
  melt: { type: 'crank', label: 'Melt the chocolate', hint: 'Stir in circles until it is just melted.', turns: 2.5 },
  whisk: { type: 'crank', label: 'Whisk', hint: 'Whisk in quick circles until it is frothy. Stop on the line.', turns: 4 },
  tamp: { type: 'tamp', label: 'Tamp', hint: 'Hold to press. Keep the needle in the green for a second.' },
  shot: { type: 'fill', label: 'Pull the shot', hint: 'Hold to pour. Let go between the two marks.' },
  steam: { type: 'heat', label: 'Steam the milk', hint: 'Hold to steam. Let go at 60–65°.' },
  pour: { type: 'pour', label: 'Pour', hint: 'Hold to tilt the jug: more tilt pours faster. Stop at the line.' },
  art: { type: 'art', label: 'Latte art', hint: 'Trace the shape in the foam.' },
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 1 inside [lo, hi], falling linearly to 0 at `fall` beyond either edge. */
export function bandScore(v: number, lo: number, hi: number, fall: number): number {
  if (v >= lo && v <= hi) return 1;
  const off = v < lo ? lo - v : v - hi;
  return clamp01(1 - off / fall);
}

/** Crank (grind, sift, melt, whisk): fill rises with the angle you drag through. */
export class Crank {
  fill = 0;
  private last: number | null = null;
  private acc = 0;
  constructor(private turns: number) {}

  /** Feed the pointer's angle around the centre; null when the pointer is up. */
  drag(angle: number | null): void {
    if (angle === null) {
      this.last = null;
      return;
    }
    if (this.last !== null) {
      let d = angle - this.last;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.acc += Math.abs(d);
    }
    this.last = angle;
    this.fill = this.acc / (Math.PI * 2 * this.turns);
  }

  score(): number {
    return clamp01(1 - Math.abs(this.fill - 1) / 0.35);
  }
}

/** Tamp: pressure rises while held; time in the green zone is what counts, pressing too hard costs. */
export class Tamp {
  pressure = 0;
  inZone = 0;
  over = false;
  static readonly LO = 0.55;
  static readonly HI = 0.8;

  step(dt: number, held: boolean): void {
    this.pressure = held ? Math.min(1.1, this.pressure + dt / 1.6) : Math.max(0, this.pressure - dt * 0.8);
    if (held && this.pressure >= Tamp.LO && this.pressure <= Tamp.HI) this.inZone += dt;
    if (this.pressure > 0.95) this.over = true;
  }

  get done(): boolean {
    return this.inZone >= 1;
  }

  score(): number {
    return clamp01(Math.min(1, this.inZone) - (this.over ? 0.5 : 0));
  }
}

/** The espresso shot: it drips in while held; let go between the marks at 0.8 and 1.0. */
export class Fill {
  level = 0;
  static readonly RATE = 0.9;
  step(dt: number, held: boolean): void {
    if (held) this.level += Fill.RATE * dt;
  }
  score(): number {
    return bandScore(this.level, 0.8, 1.0, 0.35);
  }
}

/** Steaming: the thermometer climbs while held with a little wobble, cools slowly when you let go. */
export class Heat {
  base = 20;
  time = 0;
  static readonly LO = 60;
  static readonly HI = 65;
  step(dt: number, held: boolean): void {
    this.time += dt;
    this.base = held ? this.base + 14 * dt : Math.max(20, this.base - 2 * dt);
  }
  get temp(): number {
    return this.base + (this.base > 25 ? 1.5 * Math.sin(this.time * 7) : 0);
  }
  score(): number {
    const t = this.temp;
    return t > 75 ? 0 : bandScore(t, Heat.LO, Heat.HI, 12);
  }
}

/** Pouring: tilt eases toward full while held; flow starts past a quarter tilt and lands 0.15 s later. */
export class Pour {
  tilt = 0;
  level = 0;
  poured = false;
  private time = 0;
  private falling: [number, number][] = []; // [lands at, amount]
  static readonly LINE = 0.85;
  static readonly LAG = 0.15;

  step(dt: number, held: boolean): void {
    this.time += dt;
    this.tilt = held ? this.tilt + (1 - this.tilt) * Math.min(1, 2.5 * dt) : Math.max(0, this.tilt - 3 * dt);
    const flow = this.flow;
    if (flow > 0) {
      this.poured = true;
      this.falling.push([this.time + Pour.LAG, flow * dt]);
    }
    while (this.falling.length && this.falling[0][0] <= this.time) this.level += this.falling.shift()![1];
  }

  /** Litres-ish per second leaving the jug right now. */
  get flow(): number {
    return this.tilt < 0.25 ? 0 : ((this.tilt - 0.25) / 0.75) * 0.8;
  }

  get streaming(): boolean {
    return this.falling.length > 0;
  }

  get spilled(): boolean {
    return this.level > 1;
  }

  /** Finished once something was poured, the jug is level again and nothing is still in the air. */
  get done(): boolean {
    return this.poured && this.tilt === 0 && !this.streaming;
  }

  score(): number {
    return this.spilled ? 0 : bandScore(this.level, Pour.LINE - 0.04, Pour.LINE + 0.04, 0.21);
  }
}

export type Pt = [number, number];

/** Guide shapes in unit space (−1..1, y down), 40 points each. */
export function guideShape(kind: 'heart' | 'tulip' | 'swirl'): Pt[] {
  const out: Pt[] = [];
  if (kind === 'heart') {
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      out.push([x / 17, -y / 17 + 0.1]);
    }
  } else if (kind === 'tulip') {
    const lobes: [number, number][] = [[-0.45, 0.62], [0.0, 0.5], [0.4, 0.38]]; // [centre y, radius]
    for (const [cy, r] of lobes) for (let i = 0; i < 11; i++) {
      const a = Math.PI + (i / 10) * Math.PI; // the top half of a circle
      out.push([Math.cos(a) * r, cy + Math.sin(a) * r * 0.7]);
    }
    for (let i = 0; i < 7; i++) out.push([0, 0.42 + (i / 6) * 0.45]);
  } else {
    for (let i = 0; i < 40; i++) {
      const t = i / 39;
      const a = t * Math.PI * 3.2;
      const r = 0.12 + 0.72 * t;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  return out;
}

const minDist = (p: Pt, set: Pt[]) => set.reduce((m, q) => Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1])), Infinity);

/**
 * How well a stroke traces a guide (both in pixels): the share of guide points the stroke came
 * within `near` of, scaled down by the share of stroke samples wandering more than `far` away
 * (half the stroke astray scores nothing).
 */
export function artScore(guide: Pt[], stroke: Pt[], near = 14, far = 22): number {
  if (!stroke.length || !guide.length) return 0;
  const coverage = guide.filter((g) => minDist(g, stroke) <= near).length / guide.length;
  const stray = stroke.filter((s) => minDist(s, guide) > far).length / stroke.length;
  return clamp01(coverage * (1 - Math.min(1, stray / 0.5)));
}

/** Mean step score to stars: 3 at 0.8, 2 at 0.5, otherwise 1. Skipped steps (null) don't count. */
export function starsFor(scores: (number | null)[]): number {
  const s = scores.filter((v): v is number => v !== null);
  const mean = s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
  return mean >= 0.8 ? 3 : mean >= 0.5 ? 2 : 1;
}
