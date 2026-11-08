import { describe, expect, it } from 'vitest';
import { Interp, lerpAngle } from './interp';

describe('Interp', () => {
  it('returns the only sample', () => {
    const i = new Interp();
    i.push({ x: 1, z: 2, facing: 0 }, 1000);
    expect(i.sample(5000)).toEqual({ x: 1, z: 2, facing: 0 });
  });

  it('interpolates 100 ms behind real time', () => {
    const i = new Interp();
    i.push({ x: 0, z: 0, facing: 0 }, 1000);
    i.push({ x: 1, z: 0, facing: 0 }, 1100);
    expect(i.sample(1150).x).toBeCloseTo(0.5);
  });

  it('holds the newest sample after it runs out', () => {
    const i = new Interp();
    i.push({ x: 0, z: 0, facing: 0 }, 1000);
    i.push({ x: 1, z: 0, facing: 0 }, 1100);
    expect(i.sample(9999).x).toBe(1);
  });

  it('snaps when an update is more than 2 m from where it is drawn', () => {
    const i = new Interp();
    i.push({ x: 0, z: 0, facing: 0 }, 1000);
    i.sample(1100);
    i.push({ x: 5, z: 0, facing: 0 }, 1200);
    expect(i.sample(1201).x).toBe(5);
  });

  it('starts moving smoothly after standing still for a while', () => {
    const i = new Interp();
    i.push({ x: 0, z: 0, facing: 0 }, 1000);
    i.sample(1100);
    i.push({ x: 0.3, z: 0, facing: 0 }, 5000);
    expect(i.sample(5000).x).toBe(0); // no jump
    expect(i.sample(5060).x).toBeCloseTo(0.15); // halfway through the 80 ms ease
  });
});

describe('lerpAngle', () => {
  it('takes the short way round', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI);
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5);
  });
});

describe('Interp out-of-order pushes', () => {
  it('ignores a late timestamp instead of sampling backwards in time', () => {
    const i = new Interp();
    i.push({ x: 0, z: 0, facing: 0 }, 1000);
    i.push({ x: 1, z: 0, facing: 0 }, 1100);
    i.push({ x: 2, z: 0, facing: 0 }, 1050); // late packet
    const mid = i.sample(1160); // target 1060 lies between the first two samples
    expect(Number.isFinite(mid.x)).toBe(true);
    expect(mid.x).toBeCloseTo(0.6);
    expect(i.sample(9999).x).toBe(2); // newest pose once the delay has passed
  });
});
