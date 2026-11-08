import { INTERACT_RADIUS, SEAT_RADIUS } from '../../../shared/constants';
import type { Slot } from '../../../shared/scenes/types';

export type Target =
  | { kind: 'slot'; slot: Slot; dist: number }
  | { kind: 'player'; id: string; dist: number };

/** What [E] would act on right now: the closest free slot or nearby player. */
export function pickTarget(
  x: number,
  z: number,
  slots: Slot[],
  taken: Set<string>,
  others: { id: string; x: number; z: number }[],
): Target | null {
  let best: Target | null = null;
  for (const s of slots) {
    if (taken.has(s.id)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d <= SEAT_RADIUS && (!best || d < best.dist)) best = { kind: 'slot', slot: s, dist: d };
  }
  for (const o of others) {
    const d = Math.hypot(o.x - x, o.z - z);
    if (d <= INTERACT_RADIUS && (!best || d < best.dist)) best = { kind: 'player', id: o.id, dist: d };
  }
  return best;
}
