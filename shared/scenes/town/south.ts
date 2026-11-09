import type { Box } from '../../geometry';
import { merge, type Parts } from '../kit';
import type { Decor } from '../types';
import { meadows } from './meadows';
import { GARDEN_BOX, PATHS } from './scatter';

/** Ground the stage and its seats need (final town coordinates). */
export const STAGE_BOX: Box = { x: -30, z: 50, w: 22, d: 18 };

/** Open ground in the south strip, filled lightly like the other meadows. The east part waits for mini-golf. */
const STRIP_GAPS: Box[] = [
  { x: -58, z: 50, w: 28, d: 24 },
  { x: -10, z: 50, w: 16, d: 24 },
  { x: 20, z: 49, w: 36, d: 26 },
  { x: 55, z: 49, w: 34, d: 26 },
];

/** A low ring of bushes marking the garden-plot ground, open on the side facing the park path. */
function gardenRing(): Decor[] {
  const g = GARDEN_BOX;
  const out: Decor[] = [];
  const x0 = g.x - g.w / 2;
  const x1 = g.x + g.w / 2;
  const z0 = g.z - g.d / 2;
  const z1 = g.z + g.d / 2;
  let seed = 4100;
  for (let x = x0; x <= x1 + 0.01; x += 2.6) for (const z of [z0, z1]) out.push({ kind: 'bush', x, z, seed: seed++ });
  for (let z = z0 + 2.6; z < z1 - 1; z += 2.6) {
    out.push({ kind: 'bush', x: x0, z, seed: seed++ });
    if (Math.abs(z - g.z) > 2.5) out.push({ kind: 'bush', x: x1, z, seed: seed++ }); // the gap is the way in
  }
  return out;
}

/** Everything added for the south strip and the park reserve, in final town coordinates. */
export function south(placed: Parts, lake: [number, number][]): Parts {
  const own = merge({ decor: gardenRing() });
  const taken = merge(placed, own, { colliders: [STAGE_BOX] }); // keeps the meadow off the stage ground
  return merge(own, meadows(taken, lake, STRIP_GAPS, PATHS, 1500));
}
