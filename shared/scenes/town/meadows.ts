import { pointInPolygon, type Box } from '../../geometry';
import { merge, tree, type Parts } from '../kit';
import type { Decor } from '../types';
import { inAny, PATHS, scatter } from './scatter';

/** The open ground left between the square and the zones when the town grew, filled lightly. */
const GAPS: Box[] = [
  { x: -13, z: -31.5, w: 20, d: 33 },
  { x: 12, z: -31.5, w: 18, d: 33 },
  { x: -12, z: 28, w: 18, d: 38 },
  { x: 16, z: 28, w: 26, d: 38 },
];

/** Trees, bushes and flowers in the gaps, kept clear of paths, lots and everything already placed. */
export function meadows(placed: Parts, lake: [number, number][]): Parts {
  const ok = (pad: number) => (x: number, z: number) =>
    !inAny(PATHS, x, z, pad + 1) && !inAny(placed.colliders, x, z, pad + 0.6) && !pointInPolygon(lake, x, z)
    && !placed.toys.some((t) => Math.hypot(t.x - x, t.z - z) < t.radius + 2)
    && !placed.decor.some((d) => d.kind === 'parking' && inAny([{ x: d.x, z: d.z, w: d.w ?? 0, d: d.d ?? 0 }], x, z, 2));
  const out: Partial<Parts>[] = [];
  GAPS.forEach((g, k) => {
    const trees = scatter(1100 + k, 10, g, ok(1.2));
    out.push(...trees.map(([x, z], i) => tree(x, z, 0.9 + ((i * 7 + k) % 5) / 10, (i + k) % 3 === 0 ? 'pine' : 'tree')));
    const bits: Decor[] = scatter(1200 + k, 7, g, ok(0.8)).map(([x, z], i) => ({ kind: i % 2 ? 'bush' : 'flowers', x, z, seed: 1300 + k * 10 + i }));
    out.push({ decor: bits });
  });
  return merge(...out);
}
