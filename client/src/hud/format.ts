import type { PlayerView, Session } from '../../../shared/types';

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function sessionLeftMs(s: Session, now: number): number {
  return s.phaseStartedAt + (s.phase === 'focus' ? s.focusMin : s.breakMin) * 60_000 - now;
}

export function statusText(v: PlayerView, now: number): string {
  if (v.session) {
    const label = v.session.phase === 'focus' ? '📖 Studying' : '☕ On a break';
    return `${label} · ${formatClock(sessionLeftMs(v.session, now))} left`;
  }
  if (!v.connected) return '💤 Connection lost…';
  return v.slotId ? '🪑 Sitting' : '🚶 Wandering';
}
