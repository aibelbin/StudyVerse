import type { Bounds, Box } from '../../../shared/geometry';
import { fallbackBrain, mlpForward, obstaclePush, observe, PARAMS, petStep, type PetWorld } from '../../../shared/pets/brain';
import policy from '../../../shared/pets/policy.json';
import type { PetKind, PetView } from '../../../shared/types';
import { PetMind, type MindOutput, type Poi } from './mind';

const params: number[] | null = Array.isArray((policy as { params?: number[] }).params) && (policy as { params: number[] }).params.length === PARAMS
  ? (policy as { params: number[] }).params
  : null;

const THINK_MS = 100;
const MIND_MS = 250;
const SEND_MS = 125;

export interface PetEnv {
  owner: { x: number; z: number; sitting: boolean; studying: boolean };
  colliders: Box[];
  bounds: Bounds;
  /** Interesting things and other players and pets nearby. */
  pois: Poi[];
  /** Somewhere to swim near the owner, if any (only swimmers use it). */
  water: { x: number; z: number } | null;
  isWater: (x: number, z: number) => boolean;
}

/**
 * Your own pet, simulated on your screen. Its mind decides what to do (follow, wander, sniff, play,
 * nap, its own tricks); following uses the trained policy, everything else steers to a target; physics
 * slides it around obstacles; the pose and what it's doing go to the server for everyone else.
 */
export class LocalPet {
  readonly usingPolicy = params !== null;
  private w: PetWorld;
  private mind: PetMind;
  private plan: MindOutput | null = null;
  private action: [number, number] = [0, 0];
  private lastThink = 0;
  private lastMind = 0;
  private lastSend = 0;
  private lastOwner: { x: number; z: number } | null = null;
  private ownerSpeed = 0;
  facing = 0;
  anim: PetView['anim'] = 'idle';

  constructor(kind: PetKind, x: number, z: number, private send: (p: { x: number; z: number; facing: number; anim: PetView['anim'] }) => void) {
    this.w = { pet: { x, z, vx: 0, vz: 0 }, owner: { x, z, vx: 0, vz: 0, sitting: false }, boxes: [] };
    this.mind = new PetMind(kind);
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

  update(nowMs: number, dt: number, env: PetEnv): void {
    if (dt <= 0) return;
    const o = this.w.owner;
    const owner = env.owner;
    if (this.lastOwner) {
      o.vx = (owner.x - this.lastOwner.x) / dt;
      o.vz = (owner.z - this.lastOwner.z) / dt;
      this.ownerSpeed += (Math.hypot(o.vx, o.vz) - this.ownerSpeed) * Math.min(1, dt * 6);
    }
    this.lastOwner = { x: owner.x, z: owner.z };
    Object.assign(o, { x: owner.x, z: owner.z, sitting: owner.sitting });
    if (Math.hypot(o.x - this.w.pet.x, o.z - this.w.pet.z) > 18) this.place(o.x + 1, o.z + 0.5); // lost: hop back
    const swims = this.mind.personality.swims;
    const near = (b: Box) => Math.abs(b.x - this.w.pet.x) < b.w / 2 + 2 && Math.abs(b.z - this.w.pet.z) < b.d / 2 + 2;
    // Swimmers may go into the water (the lake and pond are solid for everyone else).
    this.w.boxes = env.colliders.filter((b) => near(b) && !(swims && env.isWater(b.x, b.z)));
    if (!this.plan || nowMs - this.lastMind >= MIND_MS) {
      this.lastMind = nowMs;
      this.plan = this.mind.think({
        now: nowMs, pet: { x: this.w.pet.x, z: this.w.pet.z },
        owner: { x: owner.x, z: owner.z, speed: this.ownerSpeed, sitting: owner.sitting, studying: owner.studying },
        pois: env.pois, water: swims ? env.water : null,
      });
    }
    const plan = this.plan;
    if (nowMs - this.lastThink >= THINK_MS) {
      this.lastThink = nowMs;
      if (plan.follow) {
        const obs = observe(this.w);
        this.action = params ? mlpForward(params, obs) : fallbackBrain(obs, nowMs / 1000);
        const k = plan.speed;
        this.action = [this.action[0] * k, this.action[1] * k];
      } else if (plan.target) {
        const dx = plan.target.x - this.w.pet.x;
        const dz = plan.target.z - this.w.pet.z;
        const d = Math.hypot(dx, dz) || 1;
        const k = plan.speed * Math.min(1, d / 1.2); // ease in on arrival
        const [px, pz] = obstaclePush(this.w.pet.x, this.w.pet.z, this.w.boxes);
        this.action = [Math.max(-1, Math.min(1, (dx / d) * k + px * 0.8)), Math.max(-1, Math.min(1, (dz / d) * k + pz * 0.8))];
      } else {
        this.action = [0, 0];
      }
    }
    petStep(this.w, this.action, Math.min(dt, 0.1), env.bounds);
    const speed = Math.hypot(this.w.pet.vx, this.w.pet.vz);
    if (speed > 0.3) this.facing = Math.atan2(this.w.pet.vx, this.w.pet.vz);
    else if (plan.still === 'play' || plan.still === 'sniff') this.facing += Math.sin(nowMs / 400) * 0.01; // looks about
    const inWater = swims && env.isWater(this.w.pet.x, this.w.pet.z);
    this.anim = inWater ? 'swim' : speed > 0.3 ? plan.moving : plan.still;
    if (nowMs - this.lastSend >= SEND_MS) {
      this.lastSend = nowMs;
      this.send({ x: this.w.pet.x, z: this.w.pet.z, facing: this.facing, anim: this.anim });
    }
  }
}
