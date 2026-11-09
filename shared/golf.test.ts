import { describe, expect, it } from 'vitest';
import { inBox } from './geometry';
import { COURSE_PAR, floorTop, GOLF_BOX, HOLES, scoreName, windmillAngle } from './golf';
import { SCENES } from './scenes';
import { PATHS } from './scenes/town/scatter';

describe('mini-golf course', () => {
  it('has six holes, par 18, each inside the course with tee and cup inside its bounds', () => {
    expect(HOLES.map((h) => h.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(COURSE_PAR).toBe(18);
    for (const h of HOLES) {
      expect(inBox(GOLF_BOX, h.bounds.x - h.bounds.w / 2, h.bounds.z - h.bounds.d / 2), h.name).toBe(true);
      expect(inBox(GOLF_BOX, h.bounds.x + h.bounds.w / 2, h.bounds.z + h.bounds.d / 2), h.name).toBe(true);
      expect(inBox(h.bounds, h.tee.x, h.tee.z), h.name).toBe(true);
      expect(inBox(h.bounds, h.cup.x, h.cup.z), h.name).toBe(true);
    }
  });

  it('keeps the walkways off the holes', () => {
    for (const h of HOLES) for (const p of PATHS) expect(inBox(p, h.cup.x, h.cup.z, 0.5) || inBox(p, h.tee.x, h.tee.z, 0.5), `${h.name}`).toBe(false);
  });

  it('puts a tee toy on every hole in town', () => {
    for (const h of HOLES) expect(SCENES.town.toys.find((t) => t.id === `golf-tee-${h.n}`)).toMatchObject({ x: h.tee.x, z: h.tee.z });
  });

  it('turns the windmill at 1.2 rad/s, the same for everyone', () => {
    expect(windmillAngle(0)).toBe(0);
    expect(windmillAngle(1000)).toBeCloseTo(1.2);
    expect(windmillAngle(10_000)).toBeCloseTo(12 % (Math.PI * 2));
  });

  it('slopes ramps across their length', () => {
    const ramp = HOLES[2].pieces.find((p) => p.kind === 'floor' && (p.rise ?? 0) > 0) as Extract<(typeof HOLES)[0]['pieces'][0], { kind: 'floor' }>;
    expect(floorTop(ramp, ramp.x - ramp.w / 2)).toBeCloseTo(0.05);
    expect(floorTop(ramp, ramp.x + ramp.w / 2)).toBeCloseTo(0.55);
  });

  it('names scores', () => {
    expect(scoreName(1, 3)).toBe('Hole-in-one!');
    expect(scoreName(2, 3)).toBe('Birdie!');
    expect(scoreName(3, 3)).toBe('Par');
    expect(scoreName(4, 3)).toBe('Bogey');
    expect(scoreName(6, 3)).toBe('+3');
    expect(scoreName(7, 3, true)).toBe('Picked up');
  });
});
