import { describe, expect, it } from 'vitest';
import { pickTarget } from './interaction';

const seat = (id: string, x: number, z: number) => ({ id, x, z, facing: 0, deskId: 'd' });

describe('pickTarget', () => {
  it('picks the nearest free seat in range', () => {
    const t = pickTarget(0, 0, [seat('a', 1, 0), seat('b', 0.5, 0)], new Set(), []);
    expect(t).toMatchObject({ kind: 'seat', seat: { id: 'b' } });
  });
  it('skips taken seats', () => {
    const t = pickTarget(0, 0, [seat('a', 1, 0), seat('b', 0.5, 0)], new Set(['b']), []);
    expect(t).toMatchObject({ kind: 'seat', seat: { id: 'a' } });
  });
  it('prefers a closer player over a seat', () => {
    const t = pickTarget(0, 0, [seat('a', 1, 0)], new Set(), [{ id: 'p', x: 0, z: 0.4 }]);
    expect(t).toMatchObject({ kind: 'player', id: 'p' });
  });
  it('returns null when nothing is in range', () => {
    expect(pickTarget(0, 0, [seat('a', 5, 0)], new Set(), [{ id: 'p', x: 0, z: 3 }])).toBeNull();
  });
});
