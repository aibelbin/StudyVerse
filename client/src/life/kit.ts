import * as THREE from 'three';
import type { LifeZone } from '../../../shared/scenes/types';
import { LIFE_RADIUS, type Critter } from './math';
import { toonMat } from '../world/materials';

export interface LifeCtx {
  /** Server time, ms: shared motion lines up across clients. */
  t: number;
  dt: number;
  focus: { x: number; z: number };
  me: { x: number; z: number };
  night: number;
}

export interface LifeSystem {
  root: THREE.Object3D;
  update(ctx: LifeCtx): void;
  feed?(x: number, z: number, t: number): void;
  /** Catchable ones, for the net. */
  critters?: Critter[];
}

/** Skip work for zones nobody can see. */
export const nearby = (z: LifeZone, ctx: LifeCtx) => Math.hypot(z.x - ctx.focus.x, z.z - ctx.focus.z) < LIFE_RADIUS + z.r;

/** An InstancedMesh with a convenient per-instance pose setter. */
export class Instances {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, shadow = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false; // instances roam; a stale bounding sphere would pop them out
    this.mesh.castShadow = shadow;
  }

  set(i: number, x: number, y: number, z: number, yaw = 0, scale = 1, pitch = 0, roll = 0): void {
    this.e.set(pitch, yaw, roll, 'YXZ');
    this.m.compose(this.p.set(x, y, z), this.q.setFromEuler(this.e), this.s.set(scale, scale, scale));
    this.mesh.setMatrixAt(i, this.m);
  }

  hide(i: number): void {
    this.set(i, 0, -50, 0, 0, 0.0001);
  }

  color(i: number, c: string): void {
    this.mesh.setColorAt(i, new THREE.Color(c));
  }

  commit(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export const lambert = (color: string) => toonMat({ color, flatShading: true });
