import type { Bounds, Box } from '../geometry';
import { rng } from '../rng';
import { observe, petStep, type PetWorld } from './brain';

export type Brain = (obs: number[], t: number) => [number, number];

const ARENA: Bounds = { w: 36, d: 36 };
export const DT = 0.1;
export const STEPS = 400; // 40 s

/** A random little world: scattered boxes and an owner who walks between waypoints, pauses and sits. */
export function makeEpisode(seed: number): { boxes: Box[]; waypoints: { x: number; z: number; pause: number; sit: boolean }[] } {
  const r = rng(seed);
  const boxes: Box[] = [];
  for (let i = 0; i < 10; i++) boxes.push({ x: (r() - 0.5) * 30, z: (r() - 0.5) * 30, w: 0.6 + r() * 2.4, d: 0.6 + r() * 2.4 });
  const waypoints = [];
  for (let i = 0; i < 8; i++) {
    waypoints.push({ x: (r() - 0.5) * 30, z: (r() - 0.5) * 30, pause: r() < 0.5 ? r() * 4 : 0, sit: r() < 0.3 });
  }
  return { boxes, waypoints };
}

/** Per-step reward: stay 1.2–2.5 m from your human, move smoothly, don't bump into things, potter when they sit. */
export function stepReward(d: number, blocked: boolean, dv: number, speed: number, sitting: boolean): number {
  let r = d >= 1.2 && d <= 2.5 ? 1 : -Math.min(1, (d < 1.2 ? 1.2 - d : d - 2.5) / 3);
  if (blocked) r -= 0.3;
  r -= 0.05 * dv;
  if (sitting && d >= 1.2 && d <= 3) r += 0.15 * Math.min(1, speed / 0.6);
  return r;
}

/** Runs one episode with a brain and returns the mean reward per step (higher is better). */
export function runEpisode(brain: Brain, seed: number): number {
  const ep = makeEpisode(seed);
  const free = (x: number, z: number) => !ep.boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.6 && Math.abs(z - b.z) < b.d / 2 + 0.6);
  const start = { x: 0, z: 0 };
  while (!free(start.x, start.z)) start.x += 1;
  const w: PetWorld = {
    pet: { x: start.x + 1.5, z: start.z, vx: 0, vz: 0 },
    owner: { x: start.x, z: start.z, vx: 0, vz: 0, sitting: false },
    boxes: ep.boxes,
  };
  let wp = 0;
  let pauseLeft = 0;
  let total = 0;
  for (let i = 0; i < STEPS; i++) {
    const goal = ep.waypoints[wp % ep.waypoints.length];
    const ox = goal.x - w.owner.x;
    const oz = goal.z - w.owner.z;
    const od = Math.hypot(ox, oz);
    if (pauseLeft > 0) {
      pauseLeft -= DT;
      w.owner.vx = w.owner.vz = 0;
      if (pauseLeft <= 0) w.owner.sitting = false;
    } else if (od < 0.3) {
      pauseLeft = goal.pause;
      w.owner.sitting = goal.sit && goal.pause > 0;
      wp++;
    } else {
      const sp = Math.min(3.2, od / DT);
      w.owner.vx = (ox / od) * sp;
      w.owner.vz = (oz / od) * sp;
      w.owner.x += w.owner.vx * DT; // the owner ghosts through boxes; the pet must go round
      w.owner.z += w.owner.vz * DT;
    }
    const pvx = w.pet.vx;
    const pvz = w.pet.vz;
    const { blocked } = petStep(w, brain(observe(w), i * DT), DT, ARENA);
    let d = Math.hypot(w.owner.x - w.pet.x, w.owner.z - w.pet.z);
    if (d > 15) {
      total -= 5; // lost: snap back to its human
      w.pet.x = w.owner.x + 1;
      w.pet.z = w.owner.z;
      d = 1;
    }
    total += stepReward(d, blocked, Math.hypot(w.pet.vx - pvx, w.pet.vz - pvz), Math.hypot(w.pet.vx, w.pet.vz), w.owner.sitting);
  }
  return total / STEPS;
}
