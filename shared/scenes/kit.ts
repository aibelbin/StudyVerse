import type { Box } from '../geometry';
import type { Decor, Seat } from './types';

/** A reusable chunk of a scene: what it looks like, what blocks movement, where you can sit. */
export interface Parts {
  decor: Decor[];
  colliders: Box[];
  seats: Seat[];
}

export function merge(...ps: Partial<Parts>[]): Parts {
  const out: Parts = { decor: [], colliders: [], seats: [] };
  for (const p of ps) {
    out.decor.push(...(p.decor ?? []));
    out.colliders.push(...(p.colliders ?? []));
    out.seats.push(...(p.seats ?? []));
  }
  return out;
}

/** 1.4 x 0.8 desk with a lamp. 'north' seats sit behind the desk facing the camera (+z); 'south' seats face away. */
export function studyDesk(id: string, x: number, z: number, sides: ('north' | 'south')[] = ['north', 'south']): Parts {
  const p: Parts = {
    decor: [
      { kind: 'desk', x, z, w: 1.4, d: 0.8, seed: x * 7 + z },
      { kind: 'deskLamp', x: x + 0.5, z: z - 0.15, seed: x * 3 - z },
    ],
    colliders: [{ x, z, w: 1.4, d: 0.8 }],
    seats: [],
  };
  for (const side of sides) {
    const sz = side === 'north' ? z - 0.75 : z + 0.75;
    const facing = side === 'north' ? 0 : Math.PI;
    p.decor.push({ kind: 'chair', x, z: sz, rot: facing, seed: x * 11 + sz });
    p.seats.push({ id: `${id}-${side[0]}`, x, z: sz, facing, deskId: id });
  }
  return p;
}

/** Round café table with a stool on the west and east side, both facing the table. */
export function cafeTable(id: string, x: number, z: number): Parts {
  return {
    decor: [
      { kind: 'cafeTable', x, z },
      { kind: 'stool', x: x - 0.75, z, seed: x * 5 + z },
      { kind: 'stool', x: x + 0.75, z, seed: x * 5 - z },
      { kind: 'cup', x: x - 0.12, z: z + 0.08, y: 0.77 },
    ],
    colliders: [{ x, z, w: 0.8, d: 0.8 }],
    seats: [
      { id: `${id}-w`, x: x - 0.75, z, facing: Math.PI / 2, deskId: id },
      { id: `${id}-e`, x: x + 0.75, z, facing: -Math.PI / 2, deskId: id },
    ],
  };
}

/** Park bench running along x, two seats. facing 0 = sitters face +z (towards the camera). */
export function bench(id: string, x: number, z: number, facing: number): Parts {
  return {
    decor: [{ kind: 'bench', x, z, rot: facing }],
    colliders: [],
    seats: [
      { id: `${id}-a`, x: x - 0.45, z, facing, deskId: id },
      { id: `${id}-b`, x: x + 0.45, z, facing, deskId: id },
    ],
  };
}

export function tree(x: number, z: number, scale = 1, kind: 'tree' | 'pine' = 'tree'): Parts {
  return {
    decor: [{ kind, x, z, h: scale, seed: x * 13 + z * 7 }],
    colliders: [{ x, z, w: 0.6 * scale, d: 0.6 * scale }],
    seats: [],
  };
}

export function lampPost(x: number, z: number): Parts {
  return { decor: [{ kind: 'lampPost', x, z }], colliders: [{ x, z, w: 0.3, d: 0.3 }], seats: [] };
}

export function plant(x: number, z: number): Parts {
  return { decor: [{ kind: 'plant', x, z, seed: x * 17 + z }], colliders: [{ x, z, w: 0.5, d: 0.5 }], seats: [] };
}

/** Bookshelf of width w. rot 0 faces +z (against a north wall); ±PI/2 for side walls. */
export function bookshelf(x: number, z: number, w = 2.2, rot = 0): Parts {
  const sideways = Math.abs(Math.sin(rot)) > 0.5;
  return {
    decor: [{ kind: 'bookshelf', x, z, w, rot, seed: x * 19 + z * 3 }],
    colliders: [sideways ? { x, z, w: 0.45, d: w } : { x, z, w, d: 0.45 }],
    seats: [],
  };
}

/** Outdoor building with its door in the middle of the south (+z) face. */
export function building(x: number, z: number, w: number, d: number, h: number, color: string, accent: string, label: string): Parts {
  return {
    decor: [{ kind: 'building', x, z, w, d, h, color, accent, label }],
    colliders: [{ x, z, w, d }],
    seats: [],
  };
}
