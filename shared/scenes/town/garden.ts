import type { Parts } from '../kit';
import type { Decor, Toy } from '../types';
import { GARDEN_BOX } from './scatter';

/** Garden plot beds: 5 columns × 4 rows inside GARDEN_BOX, 2.0 × 1.8 m with 0.8 m paths between. */
export const BED = { w: 2, d: 1.8 };
const GAP = 0.8;
const COLS = 5;
const ROWS = 4;

export const PLOT_CENTRES: { x: number; z: number }[] = [];
for (let j = 0; j < ROWS; j++) {
  for (let i = 0; i < COLS; i++) {
    const x = GARDEN_BOX.x - ((COLS - 1) / 2) * (BED.w + GAP) + i * (BED.w + GAP);
    const z = GARDEN_BOX.z - ((ROWS - 1) / 2) * (BED.d + GAP) + j * (BED.d + GAP);
    PLOT_CENTRES.push({ x, z });
  }
}

/** Where each of a plot's four spots is, relative to the bed centre. */
export const SPOT_OFFSETS: { dx: number; dz: number }[] = [
  { dx: -0.5, dz: -0.42 }, { dx: 0.5, dz: -0.42 }, { dx: -0.5, dz: 0.38 }, { dx: 0.5, dz: 0.38 },
];

const toys: Toy[] = PLOT_CENTRES.map((c, i) => ({ id: `garden-plot-${i}`, kind: 'plot', x: c.x, z: c.z, radius: 1.5 }));
const decor: Decor[] = PLOT_CENTRES.map((c, i) => ({ kind: 'soil', x: c.x, z: c.z, w: BED.w, d: BED.d, seed: 300 + i }));

export const garden: Parts = { decor, toys, colliders: [], slots: [], life: [{ kind: 'butterflies', x: GARDEN_BOX.x, z: GARDEN_BOX.z, r: 7, count: 8, seed: 77 }] };
