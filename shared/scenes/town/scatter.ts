import type { Box } from '../../geometry';
import { rng } from '../../rng';

/** Deterministic rejection sampling of up to n points inside area that pass ok(). */
export function scatter(seed: number, n: number, area: Box, ok: (x: number, z: number) => boolean): [number, number][] {
  const r = rng(seed);
  const out: [number, number][] = [];
  for (let tries = 0; out.length < n && tries < n * 20; tries++) {
    const x = area.x + (r() - 0.5) * area.w;
    const z = area.z + (r() - 0.5) * area.d;
    if (ok(x, z)) out.push([x, z]);
  }
  return out;
}

export const near = (x: number, z: number, cx: number, cz: number, r: number) => Math.hypot(x - cx, z - cz) < r;

/** True if (x, z) is within pad of any box. */
export const inAny = (boxes: Box[], x: number, z: number, pad = 0) =>
  boxes.some((b) => Math.abs(x - b.x) <= b.w / 2 + pad && Math.abs(z - b.z) <= b.d / 2 + pad);

/** Walkways shared by every zone, so scatter can keep them clear. */
export const PATHS: Box[] = [
  { x: 0, z: 1.5, w: 114, d: 2.4 },      // main east–west street
  { x: 0, z: -2, w: 14, d: 24 },         // square plaza
  { x: 0, z: -27, w: 2.4, d: 26 },       // north path from the square
  { x: 0, z: 24, w: 2.4, d: 40 },        // south path
  { x: -12, z: -0.6, w: 1.8, d: 3 },     // library door spur
  { x: 12, z: -0.8, w: 1.8, d: 3.4 },    // café door spur
  { x: 24, z: -4.2, w: 2, d: 11.6 },     // to the dock
  { x: -30, z: -10.8, w: 2, d: 22.4 },   // to the campfire
  { x: -30, z: 16, w: 2, d: 26.6 },      // into the park
  { x: 30, z: 12.4, w: 2, d: 19.4 },     // to the playground
  { x: 30, z: 27, w: 24, d: 2 },         // playground cross path
];
