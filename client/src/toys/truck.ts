import * as THREE from 'three';
import type { Toy } from '../../../shared/scenes/types';
import { angleDelta, boatPoseAt, type BoatPose, type Tilt } from '../../../shared/toys';
import { Interp } from '../net/interp';
import { glow, mat, mesh } from '../world/materials';
import { PALETTE as P } from '../world/palette';
import { Floaters } from './floaters';
import type { ToyFx, ToyView } from './registry';

export interface VehicleView extends ToyView {
  /** The local driver steers directly; null hands control back to the server state. */
  setLocal(p: BoatPose | null, speed?: number, tilt?: Tilt): void;
  /** Ground speed as rendered, m/s. */
  speedNow(): number;
}

const PAINT = ['#ff9e7a', '#7ab8ff', '#8fd694', '#ffd36e'];
const FLAT: Tilt = { y: 0, pitch: 0, roll: 0 };

const WHEEL_R = 0.3;
const JUMP = 6; // further than this in one go means it parked itself: poof, don't glide

/** A cute rounded pickup: wheels that spin and steer, dust when it's moving fast, glowing headlights. */
export function truckView(toy: Toy, fx: ToyFx): VehicleView {
  const rest: BoatPose = { x: toy.x, z: toy.z, heading: toy.rot ?? 0 };
  const root = new THREE.Group();
  const body = new THREE.Group();
  const paint = mat(PAINT[(Number(toy.id.match(/(\d+)$/)?.[1] ?? 1) - 1) % PAINT.length], 0.6);
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
    new THREE.PlaneGeometry(2.6, 5).translate(0, -2.5, 0), // after the -90° tilt, -y points forward (+z)
    new THREE.MeshBasicMaterial({ map: beamTexture(), color: '#fff3b0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
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
  let localTilt: Tilt = FLAT;
  const tilt: Tilt = { ...FLAT };
  let speed = 0;
  let seen = false;
  let steer = 0;
  let roll = 0;
  let lastDust = 0;
  // Someone else driving: their poses arrive every ~100 ms, so draw them slightly in the past and glide
  // between them (as for walking players), instead of chasing the newest one.
  let interp = new Interp(JUMP);
  let lastSt: unknown = null;
  return {
    root,
    setLocal(p, s = 0, t = FLAT) {
      if (!p && local) {
        // Handing back to the server: carry on from where we drew it, not from old samples.
        interp = new Interp(JUMP);
        interp.push({ x: cur.x, z: cur.z, facing: cur.heading }, performance.now());
      }
      local = p ? { ...p } : null;
      localTilt = t;
      if (p) speed = s;
    },
    speedNow: () => speed,
    update(ctx) {
      const st = ctx.state;
      let target: BoatPose = rest;
      if (local) target = local;
      else if (st?.kind === 'truck') {
        if (st !== lastSt) {
          lastSt = st;
          const p = boatPoseAt(st, rest, ctx.now);
          interp.push({ x: p.x, z: p.z, facing: p.heading }, performance.now());
        }
        const s = interp.sample(performance.now());
        target = { x: s.x, z: s.z, heading: s.facing };
      }
      const wantTilt = local ? localTilt : st?.kind === 'truck' && st.tilt ? st.tilt : FLAT;
      if (!local && Math.hypot(target.x - cur.x, target.z - cur.z) > JUMP) {
        // A big jump (it parked itself): poof here, poof there, no gliding through trees. The first
        // frame after arriving in town just places it.
        if (seen) {
          poof(cur.x, cur.z, ctx.now);
          poof(target.x, target.z, ctx.now);
        }
        Object.assign(cur, target);
      }
      seen = true;
      const k = local || st?.kind === 'truck' ? 1 : 1 - Math.exp(-ctx.dt * 10); // the buffer already glides
      const kt = local ? 1 : 1 - Math.exp(-ctx.dt * 12);
      tilt.y += (wantTilt.y - tilt.y) * kt;
      tilt.pitch += (wantTilt.pitch - tilt.pitch) * kt;
      tilt.roll += (wantTilt.roll - tilt.roll) * kt;
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
      // The body rides its springs; the wheels stay on the ground, which reads as suspension.
      body.position.y = Math.max(-0.25, Math.min(0.6, tilt.y));
      body.rotation.set(-tilt.pitch, 0, -tilt.roll);
      for (const w of wheels) {
        w.tire.rotation.x = roll;
        w.g.rotation.y = w.front ? steer : 0;
      }
      (beams.material as THREE.MeshBasicMaterial).opacity = 0.35 * ctx.night;
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

let beamTex: THREE.CanvasTexture | null = null;

/** A soft fan of light, brightest at the lamps and fading out ahead. */
function beamTexture(): THREE.CanvasTexture {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(22, 0);
  g.lineTo(42, 0);
  g.lineTo(64, 128);
  g.lineTo(0, 128);
  g.closePath();
  g.filter = 'blur(4px)';
  g.fill();
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}

/** A burst of dust puffs at (x, z). */
function poof(x: number, z: number, now: number): void {
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshLambertMaterial({ color: '#efe3cc', transparent: true, opacity: 0.8 }));
    dust.add(puff, now, 900, (o, k) => {
      o.position.set(x + Math.cos(a) * (0.6 + k * 1.6), 0.3 + k * 0.9, z + Math.sin(a) * (0.6 + k * 1.6));
      o.scale.setScalar(1 + k * 2.5);
      ((o as THREE.Mesh).material as THREE.MeshLambertMaterial).opacity = 0.8 * (1 - k);
    });
  }
}
export const truckDustRoot = dustRoot;
