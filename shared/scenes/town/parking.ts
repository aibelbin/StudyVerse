import { lampPost, merge, type Parts } from '../kit';
import { truck } from '../kitToys';
import type { Bay, Prop } from '../types';

export const BAY_W = 3.2;
export const BAY_D = 5.5;
export const LOT_W = BAY_W * 6;
export const LOT_D = 14; // reaches 0.3 m onto the street so there is no grass seam
const BAY_Z_OFF = -3.5; // bay centres sit 3.5 m north of the lot centre

/**
 * A six-bay car park centred on (cx, cz): bays along the north side, nose out towards the
 * street on the south edge, a lamp at each north corner, and a few cones and crates to knock about.
 * trucks lists which bays start with a truck in them.
 */
export function lot(prefix: string, cx: number, cz: number, trucks: [string, number][]): Parts {
  const bays: Bay[] = Array.from({ length: 6 }, (_, i) => ({ id: `${prefix}-${i}`, x: cx + (i - 2.5) * BAY_W, z: cz + BAY_Z_OFF, rot: 0 }));
  const props: Prop[] = [
    { id: `${prefix}-cone-0`, kind: 'cone', x: cx - LOT_W / 2 + 1, z: cz + LOT_D / 2 - 1, rot: 0 },
    { id: `${prefix}-cone-1`, kind: 'cone', x: cx + LOT_W / 2 - 1, z: cz + LOT_D / 2 - 1, rot: 0 },
    { id: `${prefix}-cone-2`, kind: 'cone', x: cx - 2, z: cz + 1.6, rot: 0 },
    { id: `${prefix}-cone-3`, kind: 'cone', x: cx + 2, z: cz + 1.6, rot: 0 },
    { id: `${prefix}-crate-0`, kind: 'crate', x: cx - LOT_W / 2 + 1, z: cz + 0.4, rot: 0.3 },
    { id: `${prefix}-crate-1`, kind: 'crate', x: cx + LOT_W / 2 - 1, z: cz + 0.4, rot: -0.2 },
  ];
  return merge(
    lampPost(cx - LOT_W / 2 + 0.4, cz - LOT_D / 2 + 0.4),
    lampPost(cx + LOT_W / 2 - 0.4, cz - LOT_D / 2 + 0.4),
    ...trucks.map(([id, i]) => truck(id, bays[i].x, bays[i].z, 0)),
    { decor: [{ kind: 'parking', x: cx, z: cz, w: LOT_W, d: LOT_D, seed: bays.length }], parking: bays, props },
  );
}

export const WEST_LOT = { x: -31, z: -7 };
export const EAST_LOT = { x: 28.5, z: -7 };

export const parking: Parts = merge(
  lot('lot-w', WEST_LOT.x, WEST_LOT.z, [['truck-1', 1], ['truck-2', 4]]),
  lot('lot-e', EAST_LOT.x, EAST_LOT.z, [['truck-3', 1], ['truck-4', 4]]),
);
