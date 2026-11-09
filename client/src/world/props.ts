import * as THREE from 'three';
import type { Prop } from '../../../shared/scenes/types';
import type { PropPose } from '../drive/physics';
import { mat, mesh } from './materials';
import { PALETTE as P } from './palette';

const RESET_MS = 20_000;
const GRAVITY = 9.81;

interface Item {
  prop: Prop;
  obj: THREE.Group;
  /** Scripted flight for people who aren't driving: velocity, spin axis and rate. */
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  flying: boolean;
  movedAt: number;
  displaced: boolean;
  popAt: number;
}

function cone(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.44, 0.05, 0.44), mat('#ff7a45'), 0, 0.025, 0));
  g.add(mesh(new THREE.ConeGeometry(0.19, 0.55, 14), mat('#ff8a50'), 0, 0.32, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.115, 0.14, 0.09, 14), mat('#fff6ea'), 0, 0.3, 0, false));
  return g;
}

function crate(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), mat(P.wood), 0, 0.35, 0));
  for (const y of [0.12, 0.58]) g.add(mesh(new THREE.BoxGeometry(0.72, 0.08, 0.72), mat(P.trunk), 0, y, 0, false));
  return g;
}

/**
 * Cones and crates in the car parks. The driver feeds in real physics poses; everyone else gets
 * a cheap scripted tumble when a truck barrels through. Either way they wander home after 20 s.
 */
export class PropsView {
  readonly root = new THREE.Group();
  private items: Item[];

  constructor(props: Prop[]) {
    this.items = props.map((prop) => {
      const obj = prop.kind === 'cone' ? cone() : crate();
      this.root.add(obj);
      return { prop, obj, vel: new THREE.Vector3(), spin: new THREE.Vector3(), flying: false, movedAt: 0, displaced: false, popAt: 0 };
    });
    for (const it of this.items) this.home(it);
  }

  /** Driver mode: copy the physics world's poses. Homecoming is handled by the physics world. */
  applyPhysics(poses: PropPose[], now: number): void {
    for (const p of poses) {
      const it = this.items.find((i) => i.prop.id === p.id);
      if (!it) continue;
      const y = p.y - (it.prop.kind === 'cone' ? 0.3 : 0.35); // bodies are centred, meshes sit on their base
      const moved = it.obj.position.distanceToSquared(new THREE.Vector3(p.x, y, p.z)) > 1e-5;
      it.obj.position.set(p.x, y, p.z);
      it.obj.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
      if (moved) it.movedAt = now;
      it.displaced = Math.hypot(p.x - it.prop.x, p.z - it.prop.z) > 0.3;
      it.flying = false;
    }
  }

  /** Physics hands back to the script: everything goes straight home so both modes agree. */
  resetAll(): void {
    for (const it of this.items) this.home(it);
  }

  /** Watcher mode: trucks passing within 1.1 m at more than 2 m/s fling props along their path. */
  update(now: number, dt: number, trucks: { x: number; z: number; heading: number; speed: number }[]): void {
    for (const it of this.items) {
      if (!it.flying) {
        for (const t of trucks) {
          if (t.speed < 2 || Math.hypot(t.x - it.obj.position.x, t.z - it.obj.position.z) > 1.1 + 0.8) continue;
          const k = Math.min(t.speed, 8) * 0.7;
          it.vel.set(Math.sin(t.heading) * k + (Math.random() - 0.5), 1.5 + Math.random() * 1.5, Math.cos(t.heading) * k + (Math.random() - 0.5));
          it.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(4 + t.speed);
          it.flying = true;
          it.displaced = true;
          it.movedAt = now;
          break;
        }
      }
      if (it.flying) {
        it.vel.y -= GRAVITY * dt;
        it.obj.position.addScaledVector(it.vel, dt);
        const q = new THREE.Quaternion().setFromAxisAngle(it.spin.clone().normalize(), it.spin.length() * dt);
        it.obj.quaternion.premultiply(q);
        if (it.obj.position.y <= 0) {
          it.obj.position.y = 0;
          it.vel.y = -it.vel.y * 0.3;
          it.vel.x *= 0.6;
          it.vel.z *= 0.6;
          it.spin.multiplyScalar(0.5);
          if (Math.hypot(it.vel.x, it.vel.y, it.vel.z) < 0.6) {
            it.flying = false;
            this.lieDown(it);
          }
        }
        it.movedAt = now;
      }
      if (it.displaced && now - it.movedAt > RESET_MS) {
        this.home(it);
        it.popAt = now;
      }
      const pop = (now - it.popAt) / 300;
      it.obj.scale.setScalar(pop < 1 ? 0.6 + 0.4 * Math.sin(pop * Math.PI * 0.5) + 0.12 * Math.sin(pop * Math.PI) : 1);
    }
  }

  /** Rests a tumbled prop on its side (cones) or a face (crates) at its current heading. */
  private lieDown(it: Item): void {
    const yaw = new THREE.Euler().setFromQuaternion(it.obj.quaternion, 'YXZ').y;
    it.obj.quaternion.setFromEuler(new THREE.Euler(it.prop.kind === 'cone' ? Math.PI / 2 : 0, yaw, 0, 'YXZ'));
    it.obj.position.y = it.prop.kind === 'cone' ? 0.2 : 0;
  }

  private home(it: Item): void {
    it.obj.position.set(it.prop.x, 0, it.prop.z);
    it.obj.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.prop.rot);
    it.vel.set(0, 0, 0);
    it.flying = false;
    it.displaced = false;
  }
}
