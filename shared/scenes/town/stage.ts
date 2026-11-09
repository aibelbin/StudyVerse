import type { Box } from '../../geometry';
import { merge, type Parts } from '../kit';
import type { ToyKind } from '../../toys';
import type { Decor, Slot } from '../types';

// The open-air stage, in final town coordinates (inside STAGE_BOX). The stage is north of its
// seats so performers face south, towards the audience and the camera.
const CX = -30;
const CZ = 46;
export const STAGE: { stage: Box; audience: Box; screen: { x: number; z: number } } = {
  stage: { x: CX, z: CZ, w: 8, d: 5 },
  audience: { x: CX, z: 54, w: 18, d: 9 },
  screen: { x: CX, z: 43.2 },
};

/** Three curved rows of seats (5, 6 and 7) looking at the middle of the stage. */
function seats(): Partial<Parts> {
  const slots: Slot[] = [];
  const decor: Decor[] = [];
  [[6, 5], [8, 6], [10, 7]].forEach(([r, n], row) => {
    for (let i = 0; i < n; i++) {
      const a = -0.7 + (1.4 * i) / (n - 1);
      const x = CX + Math.sin(a) * r;
      const z = CZ + Math.cos(a) * r;
      const facing = a + Math.PI;
      slots.push({ id: `stage-seat-${row}-${i}`, x, z, facing, pose: 'sit' });
      decor.push({ kind: 'amphiSeat', x, z, rot: facing });
    }
  });
  return { slots, decor };
}

/** An instrument with its stool behind it; the player faces the audience. */
function instrument(kind: ToyKind, x: number): Partial<Parts> {
  const id = `stage-${kind}`;
  const z = CZ - 0.6;
  return {
    toys: [{ id, kind, x, z: z + 0.75, rot: 0, radius: 1.6, slotIds: [`${id}-stool`] }],
    slots: [{ id: `${id}-stool`, x, z, facing: 0, pose: 'sit', toyId: id }],
    decor: [{ kind: 'stool', x, z }],
    colliders: [{ x, z: z + 0.8, w: 1.1, d: 0.5 }],
  };
}

export const stage: Parts = merge(
  {
    decor: [
      { kind: 'stage', x: CX, z: CZ, w: STAGE.stage.w, d: STAGE.stage.d },
      { kind: 'spotlight', x: CX - 5, z: CZ + 3, rot: Math.atan2(5, -3) },
      { kind: 'spotlight', x: CX + 5, z: CZ + 3, rot: Math.atan2(-5, -3) },
    ],
    colliders: [
      { x: STAGE.screen.x, z: STAGE.screen.z, w: 5, d: 0.3 },
      { x: CX - 5, z: CZ + 3, w: 0.35, d: 0.35 },
      { x: CX + 5, z: CZ + 3, w: 0.35, d: 0.35 },
    ],
    toys: [{ id: 'stage-screen', kind: 'stageScreen', x: STAGE.screen.x, z: STAGE.screen.z + 0.4, rot: 0, radius: 2.6 }],
  },
  instrument('drums', CX - 2.6),
  instrument('guitar', CX),
  instrument('keys', CX + 2.6),
  seats(),
);
