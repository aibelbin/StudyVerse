import type { Bounds, Box } from '../geometry';
import type { ToyKind } from '../toys';

export type Pose = 'sit' | 'swing' | 'ride' | 'row' | 'drive';

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
  | 'cafeTable' | 'stool' | 'counter' | 'coffeeMachine' | 'cup'
  | 'lake' | 'dock' | 'lilyPad' | 'rock' | 'grass' | 'hedge' | 'bandstand' | 'swingSet' | 'log' | 'leafPile' | 'mound' | 'knowledgeTree' | 'parking'
  | 'cherry' | 'bridge' | 'gravel' | 'blanket' | 'lantern' | 'cushion' | 'stage' | 'amphiSeat' | 'spotlight';

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
  /** Outline points for shapes such as the lake. */
  points?: [number, number][];
}

/** Something you can press E on (or sit in). Slot-carrying toys list their slots. */
export interface Toy {
  id: string;
  kind: ToyKind;
  x: number;
  z: number;
  /** Rest heading (radians, 0 = +z). */
  rot?: number;
  /** How close you must be to use it. */
  radius: number;
  slotIds?: string[];
}

export type LifeKind =
  | 'butterflies' | 'bees' | 'birds' | 'dragonflies' | 'fireflies' | 'ladybugs' | 'snails'
  | 'leaves' | 'frogs' | 'fish' | 'ducks' | 'petals';

/** Where ambient critters live. Purely visual; the client spawns them. */
export interface LifeZone {
  kind: LifeKind;
  x: number;
  z: number;
  r: number;
  count: number;
  seed: number;
}

/** A parking space; a truck parked here faces rot (or rot + π). */
export interface Bay {
  id: string;
  x: number;
  z: number;
  rot: number;
}

/** A light thing a truck can knock flying (client-only physics, never synced). */
export interface Prop {
  id: string;
  kind: 'cone' | 'crate';
  x: number;
  z: number;
  rot: number;
}

export interface SailPath {
  points: [number, number][];
  /** Seconds per lap. */
  period: number;
  /** Lap fraction offset, 0..1. */
  offset: number;
  color: string;
}

export interface Water {
  outline: [number, number][];
  /** Where you are put when you get out of a boat. */
  landings: { x: number; z: number }[];
  sailPaths: SailPath[];
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
  /** Used in the feed: "started a 25 min session in town". */
  where: string;
  size: Bounds;
  theme: Theme;
  colliders: Box[];
  slots: Slot[];
  toys: Toy[];
  life: LifeZone[];
  water?: Water;
  parking?: Bay[];
  /** The open-air stage: who's on it, who's listening, and where the screen is. */
  stage?: { stage: Box; audience: Box; screen: { x: number; z: number } };
  props?: Prop[];
  doors: Door[];
  spawns: Spawn[];
  decor: Decor[];
}
