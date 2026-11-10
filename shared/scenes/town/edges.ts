import { merge, tree, type Parts } from '../kit';
import { rng } from '../../rng';

/** An opening in one edge's hedge (for a gate): `at` is the x (north/south) or z (east/west) of its centre. */
export interface HedgeGap {
  side: 'north' | 'south' | 'east' | 'west';
  at: number;
  w: number;
}

/** The opening between a gate's posts. */
export const GATE_GAP = 1.6;

/** The pieces of [lo, hi] left after cutting out the gaps, as centre and length. */
function cut(lo: number, hi: number, gaps: HedgeGap[]): { c: number; len: number }[] {
  const out: { c: number; len: number }[] = [];
  let from = lo;
  for (const g of [...gaps].sort((a, b) => a.at - b.at)) {
    const a = Math.max(lo, g.at - g.w / 2);
    if (a > from) out.push({ c: (from + a) / 2, len: a - from });
    from = Math.max(from, g.at + g.w / 2);
  }
  if (hi > from) out.push({ c: (from + hi) / 2, len: hi - from });
  return out;
}

/**
 * Hedges 1.5 m inside the edge of a w × d outdoor scene, with a tree line just outside them. Gaps open the hedge
 * for a gate; the colliders stay whole (a gate's door sits just inside the hedge).
 */
export function edges(w: number, d: number, seed = 907, gaps: HedgeGap[] = []): Parts {
  const HX = w / 2 - 1.5;
  const HZ = d / 2 - 1.5;
  const r = rng(seed);
  const trees: Partial<Parts>[] = [];
  const add = (x: number, z: number) => {
    const t = tree(x + (r() - 0.5) * 1.5, z + (r() - 0.5) * 1.5, 0.9 + r() * 0.5, r() < 0.5 ? 'pine' : 'tree');
    trees.push({ decor: t.decor }); // outside the play area: no colliders needed
  };
  for (let x = -(w / 2 + 2); x <= w / 2 + 2; x += 3.2) for (const z of [-HZ - 2.5, -HZ - 5.5, HZ + 2.5, HZ + 5.5]) add(x, z);
  for (let z = -HZ - 0.5; z <= HZ + 0.5; z += 3.2) for (const x of [-(w / 2 + 1), -(w / 2 + 4), w / 2 + 1, w / 2 + 4]) add(x, z);
  const on = (side: HedgeGap['side']) => gaps.filter((g) => g.side === side);
  return merge(...trees, {
    decor: [
      ...cut(-HX - 0.5, HX + 0.5, on('north')).map((p) => ({ kind: 'hedge' as const, x: p.c, z: -HZ, w: p.len, d: 1 })),
      ...cut(-HX - 0.5, HX + 0.5, on('south')).map((p) => ({ kind: 'hedge' as const, x: p.c, z: HZ, w: p.len, d: 1 })),
      ...cut(-HZ + 0.5, HZ - 0.5, on('west')).map((p) => ({ kind: 'hedge' as const, x: -HX, z: p.c, w: 1, d: p.len })),
      ...cut(-HZ + 0.5, HZ - 0.5, on('east')).map((p) => ({ kind: 'hedge' as const, x: HX, z: p.c, w: 1, d: p.len })),
    ],
    colliders: [
      { x: 0, z: -HZ, w: HX * 2, d: 1 },
      { x: 0, z: HZ, w: HX * 2, d: 1 },
      { x: -HX, z: 0, w: 1, d: HZ * 2 },
      { x: HX, z: 0, w: 1, d: HZ * 2 },
    ],
  });
}
