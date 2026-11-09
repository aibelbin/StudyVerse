import type { Box } from '../../geometry';
import { merge, tree, type Parts } from '../kit';
import { simpleToy } from '../kitToys';
import type { Decor, Slot } from '../types';

// The zen corner, in final town coordinates (inside ZEN_BOX: x −39..−25, z 19..31).
export const KOI_POND = { x: -29.5, z: 26, w: 8, d: 5.5 };
const RING = { x: -35.5, z: 21.6, r: 1.5 };
const CAIRN = { x: -26.8, z: 21 };

/** Five cushions in a ring, facing in. */
function cushions(): Partial<Parts> {
  const slots: Slot[] = [];
  const decor: Decor[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = RING.x + Math.sin(a) * RING.r;
    const z = RING.z + Math.cos(a) * RING.r;
    slots.push({ id: `zen-cushion-${i}`, x, z, facing: a + Math.PI, pose: 'sit', toyId: 'zen-ring' });
    decor.push({ kind: 'cushion', x, z, rot: a, seed: 70 + i });
  }
  return {
    toys: [{ id: 'zen-ring', kind: 'cushions', x: RING.x, z: RING.z, radius: RING.r + 1.2, slotIds: slots.map((s) => s.id) }],
    slots,
    decor,
  };
}

/** A picnic blanket with two places, both looking at the pond (east). */
function blanket(id: string, x: number, z: number): Partial<Parts> {
  return {
    decor: [{ kind: 'blanket', x, z, w: 1.6, d: 2.2, seed: x * 3 + z }],
    slots: [
      { id: `${id}-a`, x, z: z - 0.5, facing: Math.PI / 2, pose: 'sit' },
      { id: `${id}-b`, x, z: z + 0.5, facing: Math.PI / 2, pose: 'sit' },
    ],
  };
}

const lantern = (x: number, z: number): Partial<Parts> => ({ decor: [{ kind: 'lantern', x, z }], colliders: [{ x, z, w: 0.4, d: 0.4 }] });
const cherry = (x: number, z: number, s: number): Partial<Parts> => {
  const t = tree(x, z, s);
  return { ...t, decor: t.decor!.map((d) => ({ ...d, kind: 'cherry' as const })) };
};

/** The pond is solid either side of the bridge, which crosses it north to south. */
const pondWalls: Box[] = [
  { x: -31.9, z: KOI_POND.z, w: 3.0, d: 4.4 },
  { x: -27.1, z: KOI_POND.z, w: 3.0, d: 4.4 },
];

export const zen: Parts = merge(
  {
    decor: [
      { kind: 'pond', x: KOI_POND.x, z: KOI_POND.z, w: KOI_POND.w, d: KOI_POND.d, seed: 81 },
      { kind: 'bridge', x: KOI_POND.x, z: KOI_POND.z, d: 7, w: 1.7 },
      { kind: 'gravel', x: CAIRN.x, z: CAIRN.z, w: 2.6, d: 2.2 },
      { kind: 'gravel', x: RING.x, z: RING.z, w: 4.4, d: 4.4 },
    ],
    colliders: pondWalls,
    life: [{ kind: 'petals', x: -32, z: 25, r: 7, count: 30, seed: 91 }],
  },
  simpleToy('zen-koi', 'koi', KOI_POND.x, KOI_POND.z, 5),
  simpleToy('zen-cairn', 'cairn', CAIRN.x, CAIRN.z, 1.6, { x: CAIRN.x, z: CAIRN.z, w: 0.7, d: 0.7 }),
  cushions(),
  blanket('zen-blanket-1', -37.4, 26.4),
  blanket('zen-blanket-2', -36.2, 29.6),
  lantern(-30.9, 22.4), lantern(-28.1, 22.4), lantern(-30.9, 29.6), lantern(-28.1, 29.6),
  cherry(-38.3, 23.2, 1.1), cherry(-33.6, 30.4, 1.2), cherry(-25.3, 30.4, 1),
);
