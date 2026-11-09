import { describe, expect, it } from 'vitest';
import { breathAt, floorY, koiLanding, koiLoop, stageGain, STAGE_FLOOR } from './parkMath';

const pond = { x: 10, z: 20, w: 8, d: 6 };
const stage = { stage: { x: 0, z: 0, w: 8, d: 5 }, audience: { x: 0, z: 8, w: 18, d: 9 }, screen: { x: 0, z: -3 } };

describe('breathAt', () => {
  it('breathes in for 4 s, holds 2 s, breathes out for 6 s, then repeats', () => {
    expect(breathAt(0)).toMatchObject({ label: 'Breathe in', scale: 0.45 });
    expect(breathAt(2000).scale).toBeCloseTo(0.725);
    expect(breathAt(4500)).toEqual({ label: 'Hold', scale: 1 });
    expect(breathAt(9000)).toMatchObject({ label: 'Breathe out' });
    expect(breathAt(11999).scale).toBeCloseTo(0.45, 2);
    expect(breathAt(12000 + 4500)).toEqual(breathAt(4500));
  });
});

describe('koiLanding', () => {
  it('lands 1.5 m in from the edge on the thrower side', () => {
    expect(koiLanding(pond, 13, 26).z).toBeLessThan(23); // south bank: edge at z 23
    const p = koiLanding(pond, 20, 20); // east bank: edge at x 14
    expect(p.x).toBeCloseTo(12.5);
    expect(p.z).toBeCloseTo(20);
  });

  it('never lands under the bridge down the middle', () => {
    expect(koiLanding(pond, 10, 26)).toEqual({ x: 11.5, z: 21.5 }); // the bridge foot: moved aside
    expect(koiLanding(pond, 9.8, 20.5).x).toBe(8.5); // on the bridge, west of centre
  });
});

describe('koiLoop', () => {
  it('stays inside the pond', () => {
    for (let i = 0; i < 6; i++) {
      for (let t = 0; t < 120_000; t += 1700) {
        const k = koiLoop(i, t, pond);
        expect((k.x / 4) ** 2 + (k.z / 3) ** 2).toBeLessThan(1);
      }
    }
  });
});

describe('stageGain', () => {
  it('carries the stage to everyone in the audience at full volume', () => {
    expect(stageGain(stage, { x: 1, z: 0 }, { x: -6, z: 10 }, 0.1)).toBe(1);
    expect(stageGain(stage, { x: 1, z: 0 }, { x: -6, z: 20 }, 0.1)).toBe(0.1); // not in the seats
    expect(stageGain(stage, { x: 1, z: 6 }, { x: -6, z: 10 }, 0.1)).toBe(0.1); // they're not on stage
    expect(stageGain(undefined, { x: 1, z: 0 }, { x: -6, z: 10 }, 0.3)).toBe(0.3);
  });
});

describe('floorY', () => {
  it('lifts people standing on the stage', () => {
    expect(floorY({ stage }, 1, 1)).toBe(STAGE_FLOOR);
    expect(floorY({ stage }, 1, 6)).toBe(0);
    expect(floorY({}, 1, 1)).toBe(0);
  });
});
