import type { Box } from '../geometry';
import type { ToyKind } from '../toys';
import type { Parts } from './kit';
import type { Slot } from './types';

const sq = (x: number, z: number, s: number): Box => ({ x, z, w: s, d: s });

/** A toy you press E on, with an optional collider for its body. */
export function simpleToy(id: string, kind: ToyKind, x: number, z: number, radius: number, collider?: Box, rot = 0): Partial<Parts> {
  return { toys: [{ id, kind, x, z, rot, radius }], colliders: collider ? [collider] : [] };
}

/** One swing hanging from a frame (the frame is decor); you sit facing +z. */
export function swing(id: string, x: number, z: number): Partial<Parts> {
  return {
    toys: [{ id, kind: 'swing', x, z, radius: 1.2, slotIds: [id] }],
    slots: [{ id, x, z: z + 0.3, facing: 0, pose: 'swing', toyId: id }],
  };
}

/** Seesaw running along x; riders face the pivot. */
export function seesaw(id: string, x: number, z: number): Partial<Parts> {
  return {
    toys: [{ id, kind: 'seesaw', x, z, radius: 2.2, slotIds: [`${id}-w`, `${id}-e`] }],
    slots: [
      { id: `${id}-w`, x: x - 1.8, z, facing: Math.PI / 2, pose: 'ride', toyId: id },
      { id: `${id}-e`, x: x + 1.8, z, facing: -Math.PI / 2, pose: 'ride', toyId: id },
    ],
    colliders: [sq(x, z, 0.4)],
  };
}

/** Four riders at radius 1.1 facing outward; E next to it gives it a push. */
export function merryGoRound(id: string, x: number, z: number): Partial<Parts> {
  const slots: Slot[] = [0, 1, 2, 3].map((k) => {
    const a = (k * Math.PI) / 2;
    return { id: `${id}-${k}`, x: x + Math.sin(a) * 1.1, z: z + Math.cos(a) * 1.1, facing: a, pose: 'ride', toyId: id };
  });
  return {
    toys: [{ id, kind: 'merryGoRound', x, z, rot: 0, radius: 2.2, slotIds: slots.map((s) => s.id) }],
    slots,
    colliders: [sq(x, z, 0.3)],
  };
}

/** Ladder at (x, z); the chute runs +z and you land 4.2 further on. */
export function slide(id: string, x: number, z: number): Partial<Parts> {
  return { toys: [{ id, kind: 'slide', x, z, rot: 0, radius: 1.3 }], colliders: [{ x, z: z + 1.4, w: 0.8, d: 2.6 }] };
}

export const SLIDE_RUN = 4.2;

/** Upright piano facing +z with its bench slot in front. */
export function piano(id: string, x: number, z: number): Partial<Parts> {
  return {
    toys: [{ id, kind: 'piano', x, z, rot: 0, radius: 1.6, slotIds: [`${id}-bench`] }],
    slots: [{ id: `${id}-bench`, x, z: z + 0.8, facing: Math.PI, pose: 'sit', toyId: id }],
    colliders: [{ x, z: z - 0.1, w: 1.4, d: 0.6 }],
  };
}

/** Rowboat moored at (x, z) pointing along heading rot; rower in front, a passenger behind. */
export function rowboat(id: string, x: number, z: number, rot: number): Partial<Parts> {
  const at = (k: number) => ({ x: x + Math.sin(rot) * k, z: z + Math.cos(rot) * k });
  return {
    toys: [{ id, kind: 'rowboat', x, z, rot, radius: 1.5, slotIds: [`${id}-row`, `${id}-back`] }],
    slots: [
      { id: `${id}-row`, ...at(0.3), facing: rot, pose: 'row', toyId: id },
      { id: `${id}-back`, ...at(-0.55), facing: rot, pose: 'sit', toyId: id },
    ],
  };
}

/** Campfire ringed by four logs whose sitters face the fire. */
export function campfire(id: string, x: number, z: number): Partial<Parts> {
  const r = 2.3;
  const sides: [string, number][] = [['n', Math.PI], ['e', Math.PI / 2], ['s', 0], ['w', -Math.PI / 2]];
  const slots: Slot[] = [];
  const decor: Parts['decor'] = [];
  for (const [k, a] of sides) {
    const sx = x + Math.sin(a) * r;
    const sz = z + Math.cos(a) * r;
    slots.push({ id: `${id}-log-${k}`, x: sx, z: sz, facing: a + Math.PI, pose: 'sit', toyId: id });
    decor.push({ kind: 'log', x: sx, z: sz, rot: a + Math.PI / 2, seed: sx * 7 + sz });
  }
  return {
    toys: [{ id, kind: 'campfire', x, z, radius: 2.4, slotIds: slots.map((s) => s.id) }],
    slots,
    decor,
    colliders: [sq(x, z, 1)],
  };
}
