import { describe, expect, it } from 'vitest';
import { catmullLoop, hash, noise1 } from './math';

describe('catmullLoop', () => {
  const pts: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  it('passes through its control points', () => {
    pts.forEach(([x, z], i) => {
      const p = catmullLoop(pts, i / pts.length);
      expect(p.x).toBeCloseTo(x);
      expect(p.z).toBeCloseTo(z);
    });
  });
  it('closes the loop', () => {
    const a = catmullLoop(pts, 0);
    const b = catmullLoop(pts, 1);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.z).toBeCloseTo(a.z);
  });
  it('heads along the path', () => {
    expect(catmullLoop(pts, 0.125).heading).toBeCloseTo(Math.PI / 2, 0); // moving +x
  });
});

describe('noise1 and hash', () => {
  it('stays in range and moves smoothly', () => {
    let prev = noise1(3, 0);
    for (let t = 0.01; t < 20; t += 0.01) {
      const v = noise1(3, t);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.05);
      prev = v;
    }
  });
  it('hash is deterministic and in [0, 1)', () => {
    expect(hash(1, 2, 3)).toBe(hash(1, 2, 3));
    expect(hash(1, 2, 3)).not.toBe(hash(1, 2, 4));
    for (let i = 0; i < 100; i++) {
      const h = hash(i, 7);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});
