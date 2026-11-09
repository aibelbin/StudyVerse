export interface Pose {
  x: number;
  z: number;
  facing: number;
}

interface Sample extends Pose {
  t: number;
}

export const INTERP_DELAY_MS = 100;
export const SNAP_DIST = 2;
const IDLE_GAP_MS = 250;
const EASE_MS = 80;

export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** Smooths a remote player's position by drawing it slightly in the past, between received samples. */
export class Interp {
  private buf: Sample[] = [];
  private drawn: Pose | null = null;

  /** `snapDist`: a jump bigger than this (a teleport) skips the glide. Fast things need a bigger one. */
  constructor(private snapDist = SNAP_DIST) {}

  push(p: Pose, t: number): void {
    const pose = { x: p.x, z: p.z, facing: p.facing };
    if (this.drawn && Math.hypot(pose.x - this.drawn.x, pose.z - this.drawn.z) > this.snapDist) {
      this.buf = [];
      this.drawn = { ...pose };
    }
    const last = this.buf[this.buf.length - 1];
    if (last) t = Math.max(t, last.t); // a late packet must not move time backwards
    if (last && t - last.t > IDLE_GAP_MS) {
      // They stood still for a while: restamp the old pose just before this one so the first step eases in.
      this.buf = [{ ...last, t: t - EASE_MS }];
    }
    this.buf.push({ ...pose, t });
    if (this.buf.length > 20) this.buf.shift();
  }

  sample(now: number): Pose {
    const b = this.buf;
    if (b.length === 0) return this.drawn ?? { x: 0, z: 0, facing: 0 };
    const target = now - INTERP_DELAY_MS;
    while (b.length > 2 && b[1].t <= target) b.shift();
    let pose: Pose;
    if (b.length === 1 || target <= b[0].t) pose = b[0];
    else if (target >= b[b.length - 1].t) pose = b[b.length - 1];
    else {
      let i = 0;
      while (b[i + 1].t < target) i++;
      const a = b[i];
      const c = b[i + 1];
      const k = (target - a.t) / (c.t - a.t || 1);
      pose = { x: a.x + (c.x - a.x) * k, z: a.z + (c.z - a.z) * k, facing: lerpAngle(a.facing, c.facing, k) };
    }
    this.drawn = { x: pose.x, z: pose.z, facing: pose.facing };
    return this.drawn;
  }
}
