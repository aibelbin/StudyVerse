import { describe, expect, it } from 'vitest';
import { BALL_R, FELT, HOLES, type Hole } from '../../../shared/golf';
import { loadRapier } from '../drive/physics';
import { aimFromDrag, cupCheck, GolfSim, RestDetector, type SimEvent } from './sim';

/** Putts from the tee at a power (towards target) and runs until something happens. */
async function shot(hole: Hole, power: number, target = hole.cup, from = { x: hole.tee.x, y: FELT + BALL_R, z: hole.tee.z }, at = 0) {
  const sim = new GolfSim(await loadRapier(), hole, from);
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.hypot(dx, dz);
  sim.step(0.05, at); // settle
  sim.putt(dx / d, dz / d, power);
  let event: SimEvent | null = null;
  let maxY = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < 1500 && !event; i++) {
    event = sim.step(1 / 60, at + i * 16.7);
    const b = sim.ballPos();
    maxY = Math.max(maxY, b.y);
    minX = Math.min(minX, b.x);
    maxX = Math.max(maxX, b.x);
  }
  const end = sim.ballPos();
  sim.dispose();
  return { event, end, maxY, minX, maxX };
}

describe('aiming and resting', () => {
  it('putts opposite the drag, with power from the drag length', () => {
    expect(aimFromDrag(-2, 0, 80)).toEqual({ dirX: 1, dirZ: -0, power: 0.5 });
    expect(aimFromDrag(0, 3, 400)!.power).toBe(1);
    expect(aimFromDrag(1, 1, 5)).toBeNull(); // a click, not a drag
  });

  it('drops in only over the cup, at its height, and not too fast', () => {
    const cup = { x: 0, y: 0.05, z: 0 };
    expect(cupCheck({ x: 0.1, y: 0.17, z: 0 }, 0.8, cup)).toBe(true);
    expect(cupCheck({ x: 0.1, y: 0.17, z: 0 }, 3, cup)).toBe(false);
    expect(cupCheck({ x: 0.4, y: 0.17, z: 0 }, 0.5, cup)).toBe(false);
    expect(cupCheck({ x: 0, y: 0.6, z: 0 }, 0.5, cup)).toBe(false);
  });

  it('calls a ball at rest after 0.3 s of crawling', () => {
    const r = new RestDetector();
    expect(r.update(0.01, 0.2)).toBe(false);
    expect(r.update(0.01, 0.15)).toBe(true);
  });
});

describe('the course plays', () => {
  it('hole 1: some putt straight at the cup holes it', async () => {
    const results = [];
    for (let p = 0.3; p <= 1; p += 0.05) results.push((await shot(HOLES[0], p)).event);
    expect(results).toContain('holed');
    expect(results[0]).toBe('rest'); // a soft putt stops short
  });

  it('hole 3: a soft putt stops short, a medium one falls in the pond, a firm one clears the jump', async () => {
    expect((await shot(HOLES[2], 0.35)).event).toBe('rest'); // too soft: stops before the ramp
    expect((await shot(HOLES[2], 0.7)).event).toBe('penalty'); // up the ramp but short of the far side
    const firm = await shot(HOLES[2], 1);
    expect(firm.maxX).toBeGreaterThan(59);
  });

  it('hole 5: a full putt goes round the loop and out the other side', async () => {
    const r = await shot(HOLES[4], 1, { x: 30, y: 0, z: HOLES[4].tee.z });
    expect(r.maxY).toBeGreaterThan(0.95); // over the top (ball centre at the top is 1.03)
    expect(r.minX).toBeLessThan(37);
    expect(r.end.z).toBeGreaterThan(55.2); // came out on the exit side
  });

  it('hole 6: some putt up the volcano stays on top and drops in', async () => {
    const results = [];
    for (let p = 0.3; p <= 1; p += 0.025) results.push((await shot(HOLES[5], p)).event);
    expect(results).toContain('holed');
  });
});
