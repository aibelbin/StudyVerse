import type { Box } from './geometry';

/** Felt height: the course floors are this far above the grass. */
export const FELT = 0.05;
export const BALL_R = 0.12;
export const CUP_R = 0.2;

/** The mini-golf course, final town coordinates (east half of the south strip). */
export const GOLF_BOX: Box = { x: 39, z: 48.5, w: 64, d: 25 };

export type Piece =
  /** Felt floor; top at y (default FELT) on its −x edge, changing by rise across to its +x edge (a ramp). */
  | { kind: 'floor'; x: number; z: number; w: number; d: number; y?: number; rise?: number }
  /** A rail or block from y0 (default the ground) up to h. */
  | { kind: 'wall'; x: number; z: number; w: number; d: number; h: number; y0?: number }
  /** A sunken pond (no floor above it). */
  | { kind: 'water'; x: number; z: number; w: number; d: number }
  /** Tower and turning blades; the blades turn in the plane x = bladeX, around a hub at hubY. */
  | { kind: 'windmill'; x: number; z: number; bladeX: number; hubY: number; bladeLen: number }
  /** A vertical loop for balls travelling along −x: bottom at (x, z0), radius r, drifting sideways by offset. */
  | { kind: 'loop'; x: number; z: number; r: number; offset: number; width: number }
  /** A frustum mound with the cup on its flat top. */
  | { kind: 'volcano'; x: number; z: number; r0: number; r1: number; h: number };

export interface Hole {
  n: number;
  name: string;
  par: number;
  tee: { x: number; z: number };
  cup: { x: number; y: number; z: number };
  /** Leaving this (or falling below the felt) is a penalty. */
  bounds: Box;
  pieces: Piece[];
  /** Things walkers can't walk through. */
  blocks: Box[];
}

const RAIL_T = 0.2;
const RAIL_H = FELT + 0.25;

/** Rails around the rectangle x0..x1, z0..z1. */
function rails(x0: number, x1: number, z0: number, z1: number, h = RAIL_H): Piece[] {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0 + RAIL_T * 2;
  const d = z1 - z0 + RAIL_T * 2;
  return [
    { kind: 'wall', x: cx, z: z0 - RAIL_T / 2, w, d: RAIL_T, h },
    { kind: 'wall', x: cx, z: z1 + RAIL_T / 2, w, d: RAIL_T, h },
    { kind: 'wall', x: x0 - RAIL_T / 2, z: cz, w: RAIL_T, d, h },
    { kind: 'wall', x: x1 + RAIL_T / 2, z: cz, w: RAIL_T, d, h },
  ];
}

const floor = (x0: number, x1: number, z0: number, z1: number, y = FELT, rise = 0): Piece =>
  ({ kind: 'floor', x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, y, rise });
const bounds = (x0: number, x1: number, z0: number, z1: number): Box =>
  ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0 + 0.6, d: z1 - z0 + 0.6 });

const A = { z0: 39, z1: 43 }; // north row lanes
const B = { z0: 53, z1: 57 }; // south row lanes

export const HOLES: Hole[] = [
  {
    n: 1, name: 'Warm-up', par: 2,
    tee: { x: 11, z: 41 }, cup: { x: 24.5, y: FELT, z: 41 },
    bounds: bounds(10, 26, A.z0, A.z1),
    pieces: [floor(10, 26, A.z0, A.z1), ...rails(10, 26, A.z0, A.z1)],
    blocks: [],
  },
  {
    n: 2, name: 'Windmill', par: 3,
    tee: { x: 31, z: 41 }, cup: { x: 44.5, y: FELT, z: 41 },
    bounds: bounds(30, 46, A.z0, A.z1),
    pieces: [
      floor(30, 46, A.z0, A.z1), ...rails(30, 46, A.z0, A.z1),
      // the tower blocks the lane except a 1.2 m opening in the middle
      { kind: 'wall', x: 38, z: 39.7, w: 1.2, d: 1.4, h: 1.6 },
      { kind: 'wall', x: 38, z: 42.3, w: 1.2, d: 1.4, h: 1.6 },
      { kind: 'wall', x: 38, z: 41, w: 1.2, d: 1.2, h: 1.6, y0: 0.5 }, // over the opening
      { kind: 'windmill', x: 38, z: 41, bladeX: 37.25, hubY: 1.05, bladeLen: 0.95 },
    ],
    blocks: [{ x: 38, z: 41, w: 1.2, d: 4 }],
  },
  {
    n: 3, name: 'Ramp jump', par: 3,
    tee: { x: 51, z: 41 }, cup: { x: 64.8, y: FELT, z: 41 },
    bounds: bounds(50, 66, A.z0, A.z1),
    pieces: [
      floor(50, 55, A.z0, A.z1),
      floor(55, 57, A.z0, A.z1, FELT, 0.5),
      { kind: 'water', x: 57.5, z: 41, w: 1, d: 4 },
      floor(58, 60.5, A.z0, A.z1, FELT + 0.5),
      floor(60.5, 62.5, A.z0, A.z1, FELT + 0.5, -0.5),
      floor(62.5, 66, A.z0, A.z1),
      ...rails(50, 66, A.z0, A.z1, FELT + 0.8),
    ],
    blocks: [],
  },
  {
    n: 4, name: 'Zigzag', par: 3,
    tee: { x: 64.8, z: 52.6 }, cup: { x: 53.6, y: FELT, z: 57.2 },
    bounds: bounds(52, 66, 51, 59),
    pieces: [
      floor(52, 66, 51, 59), ...rails(52, 66, 51, 59),
      { kind: 'wall', x: 61.5, z: 53.5, w: 0.2, d: 5, h: RAIL_H }, // from the north rail, gap in the south
      { kind: 'wall', x: 56.5, z: 56.5, w: 0.2, d: 5, h: RAIL_H }, // from the south rail, gap in the north
    ],
    blocks: [],
  },
  {
    n: 5, name: 'Loop', par: 3,
    tee: { x: 45, z: 54.6 }, cup: { x: 33.5, y: FELT, z: 55.5 },
    bounds: bounds(32, 46, B.z0, B.z1),
    pieces: [
      floor(32, 46, B.z0, B.z1), ...rails(32, 46, B.z0, B.z1),
      { kind: 'loop', x: 40, z: 54.6, r: 0.55, offset: 0.9, width: 0.6 },
    ],
    blocks: [{ x: 40, z: 55, w: 1.5, d: 1.4 }],
  },
  {
    n: 6, name: 'Volcano', par: 4,
    tee: { x: 25, z: 55 }, cup: { x: 15.5, y: FELT + 0.55, z: 55 },
    bounds: bounds(12, 26, 52.5, 57.5),
    pieces: [
      floor(12, 26, 52.5, 57.5), ...rails(12, 26, 52.5, 57.5),
      { kind: 'volcano', x: 15.5, z: 55, r0: 2.2, r1: 0.7, h: 0.55 },
    ],
    blocks: [],
  },
];

export const COURSE_PAR = HOLES.reduce((s, h) => s + h.par, 0);

/** The windmill's blade angle at server time now (ms); the same everywhere. */
export function windmillAngle(now: number): number {
  return ((now / 1000) * 1.2) % (Math.PI * 2);
}

/** "Hole-in-one!", "Birdie", "Par", "Bogey", "+2", or "Picked up". */
export function scoreName(strokes: number, par: number, pickedUp = false): string {
  if (pickedUp) return 'Picked up';
  if (strokes === 1) return 'Hole-in-one!';
  const d = strokes - par;
  if (d <= -2) return 'Eagle!';
  if (d === -1) return 'Birdie!';
  if (d === 0) return 'Par';
  if (d === 1) return 'Bogey';
  return `+${d}`;
}

/** Floor top height at (x, z) for a sloped or flat floor piece. */
export function floorTop(p: Extract<Piece, { kind: 'floor' }>, x: number): number {
  const base = p.y ?? FELT;
  if (!p.rise) return base;
  const u = Math.max(0, Math.min(1, (x - (p.x - p.w / 2)) / p.w));
  return base + p.rise * u;
}
