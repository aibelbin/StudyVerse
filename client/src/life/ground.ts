import * as THREE from 'three';
import type { Decor, LifeZone } from '../../../shared/scenes/types';
import { Instances, lambert, nearby, type LifeCtx, type LifeSystem } from './kit';
import { hash } from './math';
import { toonMat } from '../world/materials';

/** Ladybugs and snails pottering in slow little circles. */
export function crawlers(zone: LifeZone, kind: 'ladybugs' | 'snails'): LifeSystem {
  const root = new THREE.Group();
  const n = zone.count;
  const snail = kind === 'snails';
  const shell = new Instances(
    snail ? new THREE.SphereGeometry(0.09, 8, 6) : new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    lambert(snail ? '#c98a5a' : '#ff6b6b'), n,
  );
  const body = new Instances(new THREE.BoxGeometry(0.06, 0.04, snail ? 0.22 : 0.05), lambert(snail ? '#d8c9a0' : '#3b3346'), n);
  root.add(shell.mesh, body.mesh);
  const speed = snail ? 0.04 : 0.15;
  return {
    root,
    update(ctx) {
      if (!nearby(zone, ctx)) return;
      for (let i = 0; i < n; i++) {
        const cx = zone.x + (hash(zone.seed, i, 1) - 0.5) * zone.r;
        const cz = zone.z + (hash(zone.seed, i, 2) - 0.5) * zone.r;
        const r = 0.5 + hash(zone.seed, i, 3);
        const a = (ctx.t / 1000) * (speed / r) + i;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        const yaw = -a; // tangent to the circle
        shell.set(i, x, snail ? 0.09 : 0.01, z, yaw);
        body.set(i, x + Math.sin(yaw) * 0.04, 0.02, z + Math.cos(yaw) * 0.04, yaw);
      }
      shell.commit();
      body.commit();
    },
  };
}

const PILE_LEAVES = 16;

/** Leaf piles that burst when you walk through them and settle back after a while. Local only. */
export function leafPiles(piles: Decor[]): LifeSystem {
  const root = new THREE.Group();
  const colors = ['#f2a65a', '#e8c35a', '#d9774a', '#c9603a'];
  const sets = piles.map((p, pi) => {
    const inst = new Instances(new THREE.PlaneGeometry(0.2, 0.15), toonMat({ side: THREE.DoubleSide }), PILE_LEAVES);
    inst.mesh.castShadow = true;
    for (let i = 0; i < PILE_LEAVES; i++) inst.color(i, colors[(i + pi) % colors.length]);
    root.add(inst.mesh);
    const rest = Array.from({ length: PILE_LEAVES }, (_, i) => {
      const a = hash(pi, i) * Math.PI * 2;
      const r = Math.sqrt(hash(pi, i, 2)) * 0.55;
      return { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, y: 0.04 + (0.55 - r) * 0.4, yaw: hash(pi, i, 3) * 6, a };
    });
    return { p, inst, rest, burstAt: -1e9 };
  });
  const BURST = 1200;
  const SETTLE = 10000;
  return {
    root,
    update(ctx: LifeCtx) {
      for (const s of sets) {
        if (Math.hypot(s.p.x - ctx.focus.x, s.p.z - ctx.focus.z) > 40) continue;
        const since = ctx.t - s.burstAt;
        if (since > SETTLE + 2000 && Math.hypot(ctx.me.x - s.p.x, ctx.me.z - s.p.z) < 0.8) s.burstAt = ctx.t;
        const age = ctx.t - s.burstAt;
        s.rest.forEach((l, i) => {
          let out = 0;
          let lift = 0;
          if (age < BURST) {
            out = age / BURST;
            lift = Math.sin(Math.PI * out) * (0.6 + hash(i, 9) * 0.6);
          } else if (age < SETTLE) out = 1;
          else if (age < SETTLE + 2000) out = 1 - (age - SETTLE) / 2000;
          const d = out * (1 + hash(i, 4) * 1.2);
          s.inst.set(i, l.x + Math.cos(l.a) * d, l.y * (1 - out) + 0.03 + lift, l.z + Math.sin(l.a) * d, l.yaw + out * 4, 1, -Math.PI / 2 + (lift ? Math.sin(age / 60 + i) : 0.2), 0);
        });
        s.inst.commit();
      }
    },
  };
}
