import { describe, expect, it } from 'vitest';
import { worldToMap } from './minimap';

describe('worldToMap', () => {
  const size = { w: 120, d: 90 };
  it('puts the centre of the world in the middle', () => {
    expect(worldToMap(0, 0, size, 200, 150)).toEqual({ u: 100, v: 75 });
  });
  it('maps the corners to the corners, north up', () => {
    expect(worldToMap(-60, -45, size, 200, 150)).toEqual({ u: 0, v: 0 });
    expect(worldToMap(60, 45, size, 200, 150)).toEqual({ u: 200, v: 150 });
  });
});
