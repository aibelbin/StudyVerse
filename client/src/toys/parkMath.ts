import { BREATH_HOLD_MS, BREATH_IN_MS, BREATH_OUT_MS } from '../../../shared/constants';
import { inBox, type Box } from '../../../shared/geometry';
import type { SceneDef } from '../../../shared/scenes/types';

const smooth = (u: number) => u * u * (3 - 2 * u);
export const BREATH_CYCLE_MS = BREATH_IN_MS + BREATH_HOLD_MS + BREATH_OUT_MS;
const SMALL = 0.45;

/** The breathing circle ms into the shared rhythm: its scale (0.45..1) and what to do now. */
export function breathAt(ms: number): { scale: number; label: 'Breathe in' | 'Hold' | 'Breathe out' } {
  const p = ((ms % BREATH_CYCLE_MS) + BREATH_CYCLE_MS) % BREATH_CYCLE_MS;
  if (p < BREATH_IN_MS) return { scale: SMALL + (1 - SMALL) * smooth(p / BREATH_IN_MS), label: 'Breathe in' };
  if (p < BREATH_IN_MS + BREATH_HOLD_MS) return { scale: 1, label: 'Hold' };
  return { scale: 1 - (1 - SMALL) * smooth((p - BREATH_IN_MS - BREATH_HOLD_MS) / BREATH_OUT_MS), label: 'Breathe out' };
}

export interface Pond {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Half the width of the strip down the middle of the pond that the bridge covers (plus a little). */
const BRIDGE_HALF = 1.2;

/**
 * Where tossed food lands: 1.5 m into the (elliptical) pond from the thrower, towards the middle,
 * but never under the bridge that crosses the pond north to south, where the koi couldn't be seen.
 */
export function koiLanding(pond: Pond, px: number, pz: number): { x: number; z: number } {
  const dx = px - pond.x;
  const dz = pz - pond.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: pond.x, z: pond.z };
  const ux = dx / len;
  const uz = dz / len;
  const edge = 1 / Math.hypot(ux / (pond.w / 2), uz / (pond.d / 2));
  const r = Math.max(0, Math.min(len, edge) - 1.5);
  let x = pond.x + ux * r;
  if (Math.abs(x - pond.x) < BRIDGE_HALF) x = pond.x + (dx < 0 ? -1 : 1) * (BRIDGE_HALF + 0.3);
  return { x, z: pond.z + uz * r };
}

/** Koi i's lazy loop at time t (ms), relative to the pond centre, and the way it's heading. */
export function koiLoop(i: number, t: number, pond: Pond): { x: number; z: number; heading: number } {
  const speed = 0.00018 + i * 0.000023;
  const dir = i % 2 ? 1 : -1;
  const a = dir * t * speed + i * 1.7;
  const k = 0.45 + (i % 3) * 0.12;
  const rx = (pond.w / 2) * k;
  const rz = (pond.d / 2) * k;
  const x = Math.cos(a) * rx + Math.sin(a * 2.3 + i) * 0.25;
  const z = Math.sin(a) * rz;
  // heading: the direction of travel (derivative of the loop)
  const vx = -Math.sin(a) * rx * dir;
  const vz = Math.cos(a) * rz * dir;
  return { x, z, heading: Math.atan2(vx, vz) };
}

/** How loud a voice is for me: anyone on the stage is heard in full throughout the audience. */
export function stageGain(stage: SceneDef['stage'], peer: { x: number; z: number }, me: { x: number; z: number }, normal: number): number {
  if (stage && inBox(stage.stage, peer.x, peer.z) && inBox(stage.audience, me.x, me.z)) return 1;
  return normal;
}

/** Height of the stage floor above the ground. */
export const STAGE_FLOOR = 0.33;

/** Ground height for someone standing at (x, z): up on the stage, or the grass. */
export function floorY(def: { stage?: { stage: Box } }, x: number, z: number): number {
  return def.stage && inBox(def.stage.stage, x, z) ? STAGE_FLOOR : 0;
}
