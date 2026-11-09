import { describe, expect, it } from 'vitest';
import { segmentAt } from './emoteWheel';

describe('emote wheel', () => {
  it('maps directions to segments clockwise from the top', () => {
    expect(segmentAt(0, -80, 8)).toBe(0);
    expect(segmentAt(80, 0, 8)).toBe(2);
    expect(segmentAt(0, 80, 8)).toBe(4);
    expect(segmentAt(-80, 0, 8)).toBe(6);
    expect(segmentAt(60, -60, 8)).toBe(1);
    expect(segmentAt(-60, -60, 8)).toBe(7);
  });

  it('ignores the dead zone in the middle', () => {
    expect(segmentAt(5, -5, 8)).toBe(-1);
  });
});
