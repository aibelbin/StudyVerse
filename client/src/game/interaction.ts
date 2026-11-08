import { INTERACT_RADIUS, SEAT_RADIUS } from '../../../shared/constants';
import type { Slot, Toy } from '../../../shared/scenes/types';

export type Target =
  | { kind: 'slot'; slot: Slot; dist: number }
  | { kind: 'toy'; toy: Toy; prompt: string; dist: number }
  | { kind: 'player'; id: string; dist: number };

/** A slot where it is right now (seats on boats and the merry-go-round move). */
export interface PlacedSlot {
  slot: Slot;
  x: number;
  z: number;
}

/** What [E] would act on right now: the closest free slot, usable toy, or nearby player. */
export function pickTarget(
  x: number,
  z: number,
  slots: PlacedSlot[],
  taken: Set<string>,
  toys: { toy: Toy; prompt: string | null }[],
  others: { id: string; x: number; z: number }[],
): Target | null {
  let best: Target | null = null;
  for (const s of slots) {
    if (taken.has(s.slot.id)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d <= SEAT_RADIUS && (!best || d < best.dist)) best = { kind: 'slot', slot: s.slot, dist: d };
  }
  for (const { toy, prompt } of toys) {
    if (!prompt) continue;
    const d = Math.hypot(toy.x - x, toy.z - z);
    if (d <= toy.radius && (!best || d < best.dist)) best = { kind: 'toy', toy, prompt, dist: d };
  }
  for (const o of others) {
    const d = Math.hypot(o.x - x, o.z - z);
    if (d <= INTERACT_RADIUS && (!best || d < best.dist)) best = { kind: 'player', id: o.id, dist: d };
  }
  return best;
}
