import type { Bounds, Box } from '../geometry';

export type Pose = 'sit' | 'swing' | 'ride' | 'row';

export interface Slot {
  id: string;
  x: number;
  z: number;
  /** Direction the sitter faces (radians, 0 = +z). */
  facing: number;
  pose: Pose;
  /** Desks, café tables and benches: allows Pomodoro. */
  deskId?: string;
  /** Toy seats: swings, seesaw, merry-go-round, piano bench, logs, boats. */
  toyId?: string;
}

export interface Door {
  id: string;
  box: Box;
  toScene: string;
  toSpawn: string;
}

export interface Spawn {
  id: string;
  x: number;
  z: number;
  facing: number;
}

export type DecorKind =
  | 'tree' | 'pine' | 'bush' | 'flowers' | 'lampPost' | 'bench' | 'path' | 'building' | 'pond'
  | 'desk' | 'chair' | 'deskLamp' | 'bookshelf' | 'rug' | 'plant' | 'window' | 'sign'
  | 'cafeTable' | 'stool' | 'counter' | 'coffeeMachine' | 'cup';

/** Visual-only object. Size fields mean different things per kind (see client/src/world/decor.ts). */
export interface Decor {
  kind: DecorKind;
  x: number;
  z: number;
  y?: number;
  rot?: number;
  w?: number;
  d?: number;
  h?: number;
  color?: string;
  accent?: string;
  label?: string;
  seed?: number;
}

export interface Theme {
  indoor: boolean;
  floor: string;
  floorAccent: string;
  /** Solid colour, or [top, bottom] sky gradient. */
  background: string | [string, string];
  fog: { color: string; near: number; far: number } | null;
  hemi: { sky: string; ground: string; intensity: number };
  sun: { color: string; intensity: number; x: number; y: number; z: number };
  wall?: string;
  trim?: string;
}

export interface SceneDef {
  id: string;
  name: string;
  /** Used in the feed: "started a 25 min session in the park". */
  where: string;
  size: Bounds;
  theme: Theme;
  colliders: Box[];
  slots: Slot[];
  doors: Door[];
  spawns: Spawn[];
  decor: Decor[];
}
