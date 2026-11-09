import { angleDelta } from './toys';
import type { Bay } from './scenes/types';

/** Is a truck at (x, z) heading this way parked in the bay? Nose in or nose out both count. */
export function inBay(bay: Bay, x: number, z: number, heading: number): boolean {
  if (Math.hypot(x - bay.x, z - bay.z) > 1.2) return false;
  const d = Math.abs(angleDelta(bay.rot, heading));
  return d < 0.5 || Math.PI - d < 0.5;
}

/** The nearest bay to (x, z) with no truck within 2 m of its centre, or null if every bay is full. */
export function freeBay(bays: Bay[], trucks: { x: number; z: number }[], x: number, z: number): Bay | null {
  let best: Bay | null = null;
  let bestD = Infinity;
  for (const b of bays) {
    if (trucks.some((t) => Math.hypot(t.x - b.x, t.z - b.z) < 2)) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}
