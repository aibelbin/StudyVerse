import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { SceneDef } from '../../../shared/scenes/types';
import type { BoatPose } from '../../../shared/toys';

type R = typeof RAPIER_NS;

let loading: Promise<R> | null = null;

/** Loads the Rapier WASM once, on the first drive. */
export function loadRapier(): Promise<R> {
  loading ??= import('@dimforge/rapier3d-compat').then(async (m) => {
    const R = m.default;
    await R.init();
    return R;
  });
  return loading;
}

/**
 * folio-2025's vehicle numbers (sources/Game/Physics/PhysicsVehicle.js), with the wheel layout and
 * chassis sized to our little pickup. Physics forward is +x like folio's; our heading is +z, so the
 * chassis yaw is heading − π/2.
 */
export const TUNING = {
  steeringAmplitude: 0.5,
  engineForceAmplitude: 300,
  topSpeed: 5,
  brakeAmplitude: 35,
  idleBrake: 0.06,
  reverseBrake: 0.4,
  chassis: { half: [1.55, 0.35, 0.78] as const, mass: 2.5, centerOfMass: -0.5, friction: 0.4, damping: 0.1 },
  wheels: {
    forward: 1.0,
    side: 0.78,
    radius: 0.3,
    frictionSlip: 0.9,
    maxSuspensionForce: 150,
    maxSuspensionTravel: 2,
    sideFrictionStiffness: 3,
    suspensionCompression: 10,
    suspensionRelaxation: 2.7,
    suspensionStiffness: 20,
    suspensionRestLength: 0.88,
  },
};

const STEP = 1 / 60;
const PROP_RESET_S = 20;

export interface DriveInput {
  /** −1..1: W forward, S brake then reverse. */
  throttle: number;
  /** −1..1: positive turns left. */
  steer: number;
  brake: boolean;
}

export interface DrivePose extends BoatPose {
  /** Chassis height above its resting height. */
  y: number;
  /** Nose up is positive. */
  pitch: number;
  /** Right side down is positive. */
  roll: number;
  /** Signed speed along the truck, m/s. */
  speed: number;
}

export interface PropPose {
  id: string;
  x: number;
  y: number;
  z: number;
  q: { x: number; y: number; z: number; w: number };
}

interface PropBody {
  id: string;
  body: RAPIER_NS.RigidBody;
  home: { x: number; y: number; z: number; rot: number };
  movedAt: number;
}

const yawQuat = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

/** Rotates v by unit quaternion q. */
function rotate(q: { x: number; y: number; z: number; w: number }, v: [number, number, number]): [number, number, number] {
  const [vx, vy, vz] = v;
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  return [vx + q.w * tx + (q.y * tz - q.z * ty), vy + q.w * ty + (q.z * tx - q.x * tz), vz + q.w * tz + (q.x * ty - q.y * tx)];
}

/**
 * The driver's private physics world: our truck as a Rapier ray-cast vehicle, the scene's colliders
 * as walls, other trucks and walkers as kinematic blockers, and the knock-over props.
 */
export class DriveWorld {
  input: DriveInput = { throttle: 0, steer: 0, brake: false };
  private world: RAPIER_NS.World;
  private chassis: RAPIER_NS.RigidBody;
  private car: RAPIER_NS.DynamicRayCastVehicleController;
  private walkers: RAPIER_NS.RigidBody[] = [];
  private trucks = new Map<string, RAPIER_NS.RigidBody>();
  private propBodies: PropBody[] = [];
  private acc = 0;
  private time = 0;
  private restY = 0;
  private steer = 0;
  private tippedFor = 0;
  private stuck: [number, number][] = []; // [distance, seconds] while throttling
  private lastPos = { x: 0, z: 0 };

  constructor(private R: R, def: SceneDef, start: BoatPose) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    const fixed = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => {
      const b = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z));
      this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.6), b);
    };
    fixed(0, -0.5, 0, def.size.w / 2 + 10, 0.5, def.size.d / 2 + 10);
    for (const c of def.colliders) fixed(c.x, 1.5, c.z, c.w / 2, 1.5, c.d / 2);

    const C = TUNING.chassis;
    this.chassis = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(start.x, 1.4, start.z).setRotation(yawQuat(start.heading - Math.PI / 2))
        .setLinearDamping(C.damping).setAngularDamping(C.damping).setCanSleep(false),
    );
    this.world.createCollider(
      R.ColliderDesc.cuboid(...C.half).setTranslation(0, -0.1, 0).setFriction(C.friction).setRestitution(0)
        .setMassProperties(C.mass, { x: 0, y: C.centerOfMass, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0, w: 1 }),
      this.chassis,
    );
    this.car = this.world.createVehicleController(this.chassis);
    const W = TUNING.wheels;
    for (const [f, s] of [[W.forward, W.side], [W.forward, -W.side], [-W.forward, W.side], [-W.forward, -W.side]]) {
      this.car.addWheel({ x: f, y: 0, z: s }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, W.suspensionRestLength, W.radius);
    }
    for (let i = 0; i < 4; i++) {
      this.car.setWheelFrictionSlip(i, W.frictionSlip);
      this.car.setWheelMaxSuspensionForce(i, W.maxSuspensionForce);
      this.car.setWheelMaxSuspensionTravel(i, W.maxSuspensionTravel);
      this.car.setWheelSideFrictionStiffness(i, W.sideFrictionStiffness);
      this.car.setWheelSuspensionCompression(i, W.suspensionCompression);
      this.car.setWheelSuspensionRelaxation(i, W.suspensionRelaxation);
      this.car.setWheelSuspensionStiffness(i, W.suspensionStiffness);
    }

    for (const p of def.props ?? []) {
      const cone = p.kind === 'cone';
      const y = cone ? 0.3 : 0.35;
      const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, y, p.z).setRotation(yawQuat(p.rot)));
      const shape = cone ? R.ColliderDesc.cylinder(0.3, 0.22) : R.ColliderDesc.cuboid(0.35, 0.35, 0.35);
      this.world.createCollider(shape.setMass(cone ? 0.15 : 0.6).setFriction(0.7).setRestitution(0.2), body);
      this.propBodies.push({ id: p.id, body, home: { x: p.x, y, z: p.z, rot: p.rot }, movedAt: 0 });
    }

    // Let the suspension settle so we know the resting height before anyone sees it.
    for (let i = 0; i < 90; i++) this.tick();
    this.restY = this.chassis.translation().y;
    this.lastPos = { x: start.x, z: start.z };
  }

  /** Advances by dt seconds of real time in fixed 60 Hz steps, after moving the blockers. */
  step(dt: number, walkers: { x: number; z: number }[], trucks: { id: string; x: number; z: number; heading: number }[]): void {
    this.placeBlockers(walkers, trucks);
    this.acc = Math.min(this.acc + dt, STEP * 4);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.drive();
      this.tick();
      this.time += STEP;
      this.watchProps();
    }
    this.selfRight(dt);
  }

  pose(): DrivePose {
    const t = this.chassis.translation();
    const q = this.chassis.rotation();
    const fwd = rotate(q, [1, 0, 0]);
    const side = rotate(q, [0, 0, 1]);
    return {
      x: t.x,
      z: t.z,
      heading: Math.atan2(fwd[0], fwd[2]),
      y: t.y - this.restY,
      pitch: Math.asin(Math.max(-1, Math.min(1, fwd[1]))),
      roll: Math.asin(Math.max(-1, Math.min(1, side[1]))),
      speed: this.car.currentVehicleSpeed(),
    };
  }

  /** Puts the truck back on its wheels at a pose (server correction, or flipped over). */
  teleport(p: BoatPose): void {
    this.chassis.setTranslation({ x: p.x, y: this.restY + 0.3, z: p.z }, true);
    this.chassis.setRotation(yawQuat(p.heading - Math.PI / 2), true);
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.lastPos = { x: p.x, z: p.z };
    this.stuck = [];
    this.tippedFor = 0;
  }

  props(): PropPose[] {
    return this.propBodies.map(({ id, body }) => {
      const t = body.translation();
      const q = body.rotation();
      return { id, x: t.x, y: t.y, z: t.z, q: { x: q.x, y: q.y, z: q.z, w: q.w } };
    });
  }

  dispose(): void {
    this.world.free();
  }

  private tick(): void {
    this.car.updateVehicle(STEP);
    this.world.step();
  }

  /** folio's updatePrePhysics: engine force with a soft top speed, idle and reverse braking, steering. */
  private drive(): void {
    const T = TUNING;
    const { throttle, brake: braking } = this.input;
    this.steer += (this.input.steer - this.steer) * Math.min(1, STEP * 8);
    const speed = this.car.currentVehicleSpeed();
    const absSpeed = Math.abs(speed);
    const overflow = Math.max(0, absSpeed - T.topSpeed);
    let engine = (throttle * T.engineForceAmplitude) / (1 + overflow) * STEP;
    let brake = braking ? 1 : Math.abs(throttle) < 0.1 ? T.idleBrake : 0;
    if (absSpeed > 0.5 && ((throttle > 0 && speed < 0) || (throttle < 0 && speed > 0))) {
      brake = T.reverseBrake;
      engine = 0;
    }
    brake *= T.brakeAmplitude * STEP;
    this.car.setWheelSteering(0, this.steer * T.steeringAmplitude);
    this.car.setWheelSteering(1, this.steer * T.steeringAmplitude);
    for (let i = 0; i < 4; i++) {
      this.car.setWheelBrake(i, brake);
      this.car.setWheelEngineForce(i, engine);
    }
  }

  private placeBlockers(walkers: { x: number; z: number }[], trucks: { id: string; x: number; z: number; heading: number }[]): void {
    const R = this.R;
    while (this.walkers.length < walkers.length) {
      const b = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
      this.world.createCollider(R.ColliderDesc.capsule(0.4, 0.35).setRestitution(0).setFriction(0.2), b);
      this.walkers.push(b);
    }
    this.walkers.forEach((b, i) => {
      const w = walkers[i];
      b.setNextKinematicTranslation(w ? { x: w.x, y: 0.75, z: w.z } : { x: 0, y: -50, z: 0 });
    });
    for (const t of trucks) {
      let b = this.trucks.get(t.id);
      if (!b) {
        b = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(t.x, 0.7, t.z));
        this.world.createCollider(R.ColliderDesc.cuboid(0.75, 0.6, 1.5).setRestitution(0), b);
        this.trucks.set(t.id, b);
      }
      b.setNextKinematicTranslation({ x: t.x, y: 0.7, z: t.z });
      b.setNextKinematicRotation(yawQuat(t.heading));
    }
  }

  /** Knocked props go home 20 s after they last moved, if they're out of place. */
  private watchProps(): void {
    for (const p of this.propBodies) {
      const v = p.body.linvel();
      if (Math.hypot(v.x, v.y, v.z) > 0.05) p.movedAt = this.time;
      const t = p.body.translation();
      const up = rotate(p.body.rotation(), [0, 1, 0]);
      const away = Math.hypot(t.x - p.home.x, t.z - p.home.z) > 0.3 || up[1] < Math.cos(0.5);
      if (away && this.time - p.movedAt > PROP_RESET_S) {
        p.body.setTranslation(p.home, true);
        p.body.setRotation(yawQuat(p.home.rot), true);
        p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        p.movedAt = this.time;
      }
    }
  }

  /** folio's upsideDown and stuck checks: flipped for 1.5 s, or wedged for 3 s, and it rights itself. */
  private selfRight(dt: number): void {
    const p = this.pose();
    const up = rotate(this.chassis.rotation(), [0, 1, 0]);
    this.tippedFor = up[1] < 0.4 ? this.tippedFor + dt : 0;
    if (Math.abs(this.input.throttle) > 0.5) {
      this.stuck.push([Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z), dt]);
      let seconds = 0;
      let dist = 0;
      for (let i = this.stuck.length - 1; i >= 0 && seconds < 3; i--) {
        seconds += this.stuck[i][1];
        dist += this.stuck[i][0];
      }
      if (this.stuck.length > 400) this.stuck.splice(0, this.stuck.length - 400);
      if (seconds >= 3 && dist < 0.5 && up[1] < 0.9) this.teleport(p);
    } else this.stuck = [];
    this.lastPos = { x: p.x, z: p.z };
    if (this.tippedFor > 1.5) this.teleport(p);
  }
}
