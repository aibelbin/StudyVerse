import { BREAK_RANGE, FOCUS_RANGE } from '../../shared/constants';
import type { Session } from '../../shared/types';

const MIN = 60_000;

export function validLengths(focusMin: number, breakMin: number): boolean {
  return (
    Number.isInteger(focusMin) && Number.isInteger(breakMin) &&
    focusMin >= FOCUS_RANGE[0] && focusMin <= FOCUS_RANGE[1] &&
    breakMin >= BREAK_RANGE[0] && breakMin <= BREAK_RANGE[1]
  );
}

export function newSession(focusMin: number, breakMin: number, now: number): Session {
  return { phase: 'focus', focusMin, breakMin, phaseStartedAt: now };
}

export type StepEvent = 'focusDone' | 'breakDone' | null;

/** Advances a session to `now`. The break starts at the planned end of focus, not at the tick that noticed it. */
export function stepSession(s: Session, now: number): { session: Session | null; event: StepEvent } {
  if (s.phase === 'focus') {
    const end = s.phaseStartedAt + s.focusMin * MIN;
    if (now < end) return { session: s, event: null };
    return { session: { ...s, phase: 'break', phaseStartedAt: end }, event: 'focusDone' };
  }
  if (now < s.phaseStartedAt + s.breakMin * MIN) return { session: s, event: null };
  return { session: null, event: 'breakDone' };
}

export function elapsedMin(s: Session, now: number): number {
  return Math.floor((now - s.phaseStartedAt) / MIN);
}
