import { describe, expect, it } from 'vitest';
import { pickTarget } from './interaction';

const slot = (id: string, x: number, z: number) => ({ id, x, z, facing: 0, pose: 'sit' as const, deskId: 'd' });

describe('pickTarget', () => {
  it('picks the nearest free slot in range', () => {
    const t = pickTarget(0, 0, [slot('a', 1, 0), slot('b', 0.5, 0)], new Set(), []);
    expect(t).toMatchObject({ kind: 'slot', slot: { id: 'b' } });
  });
  it('skips taken slots', () => {
    const t = pickTarget(0, 0, [slot('a', 1, 0), slot('b', 0.5, 0)], new Set(['b']), []);
    expect(t).toMatchObject({ kind: 'slot', slot: { id: 'a' } });
  });
  it('prefers a closer player over a slot', () => {
    const t = pickTarget(0, 0, [slot('a', 1, 0)], new Set(), [{ id: 'p', x: 0, z: 0.4 }]);
    expect(t).toMatchObject({ kind: 'player', id: 'p' });
  });
  it('returns null when nothing is in range', () => {
    expect(pickTarget(0, 0, [slot('a', 5, 0)], new Set(), [{ id: 'p', x: 0, z: 3 }])).toBeNull();
  });
});
