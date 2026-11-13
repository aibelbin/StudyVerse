import { describe, expect, it } from 'vitest';
import { Undo, blank, floodFill, hexToRgba, line, stamp } from './paintCore';

const BLACK = hexToRgba('#000000');
const RED = hexToRgba('#ff0000');
const px = (d: Uint8ClampedArray, n: number, x: number, y: number) => Array.from(d.slice((y * n + x) * 4, (y * n + x) * 4 + 4));
const count = (d: Uint8ClampedArray, rgba: number[]) => {
  let c = 0;
  for (let i = 0; i < d.length; i += 4) if (rgba.every((v, k) => d[i + k] === v)) c++;
  return c;
};

describe('paintCore', () => {
  it('blank is white and opaque', () => {
    const d = blank(4);
    expect(d.length).toBe(64);
    expect(px(d, 4, 3, 3)).toEqual([255, 255, 255, 255]);
  });

  it('stamp radius 0 paints exactly one pixel', () => {
    const d = blank(8);
    stamp(d, 8, 3, 4, 0, BLACK);
    expect(count(d, BLACK)).toBe(1);
    expect(px(d, 8, 3, 4)).toEqual(BLACK);
  });

  it('line connects diagonal endpoints without gaps', () => {
    const d = blank(8);
    line(d, 8, 0, 0, 7, 7, 0, BLACK);
    for (let i = 0; i < 8; i++) expect(px(d, 8, i, i)).toEqual(BLACK);
    expect(count(d, BLACK)).toBe(8);
  });

  it('flood fill stops at a border and ignores same colour', () => {
    const n = 6;
    const d = blank(n);
    line(d, n, 3, 0, 3, 5, 0, BLACK);
    floodFill(d, n, 0, 0, RED);
    expect(count(d, RED)).toBe(18);
    expect(px(d, n, 4, 0)).toEqual([255, 255, 255, 255]);
    const before = d.slice();
    floodFill(d, n, 0, 0, RED);
    expect(d).toEqual(before);
  });

  it('undo caps at 20 and pops in order', () => {
    const u = new Undo();
    for (let i = 0; i < 25; i++) u.push(Uint8ClampedArray.of(i));
    expect(u.size).toBe(20);
    expect(u.pop()![0]).toBe(24);
    expect(u.pop()![0]).toBe(23);
    expect(u.size).toBe(18);
  });
});
