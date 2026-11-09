import { merge, tree, type Parts } from '../kit';
import { rng } from '../../rng';

const HX = 73.5;
const HZ = 63.5; // 150×130 since the south strip

const hedges: Parts['decor'] = [
  { kind: 'hedge', x: 0, z: -HZ, w: HX * 2 + 1, d: 1 },
  { kind: 'hedge', x: 0, z: HZ, w: HX * 2 + 1, d: 1 },
  { kind: 'hedge', x: -HX, z: 0, w: 1, d: HZ * 2 - 1 },
  { kind: 'hedge', x: HX, z: 0, w: 1, d: HZ * 2 - 1 },
];

/** Trees just outside the hedge so the world fades into forest rather than ending. */
function treeLine(): Partial<Parts>[] {
  const r = rng(907);
  const out: Partial<Parts>[] = [];
  const add = (x: number, z: number) => {
    const t = tree(x + (r() - 0.5) * 1.5, z + (r() - 0.5) * 1.5, 0.9 + r() * 0.5, r() < 0.5 ? 'pine' : 'tree');
    out.push({ decor: t.decor }); // outside the play area: no colliders needed
  };
  for (let x = -77; x <= 77; x += 3.2) for (const z of [-HZ - 2.5, -HZ - 5.5, HZ + 2.5, HZ + 5.5]) add(x, z);
  for (let z = -HZ - 0.5; z <= HZ + 0.5; z += 3.2) for (const x of [-76, -79, 76, 79]) add(x, z);
  return out;
}

export const edges: Parts = merge(...treeLine(), {
  decor: hedges,
  colliders: [
    { x: 0, z: -HZ, w: HX * 2, d: 1 },
    { x: 0, z: HZ, w: HX * 2, d: 1 },
    { x: -HX, z: 0, w: 1, d: HZ * 2 },
    { x: HX, z: 0, w: 1, d: HZ * 2 },
  ],
});
