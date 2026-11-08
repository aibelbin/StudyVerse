import type { Box } from '../geometry';
import type { Decor, LifeZone, Slot, Toy } from './types';

/** A reusable chunk of a scene: what it looks like, what blocks movement, where you can sit. */
export interface Parts {
  decor: Decor[];
  colliders: Box[];
  slots: Slot[];
  toys: Toy[];
  life: LifeZone[];
}

export function merge(...ps: Partial<Parts>[]): Parts {
  const out: Parts = { decor: [], colliders: [], slots: [], toys: [], life: [] };
  for (const p of ps) {
    out.decor.push(...(p.decor ?? []));
    out.colliders.push(...(p.colliders ?? []));
    out.slots.push(...(p.slots ?? []));
    out.toys.push(...(p.toys ?? []));
    out.life.push(...(p.life ?? []));
  }
  return out;
}

/** 1.4 x 0.8 desk with a lamp. 'north' slots sit behind the desk facing the camera (+z); 'south' slots face away. */
export function studyDesk(id: string, x: number, z: number, sides: ('north' | 'south')[] = ['north', 'south']): Parts {
  const p: Parts = {
    toys: [],
    life: [],
    decor: [
      { kind: 'desk', x, z, w: 1.4, d: 0.8, seed: x * 7 + z },
      { kind: 'deskLamp', x: x + 0.5, z: z - 0.15, seed: x * 3 - z },
    ],
    colliders: [{ x, z, w: 1.4, d: 0.8 }],
    slots: [],
  };
  for (const side of sides) {
    const sz = side === 'north' ? z - 0.75 : z + 0.75;
    const facing = side === 'north' ? 0 : Math.PI;
    p.decor.push({ kind: 'chair', x, z: sz, rot: facing, seed: x * 11 + sz });
    p.slots.push({ id: `${id}-${side[0]}`, x, z: sz, facing, pose: 'sit', deskId: id });
  }
  return p;
}

/** Round café table with a stool on the west and east side, both facing the table. */
export function cafeTable(id: string, x: number, z: number): Partial<Parts> {
  return {
    decor: [
      { kind: 'cafeTable', x, z },
      { kind: 'stool', x: x - 0.75, z, seed: x * 5 + z },
      { kind: 'stool', x: x + 0.75, z, seed: x * 5 - z },
      { kind: 'cup', x: x - 0.12, z: z + 0.08, y: 0.77 },
    ],
    colliders: [{ x, z, w: 0.8, d: 0.8 }],
    slots: [
      { id: `${id}-w`, x: x - 0.75, z, facing: Math.PI / 2, pose: 'sit', deskId: id },
      { id: `${id}-e`, x: x + 0.75, z, facing: -Math.PI / 2, pose: 'sit', deskId: id },
    ],
  };
}

/** Park bench running along x, two slots. facing 0 = sitters face +z (towards the camera). */
export function bench(id: string, x: number, z: number, facing: number): Partial<Parts> {
  return {
    decor: [{ kind: 'bench', x, z, rot: facing }],
    colliders: [],
    slots: [
      { id: `${id}-a`, x: x - 0.45, z, facing, pose: 'sit', deskId: id },
      { id: `${id}-b`, x: x + 0.45, z, facing, pose: 'sit', deskId: id },
    ],
  };
}

export function tree(x: number, z: number, scale = 1, kind: 'tree' | 'pine' = 'tree'): Partial<Parts> {
  return {
    decor: [{ kind, x, z, h: scale, seed: x * 13 + z * 7 }],
    colliders: [{ x, z, w: 0.6 * scale, d: 0.6 * scale }],
    slots: [],
  };
}

export function lampPost(x: number, z: number): Partial<Parts> {
  return { decor: [{ kind: 'lampPost', x, z }], colliders: [{ x, z, w: 0.3, d: 0.3 }], slots: [] };
}

export function plant(x: number, z: number): Partial<Parts> {
  return { decor: [{ kind: 'plant', x, z, seed: x * 17 + z }], colliders: [{ x, z, w: 0.5, d: 0.5 }], slots: [] };
}

/** Bookshelf of width w. rot 0 faces +z (against a north wall); ±PI/2 for side walls. */
export function bookshelf(x: number, z: number, w = 2.2, rot = 0): Partial<Parts> {
  const sideways = Math.abs(Math.sin(rot)) > 0.5;
  return {
    decor: [{ kind: 'bookshelf', x, z, w, rot, seed: x * 19 + z * 3 }],
    colliders: [sideways ? { x, z, w: 0.45, d: w } : { x, z, w, d: 0.45 }],
    slots: [],
  };
}

/** Outdoor building with its door in the middle of the south (+z) face. */
export function building(x: number, z: number, w: number, d: number, h: number, color: string, accent: string, label: string): Partial<Parts> {
  return {
    decor: [{ kind: 'building', x, z, w, d, h, color, accent, label }],
    colliders: [{ x, z, w, d }],
    slots: [],
  };
}
