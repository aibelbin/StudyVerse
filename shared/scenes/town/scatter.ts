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

/**
 * The original 120×90 walkways. Zones are laid out in these coordinates and then shifted as
 * whole blocks (see town.ts), so their scatter keeps clear of the spurs that move with them.
 */
export const ZONE_PATHS: Box[] = [
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

/** How far each zone moved when the town grew to 150×100. */
export const OFFSETS = {
  woods: [-15, -5],
  lake: [15, -5],
  park: [-15, 5],
  playground: [15, 5],
} as const;

/** The 150×100 walkways, before the town moved 15 m north to make room for the south strip. */
export const BASE_PATHS: Box[] = [
  { x: 0, z: 1.5, w: 144, d: 2.4 },      // main east–west street, also the road to both car parks
  { x: 0, z: -2, w: 14, d: 24 },         // square plaza
  { x: 0, z: -31, w: 2.4, d: 34 },       // north path from the square
  { x: 0, z: 26, w: 2.4, d: 44 },        // south path
  { x: -12, z: -0.6, w: 1.8, d: 3 },     // library door spur
  { x: 12, z: -0.8, w: 1.8, d: 3.4 },    // café door spur
  { x: 39, z: -6.85, w: 2, d: 14.3 },    // to the dock
  { x: -45, z: -13.3, w: 2, d: 27.4 },   // to the campfire
  { x: -45, z: 18.5, w: 2, d: 31.6 },    // into the park
  { x: 45, z: 14.9, w: 2, d: 24.4 },     // to the playground
  { x: 45, z: 32, w: 24, d: 2 },         // playground cross path
];

/**
 * The town grew to 150×130 by adding a strip in the south. Scenes are centred on the origin, so
 * everything laid out for 150×100 moves this far in z (north).
 */
export const TOWN_DZ = -15;

/** The south strip, in final town coordinates: z from 33.5 (the old hedge line) to the new edge. */
export const STRIP = { x: 0, z: 48.5, w: 147, d: 30 };

/** Park ground kept for the zen corner and for round 2's garden plots (final town coordinates). */
export const ZEN_BOX: Box = { x: -32, z: 25, w: 14, d: 12 };
export const GARDEN_BOX: Box = { x: -62, z: 10, w: 16, d: 12 };
export const RESERVED: Box[] = [ZEN_BOX, GARDEN_BOX];

const moved = (b: Box): Box => ({ ...b, z: b.z + TOWN_DZ });

/** The walkways in final town coordinates. */
export const PATHS: Box[] = [
  ...BASE_PATHS.map((b, i) => {
    if (i === 3) return { x: 0, z: 15, w: 2.4, d: 52 };        // south path, now on to the strip path
    if (i === 8) return { x: -45, z: 14.35, w: 2, d: 53.3 };   // park path, now on to the strip path
    return moved(b);
  }),
  { x: -29.4, z: 40, w: 61.2, d: 2 },    // strip path: park path to south path, past the stage
];
