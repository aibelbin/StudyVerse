import { describe, expect, it } from 'vitest';
import type { Slot, Toy } from './scenes/types';
import { boatPoseAt, seesawAngle, slotWorld, spinAt, swingAngle, type ToyState } from './toys';

describe('spinAt', () => {
  const s = { angle0: 1, speed0: 2, t0: 1000 };
  it('starts at the stored angle and speed', () => {
    expect(spinAt(s, 1000)).toEqual({ angle: 1, speed: 2 });
  });
  it('slows down exponentially', () => {
    expect(spinAt(s, 11_000).speed).toBeCloseTo(2 * Math.exp(-4));
  });
  it('keeps turning forward and settles', () => {
    const a1 = spinAt(s, 2000).angle;
    const a2 = spinAt(s, 5000).angle;
    expect(a2).toBeGreaterThan(a1);
    expect(spinAt(s, 1_000_000).angle).toBeCloseTo(1 + 2 / 0.4);
  });
});

describe('boatPoseAt', () => {
  const mooring = { x: 0, z: 0, heading: 0 };
  const base: Extract<ToyState, { kind: 'rowboat' }> = { kind: 'rowboat', x: 6, z: 0, heading: 1, returnFrom: null };
  it('stays put without a return', () => {
    expect(boatPoseAt(base, mooring, 5000)).toEqual({ x: 6, z: 0, heading: 1 });
  });
  const ret = { ...base, returnFrom: { x: 6, z: 0, heading: 1, at: 1000 } };
  it('glides home over dist / 1.5 seconds', () => {
    const mid = boatPoseAt(ret, mooring, 1000 + 2000); // 6 m at 1.5 m/s = 4 s
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(6);
    expect(boatPoseAt(ret, mooring, 1000 + 4000)).toEqual(mooring);
    expect(boatPoseAt(ret, mooring, 1000 + 60_000)).toEqual(mooring);
  });
  it('turns the short way across ±π', () => {
    const r = { ...base, returnFrom: { x: 0, z: 0, heading: Math.PI - 0.1, at: 0 } };
    const m = { x: 0, z: 0, heading: -Math.PI + 0.1 };
    const h = boatPoseAt(r, m, 750).heading; // halfway through the minimum 1.5 s
    expect(Math.abs(Math.abs(h) - Math.PI)).toBeLessThan(0.11);
  });
});

describe('slotWorld', () => {
  const toy: Toy = { id: 't', kind: 'rowboat', x: 10, z: 10, rot: 0, radius: 1 };
  const slot: Slot = { id: 's', x: 10, z: 11, facing: 0, pose: 'row', toyId: 't' };
  it('is the slot itself at rest', () => {
    expect(slotWorld(slot, toy, { x: 10, z: 10, heading: 0 })).toEqual({ x: 10, z: 11, facing: 0 });
  });
  it('moves with the toy', () => {
    const p = slotWorld(slot, toy, { x: 13, z: 10, heading: 0 });
    expect(p.x).toBeCloseTo(13);
    expect(p.z).toBeCloseTo(11);
  });
  it('rotates about the toy centre', () => {
    const p = slotWorld(slot, toy, { x: 10, z: 10, heading: Math.PI / 2 });
    expect(p.x).toBeCloseTo(11);
    expect(p.z).toBeCloseTo(10);
    expect(p.facing).toBeCloseTo(Math.PI / 2);
  });
});

describe('swing and seesaw', () => {
  it('stay within their arcs', () => {
    for (let t = 0; t < 10_000; t += 137) {
      expect(Math.abs(swingAngle(t, 0.5))).toBeLessThanOrEqual(0.6);
      expect(Math.abs(seesawAngle(t))).toBeLessThanOrEqual(0.25);
    }
  });
});
