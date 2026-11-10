import { merge, tree, type Parts } from '../kit';
import { rng } from '../../rng';

/** Hedges 1.5 m inside the edge of a w × d outdoor scene, with a tree line just outside them. */
export function edges(w: number, d: number, seed = 907): Parts {
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
  return merge(...trees, {
    decor: [
      { kind: 'hedge', x: 0, z: -HZ, w: HX * 2 + 1, d: 1 },
      { kind: 'hedge', x: 0, z: HZ, w: HX * 2 + 1, d: 1 },
      { kind: 'hedge', x: -HX, z: 0, w: 1, d: HZ * 2 - 1 },
      { kind: 'hedge', x: HX, z: 0, w: 1, d: HZ * 2 - 1 },
    ],
    colliders: [
      { x: 0, z: -HZ, w: HX * 2, d: 1 },
      { x: 0, z: HZ, w: HX * 2, d: 1 },
      { x: -HX, z: 0, w: 1, d: HZ * 2 },
      { x: HX, z: 0, w: 1, d: HZ * 2 },
    ],
  });
}
