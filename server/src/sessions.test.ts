import { describe, expect, it } from 'vitest';
import { elapsedMin, newSession, stepSession, validLengths } from './sessions';

const MIN = 60_000;

describe('sessions', () => {
  it('validates lengths', () => {
    expect(validLengths(25, 5)).toBe(true);
    expect(validLengths(120, 30)).toBe(true);
    expect(validLengths(0, 5)).toBe(false);
    expect(validLengths(121, 5)).toBe(false);
    expect(validLengths(25, 31)).toBe(false);
    expect(validLengths(25.5, 5)).toBe(false);
  });

  it('stays in focus until the focus time is up', () => {
    const s = newSession(25, 5, 0);
    expect(stepSession(s, 25 * MIN - 1)).toEqual({ session: s, event: null });
  });

  it('moves to break exactly at the end of focus, timed from the planned end', () => {
    const s = newSession(25, 5, 0);
    expect(stepSession(s, 25 * MIN + 400)).toEqual({
      session: { phase: 'break', focusMin: 25, breakMin: 5, phaseStartedAt: 25 * MIN },
      event: 'focusDone',
    });
  });

  it('ends after the break', () => {
    const b = { phase: 'break' as const, focusMin: 25, breakMin: 5, phaseStartedAt: 25 * MIN };
    expect(stepSession(b, 30 * MIN)).toEqual({ session: null, event: 'breakDone' });
  });

  it('counts whole elapsed minutes', () => {
    expect(elapsedMin(newSession(25, 5, 0), 12 * MIN + 59_000)).toBe(12);
  });
});
