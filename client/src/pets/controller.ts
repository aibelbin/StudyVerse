import type { Bounds, Box } from '../../../shared/geometry';
import { fallbackBrain, mlpForward, observe, PARAMS, petStep, type PetWorld } from '../../../shared/pets/brain';
import policy from '../../../shared/pets/policy.json';
import type { PetView } from '../../../shared/types';

const params: number[] | null = Array.isArray((policy as { params?: number[] }).params) && (policy as { params: number[] }).params.length === PARAMS
  ? (policy as { params: number[] }).params
  : null;

const THINK_MS = 100;
const SEND_MS = 125;

/**
 * Your own pet, simulated on your screen: the trained policy (or the fallback brain) picks a velocity
 * ten times a second, physics slides it around obstacles, and the pose goes to the server for others.
 */
export class LocalPet {
  readonly usingPolicy = params !== null;
  private w: PetWorld;
  private action: [number, number] = [0, 0];
  private lastThink = 0;
  private lastSend = 0;
  private lastOwner: { x: number; z: number } | null = null;
  facing = 0;
  anim: PetView['anim'] = 'idle';

  constructor(x: number, z: number, private send: (p: { x: number; z: number; facing: number; anim: PetView['anim'] }) => void) {
    this.w = { pet: { x, z, vx: 0, vz: 0 }, owner: { x, z, vx: 0, vz: 0, sitting: false }, boxes: [] };
  }

  get x(): number {
    return this.w.pet.x;
  }

  get z(): number {
    return this.w.pet.z;
  }

  /** Puts the pet somewhere (a new scene, or the server's spawn). */
  place(x: number, z: number): void {
    Object.assign(this.w.pet, { x, z, vx: 0, vz: 0 });
    this.lastOwner = null;
  }

  update(nowMs: number, dt: number, owner: { x: number; z: number; sitting: boolean }, colliders: Box[], bounds: Bounds): void {
    if (dt <= 0) return;
    const o = this.w.owner;
    if (this.lastOwner) {
      o.vx = (owner.x - this.lastOwner.x) / dt;
      o.vz = (owner.z - this.lastOwner.z) / dt;
    }
    this.lastOwner = { x: owner.x, z: owner.z };
    Object.assign(o, { x: owner.x, z: owner.z, sitting: owner.sitting });
    if (Math.hypot(o.x - this.w.pet.x, o.z - this.w.pet.z) > 18) this.place(o.x + 1, o.z + 0.5); // lost: hop back
    this.w.boxes = colliders.filter((b) => Math.abs(b.x - this.w.pet.x) < b.w / 2 + 2 && Math.abs(b.z - this.w.pet.z) < b.d / 2 + 2);
    if (nowMs - this.lastThink >= THINK_MS) {
      this.lastThink = nowMs;
      const obs = observe(this.w);
      this.action = params ? mlpForward(params, obs) : fallbackBrain(obs, nowMs / 1000);
    }
    petStep(this.w, this.action, Math.min(dt, 0.1), bounds);
    const speed = Math.hypot(this.w.pet.vx, this.w.pet.vz);
    if (speed > 0.3) this.facing = Math.atan2(this.w.pet.vx, this.w.pet.vz);
    this.anim = speed > 0.3 ? 'walk' : owner.sitting ? 'sit' : 'idle';
    if (nowMs - this.lastSend >= SEND_MS) {
      this.lastSend = nowMs;
      this.send({ x: this.w.pet.x, z: this.w.pet.z, facing: this.facing, anim: this.anim });
    }
  }
}
