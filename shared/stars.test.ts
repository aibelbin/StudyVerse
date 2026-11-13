// shared/stars.test.ts
import { describe, expect, it } from 'vitest';
import { isConstellationInput, STAR_COUNT, STAR_SEED, starField } from './stars';

describe('starField', () => {
  it('is deterministic and inside the unit square', () => {
    const a = starField(STAR_SEED, STAR_COUNT);
    expect(a).toHaveLength(STAR_COUNT);
    expect(starField(STAR_SEED, STAR_COUNT)).toEqual(a);
    expect(starField(1, STAR_COUNT)).not.toEqual(a);
    for (const s of a) for (const v of [s.x, s.y, s.mag]) expect(v >= 0 && v < 1).toBe(true);
  });
});

describe('isConstellationInput', () => {
  it('accepts 1–8 distinct lines between distinct stars', () => {
    expect(isConstellationInput('Bear', [[0, 1]])).toBe(true);
    expect(isConstellationInput('Bear', Array.from({ length: 8 }, (_, i) => [i, i + 1]))).toBe(true);
  });
  it('rejects bad names and edges', () => {
    expect(isConstellationInput('', [[0, 1]])).toBe(false);
    expect(isConstellationInput('x'.repeat(25), [[0, 1]])).toBe(false);
    expect(isConstellationInput('Bear', [])).toBe(false);
    expect(isConstellationInput('Bear', Array.from({ length: 9 }, (_, i) => [i, i + 1]))).toBe(false);
    expect(isConstellationInput('Bear', [[0, 0]])).toBe(false);
    expect(isConstellationInput('Bear', [[0, STAR_COUNT]])).toBe(false);
    expect(isConstellationInput('Bear', [[-1, 2]])).toBe(false);
    expect(isConstellationInput('Bear', [[0, 1.5]])).toBe(false);
    expect(isConstellationInput('Bear', [[0, 1, 2]])).toBe(false);
    expect(isConstellationInput('Bear', [[0, 1], [1, 0]])).toBe(false);
    expect(isConstellationInput('Bear', 'nope')).toBe(false);
  });
});
