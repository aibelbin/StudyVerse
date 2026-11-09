import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { GOLF_MAX_SPEED } from '../../../shared/constants';
import { inBox } from '../../../shared/geometry';
import { BALL_R, CUP_R, FELT, windmillAngle, type Hole, type Piece } from '../../../shared/golf';

type R = typeof RAPIER_NS;
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const STEP = 1 / 120;
const REST_SPEED = 0.06;
const REST_FOR = 0.3;
const HOLE_SPEED = 1.0;
const MIN_DRAG_PX = 8;
const FULL_DRAG_PX = 160;

/** A drag on screen (its world direction and its length in pixels) as a putt: the ball goes the other way. */
export function aimFromDrag(worldDx: number, worldDz: number, pixels: number): { dirX: number; dirZ: number; power: number } | null {
  const len = Math.hypot(worldDx, worldDz);
  if (pixels < MIN_DRAG_PX || len < 1e-6) return null;
  return { dirX: -worldDx / len, dirZ: -worldDz / len, power: Math.min(1, pixels / FULL_DRAG_PX) };
}

/** In the cup: over it, at its height, and slow enough to drop. */
export function cupCheck(ball: Vec3, speed: number, cup: Vec3): boolean {
  return Math.hypot(ball.x - cup.x, ball.z - cup.z) < CUP_R && Math.abs(ball.y - (cup.y + BALL_R)) < 0.15 && speed < HOLE_SPEED;
}

/** True once the speed has stayed under REST_SPEED for REST_FOR seconds. */
export class RestDetector {
  private still = 0;
  update(speed: number, dt: number): boolean {
    this.still = speed < REST_SPEED ? this.still + dt : 0;
    return this.still >= REST_FOR;
  }
  reset(): void {
    this.still = 0;
  }
}

export type SimEvent = 'rest' | 'penalty' | 'holed';

const quatX = (a: number) => ({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) });
const quatZ = (a: number) => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });

/** The loop as a ribbon (with low side rails) for a ball travelling along −x. */
export function loopMesh(p: Extract<Piece, { kind: 'loop' }>, n = 64): { vertices: Float32Array; indices: Uint32Array } {
  const v: number[] = [];
  const idx: number[] = [];
  const rail = 0.14;
  for (let i = 0; i <= n; i++) {
    const phi = (i / n) * Math.PI * 2;
    const cx = p.x - p.r * Math.sin(phi);
    const cy = FELT + p.r * (1 - Math.cos(phi));
    const cz = p.z + p.offset * (i / n);
    const ix = Math.sin(phi);
    const iy = Math.cos(phi); // towards the loop's middle
    const w = p.width / 2;
    v.push(cx + ix * rail, cy + iy * rail, cz - w, cx, cy, cz - w, cx, cy, cz + w, cx + ix * rail, cy + iy * rail, cz + w);
    if (i === 0) continue;
    const a = (i - 1) * 4;
    const b = i * 4;
    for (let k = 0; k < 3; k++) idx.push(a + k, b + k, b + k + 1, a + k, b + k + 1, a + k + 1);
  }
  return { vertices: new Float32Array(v), indices: new Uint32Array(idx) };
}

/** The volcano's outline as points for a convex hull. */
export function volcanoPoints(p: Extract<Piece, { kind: 'volcano' }>, n = 20): Float32Array {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(p.x + Math.cos(a) * p.r0, FELT - 0.01, p.z + Math.sin(a) * p.r0);
    out.push(p.x + Math.cos(a) * p.r1, FELT + p.h, p.z + Math.sin(a) * p.r1);
  }
  return new Float32Array(out);
}

/**
 * One hole's physics on your own machine: the course as colliders, your ball, putts, and the
 * windmill turning from server time. step() reports when the ball comes to rest, falls out or drops in.
 */
export class GolfSim {
  private world: RAPIER_NS.World;
  private ball: RAPIER_NS.RigidBody;
  private blades: { body: RAPIER_NS.RigidBody; x: number; y: number; z: number } | null = null;
  private acc = 0;
  private prev: Vec3;
  private rest = new RestDetector();
  moving = false;

  constructor(R: R, private hole: Hole, start: Vec3) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    const fixed = (desc: RAPIER_NS.ColliderDesc, friction = 0.7, restitution = 0.3) => {
      this.world.createCollider(desc.setFriction(friction).setRestitution(restitution));
    };
    for (const p of hole.pieces) {
      if (p.kind === 'floor') {
        const y0 = p.y ?? FELT;
        const rise = p.rise ?? 0;
        const angle = Math.atan2(rise, p.w);
        const len = Math.hypot(p.w, rise);
        const t = 0.2;
        fixed(R.ColliderDesc.cuboid(len / 2, t / 2, p.d / 2)
          .setTranslation(p.x, y0 + rise / 2 - (t / 2) / Math.cos(angle), p.z)
          .setRotation(quatZ(angle)), 0.9, 0.1);
      } else if (p.kind === 'wall') {
        const y0 = p.y0 ?? 0;
        fixed(R.ColliderDesc.cuboid(p.w / 2, (p.h - y0) / 2, p.d / 2).setTranslation(p.x, (y0 + p.h) / 2, p.z), 0.2, 0.75);
      } else if (p.kind === 'loop') {
        const m = loopMesh(p);
        // Smooth contacts across triangle edges, and keep the ball's own grip out of it so it keeps its speed round the loop.
        fixed(R.ColliderDesc.trimesh(m.vertices, m.indices, R.TriMeshFlags.FIX_INTERNAL_EDGES)
          .setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitutionCombineRule(R.CoefficientCombineRule.Min), 0.02, 0);
      } else if (p.kind === 'volcano') {
        const hull = R.ColliderDesc.convexHull(volcanoPoints(p));
        if (hull) fixed(hull, 0.9, 0.1);
      } else if (p.kind === 'windmill') {
        const body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.bladeX, p.hubY, p.z));
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const r = p.bladeLen / 2;
          this.world.createCollider(
            R.ColliderDesc.cuboid(0.08, p.bladeLen / 2, 0.13).setTranslation(0, Math.cos(a) * r, Math.sin(a) * r).setRotation(quatX(-a)).setRestitution(0.5),
            body,
          );
        }
        this.blades = { body, x: p.bladeX, y: p.hubY, z: p.z };
      }
    }
    this.ball = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setLinearDamping(0.2).setAngularDamping(0.35).setCcdEnabled(true).setCanSleep(false),
    );
    this.world.createCollider(R.ColliderDesc.ball(BALL_R).setMass(0.05).setFriction(0.6).setRestitution(0.45), this.ball);
    this.prev = { ...start };
  }

  /** A putt at power 0..1 towards (dirX, dirZ). */
  putt(dirX: number, dirZ: number, power: number): void {
    const s = Math.max(0, Math.min(1, power)) * GOLF_MAX_SPEED;
    this.ball.setLinvel({ x: dirX * s, y: 0, z: dirZ * s }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.moving = true;
    this.rest.reset();
  }

  /** Puts the ball back (after a penalty) at rest. */
  resetTo(p: Vec3): void {
    this.ball.setTranslation(p, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prev = { ...p };
    this.moving = false;
    this.rest.reset();
  }

  /** Advances by dt seconds; returns what happened to a moving ball, if anything. */
  step(dt: number, serverNow: number): SimEvent | null {
    this.acc = Math.min(this.acc + dt, STEP * 12);
    let event: SimEvent | null = null;
    let t = serverNow - this.acc * 1000;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      t += STEP * 1000;
      if (this.blades) this.blades.body.setNextKinematicRotation(quatX(windmillAngle(t)));
      const p = this.ball.translation();
      this.prev = { x: p.x, y: p.y, z: p.z };
      this.world.step();
      if (!this.moving || event) continue;
      const b = this.ball.translation();
      const v = this.ball.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (b.y < -0.15 || !inBox(this.hole.bounds, b.x, b.z)) event = 'penalty';
      else if (cupCheck(b, speed, this.hole.cup)) event = 'holed';
      else if (this.rest.update(speed, STEP)) event = 'rest';
      if (event) this.moving = false;
    }
    return event;
  }

  /** The ball for drawing: blended between the last two steps. */
  ballPos(): Vec3 {
    const a = Math.max(0, Math.min(1, this.acc / STEP));
    const c = this.ball.translation();
    return { x: this.prev.x + (c.x - this.prev.x) * a, y: this.prev.y + (c.y - this.prev.y) * a, z: this.prev.z + (c.z - this.prev.z) * a };
  }

  speed(): number {
    const v = this.ball.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  dispose(): void {
    this.world.free();
  }
}
