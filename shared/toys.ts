import { pointInPolygon } from './geometry';
import type { PlotState } from './garden';
import type { Slot, Toy } from './scenes/types';

export type ToyKind =
  | 'swing' | 'seesaw' | 'merryGoRound' | 'slide' | 'piano' | 'jukebox' | 'ducks'
  | 'fountain' | 'bell' | 'chimes' | 'stones' | 'campfire' | 'telescope' | 'rowboat'
  | 'shop' | 'board' | 'quotes' | 'coffee' | 'truck'
  | 'koi' | 'cushions' | 'cairn' | 'drums' | 'guitar' | 'keys' | 'stageScreen' | 'plot' | 'golfTee' | 'golfBoard' | 'giftShop';

export const TOY_KINDS: ToyKind[] = [
  'swing', 'seesaw', 'merryGoRound', 'slide', 'piano', 'jukebox', 'ducks',
  'fountain', 'bell', 'chimes', 'stones', 'campfire', 'telescope', 'rowboat',
  'shop', 'board', 'quotes', 'coffee', 'truck',
  'koi', 'cushions', 'cairn', 'drums', 'guitar', 'keys', 'stageScreen', 'plot', 'golfTee', 'golfBoard', 'giftShop',
];

/** Toys whose E opens something on your own screen instead of telling the server. */
export const LOCAL_TOYS: ToyKind[] = ['telescope', 'shop', 'board', 'quotes', 'coffee', 'stageScreen', 'giftShop'];

export type ToyAction = 'push' | 'slide' | 'note' | 'next' | 'feed' | 'coin' | 'ring' | 'skip' | 'toggle' | 'honk' | 'stack';

/** Actions you do from one of the toy's seats rather than standing next to it. */
export const SEATED_ACTIONS: ToyAction[] = ['note', 'honk'];

export const TOY_ACTIONS: ToyAction[] = ['push', 'slide', 'note', 'next', 'feed', 'coin', 'ring', 'skip', 'toggle', 'honk', 'stack'];

export interface BoatPose {
  x: number;
  z: number;
  heading: number;
}

export type ToyState =
  | { kind: 'merryGoRound'; angle0: number; speed0: number; t0: number }
  /** track 0 = off, 1..3 = a loop; startedAt keeps everyone on the same bar. */
  | { kind: 'jukebox'; track: number; startedAt: number }
  | { kind: 'campfire'; lit: boolean }
  | { kind: 'rowboat'; x: number; z: number; heading: number; returnFrom: (BoatPose & { at: number }) | null }
  | { kind: 'truck'; x: number; z: number; heading: number; returnFrom: null; tilt?: Tilt }
  /** The meditation ring's shared breathing clock; null while nobody sits there. */
  | { kind: 'meditate'; startedAt: number | null }
  /** The shared cairn: stones now, the shape seed, and the tallest it has been. */
  | { kind: 'cairn'; height: number; seed: number; record: number; recordBy: string | null }
  | { kind: 'stageScreen'; text: string | null; by: string | null; until: number }
  | PlotState
  /** Today's best mini-golf rounds, and who has already had today's KP. */
  | { kind: 'golfBoard'; day: string; top: { name: string; strokes: number }[]; paid: string[] };

/** Chance the stone that makes a cairn h tall topples it: none up to 4, rising to 35% at 15. */
export function toppleChance(h: number): number {
  return h <= 4 ? 0 : Math.min(0.35, (h - 4) * 0.032);
}

export const BOAT_SPEED = 2.4;        // m/s while rowing
/** How a truck's body sits on its springs: height above rest, nose-up pitch, right-down roll. */
export interface Tilt {
  y: number;
  pitch: number;
  roll: number;
}

export const BOAT_RETURN_SPEED = 1.5; // m/s gliding home
export const SPIN_DECAY = 0.4;        // 1/s
export const SPIN_PUSH = 1.2;         // rad/s per push
export const SPIN_MAX = 3;            // rad/s

/** Merry-go-round angle and speed at time now (ms), with exponential slow-down. */
export function spinAt(s: { angle0: number; speed0: number; t0: number }, now: number): { angle: number; speed: number } {
  const dt = Math.max(0, now - s.t0) / 1000;
  const e = Math.exp(-SPIN_DECAY * dt);
  return { angle: s.angle0 + (s.speed0 * (1 - e)) / SPIN_DECAY, speed: s.speed0 * e };
}

const smooth = (u: number) => u * u * (3 - 2 * u);

/** Shortest signed difference b - a, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Where a rowboat is now: its stored pose, or partway along its glide home to the mooring. */
export function boatPoseAt(s: Extract<ToyState, { kind: 'rowboat' | 'truck' }>, mooring: BoatPose, now: number): BoatPose {
  const r = s.returnFrom;
  if (!r) return { x: s.x, z: s.z, heading: s.heading };
  const d = Math.hypot(mooring.x - r.x, mooring.z - r.z);
  const dur = Math.max((d / BOAT_RETURN_SPEED) * 1000, 1500);
  const u = Math.min(1, Math.max(0, (now - r.at) / dur));
  if (u >= 1) return { ...mooring };
  const k = smooth(u);
  return {
    x: r.x + (mooring.x - r.x) * k,
    z: r.z + (mooring.z - r.z) * k,
    heading: r.heading + angleDelta(r.heading, mooring.heading) * k,
  };
}

/** Swing arc (radians) for a swing whose phase offset is `phase`. */
export function swingAngle(now: number, phase: number): number {
  return 0.6 * Math.sin((Math.PI * 2 * now) / 2200 + phase);
}

export function seesawAngle(now: number): number {
  return 0.25 * Math.sin((Math.PI * 2 * now) / 2600);
}

/**
 * World position of a slot given its toy's current pose. The slot's scene coordinates are its spot
 * when the toy is at rest (toy.x, toy.z, toy.rot); the offset turns with the toy.
 */
export function slotWorld(slot: Slot, toy: Toy, pose: BoatPose): { x: number; z: number; facing: number } {
  const d = pose.heading - (toy.rot ?? 0);
  if (d === 0 && pose.x === toy.x && pose.z === toy.z) return { x: slot.x, z: slot.z, facing: slot.facing };
  const ox = slot.x - toy.x;
  const oz = slot.z - toy.z;
  const c = Math.cos(d);
  const s = Math.sin(d);
  return { x: pose.x + ox * c + oz * s, z: pose.z - ox * s + oz * c, facing: slot.facing + d };
}

/** Kinds whose slots move with the toy (so scene tests skip their collider checks). */
export const MOVING_TOYS: ToyKind[] = ['rowboat', 'merryGoRound', 'truck'];

/** A boat at (x, z) fits on the water: its centre and four points 0.7 around it are inside the outline. */
export function boatOnWater(outline: [number, number][] | undefined, x: number, z: number): boolean {
  if (!outline) return false;
  const r = 0.7;
  return [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => pointInPolygon(outline, x + dx, z + dz));
}
