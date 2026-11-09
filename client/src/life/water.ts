import * as THREE from 'three';
import { pointInPolygon } from '../../../shared/geometry';
import type { LifeZone, SceneDef, Water } from '../../../shared/scenes/types';
import { mesh, toonMat } from '../world/materials';
import { Instances, lambert, nearby, type LifeSystem } from './kit';
import { catmullLoop, hash, noise1 } from './math';

/** Sailboats lapping fixed loops, timed from the server clock so everyone sees the same regatta. */
export function sailboats(water: Water): LifeSystem {
  const root = new THREE.Group();
  const boats = water.sailPaths.map((p) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.25, 1.6), lambert('#fff6ea'), 0, 0.1, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 6), lambert('#9c6f4c'), 0, 1.15, 0.1));
    const sail = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 1.7), new THREE.Vector2(0.9, 0)]);
    const s = mesh(new THREE.ShapeGeometry(sail), toonMat({ color: p.color, side: THREE.DoubleSide }), 0, 0.3, 0.15);
    s.rotation.y = Math.PI / 2;
    g.add(s);
    root.add(g);
    return { g, s, path: p };
  });
  return {
    root,
    update(ctx) {
      for (const b of boats) {
        const u = (ctx.t / 1000 / b.path.period + b.path.offset) % 1;
        const p = catmullLoop(b.path.points, u);
        b.g.position.set(p.x, Math.sin(ctx.t / 800 + b.path.offset * 9) * 0.04, p.z);
        b.g.rotation.y = p.heading;
        b.g.rotation.z = Math.sin(ctx.t / 1300 + b.path.offset * 5) * 0.06;
      }
    },
  };
}

const inWater = (w: Water, x: number, z: number) => pointInPolygon(w.outline, x, z);

/** Ducks drift on noise; bread makes the nearby ones paddle over for a while. */
export function ducks(zone: LifeZone, water: Water): LifeSystem {
  const root = new THREE.Group();
  const body = new Instances(new THREE.SphereGeometry(0.22, 10, 8).scale(1, 0.75, 1.3), lambert('#ffffff'), zone.count, true);
  const head = new Instances(new THREE.SphereGeometry(0.12, 8, 6), lambert('#5fb36b'), zone.count);
  const beak = new Instances(new THREE.ConeGeometry(0.05, 0.14, 6).rotateX(Math.PI / 2), lambert('#ffb347'), zone.count);
  root.add(body.mesh, head.mesh, beak.mesh);
  const wander = (i: number, t: number) => ({
    x: zone.x + noise1(zone.seed + i * 7, t / 14000 + i) * zone.r * 0.7,
    z: zone.z + noise1(zone.seed + i * 13, t / 16000 + i * 3) * zone.r * 0.45,
  });
  const ducks = Array.from({ length: zone.count }, (_, i) => ({ ...wander(i, 0), heading: 0 }));
  let food: { x: number; z: number; until: number } | null = null;
  let started = false;
  return {
    root,
    feed(x, z, t) {
      food = { x, z, until: t + 8000 };
    },
    update(ctx) {
      if (!started) {
        started = true;
        ducks.forEach((d, i) => Object.assign(d, wander(i, ctx.t)));
      }
      if (!nearby(zone, ctx)) return;
      if (food && ctx.t > food.until) food = null;
      ducks.forEach((d, i) => {
        const hungry = food && Math.hypot(food.x - d.x, food.z - d.z) < 10;
        const goal = hungry ? { x: food!.x + Math.cos(i * 2.4) * 0.6, z: food!.z + Math.sin(i * 2.4) * 0.6 } : wander(i, ctx.t);
        const k = 1 - Math.exp(-ctx.dt * (hungry ? 0.9 : 0.4));
        const nx = d.x + (goal.x - d.x) * k;
        const nz = d.z + (goal.z - d.z) * k;
        if (Math.hypot(nx - d.x, nz - d.z) > 0.002) d.heading = Math.atan2(nx - d.x, nz - d.z);
        if (inWater(water, nx, nz)) [d.x, d.z] = [nx, nz];
        const bob = Math.sin(ctx.t / 500 + i) * 0.02;
        const fx = Math.sin(d.heading);
        const fz = Math.cos(d.heading);
        body.set(i, d.x, 0.12 + bob, d.z, d.heading);
        head.set(i, d.x + fx * 0.22, 0.34 + bob, d.z + fz * 0.22, d.heading);
        beak.set(i, d.x + fx * 0.34, 0.33 + bob, d.z + fz * 0.34, d.heading);
      });
      body.commit();
      head.commit();
      beak.commit();
    },
  };
}

/** Fish leap out of the water at seeded times and places. */
export function fish(zone: LifeZone, water: Water): LifeSystem {
  const root = new THREE.Group();
  const fishes = new Instances(new THREE.SphereGeometry(0.12, 8, 6).scale(0.6, 0.8, 1.6), lambert('#ff9e7a'), zone.count);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false });
  const rings = Array.from({ length: zone.count }, () => {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 20), ringMat.clone());
    r.rotation.x = -Math.PI / 2;
    root.add(r);
    return r;
  });
  root.add(fishes.mesh);
  const JUMP = 900;
  return {
    root,
    update(ctx) {
      if (!nearby(zone, ctx)) return;
      for (let i = 0; i < zone.count; i++) {
        const period = 6000 + hash(zone.seed, i) * 8000;
        const n = Math.floor((ctx.t + i * 977) / period);
        const phase = (ctx.t + i * 977) % period;
        let x = zone.x + (hash(zone.seed, i, n, 1) - 0.5) * zone.r * 1.6;
        let z = zone.z + (hash(zone.seed, i, n, 2) - 0.5) * zone.r;
        if (!inWater(water, x, z)) [x, z] = [zone.x, zone.z];
        const yaw = hash(zone.seed, i, n, 3) * Math.PI * 2;
        const k = phase / JUMP;
        const ring = rings[i];
        if (k < 1) {
          const along = (k - 0.5) * 0.9;
          fishes.set(i, x + Math.sin(yaw) * along, Math.sin(Math.PI * k) * 0.6, z + Math.cos(yaw) * along, yaw, 1, (k - 0.5) * 2.2);
        } else fishes.hide(i);
        const rk = phase / 1400;
        ring.visible = rk < 1;
        if (rk < 1) {
          const s = 0.15 + rk * 0.8;
          ring.position.set(x, 0.05, z);
          ring.scale.set(s, s, s);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - rk);
        }
      }
      fishes.commit();
    },
  };
}

/** Frogs sit on lily pads and plop into the water when you come close. Local only. */
export function frogs(zone: LifeZone, def: SceneDef): LifeSystem {
  const root = new THREE.Group();
  const pads = def.decor.filter((d) => d.kind === 'lilyPad' && Math.hypot(d.x - zone.x, d.z - zone.z) < zone.r);
  const spots = Array.from({ length: Math.min(zone.count, pads.length) }, (_, i) => pads[Math.floor(hash(zone.seed, i) * pads.length)]);
  const body = new Instances(new THREE.SphereGeometry(0.14, 8, 6).scale(1, 0.7, 1.1), lambert('#62b07a'), spots.length);
  const eyes = new Instances(new THREE.SphereGeometry(0.045, 6, 4), lambert('#fffaf0'), spots.length * 2);
  root.add(body.mesh, eyes.mesh);
  const goneUntil = spots.map(() => 0);
  return {
    root,
    update(ctx) {
      if (!nearby(zone, ctx)) return;
      spots.forEach((p, i) => {
        if (goneUntil[i] < ctx.t && Math.hypot(ctx.me.x - p.x, ctx.me.z - p.z) < 2) goneUntil[i] = ctx.t + 6000;
        const away = goneUntil[i] - ctx.t;
        if (away > 5600) {
          const k = (6000 - away) / 400; // the leap in
          body.set(i, p.x + k * 0.6, 0.1 + Math.sin(Math.PI * k) * 0.4, p.z, 1.5);
        } else if (away > 0) {
          body.hide(i);
          eyes.hide(i * 2);
          eyes.hide(i * 2 + 1);
          return;
        } else {
          const hop = Math.max(0, Math.sin(ctx.t / 600 + i * 3)) > 0.97 ? 0.06 : 0;
          body.set(i, p.x, 0.12 + hop, p.z, i);
        }
        const yaw = away > 5600 ? 1.5 : i;
        for (const s of [-1, 1]) {
          eyes.set(i * 2 + (s > 0 ? 1 : 0), p.x + Math.sin(yaw) * 0.08 + Math.cos(yaw) * s * 0.06, 0.24, p.z + Math.cos(yaw) * 0.08 - Math.sin(yaw) * s * 0.06);
        }
      });
      body.commit();
      eyes.commit();
    },
  };
}

/** Dragonflies dart between seeded points over the water. */
export function dragonflies(zone: LifeZone, water: Water): LifeSystem {
  const root = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.03, 0.03, 0.32);
  const wingGeo = new THREE.BoxGeometry(0.4, 0.005, 0.07);
  const bodies = new Instances(geo, lambert('#3f8fd8'), zone.count);
  const wings = new Instances(wingGeo, toonMat({ color: '#dff4ff', transparent: true, opacity: 0.7 }), zone.count);
  root.add(bodies.mesh, wings.mesh);
  const point = (i: number, k: number) => {
    const x = zone.x + (hash(zone.seed, i, k, 1) - 0.5) * zone.r * 1.6;
    const z = zone.z + (hash(zone.seed, i, k, 2) - 0.5) * zone.r;
    return inWater(water, x, z) ? { x, z } : { x: zone.x + (hash(zone.seed, i, 9) - 0.5) * 6, z: zone.z };
  };
  return {
    root,
    update(ctx) {
      if (!nearby(zone, ctx)) return;
      for (let i = 0; i < zone.count; i++) {
        const f = ctx.t / 1700 + i * 0.37;
        const k = Math.floor(f);
        const u = f - k;
        const e = u < 0.35 ? (u / 0.35) ** 2 * (3 - 2 * (u / 0.35)) : 1; // dart, then hover
        const a = point(i, k);
        const b = point(i, k + 1);
        const x = a.x + (b.x - a.x) * e;
        const z = a.z + (b.z - a.z) * e;
        const y = 0.7 + Math.sin(ctx.t / 300 + i) * 0.08;
        const yaw = Math.atan2(b.x - a.x, b.z - a.z);
        bodies.set(i, x, y, z, yaw);
        wings.set(i, x, y + 0.02, z, yaw, 1, 0, Math.sin(ctx.t / 25 + i) * 0.3);
      }
      bodies.commit();
      wings.commit();
    },
  };
}
