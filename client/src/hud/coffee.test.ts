import { describe, expect, it } from 'vitest';
import { barPos, scoreStep } from './coffee';

describe('coffee timing', () => {
  it('scores a stop inside the green zone', () => {
    expect(scoreStep(0.5, 0.4, 0.2)).toBe(true);
    expect(scoreStep(0.4, 0.4, 0.2)).toBe(true);
    expect(scoreStep(0.61, 0.4, 0.2)).toBe(false);
  });
  it('sweeps back and forth across the bar', () => {
    expect(barPos(0, 1000)).toBe(0);
    expect(barPos(500, 1000)).toBeCloseTo(0.5);
    expect(barPos(1000, 1000)).toBeCloseTo(1);
    expect(barPos(1500, 1000)).toBeCloseTo(0.5);
    expect(barPos(2000, 1000)).toBeCloseTo(0);
  });
});
