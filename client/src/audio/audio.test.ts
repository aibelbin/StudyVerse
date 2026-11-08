import { describe, expect, it } from 'vitest';
import { gainForDistance, panFor } from './engine';
import { BARS, STEP_MS, STEPS_PER_BAR, stepsBetween } from './jukebox';

describe('gainForDistance', () => {
  it('is full up close and silent far away', () => {
    expect(gainForDistance(0)).toBe(1);
    expect(gainForDistance(4)).toBe(1);
    expect(gainForDistance(25)).toBe(0);
    expect(gainForDistance(30)).toBe(0);
  });
  it('falls off smoothly in between', () => {
    let prev = 1;
    for (let d = 4.5; d < 25; d += 0.5) {
      const g = gainForDistance(d);
      expect(g).toBeLessThan(prev);
      prev = g;
    }
  });
});

describe('panFor', () => {
  it('clamps to the stereo field', () => {
    expect(panFor(0)).toBe(0);
    expect(panFor(6)).toBeCloseTo(0.5);
    expect(panFor(100)).toBe(1);
    expect(panFor(-100)).toBe(-1);
  });
});

describe('jukebox timing', () => {
  it('steps are eighth notes at 80 BPM', () => {
    expect(STEP_MS).toBe(375);
  });
  it('lists the steps starting inside a window', () => {
    expect(stepsBetween(0, 1000)).toEqual([{ index: 0, atMs: 0 }, { index: 1, atMs: 375 }, { index: 2, atMs: 750 }]);
    expect(stepsBetween(375, 750)).toEqual([{ index: 1, atMs: 375 }]);
  });
  it('wraps the step index around the loop', () => {
    const loop = STEP_MS * STEPS_PER_BAR * BARS;
    expect(stepsBetween(loop, loop + 10)).toEqual([{ index: 0, atMs: loop }]);
  });
});
