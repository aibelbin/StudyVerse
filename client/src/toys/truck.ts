import * as THREE from 'three';
import type { Toy } from '../../../shared/scenes/types';
import { angleDelta, boatPoseAt, type BoatPose } from '../../../shared/toys';
import { glow, mat, mesh } from '../world/materials';
import { PALETTE as P } from '../world/palette';
import { Floaters } from './floaters';
import type { ToyFx, ToyView } from './registry';

export interface VehicleView extends ToyView {
  /** The local driver steers directly; null hands control back to the server state. */
  setLocal(p: BoatPose | null, speed?: number): void;
}

const WHEEL_R = 0.3;

/** A cute rounded pickup: wheels that spin and steer, dust when it's moving fast, glowing headlights. */
export function truckView(toy: Toy, fx: ToyFx): VehicleView {
  const rest: BoatPose = { x: toy.x, z: toy.z, heading: toy.rot ?? 0 };
  const root = new THREE.Group();
  const body = new THREE.Group();
  const paint = mat(['#ff9e7a', '#7ab8ff'][toy.id.endsWith('2') ? 1 : 0], 0.6);
  body.add(mesh(new THREE.BoxGeometry(1.55, 0.45, 3.1), paint, 0, 0.6, 0));
  // Open-top, so you can see who's driving: a rounded hood, a windscreen and a little seat.
  body.add(mesh(new THREE.BoxGeometry(1.45, 0.28, 0.85), paint, 0, 0.96, 1.1));
  body.add(mesh(new THREE.BoxGeometry(1.4, 0.42, 0.05), glow('#cfeaff', 0.25), 0, 1.25, 0.68, false));
  body.add(mesh(new THREE.BoxGeometry(1.46, 0.05, 0.08), mat('#fff6ea'), 0, 1.47, 0.68));
  body.add(mesh(new THREE.BoxGeometry(1.3, 0.12, 0.5), mat('#fff6ea'), 0, 0.88, 0.25));
  body.add(mesh(new THREE.BoxGeometry(1.3, 0.4, 0.1), mat('#fff6ea'), 0, 1.05, 0.0));
  const wheel = mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 16), mat('#3b3346'), -0.32, 1.12, 0.56);
  wheel.rotation.x = -0.6;
  body.add(wheel);
  for (const x of [-0.74, 0.74]) body.add(mesh(new THREE.BoxGeometry(0.05, 0.35, 1.5), paint, x, 0.98, -0.75));
  body.add(mesh(new THREE.BoxGeometry(1.53, 0.35, 0.05), paint, 0, 0.98, -1.52));
  body.add(mesh(new THREE.BoxGeometry(1.42, 0.04, 1.45), mat(P.wood), 0, 0.84, -0.75, false));
  for (const x of [-0.5, 0.5]) body.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), glow('#fff6c8', 1.4, 'headlight'), x, 0.68, 1.56, false));
  for (const x of [-0.6, 0.6]) body.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 0.04), glow('#ff6b6b', 0.8), x, 0.7, -1.56, false));
  root.add(body);
  const beams = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 4).translate(0, 2, 0),
    new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beams.rotation.x = -Math.PI / 2;
  beams.position.set(0, 0.03, 1.6);
  root.add(beams);
  const wheels: { g: THREE.Group; tire: THREE.Mesh; front: boolean }[] = [];
  for (const [x, z] of [[-0.78, 1.0], [0.78, 1.0], [-0.78, -1.0], [0.78, -1.0]]) {
    const g = new THREE.Group();
    g.position.set(x, WHEEL_R, z);
    const tire = mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 16), mat('#3b3346'), 0, 0, 0);
    tire.rotation.z = Math.PI / 2;
    tire.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.27, 10), mat(P.metal), 0, 0, 0, false));
    g.add(tire);
    root.add(g);
    wheels.push({ g, tire, front: z > 0 });
  }
  const cur: BoatPose = { ...rest };
  let local: BoatPose | null = null;
  let speed = 0;
  let steer = 0;
  let roll = 0;
  let lastDust = 0;
  return {
    root,
    setLocal(p, s = 0) {
      local = p ? { ...p } : null;
      if (p) speed = s;
    },
    update(ctx) {
      const st = ctx.state;
      const target = local ?? (st?.kind === 'truck' ? boatPoseAt(st, rest, ctx.now) : rest);
      const k = local ? 1 : 1 - Math.exp(-ctx.dt * 10);
      const px = cur.x;
      const pz = cur.z;
      const ph = cur.heading;
      cur.x += (target.x - cur.x) * k;
      cur.z += (target.z - cur.z) * k;
      cur.heading += angleDelta(cur.heading, target.heading) * k;
      const moved = Math.hypot(cur.x - px, cur.z - pz);
      if (!local) speed += (moved / Math.max(ctx.dt, 1e-3) - speed) * 0.25;
      const turn = angleDelta(ph, cur.heading) / Math.max(ctx.dt, 1e-3);
      steer += (Math.max(-0.5, Math.min(0.5, turn * 0.25)) - steer) * 0.2;
      roll += moved / WHEEL_R;
      root.position.set(cur.x, 0, cur.z);
      root.rotation.y = cur.heading;
      body.position.y = Math.sin(ctx.now / 90) * 0.01 * Math.min(1, speed / 3);
      body.rotation.z = -steer * 0.08 * Math.min(1, speed / 4);
      for (const w of wheels) {
        w.tire.rotation.x = roll;
        w.g.rotation.y = w.front ? steer : 0;
      }
      (beams.material as THREE.MeshBasicMaterial).opacity = 0.18 * ctx.night;
      if (speed > 3 && ctx.now - lastDust > 90) {
        lastDust = ctx.now;
        {
          const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshLambertMaterial({ color: '#e8d8b8', transparent: true, opacity: 0.6 }));
          const bx = cur.x - Math.sin(cur.heading) * 1.4 + (Math.random() - 0.5) * 1.2;
          const bz = cur.z - Math.cos(cur.heading) * 1.4 + (Math.random() - 0.5) * 0.4;
          dust.add(puff, ctx.now, 700, (o, kk) => {
            o.position.set(bx, 0.15 + kk * 0.5, bz);
            o.scale.setScalar(1 + kk * 2);
            ((o as THREE.Mesh).material as THREE.MeshLambertMaterial).opacity = 0.6 * (1 - kk);
          });
        }
      }
      dust.update(ctx.now);
    },
    pose: () => ({ ...cur }),
    riderOffset: (slot) => ({ dx: 0, dy: (slot.pose === 'drive' ? 0.72 : 0.86) - 0.45 + body.position.y, dz: 0 }),
    onEvent(e) {
      if (e.action !== 'honk') return;
      fx.sound('honk', cur.x, cur.z);
      fx.say(e.by, '📯 beep beep!');
    },
  };
}

/** Dust lives in world space (not on the truck), so it hangs in the air behind it. */
const dustRoot = new THREE.Group();
const dust = new Floaters(dustRoot);
export const truckDustRoot = dustRoot;
