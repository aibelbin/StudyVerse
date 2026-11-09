import { GOLF_BOX, HOLES } from '../../golf';
import { merge, tree, type Parts } from '../kit';
import type { Toy } from '../types';

/** One tee toy per hole (E there starts it) and the "Today's best" board by the entrance. */
const tees: Toy[] = HOLES.map((h) => ({ id: `golf-tee-${h.n}`, kind: 'golfTee', x: h.tee.x, z: h.tee.z, radius: 2.4 }));
export const GOLF_BOARD = { x: 9.5, z: 37.4 };

/** A loose ring of trees around the course. */
function ring(): Partial<Parts>[] {
  const out: Partial<Parts>[] = [];
  const x0 = GOLF_BOX.x - GOLF_BOX.w / 2;
  const x1 = GOLF_BOX.x + GOLF_BOX.w / 2;
  for (let x = x0 + 4; x < x1; x += 7) out.push(tree(x, 62, 1 + ((x * 7) % 3) / 10));
  for (const z of [50, 56]) out.push(tree(x1 + 1, z, 1.1));
  return out;
}

export const golf: Parts = merge(
  {
    toys: [...tees, { id: 'golf-board', kind: 'golfBoard', x: GOLF_BOARD.x, z: GOLF_BOARD.z + 0.5, radius: 2.2 }],
    colliders: [{ x: GOLF_BOARD.x, z: GOLF_BOARD.z, w: 2.6, d: 0.3 }, ...HOLES.flatMap((h) => h.blocks)],
  },
  ...ring(),
);
