import { merge, tree, type Parts } from '../kit';
import { merryGoRound, seesaw, slide, swing } from '../kitToys';

export const playground: Parts = merge(
  swing('swing-1', 19, 22),
  swing('swing-2', 21, 22),
  seesaw('seesaw', 30, 22),
  merryGoRound('mgr', 40, 22),
  slide('slide', 30, 30.4),
  tree(14, 16, 1.1), tree(46, 16, 1), tree(48, 30, 1.2), tree(14, 34, 0.9), tree(44, 38, 1.1), tree(18, 40, 1),
  {
    decor: [
      { kind: 'swingSet', x: 20, z: 22, w: 4.8 },
      { kind: 'flowers', x: 24, z: 18, seed: 51 }, { kind: 'flowers', x: 36, z: 18, seed: 52 },
      { kind: 'flowers', x: 26, z: 34, seed: 53 }, { kind: 'flowers', x: 36, z: 33, seed: 54 },
      { kind: 'bush', x: 16, z: 26, seed: 55 }, { kind: 'bush', x: 44, z: 26, seed: 56 },
    ],
    colliders: [{ x: 17.6, z: 22, w: 0.3, d: 0.3 }, { x: 22.4, z: 22, w: 0.3, d: 0.3 }],
    life: [
      { kind: 'butterflies', x: 30, z: 26, r: 14, count: 8, seed: 61 },
      { kind: 'birds', x: 34, z: 36, r: 6, count: 6, seed: 62 },
    ],
  },
);
