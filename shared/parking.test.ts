import { describe, expect, it } from 'vitest';
import { freeBay, inBay } from './parking';

const bays = [
  { id: 'a', x: 0, z: 0, rot: 0 },
  { id: 'b', x: 3.2, z: 0, rot: 0 },
  { id: 'c', x: 6.4, z: 0, rot: 0 },
];

describe('parking', () => {
  it('counts a truck as parked when it is close and lined up either way round', () => {
    expect(inBay(bays[0], 0.5, 0.5, 0.2)).toBe(true);
    expect(inBay(bays[0], 0, 0, Math.PI - 0.2)).toBe(true);
    expect(inBay(bays[0], 0, 0, Math.PI / 2)).toBe(false);
    expect(inBay(bays[0], 1.5, 0, 0)).toBe(false);
  });

  it('picks the nearest empty bay', () => {
    expect(freeBay(bays, [], 7, 3)!.id).toBe('c');
    expect(freeBay(bays, [{ x: 6.2, z: 0.3 }], 7, 3)!.id).toBe('b');
    expect(freeBay(bays, bays, 7, 3)).toBeNull();
  });
});
