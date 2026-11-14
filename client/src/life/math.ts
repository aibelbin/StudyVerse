import type { LifeKind } from '../../../shared/scenes/types';

/** Critters further than this (plus their zone radius) from the camera target stop updating. */
export const LIFE_RADIUS = 35;

/** Deterministic hash of a few integers to [0, 1). */
export function hash(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Smooth 1-D value noise in [-1, 1]. */
export function noise1(seed: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  const a = hash(seed, i) * 2 - 1;
  const b = hash(seed, i + 1) * 2 - 1;
  return a + (b - a) * s;
}

export const within = (a: { x: number; z: number }, b: { x: number; z: number }, r: number) =>
  Math.hypot(a.x - b.x, a.z - b.z) <= r;

/** Point and heading on a closed Catmull-Rom loop through points, u in [0, 1). */
export function catmullLoop(points: [number, number][], u: number): { x: number; z: number; heading: number } {
  const n = points.length;
  const f = (((u % 1) + 1) % 1) * n;
  const i = Math.floor(f);
  const t = f - i;
  const p = (k: number) => points[(((i + k) % n) + n) % n];
  const [p0, p1, p2, p3] = [p(-1), p(0), p(1), p(2)];
  const c = (a: number, b: number, cc: number, d: number) =>
    0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t * t + (-a + 3 * b - 3 * cc + d) * t * t * t);
  const dc = (a: number, b: number, cc: number, d: number) =>
    0.5 * ((-a + cc) + 2 * (2 * a - 5 * b + 4 * cc - d) * t + 3 * (-a + 3 * b - 3 * cc + d) * t * t);
  return {
    x: c(p0[0], p1[0], p2[0], p3[0]),
    z: c(p0[1], p1[1], p2[1], p3[1]),
    heading: Math.atan2(dc(p0[0], p1[0], p2[0], p3[0]), dc(p0[1], p1[1], p2[1], p3[1])),
  };
}

/** A catchable critter's last drawn spot. shown = drawn this frame (not netted, fireflies only after dark). */
export interface Critter {
  id: number;
  kind: LifeKind;
  x: number;
  z: number;
  shown: boolean;
  hiddenUntil: number;
}

let nextCritter = 0;
export const critters = (kind: LifeKind, n: number): Critter[] =>
  Array.from({ length: n }, () => ({ id: nextCritter++, kind, x: 0, z: 0, shown: false, hiddenUntil: 0 }));

/** Note where a critter is now; false while it's netted (draw it hidden). */
export function track(c: Critter, x: number, z: number, t: number): boolean {
  c.x = x;
  c.z = z;
  return (c.shown = t >= c.hiddenUntil);
}

/** The closest shown critter within reach of (x, z) that `ok` accepts (one you could catch right now). */
export function nearestCritter(list: Critter[], x: number, z: number, reach: number, ok: (kind: LifeKind) => boolean): Critter | null {
  let best: Critter | null = null;
  let bd = reach;
  for (const c of list) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (c.shown && d <= bd && ok(c.kind)) [best, bd] = [c, d];
  }
  return best;
}
