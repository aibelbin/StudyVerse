import * as THREE from 'three';
import type { SceneDef, Toy } from '../../../shared/scenes/types';
import { angleDelta, boatPoseAt, type BoatPose } from '../../../shared/toys';
import { mat, mesh, toonMat } from '../world/materials';
import { PALETTE as P } from '../world/palette';
import { Floaters } from './floaters';
import type { ToyFx, ToyView } from './registry';

/** Unit vector from the toy towards the middle of the scene's water. */
function towardWater(toy: Toy, def: SceneDef): { x: number; z: number } {
  const o = def.water?.outline ?? [];
  const cx = o.reduce((a, p) => a + p[0], 0) / Math.max(o.length, 1);
  const cz = o.reduce((a, p) => a + p[1], 0) / Math.max(o.length, 1);
  const len = Math.hypot(cx - toy.x, cz - toy.z) || 1;
  return { x: (cx - toy.x) / len, z: (cz - toy.z) / len };
}

export function fountainView(toy: Toy, fx: ToyFx): ToyView {
  const root = new THREE.Group();
  const rim = mesh(new THREE.TorusGeometry(1.42, 0.14, 8, 32), mat('#d8d2e0'), 0, 0.42, 0);
  rim.rotation.x = Math.PI / 2;
  root.add(mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.4, 24), mat('#c9c2d4'), 0, 0.2, 0), rim);
  root.add(mesh(new THREE.CylinderGeometry(1.36, 1.36, 0.04, 24), toonMat({ color: P.water, roughness: 0.1 }), 0, 0.41, 0, false));
  root.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 10), mat('#d8d2e0'), 0, 0.9, 0));
  root.add(mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.18, 14), mat('#d8d2e0'), 0, 1.45, 0));
  const drops: THREE.Mesh[] = [];
  const dropMat = toonMat({ color: '#cfefff', transparent: true, opacity: 0.85, roughness: 0.1 });
  for (let i = 0; i < 14; i++) {
    const d = mesh(new THREE.SphereGeometry(0.05, 6, 4), dropMat, 0, 0, 0, false);
    d.userData.a = (i / 14) * Math.PI * 2;
    d.userData.off = (i * 0.37) % 1;
    drops.push(d);
    root.add(d);
  }
  const fl = new Floaters(root);
  return {
    root,
    update(ctx) {
      for (const d of drops) {
        const k = (ctx.now / 1100 + d.userData.off) % 1;
        const r = 0.15 + k * 0.85;
        d.position.set(Math.sin(d.userData.a) * r, 1.6 + k * 0.9 - k * k * 1.6, Math.cos(d.userData.a) * r);
      }
      fl.update(ctx.now);
    },
    onEvent(e, ctx) {
      const p = fx.playerPos(e.by);
      const lx = p ? Math.max(-1, Math.min(1, (p.x - toy.x) / 3)) : 0.5;
      const lz = p ? Math.max(-1, Math.min(1, (p.z - toy.z) / 3)) : 0.5;
      fl.ring(lx * 0.7, lz * 0.7, ctx.now, 500, 0.5);
      fl.text('✨', lx * 0.7, 0.8, lz * 0.7, ctx.now + 500);
      fx.sound('coin', toy.x, toy.z);
      setTimeout(() => fx.sound('splash', toy.x, toy.z), 450);
    },
  };
}

export function stonesView(toy: Toy, def: SceneDef, fx: ToyFx): ToyView {
  const root = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = mesh(new THREE.IcosahedronGeometry(0.07, 0), mat('#a9a3ad'), (i - 1.5) * 0.12, 0.22, 0.3 + (i % 2) * 0.08, false);
    s.scale.y = 0.5;
    root.add(s);
  }
  const dir = towardWater(toy, def);
  const fl = new Floaters(root);
  return {
    root,
    update(ctx) {
      fl.update(ctx.now);
    },
    onEvent(e, ctx) {
      const n = e.arg ?? 1;
      for (let i = 0; i < n; i++) {
        const d = 2 + i * 1.3;
        fl.ring(dir.x * d, dir.z * d, ctx.now, i * 280, 0.6 - i * 0.04);
        setTimeout(() => fx.sound('skip', toy.x + dir.x * d, toy.z + dir.z * d, i), i * 280);
      }
      fx.say(e.by, n === 7 ? '7 skips! 🤯' : `${n} skip${n === 1 ? '' : 's'}!`);
    },
  };
}

export function ducksView(toy: Toy, def: SceneDef, fx: ToyFx): ToyView {
  const root = new THREE.Group();
  root.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), mat(P.woodDark), 0, 0.45, 0));
  root.add(mesh(new THREE.BoxGeometry(0.5, 0.3, 0.04), mat(P.woodLight), 0, 0.9, 0));
  root.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), mat('#ffd36e'), 0, 0.92, 0.03, false));
  const dir = towardWater(toy, def);
  const fl = new Floaters(root);
  return {
    root,
    update(ctx) {
      fl.update(ctx.now);
    },
    onEvent(e, ctx) {
      const p = fx.playerPos(e.by) ?? { x: toy.x, z: toy.z };
      const tx = toy.x + dir.x * 3.5;
      const tz = toy.z + dir.z * 3.5;
      for (let i = 0; i < 5; i++) {
        const crumb = mesh(new THREE.SphereGeometry(0.05, 5, 4), mat('#f2c46d'), 0, 0, 0, false);
        const ex = tx + (Math.random() - 0.5) * 1.2 - toy.x;
        const ez = tz + (Math.random() - 0.5) * 1.2 - toy.z;
        const sx = p.x - toy.x;
        const sz = p.z - toy.z;
        fl.add(crumb, ctx.now + i * 60, 700, (o, k) => o.position.set(sx + (ex - sx) * k, 1.1 + k * 1.4 - k * k * 2.45, sz + (ez - sz) * k));
        fl.ring(ex, ez, ctx.now, 700 + i * 60, 0.35);
      }
      setTimeout(() => {
        fx.sound('plop', tx, tz);
        fx.feedDucks(tx, tz);
      }, 700);
      setTimeout(() => fx.sound('quack', tx, tz), 1600);
    },
  };
}

export interface RowboatView extends ToyView {
  /** The local rower steers the boat directly; null hands it back to the server state. */
  setLocal(p: BoatPose | null): void;
}

export function rowboatView(toy: Toy): RowboatView {
  const mooring: BoatPose = { x: toy.x, z: toy.z, heading: toy.rot ?? 0 };
  const root = new THREE.Group();
  const hull = new THREE.Group();
  hull.add(mesh(new THREE.BoxGeometry(0.9, 0.12, 1.7), mat('#f2b5a0'), 0, 0.06, 0));
  hull.add(mesh(new THREE.BoxGeometry(0.82, 0.02, 1.62), mat(P.woodLight), 0, 0.13, 0, false));
  for (const x of [-0.44, 0.44]) hull.add(mesh(new THREE.BoxGeometry(0.07, 0.3, 1.7), mat('#f2b5a0'), x, 0.17, 0));
  hull.add(mesh(new THREE.BoxGeometry(0.9, 0.3, 0.07), mat('#f2b5a0'), 0, 0.17, -0.84));
  const bow = mesh(new THREE.CylinderGeometry(0.0, 0.48, 0.6, 4, 1), mat('#f2b5a0'), 0, 0.12, 1.1);
  bow.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  bow.scale.set(1, 1, 0.62);
  hull.add(bow);
  for (const x of [-0.44, 0.44]) hull.add(mesh(new THREE.BoxGeometry(0.1, 0.04, 1.72), mat('#fff6ea'), x, 0.33, 0));
  for (const z of [0.3, -0.55]) hull.add(mesh(new THREE.BoxGeometry(0.85, 0.05, 0.25), mat(P.wood), 0, 0.24, z));
  const oars = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.48, 0.3, 0.2);
    const shaft = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6), mat(P.woodLight), s * 0.5, -0.1, 0);
    shaft.rotation.z = (s * Math.PI) / 2.6;
    g.add(shaft);
    hull.add(g);
    return g;
  });
  root.add(hull);
  const cur: BoatPose = { ...mooring };
  let local: BoatPose | null = null;
  let speed = 0;
  return {
    root,
    setLocal(p) {
      local = p ? { ...p } : null;
    },
    update(ctx) {
      const target = local ?? (ctx.state?.kind === 'rowboat' ? boatPoseAt(ctx.state, mooring, ctx.now) : mooring);
      const k = local ? 1 : 1 - Math.exp(-ctx.dt * 10);
      const px = cur.x;
      const pz = cur.z;
      cur.x += (target.x - cur.x) * k;
      cur.z += (target.z - cur.z) * k;
      cur.heading += angleDelta(cur.heading, target.heading) * k;
      speed += ((Math.hypot(cur.x - px, cur.z - pz) / Math.max(ctx.dt, 1e-3)) - speed) * 0.2;
      root.position.set(cur.x, Math.sin(ctx.now / 700) * 0.025, cur.z);
      root.rotation.y = cur.heading;
      hull.rotation.z = Math.sin(ctx.now / 900) * 0.03;
      const stroke = speed > 0.2 ? Math.sin(ctx.now / 180) : 0;
      oars.forEach((o, i) => (o.rotation.y = (i ? -1 : 1) * stroke * 0.5));
    },
    pose: () => ({ ...cur }),
    riderOffset: () => ({ dx: 0, dy: 0.27 - 0.45 + root.position.y, dz: 0 }),
  };
}
