// shared/stars.ts
import { TITLE_MAX } from './art';
import { rng } from './rng';

export const STAR_COUNT = 120;
export const STAR_SEED = 4242;
export const CONSTELLATION_EDGES = 8;

export interface Star { x: number; y: number; mag: number }

/** n stars in the unit square, the same on every client for a seed. */
export function starField(seed: number, n: number): Star[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({ x: r(), y: r(), mag: r() }));
}

export interface Constellation {
  owner: string;
  ownerName: string;
  name: string;
  edges: [number, number][];
}

/** A cleaned name of 1–TITLE_MAX chars and 1–CONSTELLATION_EDGES distinct lines between distinct stars. */
export function isConstellationInput(name: string, edges: unknown): edges is [number, number][] {
  if (!name || [...name].length > TITLE_MAX) return false;
  if (!Array.isArray(edges) || edges.length < 1 || edges.length > CONSTELLATION_EDGES) return false;
  const seen = new Set<string>();
  for (const e of edges) {
    if (!Array.isArray(e) || e.length !== 2) return false;
    const [a, b] = e;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || a < 0 || b < 0 || a >= STAR_COUNT || b >= STAR_COUNT) return false;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/** A unit-square star → a unit direction on the night dome: x across a 120° band centred on north (−z, where the camera looks), y from 55° (top) down to 20° elevation, inside the telescope's view (the play camera never sees the sky). The sky and the editor both draw with this. */
export function skyDir(x: number, y: number): [number, number, number] {
  const az = (x - 0.5) * ((120 * Math.PI) / 180);
  const el = ((55 - 35 * y) * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}
