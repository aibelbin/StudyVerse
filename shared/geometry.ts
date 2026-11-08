/** Axis-aligned box on the ground plane: centre (x, z), full width w (along x) and depth d (along z). */
export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Scene floor, centred on the origin. */
export interface Bounds {
  w: number;
  d: number;
}

export function inBox(b: Box, x: number, z: number, pad = 0): boolean {
  return Math.abs(x - b.x) <= b.w / 2 + pad && Math.abs(z - b.z) <= b.d / 2 + pad;
}

function blocked(x: number, z: number, r: number, colliders: Box[]): boolean {
  return colliders.some((b) => Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r);
}

export function clampToBounds(x: number, z: number, r: number, bounds: Bounds): { x: number; z: number } {
  const hx = bounds.w / 2 - r;
  const hz = bounds.d / 2 - r;
  return { x: Math.max(-hx, Math.min(hx, x)), z: Math.max(-hz, Math.min(hz, z)) };
}

/** Moves a circle of radius r, resolving each axis separately so it slides along walls. */
export function moveWithCollision(
  x: number,
  z: number,
  dx: number,
  dz: number,
  r: number,
  colliders: Box[],
  bounds: Bounds,
): { x: number; z: number } {
  let nx = x;
  let nz = z;
  if (dx !== 0 && !blocked(x + dx, nz, r, colliders)) nx = x + dx;
  if (dz !== 0 && !blocked(nx, z + dz, r, colliders)) nz = z + dz;
  return clampToBounds(nx, nz, r, bounds);
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** Even-odd test against a closed outline of [x, z] points. */
export function pointInPolygon(poly: [number, number][], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Collider boxes for a polygon: grid cells whose centre is inside, merged into runs per row. */
export function polygonToBoxes(poly: [number, number][], cell: number, keepClear: Box[]): Box[] {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const out: Box[] = [];
  const overlapsClear = (cx: number, cz: number) =>
    keepClear.some((b) => Math.abs(cx - b.x) < (b.w + cell) / 2 && Math.abs(cz - b.z) < (b.d + cell) / 2);
  for (let cz = z0 + cell / 2; cz < z1; cz += cell) {
    let start: number | null = null;
    let end = 0;
    for (let cx = x0 + cell / 2; cx < x1; cx += cell) {
      if (pointInPolygon(poly, cx, cz) && !overlapsClear(cx, cz)) {
        start ??= cx - cell / 2;
        end = cx + cell / 2;
      } else if (start !== null) {
        out.push({ x: (start + end) / 2, z: cz, w: end - start, d: cell });
        start = null;
      }
    }
    if (start !== null) out.push({ x: (start + end) / 2, z: cz, w: end - start, d: cell });
  }
  return out;
}
