import { moveWithCollision, type Bounds, type Box } from '../geometry';

/** Everything a pet's brain sees each tick. */
export interface PetWorld {
  pet: { x: number; z: number; vx: number; vz: number };
  owner: { x: number; z: number; vx: number; vz: number; sitting: boolean };
  boxes: Box[];
}

export const OBS = 10;
export const HIDDEN = 24;
export const ACT = 2;
export const PET_SPEED = 3.6;
export const PET_RADIUS = 0.25;
export const FEEL = 1.5; // how far the obstacle sense reaches, m

const clip = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/** Push away from boxes within FEEL metres, stronger when closer. */
export function obstaclePush(x: number, z: number, boxes: Box[]): [number, number] {
  let px = 0;
  let pz = 0;
  for (const b of boxes) {
    const cx = clip(x - b.x, b.w / 2) + b.x;
    const cz = clip(z - b.z, b.d / 2) + b.z;
    const dx = x - cx;
    const dz = z - cz;
    const d = Math.hypot(dx, dz);
    if (d >= FEEL || d < 1e-6) continue;
    const k = (FEEL - d) / FEEL;
    px += (dx / d) * k;
    pz += (dz / d) * k;
  }
  return [clip(px, 1.5), clip(pz, 1.5)];
}

/** The pet's 10 inputs: owner offset and distance, both velocities, owner sitting, obstacle push. */
export function observe(w: PetWorld): number[] {
  const dx = w.owner.x - w.pet.x;
  const dz = w.owner.z - w.pet.z;
  const [px, pz] = obstaclePush(w.pet.x, w.pet.z, w.boxes);
  return [
    clip(dx / 5, 2), clip(dz / 5, 2), clip(Math.hypot(dx, dz) / 5, 2),
    w.owner.vx / 4, w.owner.vz / 4, w.pet.vx / 4, w.pet.vz / 4,
    w.owner.sitting ? 1 : 0, px, pz,
  ];
}

/** Layer sizes of the policy network, flattened as W1 b1 W2 b2 W3 b3 (row-major, out × in). */
export const PARAMS = HIDDEN * OBS + HIDDEN + HIDDEN * HIDDEN + HIDDEN + ACT * HIDDEN + ACT;

/** Forward pass: tanh hidden layers, tanh outputs = desired velocity as a fraction of PET_SPEED. */
export function mlpForward(p: ArrayLike<number>, obs: number[]): [number, number] {
  let o = 0;
  const layer = (input: number[], outN: number): number[] => {
    const inN = input.length;
    const out = new Array<number>(outN);
    const bias = o + outN * inN;
    for (let j = 0; j < outN; j++) {
      let s = p[bias + j];
      const row = o + j * inN;
      for (let i = 0; i < inN; i++) s += p[row + i] * input[i];
      out[j] = Math.tanh(s);
    }
    o = bias + outN;
    return out;
  };
  const h1 = layer(obs, HIDDEN);
  const h2 = layer(h1, HIDDEN);
  const a = layer(h2, ACT);
  return [a[0], a[1]];
}

/** Hand-written behaviour: catch up when far, give space when close, potter about while you sit. */
export function fallbackBrain(obs: number[], t: number): [number, number] {
  const [dx, dz, dist, , , , , sitting, px, pz] = obs;
  const d = dist * 5;
  let ax = 0;
  let az = 0;
  if (d > 2.2) {
    const k = Math.min(1, (d - 1.8) / 2.5);
    ax = (dx / dist) * k;
    az = (dz / dist) * k;
  } else if (d < 1.1 && dist > 1e-3) {
    ax = -(dx / dist) * 0.3;
    az = -(dz / dist) * 0.3;
  } else if (sitting) {
    ax = Math.sin(t * 0.7) * 0.15;
    az = Math.cos(t * 0.5) * 0.15;
  }
  return [clip(ax + px * 0.8, 1), clip(az + pz * 0.8, 1)];
}

/** One physics step: steer velocity towards the action (with some inertia) and slide along walls. */
export function petStep(w: PetWorld, action: [number, number], dt: number, bounds: Bounds): { blocked: boolean } {
  const k = 1 - Math.exp(-dt * 8);
  w.pet.vx += (action[0] * PET_SPEED - w.pet.vx) * k;
  w.pet.vz += (action[1] * PET_SPEED - w.pet.vz) * k;
  const want = { x: w.pet.x + w.pet.vx * dt, z: w.pet.z + w.pet.vz * dt };
  const r = moveWithCollision(w.pet.x, w.pet.z, w.pet.vx * dt, w.pet.vz * dt, PET_RADIUS, w.boxes, bounds);
  const blocked = Math.hypot(want.x - r.x, want.z - r.z) > 0.01;
  w.pet.x = r.x;
  w.pet.z = r.z;
  return { blocked };
}
