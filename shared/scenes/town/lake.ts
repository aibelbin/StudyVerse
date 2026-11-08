import { pointInPolygon, polygonToBoxes, type Box } from '../../geometry';
import { merge, type Parts } from '../kit';
import { rowboat, simpleToy } from '../kitToys';
import type { Decor, SailPath, Water } from '../types';
import { inAny, scatter } from './scatter';

export const LAKE = { x: 28, z: -24, rx: 22, rz: 13 };
export const DOCK: Box = { x: 24, z: -13.5, w: 2, d: 9 };

function ring(n: number, rx: number, rz: number, cx: number, cz: number, wobble: number, phase = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + phase;
    const w = 1 + wobble * (0.6 * Math.sin(3 * a + 1) + 0.4 * Math.sin(5 * a + 2));
    out.push([cx + rx * w * Math.cos(a), cz + rz * w * Math.sin(a)]);
  }
  return out;
}

export const OUTLINE = ring(24, LAKE.rx, LAKE.rz, LAKE.x, LAKE.z, 0.05);

/** A point on the outline pushed outward (away from the lake centre) by k. */
function outward([x, z]: [number, number], k: number): { x: number; z: number } {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const len = Math.hypot(dx, dz);
  return { x: x + (dx / len) * k, z: z + (dz / len) * k };
}

const colliders = polygonToBoxes(OUTLINE, 1.5, [DOCK]);
const inBounds = (p: { x: number; z: number }) => Math.abs(p.x) < 56 && Math.abs(p.z) < 42;

const landings = [
  { x: 24, z: -10.5 },
  ...OUTLINE.filter((_, i) => i % 3 === 0)
    .map((p) => outward(p, 2.2))
    .filter((p) => inBounds(p) && !inAny(colliders, p.x, p.z, 0.4)),
];

const nearestOnShore = (x: number, z: number) =>
  OUTLINE.reduce((best, p) => (Math.hypot(p[0] - x, p[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? p : best));
const ducksSpot = outward(nearestOnShore(36, -10), 1.6);

const sailPaths: SailPath[] = [
  { points: ring(6, 15, 7.5, 30, -26, 0.08, 0.3), period: 120, offset: 0, color: '#ff8a7a' },
  { points: ring(6, 9, 5, 22, -24, 0.1, 1.1), period: 150, offset: 0.4, color: '#7ab8ff' },
  { points: ring(6, 8, 5, 38, -24, 0.1, 2.2), period: 180, offset: 0.7, color: '#ffd36e' },
];

export const water: Water = { outline: OUTLINE, landings, sailPaths };

const lilies: Decor[] = scatter(41, 40, { x: LAKE.x, z: LAKE.z, w: LAKE.rx * 2, d: LAKE.rz * 2 }, (x, z) => {
  if (!pointInPolygon(OUTLINE, x, z)) return false;
  const k = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
  return k > 0.68 && k < 0.92 && !inAny([DOCK], x, z, 2.5);
}).map(([x, z], i) => ({ kind: 'lilyPad', x, z, seed: i * 31 + 7 }));

export const lake: Parts = merge(
  rowboat('boat-1', 22.3, -15.6, Math.PI),
  rowboat('boat-2', 25.7, -15.6, Math.PI),
  simpleToy('stones', 'stones', 24, -17.2, 1.4),
  simpleToy('ducks', 'ducks', ducksSpot.x, ducksSpot.z, 1.8),
  {
    decor: [
      { kind: 'lake', x: 0, z: 0, points: OUTLINE },
      { kind: 'dock', x: DOCK.x, z: DOCK.z, w: DOCK.w, d: DOCK.d },
      ...lilies,
    ],
    colliders,
    life: [
      { kind: 'ducks', x: LAKE.x, z: LAKE.z, r: 12, count: 8, seed: 11 },
      { kind: 'fish', x: LAKE.x, z: LAKE.z, r: 14, count: 6, seed: 12 },
      { kind: 'frogs', x: LAKE.x, z: LAKE.z, r: 20, count: 5, seed: 13 },
      { kind: 'dragonflies', x: LAKE.x, z: LAKE.z + 4, r: 16, count: 8, seed: 14 },
    ],
  },
);
