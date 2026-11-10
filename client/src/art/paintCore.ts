export const PALETTE = [
  '#ffffff', '#e8e4ea', '#9a93a3', '#2a2430',
  '#5a3d3a', '#8a5a44', '#d9a27a', '#f6d7b8',
  '#f4a6a6', '#e85d6f', '#b8404f', '#f7b985',
  '#f2d06b', '#fbe9a0', '#b9d99a', '#6fae6b',
  '#2f6b55', '#8fd3d0', '#6aa7d8', '#3f5fa8',
  '#c9b6ec', '#9372c9', '#f3b6dc', '#4a3a6a',
];

export function hexToRgba(hex: string): number[] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(255);
}

export function blank(n: number): Uint8ClampedArray {
  return new Uint8ClampedArray(n * n * 4).fill(255);
}

function put(data: Uint8ClampedArray, n: number, x: number, y: number, rgba: number[]) {
  if (x < 0 || y < 0 || x >= n || y >= n) return;
  data.set(rgba, (y * n + x) * 4);
}

export function stamp(data: Uint8ClampedArray, n: number, cx: number, cy: number, radius: number, rgba: number[]) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  if (radius <= 0) return put(data, n, cx, cy, rgba);
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      if (dx * dx + dy * dy <= radius * radius) put(data, n, cx + dx, cy + dy, rgba);
}

export function line(data: Uint8ClampedArray, n: number, x0: number, y0: number, x1: number, y1: number, radius: number, rgba: number[]) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    stamp(data, n, x0, y0, radius, rgba);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function floodFill(data: Uint8ClampedArray, n: number, x: number, y: number, rgba: number[]) {
  if (x < 0 || y < 0 || x >= n || y >= n) return;
  const at = (px: number, py: number) => (py * n + px) * 4;
  const t = Array.from(data.slice(at(x, y), at(x, y) + 4));
  if (t.every((v, i) => v === rgba[i])) return;
  const same = (i: number) => t.every((v, k) => data[i + k] === v);
  const stack = [x, y];
  while (stack.length) {
    const py = stack.pop()!, px = stack.pop()!;
    if (px < 0 || py < 0 || px >= n || py >= n || !same(at(px, py))) continue;
    data.set(rgba, at(px, py));
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
  }
}

export class Undo {
  private snaps: Uint8ClampedArray[] = [];
  push(data: Uint8ClampedArray) {
    this.snaps.push(data.slice());
    if (this.snaps.length > 20) this.snaps.shift();
  }
  pop(): Uint8ClampedArray | undefined {
    return this.snaps.pop();
  }
  get size(): number {
    return this.snaps.length;
  }
}
