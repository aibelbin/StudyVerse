import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../../../shared/types';
import { formatClock, sessionLeftMs, statusText } from './format';

const base: PlayerView = {
  id: 'a', name: 'Sam', look: { body: '#ffffff', skin: '#ffffff', hat: 'none' }, scene: 'town',
  x: 0, z: 0, facing: 0, anim: 'idle', seatId: null, session: null, connected: true, rainUntil: 0,
};

describe('format', () => {
  it('formats a countdown as m:ss, never negative', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(1_500)).toBe('0:02');
    expect(formatClock(-5)).toBe('0:00');
  });
  it('computes time left in the current phase', () => {
    expect(sessionLeftMs({ phase: 'break', focusMin: 25, breakMin: 5, phaseStartedAt: 0 }, 60_000)).toBe(4 * 60_000);
  });
  it('describes what a player is doing', () => {
    expect(statusText(base, 0)).toBe('🚶 Wandering');
    expect(statusText({ ...base, seatId: 's' }, 0)).toBe('🪑 Sitting');
    expect(statusText({ ...base, connected: false }, 0)).toBe('💤 Connection lost…');
    expect(statusText({ ...base, seatId: 's', session: { phase: 'focus', focusMin: 25, breakMin: 5, phaseStartedAt: 0 } }, 60_000))
      .toBe('📖 Studying · 24:00 left');
  });
});
