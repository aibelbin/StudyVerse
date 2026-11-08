import { describe, expect, it } from 'vitest';
import { clampToBounds, dist, inBox, moveWithCollision, pointInPolygon, polygonToBoxes } from './geometry';

describe('inBox', () => {
  const b = { x: 0, z: 0, w: 2, d: 1 };
  it('is true at the centre and on the edge', () => {
    expect(inBox(b, 0, 0)).toBe(true);
    expect(inBox(b, 1, 0.5)).toBe(true);
  });
  it('is false outside, unless padded', () => {
    expect(inBox(b, 1.2, 0)).toBe(false);
    expect(inBox(b, 1.2, 0, 0.3)).toBe(true);
  });
});

describe('moveWithCollision', () => {
  const bounds = { w: 10, d: 10 };
  it('moves freely in open space', () => {
    expect(moveWithCollision(0, 0, 0.5, -0.25, 0.3, [], bounds)).toEqual({ x: 0.5, z: -0.25 });
  });
  it('stops at a wall on x but keeps sliding along z', () => {
    const wall = { x: 2, z: 0, w: 1, d: 10 };
    expect(moveWithCollision(1, 0, 0.5, 0.5, 0.3, [wall], bounds)).toEqual({ x: 1, z: 0.5 });
  });
  it('clamps to the scene bounds minus the radius', () => {
    expect(moveWithCollision(4.6, 0, 1, 0, 0.3, [], bounds)).toEqual({ x: 4.7, z: 0 });
  });
});

describe('clampToBounds and dist', () => {
  it('clamps both axes', () => {
    expect(clampToBounds(-9, 9, 0.5, { w: 10, d: 4 })).toEqual({ x: -4.5, z: 1.5 });
  });
  it('measures straight-line distance', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
  });
});

describe('polygons', () => {
  const sq: [number, number][] = [[0, 0], [4, 0], [4, 4], [0, 4]];
  it('pointInPolygon', () => {
    expect(pointInPolygon(sq, 2, 2)).toBe(true);
    expect(pointInPolygon(sq, 5, 2)).toBe(false);
    expect(pointInPolygon(sq, -0.1, 3)).toBe(false);
  });
  it('polygonToBoxes covers the inside with row runs', () => {
    const boxes = polygonToBoxes(sq, 1, []);
    expect(boxes).toHaveLength(4);
    expect(boxes.reduce((n, b) => n + b.w * b.d, 0)).toBeCloseTo(16);
    expect(boxes[0]).toEqual({ x: 2, z: 0.5, w: 4, d: 1 });
  });
  it('polygonToBoxes leaves keep-clear areas open', () => {
    const boxes = polygonToBoxes(sq, 1, [{ x: 0.5, z: 0.5, w: 0.5, d: 0.5 }]);
    expect(boxes.reduce((n, b) => n + b.w * b.d, 0)).toBeCloseTo(15);
    expect(boxes.some((b) => inBox(b, 0.5, 0.5))).toBe(false);
  });
});
