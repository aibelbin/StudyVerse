import { bench, merge, shift, tree, type Parts } from '../kit';
import { simpleToy } from '../kitToys';
import type { Decor } from '../types';
import { inAny, near, OFFSETS, ZONE_PATHS, scatter } from './scatter';

const AREA = { x: -32, z: 24.5, w: 52, d: 37 }; // x -58..-6, z 6..43
const TELESCOPE = { x: -40, z: 32 };
const CHIMES_TREE = { x: -22, z: 20 };

const benches = [
  bench('park-b1', -20, 12, 0),
  bench('park-b2', -20, 26, Math.PI),
  bench('park-b3', -44, 14, 0),
  bench('park-b4', -48, 38, Math.PI),
  bench('park-b5', -12, 36, Math.PI),
  bench('park-b6', -34, 40, Math.PI),
];
const benchSpots = [[-20, 12], [-20, 26], [-44, 14], [-48, 38], [-12, 36], [-34, 40]];

const open = (x: number, z: number) =>
  !inAny(ZONE_PATHS, x, z, 1.5) && !near(x, z, TELESCOPE.x, TELESCOPE.z, 4) && !near(x, z, CHIMES_TREE.x, CHIMES_TREE.z, 2.5)
  && !benchSpots.some(([bx, bz]) => near(x, z, bx, bz, 2.5));

const trees = scatter(401, 26, AREA, open).map(([x, z], i) => tree(x, z, 0.9 + ((i * 7) % 5) / 10));
const beds: Decor[] = scatter(402, 10, AREA, open).map(([x, z], i) => ({ kind: 'flowers', x, z, seed: 600 + i }));
const bushes: Decor[] = scatter(403, 12, AREA, open).map(([x, z], i) => ({ kind: 'bush', x, z, seed: 700 + i }));

export const flowerBeds = beds;

export const park: Parts = shift(merge(
  ...benches,
  tree(CHIMES_TREE.x, CHIMES_TREE.z, 1.2),
  simpleToy('chimes', 'chimes', CHIMES_TREE.x, CHIMES_TREE.z, 1.6),
  simpleToy('telescope', 'telescope', TELESCOPE.x, TELESCOPE.z, 1.4, { x: TELESCOPE.x, z: TELESCOPE.z - 0.3, w: 0.4, d: 0.4 }),
  ...trees,
  {
    decor: [{ kind: 'mound', x: TELESCOPE.x, z: TELESCOPE.z, w: 3.4 }, ...beds, ...bushes],
    life: [
      { kind: 'butterflies', x: -30, z: 25, r: 18, count: 14, seed: 41 },
      { kind: 'bees', x: -30, z: 25, r: 16, count: 10, seed: 42 },
      { kind: 'birds', x: -26, z: 18, r: 8, count: 8, seed: 43 },
      { kind: 'ladybugs', x: -20, z: 14, r: 6, count: 6, seed: 44 },
      { kind: 'fireflies', x: -36, z: 30, r: 12, count: 20, seed: 45 },
    ],
  },
), ...OFFSETS.park);
