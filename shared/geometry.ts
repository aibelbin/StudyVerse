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
