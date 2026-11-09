import { describe, expect, it } from 'vitest';
import type { PetKind } from '../../../shared/types';
import { PERSONALITY, PetMind, type MindInput, type Poi } from './mind';

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};
const input = (over: Partial<MindInput> = {}, owner: Partial<MindInput['owner']> = {}): MindInput => ({
  now: 100_000,
  pet: { x: 1, z: 1 },
  owner: { x: 0, z: 0, speed: 0, sitting: false, studying: false, ...owner },
  pois: [],
  water: null,
  ...over,
});

describe('pet minds', () => {
  it('follow when their person walks, at a run when far behind', () => {
    const m = new PetMind('kitten', seq([0.5]));
    expect(m.think(input({}, { speed: 3 }))).toMatchObject({ follow: false, moving: 'walk' }); // close: keeps pace
    expect(m.think(input({ pet: { x: 9, z: 0 } }, { speed: 3 }))).toMatchObject({ follow: true, moving: 'run' });
  });

  it('wander within their roaming radius when their person stands still', () => {
    for (const kind of ['kitten', 'bunny', 'duckling', 'frog'] as PetKind[]) {
      const m = new PetMind(kind, seq([0.05, 0.3, 0.6, 0.9, 0.2, 0.7]));
      for (let t = 0; t < 30; t++) {
        const out = m.think(input({ now: 100_000 + t * 9000 }));
        if (out.target) expect(Math.hypot(out.target.x, out.target.z), kind).toBeLessThanOrEqual(PERSONALITY[kind].roam + 1.5);
      }
    }
  });

  it('curl up and nap near you while you study', () => {
    const out = new PetMind('kitten', seq([0.3])).think(input({ pet: { x: 0.5, z: 0.5 } }, { sitting: true, studying: true }));
    expect(out.still).toBe('sleep');
    expect(new PetMind('bunny', seq([0.3])).think(input({}, { sitting: true, studying: true })).still).toBe('flop');
  });

  it('go and sniff things they like, and greet people only when someone is there', () => {
    const flowers: Poi[] = [{ kind: 'flower', x: 3, z: 0 }];
    let sawSniff = false;
    let sawGreet = false;
    for (let s = 0; s < 40; s++) {
      const m = new PetMind('bunny', seq([s / 40, 0.5, 0.2, 0.8]));
      const out = m.think(input({ pois: flowers }));
      if (out.still === 'sniff') sawSniff = true;
      if (out.still === 'play' && out.target && Math.hypot(out.target.x - 5, out.target.z - 5) < 1) sawGreet = true;
    }
    expect(sawSniff).toBe(true);
    expect(sawGreet).toBe(false); // nobody around to greet
  });

  it('do their own tricks: kittens pounce or get the zoomies, ducklings head for water', () => {
    const tricks = new Set<string>();
    for (let s = 0; s < 60; s++) tricks.add(new PetMind('kitten', seq([s / 60, 0.3, 0.6])).think(input()).still);
    expect([...tricks].some((t) => t === 'pounce' || t === 'play')).toBe(true);
    let swam = false;
    for (let s = 0; s < 60; s++) {
      const out = new PetMind('duckling', seq([s / 60, 0.9, 0.4])).think(input({ water: { x: 3, z: 3 } }));
      if (out.still === 'swim') swam = true;
    }
    expect(swam).toBe(true);
  });
});
