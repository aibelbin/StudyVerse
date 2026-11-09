import * as THREE from 'three';
import { pointInPolygon } from '../../../shared/geometry';
import type { LifeZone, SceneDef } from '../../../shared/scenes/types';
import { PALETTE as P } from '../world/palette';
import { Instances, lambert, nearby, type LifeSystem } from './kit';
import { hash, noise1 } from './math';

/** Butterflies (flapping wing pairs) or bees (buzzing dots) looping over flower beds. */
export function flyers(zone: LifeZone, def: SceneDef, kind: 'butterflies' | 'bees'): LifeSystem {
  const root = new THREE.Group();
  const beds = def.decor.filter((d) => d.kind === 'flowers' && Math.hypot(d.x - zone.x, d.z - zone.z) < zone.r);
  const home = (i: number) => (beds.length ? beds[i % beds.length] : { x: zone.x, z: zone.z });
  const n = zone.count;
  if (kind === 'bees') {
    const bees = new Instances(new THREE.SphereGeometry(0.06, 6, 4).scale(1, 0.9, 1.4), lambert('#ffd36e'), n);
    root.add(bees.mesh);
    return {
      root,
      update(ctx) {
        if (!nearby(zone, ctx)) return;
        for (let i = 0; i < n; i++) {
          const h = home(i);
          const a = ctx.t / (420 + i * 37) + i;
          const x = h.x + Math.sin(a) * 0.55 + noise1(i, ctx.t / 400) * 0.15;
          const z = h.z + Math.cos(a * 1.3) * 0.4;
          bees.set(i, x, 0.45 + Math.sin(ctx.t / 150 + i) * 0.08, z, a + Math.PI / 2);
        }
        bees.commit();
      },
    };
  }
  const wingGeo = new THREE.CircleGeometry(0.11, 6).translate(0.1, 0, 0).rotateX(-Math.PI / 2);
  const left = new Instances(wingGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), n);
  const right = new Instances(wingGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), n);
  for (let i = 0; i < n; i++) {
    const c = P.flowers[Math.floor(hash(zone.seed, i) * P.flowers.length)];
    left.color(i, c);
    right.color(i, c);
  }
  root.add(left.mesh, right.mesh);
  return {
    root,
    update(ctx) {
      if (!nearby(zone, ctx)) return;
      for (let i = 0; i < n; i++) {
        const h = home(i);
        const s = ctx.t / 1000;
        const x = h.x + Math.sin(s * (0.31 + hash(i, 1) * 0.2) + i) * 2.2 + noise1(zone.seed + i, s * 0.4) * 1.5;
        const z = h.z + Math.cos(s * (0.27 + hash(i, 2) * 0.2) + i * 2) * 1.8 + noise1(zone.seed - i, s * 0.4) * 1.5;
        const y = 0.7 + Math.sin(s * 1.7 + i) * 0.25 + noise1(i * 3, s) * 0.15;
        const yaw = s * 0.8 + i;
        const flap = Math.sin(ctx.t / 55 + i) * 1.1;
        left.set(i, x, y, z, yaw, 1, 0, flap);
        right.set(i, x, y, z, yaw + Math.PI, 1, 0, flap);
      }
      left.commit();
      right.commit();
    },
  };
}

/** Three plumages: body, head, wings, breast/belly. */
const PLUMAGE = [
  { body: '#a07a5a', head: '#7a5a44', wing: '#8a6a50', breast: '#e8d8c0' }, // sparrow
  { body: '#6fa8dc', head: '#4f88c8', wing: '#3f70b0', breast: '#f0e6d2' }, // bluebird
  { body: '#7a6a60', head: '#5a4c44', wing: '#6a5a50', breast: '#ff8a5a' }, // robin
];

/** Birds hop around and flutter off when you get close, flapping their wings, and come back later. Local only. */
export function birds(zone: LifeZone, def: SceneDef): LifeSystem {
  const root = new THREE.Group();
  const n = zone.count;
  const white = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  const bodies = new Instances(new THREE.SphereGeometry(0.11, 10, 8).scale(0.9, 0.85, 1.25), white, n, true);
  const breasts = new Instances(new THREE.SphereGeometry(0.075, 8, 6).scale(0.95, 0.9, 0.8), white, n);
  const heads = new Instances(new THREE.SphereGeometry(0.075, 8, 6), white, n);
  const beaks = new Instances(new THREE.ConeGeometry(0.022, 0.07, 5).rotateX(Math.PI / 2), lambert('#ffb347'), n);
  const tails = new Instances(new THREE.BoxGeometry(0.08, 0.015, 0.1).translate(0, 0, -0.05), white, n);
  const eyes = new Instances(new THREE.SphereGeometry(0.014, 5, 4), lambert('#2a2430'), n * 2);
  // Wings pivot at the shoulder: the left one reaches out along +x, the right along -x.
  const wingGeo = (side: 1 | -1) => new THREE.SphereGeometry(0.1, 8, 4).scale(1, 0.12, 0.55).translate(side * 0.1, 0, -0.01);
  const wingL = new Instances(wingGeo(1), white, n, true);
  const wingR = new Instances(wingGeo(-1), white, n, true);
  for (let i = 0; i < n; i++) {
    const p = PLUMAGE[Math.floor(hash(zone.seed, i, 7) * PLUMAGE.length)];
    bodies.color(i, p.body);
    breasts.color(i, p.breast);
    heads.color(i, p.head);
    tails.color(i, p.wing);
    wingL.color(i, p.wing);
    wingR.color(i, p.wing);
  }
  for (const x of [bodies, breasts, heads, beaks, tails, eyes, wingL, wingR]) root.add(x.mesh);
  const blocked = (x: number, z: number) =>
    def.colliders.some((c) => Math.abs(x - c.x) < c.w / 2 + 0.3 && Math.abs(z - c.z) < c.d / 2 + 0.3)
    || (def.water && pointInPolygon(def.water.outline, x, z));
  const homes = Array.from({ length: n }, (_, i) => {
    for (let k = 0; k < 10; k++) {
      const x = zone.x + (hash(zone.seed, i, k, 1) - 0.5) * zone.r * 1.6;
      const z = zone.z + (hash(zone.seed, i, k, 2) - 0.5) * zone.r * 1.6;
      if (!blocked(x, z)) return { x, z };
    }
    return { x: zone.x, z: zone.z };
  });
  const state = homes.map(() => ({ fledAt: -1e9, dir: 0, back: 0 }));
  /** Local offset (right, up, forward) on a bird at (x, y, z) facing yaw, to world space. */
  const at = (x: number, y: number, z: number, yaw: number, r: number, u: number, f: number) => {
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    return [x + s * f + c * r, y + u, z + c * f - s * r] as const;
  };
  return {
    root,
    update(ctx) {
      if (!nearby(zone, ctx)) return;
      for (let i = 0; i < n; i++) {
        const h = homes[i];
        const st = state[i];
        const hopT = ctx.t / 900 + hash(i, 5) * 10;
        const hx = h.x + noise1(zone.seed + i, hopT * 0.3) * 0.8;
        const hz = h.z + noise1(zone.seed + i + 50, hopT * 0.3) * 0.8;
        if (ctx.t - st.fledAt > st.back && Math.hypot(ctx.me.x - hx, ctx.me.z - hz) < 3) {
          st.fledAt = ctx.t;
          st.dir = Math.atan2(hx - ctx.me.x, hz - ctx.me.z);
          st.back = 20000 + hash(i, ctx.t) * 20000;
        }
        const away = ctx.t - st.fledAt;
        const hopK = hopT % 1;
        let x = hx;
        let y = Math.max(0, Math.sin(hopK * Math.PI)) * 0.08;
        let z = hz;
        let yaw = noise1(i, hopT * 0.2) * 3;
        let pitch = 0;
        let flap = -1.25; // folded against the body
        if (y > 0.02) flap = -0.6 + Math.sin(ctx.t / 40 + i) * 0.5; // a flutter on each hop
        if (away < st.back) {
          const fly = Math.min(away, 3000) / 3000;
          const ret = away > st.back - 3000 ? (st.back - away) / 3000 : 1; // glide back in at the end
          const k = Math.min(fly, ret);
          x += Math.sin(st.dir) * 14 * k;
          z += Math.cos(st.dir) * 14 * k;
          y = 7 * k;
          yaw = away > st.back - 3000 ? st.dir + Math.PI : st.dir;
          pitch = k > 0 && k < 1 ? -0.25 : 0;
          if (k > 0.02) flap = Math.sin(ctx.t / 55 + i * 1.7) * 0.9;
        }
        const by = 0.13 + y;
        bodies.set(i, x, by, z, yaw, 1, pitch);
        breasts.set(i, ...at(x, by, z, yaw, 0, -0.01, 0.05), yaw);
        heads.set(i, ...at(x, by, z, yaw, 0, 0.09, 0.1), yaw);
        beaks.set(i, ...at(x, by, z, yaw, 0, 0.085, 0.18), yaw);
        tails.set(i, ...at(x, by, z, yaw, 0, 0.02, -0.12), yaw, 1, 0.35);
        eyes.set(i * 2, ...at(x, by, z, yaw, 0.045, 0.11, 0.15), yaw);
        eyes.set(i * 2 + 1, ...at(x, by, z, yaw, -0.045, 0.11, 0.15), yaw);
        wingL.set(i, ...at(x, by, z, yaw, 0.08, 0.03, 0), yaw, 1, pitch, flap);
        wingR.set(i, ...at(x, by, z, yaw, -0.08, 0.03, 0), yaw, 1, pitch, -flap);
      }
      for (const x of [bodies, breasts, heads, beaks, tails, eyes, wingL, wingR]) x.commit();
    },
  };
}

let glowTex: THREE.Texture | null = null;
function softDot(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,220,1)');
  grad.addColorStop(0.4, 'rgba(255,240,150,0.6)');
  grad.addColorStop(1, 'rgba(255,240,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** Fireflies drift and glow after dark. */
export function fireflies(zone: LifeZone): LifeSystem {
  const n = zone.count;
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.35, map: softDot(), color: '#fff3a0', transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    root: points,
    update(ctx) {
      points.visible = ctx.night > 0.3;
      if (!points.visible || !nearby(zone, ctx)) return;
      mat.opacity = Math.min(1, (ctx.night - 0.3) * 1.6) * (0.75 + Math.sin(ctx.t / 700) * 0.25);
      const s = ctx.t / 1000;
      for (let i = 0; i < n; i++) {
        const r = Math.sqrt(hash(zone.seed, i)) * zone.r;
        const a = hash(zone.seed, i, 2) * Math.PI * 2;
        pos[i * 3] = zone.x + Math.cos(a) * r + noise1(i, s * 0.25) * 1.5;
        pos[i * 3 + 1] = 0.6 + hash(i, 3) * 1.6 + noise1(i + 99, s * 0.3) * 0.4;
        pos[i * 3 + 2] = zone.z + Math.sin(a) * r + noise1(i + 7, s * 0.25) * 1.5;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** Leaves drifting down under the trees, on a loop. */
export function leaves(zone: LifeZone, colors = ['#f2a65a', '#e8c35a', '#d9774a', '#9bd48a']): LifeSystem {
  const n = zone.count;
  const inst = new Instances(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), n);
  for (let i = 0; i < n; i++) inst.color(i, colors[i % colors.length]);
  return {
    root: inst.mesh,
    update(ctx) {
      if (!nearby(zone, ctx)) return;
      for (let i = 0; i < n; i++) {
        const period = 7000 + hash(zone.seed, i) * 5000;
        const k = ((ctx.t + i * 811) % period) / period;
        const cyc = Math.floor((ctx.t + i * 811) / period);
        const r = Math.sqrt(hash(zone.seed, i, cyc)) * zone.r;
        const a = hash(zone.seed, i, cyc, 2) * Math.PI * 2;
        const x = zone.x + Math.cos(a) * r + Math.sin(k * 9 + i) * 0.5;
        const z = zone.z + Math.sin(a) * r + Math.cos(k * 7 + i) * 0.3;
        const y = 4.2 * (1 - k) + 0.02;
        inst.set(i, x, y, z, k * 12 + i, 1, -Math.PI / 2 + Math.sin(k * 20) * 0.6, Math.cos(k * 17) * 0.5);
      }
      inst.commit();
    },
  };
}

/** Fluffy clouds drifting slowly over the whole town. */
export function clouds(): LifeSystem {
  const root = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, transparent: true, opacity: 0.92 });
  const list = Array.from({ length: 8 }, (_, i) => {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(hash(i, 1) * 3);
    for (let k = 0; k < puffs; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + hash(i, k) * 1.4, 1), mat);
      m.position.set((k - puffs / 2) * 1.8, hash(i, k, 2) * 0.8, (hash(i, k, 3) - 0.5) * 1.5);
      g.add(m);
    }
    root.add(g);
    return { g, z: -40 + i * 11 + hash(i, 4) * 6, off: hash(i, 5) * 180, y: 20 + hash(i, 6) * 6 };
  });
  return {
    root,
    update(ctx) {
      for (const c of list) {
        const x = ((ctx.t / 1000 + c.off) % 180) - 90;
        c.g.position.set(x, c.y, c.z);
      }
    },
  };
}
