import { merge, shift, tree, type Parts } from '../kit';
import { campfire } from '../kitToys';
import type { Decor } from '../types';
import { inAny, near, OFFSETS, ZONE_PATHS, scatter } from './scatter';

export const CAMP = { x: -30, z: -28 };
const AREA = { x: -33, z: -28.5, w: 50, d: 29 }; // x -58..-8, z -43..-14

const clear = (x: number, z: number) => !near(x, z, CAMP.x, CAMP.z, 6) && !inAny(ZONE_PATHS, x, z, 1.2);

const pines = scatter(301, 140, AREA, clear).map(([x, z], i) => tree(x, z, 0.85 + ((i * 37) % 10) / 20, 'pine'));
const leafy = scatter(302, 30, AREA, clear).map(([x, z], i) => tree(x, z, 0.9 + ((i * 13) % 6) / 15));
const piles: Decor[] = scatter(303, 6, { x: CAMP.x, z: CAMP.z, w: 30, d: 20 }, (x, z) => clear(x, z) || near(x, z, CAMP.x, CAMP.z, 6) && !near(x, z, CAMP.x, CAMP.z, 3.5))
  .map(([x, z], i) => ({ kind: 'leafPile', x, z, seed: 500 + i }));

export const woods: Parts = shift(merge(
  campfire('campfire', CAMP.x, CAMP.z),
  ...pines,
  ...leafy,
  {
    decor: piles,
    life: [
      { kind: 'fireflies', x: CAMP.x, z: CAMP.z, r: 14, count: 30, seed: 31 },
      { kind: 'snails', x: CAMP.x + 4, z: CAMP.z + 3, r: 10, count: 4, seed: 32 },
      { kind: 'leaves', x: CAMP.x, z: CAMP.z, r: 18, count: 40, seed: 33 },
      { kind: 'birds', x: -20, z: -18, r: 6, count: 5, seed: 34 },
    ],
  },
), ...OFFSETS.woods);
