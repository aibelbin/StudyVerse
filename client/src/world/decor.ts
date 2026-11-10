import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Decor, DecorKind } from '../../../shared/scenes/types';
import { glow, mat, mesh, toonMat } from './materials';
import { PALETTE as P } from './palette';
import { rng } from './rng';
import { labelTexture } from './text';
import { waterMat } from './ground';

type Builder = (d: Decor, r: () => number) => THREE.Object3D;

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
const pick = <T,>(arr: readonly T[], r: () => number): T => arr[Math.floor(r() * arr.length)];

function group(...kids: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (kids.length) g.add(...kids);
  return g;
}

/**
 * Many-part decor (hedges, buildings, benches) merged into one mesh per material, so a detailed
 * object costs a few draw calls instead of dozens.
 */
export function merged(g: THREE.Object3D): THREE.Group {
  g.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; shadow: boolean }>();
  const keep: THREE.Object3D[] = [];
  g.traverse((o) => {
    if (o === g || !(o instanceof THREE.Mesh)) return;
    if (Array.isArray(o.material) || o.userData.keep) {
      keep.push(o);
      return;
    }
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    let e = byMat.get(o.material);
    if (!e) byMat.set(o.material, (e = { geos: [], shadow: false }));
    e.geos.push(geo);
    e.shadow ||= o.castShadow;
  });
  const out = new THREE.Group();
  for (const [m, e] of byMat) {
    const one = new THREE.Mesh(mergeGeometries(e.geos)!, m);
    one.castShadow = e.shadow;
    one.receiveShadow = true;
    out.add(one);
  }
  for (const o of keep) {
    o.removeFromParent();
    out.add(o);
  }
  out.userData = { ...g.userData };
  return out;
}

function labelPlane(text: string, height: number): THREE.Mesh {
  const { tex, aspect } = labelTexture(text, { fg: P.ink, font: 56, pad: 10 });
  return new THREE.Mesh(
    new THREE.PlaneGeometry(height * aspect, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
}

let cobbleTex: THREE.CanvasTexture | null = null;

/** Soft, rounded paving stones on the path colour, tiling every 2.4 m. */
function cobbles(): THREE.CanvasTexture {
  if (cobbleTex) return cobbleTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = rng(5);
  g.fillStyle = '#e6d0a6';
  g.fillRect(0, 0, 128, 128);
  // moss in some of the gaps
  for (let i = 0; i < 70; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(140,190,110,0.55)' : 'rgba(120,170,100,0.4)';
    g.fillRect(r() * 128, r() * 128, 3, 3);
  }
  const tones = [[244, 226, 190], [236, 214, 176], [229, 206, 168], [240, 220, 196], [232, 210, 186]];
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 16 : 0;
    for (let col = -1; col < 4; col++) {
      const [cr, cg, cb] = tones[Math.floor(r() * tones.length)];
      const j = Math.floor(r() * 8) - 4;
      g.fillStyle = `rgb(${cr + j}, ${cg + j}, ${cb + j})`;
      g.beginPath();
      g.roundRect(col * 32 + off + 2, row * 32 + 2, 28, 28, 9);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)'; // a soft highlight on each stone
      g.beginPath();
      g.roundRect(col * 32 + off + 6, row * 32 + 5, 16, 5, 3);
      g.fill();
    }
  }
  cobbleTex = new THREE.CanvasTexture(c);
  cobbleTex.wrapS = cobbleTex.wrapT = THREE.RepeatWrapping;
  cobbleTex.colorSpace = THREE.SRGBColorSpace;
  cobbleTex.anisotropy = 4;
  return cobbleTex;
}


/** Shared by every indoor sunbeam so the time of day can fade them all (see tintIndoorWindows). */
export const SUNBEAM = new THREE.MeshBasicMaterial({ color: '#fff4d0', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

const texCache = new Map<string, THREE.CanvasTexture>();

/** A small canvas texture, cached by key and repeating. */
function canvasTex(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Plank siding in the wall colour (one 64 px tile = 1 m). */
function sidingTex(color: string): THREE.CanvasTexture {
  return canvasTex(`siding|${color}`, 64, 64, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 16) {
      g.fillStyle = 'rgba(0,0,0,0.07)';
      g.fillRect(0, y + 14, 64, 2);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(0, y, 64, 2);
    }
  });
}

/** Rows of rounded roof tiles in the accent colour (one tile row ≈ 0.25 m). */
function tileTex(color: string): THREE.CanvasTexture {
  return canvasTex(`tiles|${color}`, 64, 64, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      for (let x = -16; x < 80; x += 16) {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.beginPath();
        g.arc(x + off + 8, row * 16 + 16, 8, Math.PI, 0);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.1)';
        g.fillRect(x + off + 2, row * 16 + 3, 12, 2);
      }
    }
  });
}

/** Cream-and-accent awning stripes. */
function stripeTex(color: string): THREE.CanvasTexture {
  return canvasTex(`stripes|${color}`, 64, 8, (g) => {
    g.fillStyle = '#fff6ea';
    g.fillRect(0, 0, 64, 8);
    g.fillStyle = color;
    for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 8, 8);
  });
}

/** Where a building's chimney top is, in its own space (the smoke rises from here). */
export function chimneyLocal(d: Decor): THREE.Vector3 {
  const w = d.w ?? 6;
  const dd = d.d ?? 5;
  const h = d.h ?? 4;
  return new THREE.Vector3(w * 0.28, h + 1.75, -dd * 0.12);
}

const builders: Record<DecorKind, Builder> = {
  /** A player's cabin: a small, simple building. Door on +z, a plaque with the owner's name above it. */
  cabin(d, r) {
    const w = d.w ?? 5;
    const dd = d.d ?? 4.5;
    const h = d.h ?? 2.6;
    const wall = d.color ?? '#f2dcc0';
    const accent = d.accent ?? P.woodDark;
    const front = dd / 2;
    const trim = mat('#fff6ea');
    const wood = mat(P.woodLight);
    const g = group();
    g.add(mesh(box(w + 0.12, 0.3, dd + 0.12), mat('#c9bfb2'), 0, 0.15, 0));
    const siding = sidingTex(wall).clone();
    siding.repeat.set(w, h);
    siding.needsUpdate = true;
    g.add(mesh(box(w, h - 0.3, dd), toonMat({ map: siding }), 0, 0.3 + (h - 0.3) / 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(box(0.12, h, 0.12), trim, sx * (w / 2 - 0.02), h / 2, sz * (dd / 2 - 0.02)));
    g.add(mesh(box(w + 0.1, 0.12, dd + 0.1), trim, 0, h, 0));
    const rise = 1.4;
    const half = w / 2 + 0.3;
    const slope = Math.hypot(half, rise);
    const ang = Math.atan2(rise, half);
    const tiles = tileTex(accent).clone();
    tiles.repeat.set(slope * 4, (dd + 0.6) * 4);
    tiles.needsUpdate = true;
    const tileMat = toonMat({ map: tiles });
    for (const side of [-1, 1]) {
      const rf = mesh(box(slope, 0.1, dd + 0.6), tileMat, side * half / 2, h + rise / 2 + 0.05, 0);
      rf.rotation.z = -side * ang;
      g.add(rf);
    }
    const ridge = mesh(cyl(0.08, 0.08, dd + 0.65, 8), mat(accent), 0, h + rise + 0.08, 0);
    ridge.rotation.x = Math.PI / 2;
    g.add(ridge);
    const gable = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise - 0.05)]);
    for (const z of [front + 0.01, -front - 0.01]) g.add(mesh(new THREE.ShapeGeometry(gable), mat(wall), 0, h, z));
    // door
    const doorColor = pick(['#5f9a72', '#c9705a', '#e8c35a', '#f2a65a', '#7a8fc4', '#8fd694'], r);
    g.add(mesh(box(1.0, 1.7, 0.1), trim, -0.7, 0.85 + 0.05, front + 0.03));
    g.add(mesh(box(0.82, 1.55, 0.12), mat(doorColor), -0.7, 0.8 + 0.05, front + 0.05));
    g.add(mesh(sph(0.045, 1), mat('#e8c35a'), -0.45, 0.85, front + 0.13, false));
    g.add(mesh(box(1.1, 0.02, 0.6), mat('#b5857a'), -0.7, 0.01, front + 0.4)); // doormat
    // window with a flower box
    const wx = 1.2;
    g.add(mesh(box(1.1, 0.95, 0.08), wood, wx, 1.4, front + 0.02));
    g.add(mesh(box(0.92, 0.77, 0.1), glow(P.windowGlow, 0.5, 'window'), wx, 1.4, front + 0.03, false));
    g.add(mesh(box(0.05, 0.77, 0.12), wood, wx, 1.4, front + 0.06, false));
    g.add(mesh(box(0.92, 0.05, 0.12), wood, wx, 1.4, front + 0.06, false));
    g.add(mesh(box(1.1, 0.2, 0.24), mat(P.woodDark), wx, 0.84, front + 0.14));
    for (let i = 0; i < 5; i++) g.add(mesh(sph(0.07, 1), mat(P.flowers[i % P.flowers.length]), wx - 0.4 + i * 0.2, 1.0, front + 0.16, false));
    if (d.label) {
      const text = labelPlane(d.label, 0.3);
      const tw = (text.geometry as THREE.PlaneGeometry).parameters.width;
      const py = 2.1;
      g.add(mesh(box(tw + 0.3, 0.46, 0.06), mat(P.woodLight), 0, py, front + 0.04));
      g.add(mesh(box(tw + 0.4, 0.56, 0.05), mat(P.woodDark), 0, py, front + 0.02));
      text.position.set(0, py, front + 0.09);
      text.userData.keep = true;
      g.add(text);
    }
    return merged(g);
  },

  /** The village gate: two posts and a beam with the village's name hanging under it, a lantern at each post. */
  gate(d) {
    const wood = mat(P.woodDark);
    const g = group();
    for (const sx of [-1, 1]) {
      g.add(mesh(box(0.22, 2.8, 0.22), wood, sx * 0.8, 1.4, 0));
      g.add(mesh(box(0.1, 0.14, 0.1), mat(P.dark), sx * 1.0, 2.4, 0.22, false)); // lantern hook
      g.add(mesh(sph(0.12, 1), glow(P.lampGlow, 1.6, 'street'), sx * 1.0, 2.25, 0.22, false));
    }
    g.add(mesh(box(2.2, 0.2, 0.28), mat(P.woodLight), 0, 2.8, 0));
    if (d.label) {
      const text = labelPlane(d.label, 0.34);
      const tw = (text.geometry as THREE.PlaneGeometry).parameters.width;
      g.add(mesh(box(tw + 0.3, 0.5, 0.05), mat(P.woodLight), 0, 2.4, 0.02));
      text.position.set(0, 2.4, 0.06);
      text.userData.keep = true;
      g.add(text);
    }
    return merged(g);
  },

  /** A pale panel to hang paintings on, with a wooden rail along the top. */
  galleryWall(d) {
    const w = d.w ?? 4;
    return group(mesh(box(w, 2.4, 0.04), mat('#f4ece0'), 0, 1.75, 0), mesh(box(w + 0.1, 0.08, 0.1), mat(P.woodDark), 0, 2.95, 0));
  },

  /** A wall shelf: the plank sits at the origin (y comes from d.y), brackets below. */
  shelf(d) {
    const w = d.w ?? 1;
    const g = group(mesh(box(w, 0.05, 0.3), mat(P.woodLight), 0, 0, 0));
    for (const sx of [-1, 1]) g.add(mesh(box(0.04, 0.16, 0.22), mat(P.woodDark), sx * (w / 2 - 0.1), -0.105, 0));
    return g;
  },

  bed(_d, r) {
    const g = group(
      mesh(box(1.2, 0.3, 2), mat(P.woodDark), 0, 0.15, 0),
      mesh(box(1.1, 0.14, 1.9), mat('#fff6ea'), 0, 0.37, 0),
      mesh(box(0.7, 0.12, 0.35), mat('#ffffff'), 0, 0.5, -0.7),
      mesh(box(1.14, 0.1, 1.0), mat(pick(P.chairs, r)), 0, 0.46, 0.4),
    );
    return g;
  },
  /** Four shapes by seed (oak, poplar, birch, apple): round canopies of soft clumps, lighter on top. */
  tree(d, r) {
    const s = d.h ?? 1;
    const kind = Math.abs(Math.round(d.seed ?? 0)) % 4;
    const greens = [P.leaf2, P.leaf1, P.leaf3];
    const top = '#b2e29a';
    const g = group();
    const clump = (x: number, y: number, z: number, rad: number, color: string) =>
      g.add(mesh(sph(rad * s, 1), mat(color), x * s, y * s, z * s));
    if (kind === 1) {
      // poplar: tall and narrow
      g.add(mesh(cyl(0.09 * s, 0.14 * s, 1.2 * s, 8), mat(P.trunk), 0, 0.6 * s, 0));
      for (let i = 0; i < 6; i++) clump((r() - 0.5) * 0.25, 1.2 + i * 0.42, (r() - 0.5) * 0.25, 0.5 - i * 0.045, i > 3 ? top : greens[i % 3]);
      return g;
    }
    if (kind === 2) {
      // birch: white trunk with dark marks, airy pale canopy
      g.add(mesh(cyl(0.08 * s, 0.11 * s, 1.7 * s, 8), mat('#f2efe6'), 0, 0.85 * s, 0));
      for (let i = 0; i < 4; i++) g.add(mesh(box(0.13 * s, 0.03 * s, 0.13 * s), mat('#4a4048'), 0, (0.3 + i * 0.35) * s, 0, false));
      const pale = ['#a8d98f', '#bfe5a6', '#93cc7e'];
      for (let i = 0; i < 7; i++) clump((r() - 0.5) * 1.1, 1.7 + r() * 0.9, (r() - 0.5) * 1.1, 0.38 + r() * 0.16, pale[i % 3]);
      return g;
    }
    // oak and apple: a wide round canopy on a short trunk with two branch stubs
    g.add(mesh(cyl(0.13 * s, 0.2 * s, 1.3 * s, 8), mat(P.trunk), 0, 0.65 * s, 0));
    for (const side of [-1, 1]) {
      const b = mesh(cyl(0.05 * s, 0.07 * s, 0.6 * s, 6), mat(P.trunk), side * 0.22 * s, 1.15 * s, 0);
      b.rotation.z = -side * 0.8;
      g.add(b);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r() * 0.5;
      const rr = 0.45 + r() * 0.2;
      clump(Math.cos(a) * rr, 1.55 + r() * 0.35, Math.sin(a) * rr, 0.42 + r() * 0.14, greens[i % 3]);
    }
    clump(0, 2.05, 0, 0.5, top);
    clump(0.25, 1.95, 0.2, 0.34, top);
    if (kind === 3) {
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2;
        g.add(mesh(sph(0.065 * s, 1), mat('#e8453c'), Math.cos(a) * 0.8 * s, (1.35 + r() * 0.6) * s, Math.sin(a) * 0.8 * s, false));
      }
    }
    return g;
  },

  /** Four tiers, each a darker cone with a lighter cap, on a visible trunk. */
  pine(d) {
    const s = d.h ?? 1;
    const g = group(mesh(cyl(0.1 * s, 0.15 * s, 0.9 * s, 8), mat(P.trunk), 0, 0.45 * s, 0));
    for (let i = 0; i < 4; i++) {
      const w = (1.05 - i * 0.22) * s;
      const y = (0.95 + i * 0.5) * s;
      g.add(mesh(new THREE.ConeGeometry(w, 0.95 * s, 10), mat(P.pine1), 0, y, 0));
      g.add(mesh(new THREE.ConeGeometry(w * 0.72, 0.6 * s, 10), mat(i % 2 ? '#74c08a' : P.pine2), 0, y + 0.22 * s, 0, false));
    }
    return g;
  },

  /** Soft clumps; variants get red or blue berries or tiny white flowers. */
  bush(d, r) {
    const kind = Math.abs(Math.round(d.seed ?? 0)) % 4;
    const g = group();
    const n = 4 + Math.floor(r() * 3);
    const spots: [number, number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rad = 0.28 + r() * 0.14;
      const p: [number, number, number, number] = [Math.cos(a) * 0.32, 0.28 + r() * 0.12, Math.sin(a) * 0.22, rad];
      spots.push(p);
      g.add(mesh(sph(rad, 1), mat(i % 3 === 0 ? P.leaf3 : i % 2 ? P.leaf1 : P.leaf2), p[0], p[1], p[2]));
    }
    g.add(mesh(sph(0.34, 1), mat('#a6dc8e'), 0, 0.5, 0));
    if (kind > 0) {
      const dot = kind === 1 ? '#e8453c' : kind === 2 ? '#5a7ae8' : '#ffffff';
      for (let i = 0; i < 10; i++) {
        const [x, y, z, rad] = spots[i % spots.length];
        const a = r() * Math.PI * 2;
        g.add(mesh(sph(0.04, 0), mat(dot), x + Math.cos(a) * rad * 0.9, y + 0.1 + r() * 0.1, z + Math.sin(a) * rad * 0.9, false));
      }
    }
    return g;
  },

  /** A little bed of real flowers: stems, two leaves, a five-petal ring round a yellow middle. */
  flowers(_d, r) {
    const g = group();
    const family = pick([['#f7a1c4', '#ff7fa8', '#ffd0e0'], ['#ffd36e', '#ffb347', '#fff1a8'], ['#c3a6ff', '#9f86f0', '#e2d4ff'], ['#ffffff', '#f2f2f2', '#ffe8f0'], ['#ff9e7a', '#ff7a5a', '#ffd0bc']], r);
    for (let i = 0; i < 7; i++) {
      const x = (r() - 0.5) * 0.9;
      const z = (r() - 0.5) * 0.5;
      const h = 0.22 + r() * 0.16;
      g.add(mesh(cyl(0.012, 0.014, h, 4), mat(P.leaf2), x, h / 2, z, false));
      for (const side of [-1, 1]) {
        const leaf = mesh(sph(0.04, 0), mat(P.leaf1), x + side * 0.04, h * 0.35, z, false);
        leaf.scale.set(1.2, 0.3, 0.6);
        g.add(leaf);
      }
      const color = family[i % 3];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const petal = mesh(sph(0.035, 0), mat(color), x + Math.cos(a) * 0.04, h + 0.01, z + Math.sin(a) * 0.04, false);
        petal.scale.set(1, 0.4, 1);
        g.add(petal);
      }
      g.add(mesh(sph(0.026, 0), mat('#ffcf3a'), x, h + 0.025, z, false));
    }
    return g;
  },

  /** A plinth, a ringed pole and a lantern: four little posts round a glowing globe, a cap and a finial. */
  lampPost() {
    const iron = mat(P.dark);
    const g = group(
      mesh(cyl(0.16, 0.2, 0.25, 8), iron, 0, 0.125, 0),
      mesh(cyl(0.05, 0.07, 2.2, 8), iron, 0, 1.35, 0),
      mesh(cyl(0.09, 0.09, 0.06, 8), iron, 0, 0.6, 0),
      mesh(cyl(0.08, 0.08, 0.05, 8), iron, 0, 2.15, 0),
      mesh(cyl(0.16, 0.12, 0.05, 8), iron, 0, 2.3, 0),
      mesh(sph(0.15, 2), glow(P.lampGlow, 1.6, 'street'), 0, 2.5, 0, false),
      mesh(new THREE.ConeGeometry(0.24, 0.2, 8), iron, 0, 2.76, 0),
      mesh(sph(0.04, 1), mat('#e8c35a'), 0, 2.9, 0, false),
    );
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(mesh(box(0.025, 0.36, 0.025), iron, Math.cos(a) * 0.17, 2.5, Math.sin(a) * 0.17, false));
    }
    return merged(g);
  },

  /** Slatted seat and back, armrests, and dark iron legs. */
  bench() {
    const g = group();
    for (let i = 0; i < 4; i++) g.add(mesh(box(1.5, 0.05, 0.1), mat(i % 2 ? P.wood : P.woodLight), 0, 0.45, -0.16 + i * 0.11));
    for (let i = 0; i < 3; i++) g.add(mesh(box(1.5, 0.09, 0.04), mat(i % 2 ? P.woodLight : P.wood), 0, 0.62 + i * 0.13, -0.22 - i * 0.02));
    for (const x of [-0.72, 0.72]) {
      g.add(mesh(box(0.06, 0.45, 0.06), mat(P.dark), x, 0.225, 0.16));
      g.add(mesh(box(0.06, 0.88, 0.06), mat(P.dark), x, 0.44, -0.22));
      g.add(mesh(box(0.07, 0.05, 0.42), mat(P.dark), x, 0.62, -0.03));
      g.add(mesh(box(0.08, 0.04, 0.46), mat(P.woodDark), x, 0.66, -0.03));
    }
    return merged(g);
  },

  path(d) {
    const w = d.w ?? 1;
    const dd = d.d ?? 1;
    const tex = cobbles().clone();
    tex.repeat.set(w / 2.4, dd / 2.4);
    tex.needsUpdate = true;
    return mesh(box(w, 0.02, dd), toonMat({ map: tex, roughness: 1 }), 0, 0.01, 0, false);
  },

  /** Asphalt with painted bay lines along the north side (d.seed bays, 5.5 m deep) and a wheel stop in each. */
  parking(d) {
    const w = d.w ?? 19.2;
    const dd = d.d ?? 13.4;
    const bays = d.seed ?? 6;
    const PX = 24; // texture pixels per metre
    const c = document.createElement('canvas');
    c.width = Math.round(w * PX);
    c.height = Math.round(dd * PX);
    const g = c.getContext('2d')!;
    g.fillStyle = '#7d7f86';
    g.fillRect(0, 0, c.width, c.height);
    const r = rng(77);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      g.fillRect(r() * c.width, r() * c.height, 3, 3);
    }
    g.strokeStyle = '#f4f1e8';
    g.lineWidth = 0.12 * PX;
    const bayW = w / bays;
    for (let i = 0; i <= bays; i++) {
      g.beginPath();
      g.moveTo(i * bayW * PX, 0.2 * PX);
      g.lineTo(i * bayW * PX, 5.6 * PX);
      g.stroke();
    }
    g.setLineDash([0.6 * PX, 0.5 * PX]);
    g.beginPath();
    g.moveTo(0.4 * PX, 9.4 * PX);
    g.lineTo((w - 0.4) * PX, 9.4 * PX);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const lot = group(
      mesh(box(w + 0.3, 0.025, dd + 0.3), mat('#e7e1d2'), 0, 0.012, 0, false), // kerb
      mesh(box(w, 0.03, dd), toonMat({ map: tex, roughness: 0.95 }), 0, 0.016, 0, false),
    );
    for (let i = 0; i < bays; i++) {
      lot.add(mesh(box(1.4, 0.12, 0.22), mat('#d9d4c7'), -w / 2 + (i + 0.5) * bayW, 0.06, -dd / 2 + 0.75));
    }
    return lot;
  },

  pond(d, r) {
    const sx = (d.w ?? 4) / 2;
    const sz = (d.d ?? 3) / 2;
    const rim = mesh(cyl(1.08, 1.08, 0.05, 32), mat(P.waterRim), 0, 0.025, 0, false);
    rim.scale.set(sx, 1, sz);
    const water = mesh(cyl(1, 1, 0.06, 32), waterMat(P.water), 0, 0.04, 0, false);
    water.scale.set(sx, 1, sz);
    const g = group(rim, water);
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      const k = 0.3 + r() * 0.5;
      g.add(mesh(cyl(0.2, 0.2, 0.01, 10), mat(P.leaf1), Math.cos(a) * sx * k, 0.075, Math.sin(a) * sz * k, false));
    }
    return g;
  },

  /**
   * A storybook shopfront: stone base, plank walls, a tiled roof with a chimney, framed windows
   * with shutters and flower boxes, a door with a step and a little lamp, and a striped awning.
   */
  building(d) {
    const w = d.w ?? 6;
    const dd = d.d ?? 5;
    const h = d.h ?? 4;
    const wall = d.color ?? '#f2dcc0';
    const accent = d.accent ?? P.woodDark;
    const front = dd / 2;
    const trim = mat('#fff6ea');
    const wood = mat(P.woodLight);
    const g = group();
    g.add(mesh(box(w + 0.12, 0.38, dd + 0.12), mat('#c9bfb2'), 0, 0.19, 0));
    const siding = sidingTex(wall).clone();
    siding.repeat.set(w, h);
    siding.needsUpdate = true;
    g.add(mesh(box(w, h - 0.38, dd), toonMat({ map: siding }), 0, 0.38 + (h - 0.38) / 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(box(0.14, h, 0.14), trim, sx * (w / 2 - 0.02), h / 2, sz * (dd / 2 - 0.02)));
    g.add(mesh(box(w + 0.1, 0.14, dd + 0.1), trim, 0, h, 0));
    // roof: two tiled slopes, a ridge, gable ends
    const rise = 1.7;
    const half = w / 2 + 0.35;
    const slope = Math.hypot(half, rise);
    const ang = Math.atan2(rise, half);
    const tiles = tileTex(accent).clone();
    tiles.repeat.set(slope * 4, (dd + 0.7) * 4);
    tiles.needsUpdate = true;
    const tileMat = toonMat({ map: tiles });
    for (const side of [-1, 1]) {
      const r = mesh(box(slope, 0.1, dd + 0.7), tileMat, side * half / 2, h + rise / 2 + 0.05, 0);
      r.rotation.z = -side * ang;
      g.add(r);
    }
    const ridge = mesh(cyl(0.09, 0.09, dd + 0.75, 8), mat(accent), 0, h + rise + 0.08, 0);
    ridge.rotation.x = Math.PI / 2;
    g.add(ridge);
    const gable = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise - 0.05)]);
    for (const z of [front + 0.01, -front - 0.01]) g.add(mesh(new THREE.ShapeGeometry(gable), mat(wall), 0, h, z));
    g.add(mesh(new THREE.CircleGeometry(0.28, 16), wood, 0, h + 0.7, front + 0.02)); // round gable window
    g.add(mesh(new THREE.CircleGeometry(0.2, 16), glow(P.windowGlow, 0.5, 'window'), 0, h + 0.7, front + 0.03, false));
    // chimney with a cap
    const c = chimneyLocal(d);
    g.add(mesh(box(0.5, 1.3, 0.5), mat('#b5857a'), c.x, c.y - 0.75, c.z));
    g.add(mesh(box(0.64, 0.12, 0.64), mat('#8a6a62'), c.x, c.y - 0.08, c.z));
    // door: frame, panels, knob, step, a lamp above
    g.add(mesh(box(1.25, 1.95, 0.1), trim, 0, 0.98 + 0.05, front + 0.03));
    g.add(mesh(box(1.0, 1.75, 0.12), mat(P.woodDark), 0, 0.92 + 0.05, front + 0.05));
    for (const y of [0.55, 1.35]) g.add(mesh(box(0.7, 0.5, 0.04), mat('#7a5240'), 0, y + 0.05, front + 0.12));
    g.add(mesh(sph(0.05, 1), mat('#e8c35a'), 0.36, 0.95, front + 0.14, false));
    g.add(mesh(box(1.4, 0.12, 0.45), mat('#c9bfb2'), 0, 0.06, front + 0.25));
    g.add(mesh(box(0.06, 0.06, 0.25), mat(P.dark), 0.75, 2.05, front + 0.12));
    g.add(mesh(sph(0.09, 1), glow(P.lampGlow, 1.6, 'street'), 0.75, 1.95, front + 0.24, false));
    // windows: frame, glass, cross bars, sill, shutters, a box of flowers
    for (const x of [-w / 2 + 1.35, w / 2 - 1.35]) {
      g.add(mesh(box(1.25, 1.05, 0.08), wood, x, 1.75, front + 0.02));
      g.add(mesh(box(1.05, 0.85, 0.1), glow(P.windowGlow, 0.5, 'window'), x, 1.75, front + 0.03, false));
      g.add(mesh(box(0.05, 0.85, 0.12), wood, x, 1.75, front + 0.06, false));
      g.add(mesh(box(1.05, 0.05, 0.12), wood, x, 1.75, front + 0.06, false));
      g.add(mesh(box(1.4, 0.08, 0.22), trim, x, 1.2, front + 0.1));
      for (const sx of [-1, 1]) {
        g.add(mesh(box(0.42, 1.0, 0.06), mat(accent), x + sx * 0.86, 1.75, front + 0.04));
        for (const y of [1.5, 1.75, 2.0]) g.add(mesh(box(0.34, 0.03, 0.03), mat(P.woodDark), x + sx * 0.86, y, front + 0.075, false));
      }
      g.add(mesh(box(1.2, 0.22, 0.26), mat(P.woodDark), x, 1.05, front + 0.2));
      for (let i = 0; i < 6; i++) g.add(mesh(sph(0.075, 1), mat(P.flowers[(i + Math.round(x)) % P.flowers.length]), x - 0.5 + i * 0.2, 1.22, front + 0.22, false));
    }
    // striped awning with a scalloped edge
    const stripes = stripeTex(accent).clone();
    stripes.repeat.set(w * 0.55 * 1.5, 1);
    stripes.needsUpdate = true;
    const awning = mesh(box(w * 0.55, 0.06, 0.95), toonMat({ map: stripes }), 0, 2.3, front + 0.42);
    awning.rotation.x = 0.32;
    g.add(awning);
    const n = Math.round(w * 0.55 * 4);
    for (let i = 0; i < n; i++) {
      const sc = mesh(sph(0.11, 1), mat(i % 2 ? '#fff6ea' : accent), -w * 0.275 + (i + 0.5) * (w * 0.55 / n), 2.1, front + 0.88, false);
      sc.scale.set(1, 0.7, 0.35);
      g.add(sc);
    }
    if (d.label) {
      const text = labelPlane(d.label, 0.42);
      const tw = (text.geometry as THREE.PlaneGeometry).parameters.width;
      g.add(mesh(box(tw + 0.5, 0.66, 0.08), mat(P.woodLight), 0, h - 0.5, front + 0.04));
      g.add(mesh(box(tw + 0.62, 0.78, 0.06), mat(P.woodDark), 0, h - 0.5, front + 0.02));
      text.position.set(0, h - 0.5, front + 0.09);
      text.userData.keep = true;
      g.add(text);
    }
    return merged(g);
  },

  desk(d, r) {
    const w = d.w ?? 1.4;
    const dd = d.d ?? 0.8;
    const g = group(mesh(box(w, 0.06, dd), mat(P.wood), 0, 0.74, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(box(0.06, 0.71, 0.06), mat(P.woodDark), sx * (w / 2 - 0.08), 0.355, sz * (dd / 2 - 0.08)));
    const stack = 2 + Math.floor(r() * 2);
    for (let i = 0; i < stack; i++) g.add(mesh(box(0.3, 0.05, 0.22), mat(pick(P.books, r)), -w / 2 + 0.3, 0.795 + i * 0.05, (r() - 0.5) * 0.05));
    g.add(mesh(box(0.36, 0.01, 0.26), mat(P.paper), 0.05, 0.775, 0, false));
    return g;
  },

  chair(_d, r) {
    const c = pick(P.chairs, r);
    const g = group(mesh(box(0.46, 0.06, 0.46), mat(c), 0, 0.45, 0), mesh(box(0.46, 0.46, 0.06), mat(c), 0, 0.72, -0.2));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(box(0.05, 0.45, 0.05), mat(P.woodDark), sx * 0.19, 0.225, sz * 0.19));
    return g;
  },

  deskLamp(_d, r) {
    return group(
      mesh(cyl(0.09, 0.1, 0.03), mat(P.dark), 0, 0.785, 0),
      mesh(cyl(0.015, 0.015, 0.36, 6), mat(P.dark), 0, 0.95, 0),
      mesh(new THREE.ConeGeometry(0.14, 0.16, 14), mat(pick(P.lampShades, r)), 0, 1.15, 0),
      mesh(sph(0.045, 1), glow(P.lampGlow), 0, 1.04, 0, false),
    );
  },

  bookshelf(d, r) {
    const w = d.w ?? 2.2;
    const H = 2.1;
    const D = 0.45;
    const g = group(
      mesh(box(w, H, 0.05), mat(P.woodDark), 0, H / 2, -D / 2 + 0.025),
      mesh(box(0.06, H, D), mat(P.woodDark), -w / 2 + 0.03, H / 2, 0),
      mesh(box(0.06, H, D), mat(P.woodDark), w / 2 - 0.03, H / 2, 0),
    );
    for (let i = 0; i < 5; i++) g.add(mesh(box(w, 0.05, D), mat(P.wood), 0, 0.03 + i * 0.5, 0));
    const max = 4 * Math.ceil(w / 0.05);
    const books = new THREE.InstancedMesh(box(1, 1, 1), toonMat({ roughness: 0.8, flatShading: true }), max);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    let n = 0;
    for (let shelf = 0; shelf < 4; shelf++) {
      let x = -w / 2 + 0.08;
      while (x < w / 2 - 0.14 && n < max) {
        if (r() < 0.08) {
          x += 0.15;
          continue;
        }
        const bw = 0.05 + r() * 0.06;
        const bh = 0.28 + r() * 0.14;
        m4.makeScale(bw, bh, 0.3).setPosition(x + bw / 2, 0.055 + shelf * 0.5 + bh / 2, 0.02);
        books.setMatrixAt(n, m4);
        books.setColorAt(n, col.set(pick(P.books, r)));
        n++;
        x += bw + 0.005;
      }
    }
    books.count = n;
    books.castShadow = true;
    books.receiveShadow = true;
    books.instanceMatrix.needsUpdate = true;
    if (books.instanceColor) books.instanceColor.needsUpdate = true;
    g.add(books);
    // little things on top: a plant, a globe or a stack of books
    const what = Math.floor(r() * 3);
    if (what === 0) {
      g.add(mesh(cyl(0.11, 0.08, 0.16, 10), mat('#e98a6a'), w / 2 - 0.3, H + 0.08, 0));
      g.add(mesh(sph(0.15, 1), mat(P.leaf1), w / 2 - 0.3, H + 0.26, 0));
    } else if (what === 1) {
      g.add(mesh(cyl(0.08, 0.1, 0.04, 10), mat(P.woodDark), -w / 2 + 0.35, H + 0.02, 0));
      g.add(mesh(sph(0.14, 2), mat('#7ab8e8'), -w / 2 + 0.35, H + 0.2, 0));
      g.add(mesh(sph(0.09, 1), mat('#8cc47a'), -w / 2 + 0.38, H + 0.24, 0.08, false));
    } else {
      for (let i = 0; i < 3; i++) g.add(mesh(box(0.38 - i * 0.04, 0.07, 0.26), mat(pick(P.books, r)), 0.2, H + 0.035 + i * 0.07, 0));
    }
    return g;
  },

  /** A patterned rug: a border, a row of diamonds down the middle, and a fringe at both ends. */
  rug(d) {
    const w = d.w ?? 2;
    const dd = d.d ?? 3;
    const col = d.color ?? '#d98c8c';
    const acc = d.accent ?? '#f2c4b0';
    const PX = 48;
    const c = document.createElement('canvas');
    c.width = Math.round(w * PX);
    c.height = Math.round(dd * PX);
    const g2 = c.getContext('2d')!;
    g2.fillStyle = col;
    g2.fillRect(0, 0, c.width, c.height);
    g2.fillStyle = acc;
    g2.fillRect(10, 10, c.width - 20, c.height - 20);
    g2.fillStyle = col;
    g2.fillRect(16, 16, c.width - 32, c.height - 32);
    g2.fillStyle = acc;
    const step = Math.min(c.width, 60);
    for (let y = step; y < c.height - step / 2; y += step) {
      g2.beginPath();
      g2.moveTo(c.width / 2, y - step * 0.35);
      g2.lineTo(c.width / 2 + step * 0.3, y);
      g2.lineTo(c.width / 2, y + step * 0.35);
      g2.lineTo(c.width / 2 - step * 0.3, y);
      g2.fill();
    }
    for (let x = 30; x < c.width - 20; x += 40) for (const y of [26, c.height - 26]) {
      g2.beginPath();
      g2.arc(x, y, 5, 0, Math.PI * 2);
      g2.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const gr = group(mesh(box(w, 0.02, dd), toonMat({ map: tex }), 0, 0.011, 0, false));
    for (const z of [-dd / 2 - 0.05, dd / 2 + 0.05]) for (let x = -w / 2 + 0.05; x <= w / 2 - 0.04; x += 0.08) gr.add(mesh(box(0.025, 0.012, 0.1), mat('#fff6ea'), x, 0.01, z, false));
    return merged(gr);
  },

  /** A glazed pot with a rim and soil, and a layered fan of leaves (some variants are ferns). */
  plant(d, r) {
    const fern = Math.abs(Math.round(d.seed ?? 0)) % 2 === 0;
    const pot = pick(['#e98a6a', '#7ab8c8', '#f2e2c4', '#c98ab8'], r);
    const g = group(
      mesh(cyl(0.2, 0.15, 0.36, 14), mat(pot), 0, 0.18, 0),
      mesh(cyl(0.23, 0.23, 0.06, 14), mat(pot), 0, 0.36, 0),
      mesh(cyl(0.18, 0.18, 0.02, 14), mat(P.soil), 0, 0.385, 0, false),
    );
    const n = fern ? 9 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4;
      const tilt = fern ? 0.9 : 0.45 + r() * 0.3;
      const len = fern ? 0.45 : 0.32 + r() * 0.12;
      const leaf = mesh(sph(fern ? 0.1 : 0.15, 1), mat(i % 3 === 0 ? P.leaf3 : i % 2 ? P.leaf1 : P.leaf2), Math.cos(a) * len * 0.45, 0.4 + Math.cos(tilt) * len * 0.8, Math.sin(a) * len * 0.45);
      leaf.scale.set(fern ? 0.5 : 0.65, fern ? 2.4 : 1.7, fern ? 0.25 : 0.5);
      leaf.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
      g.add(leaf);
    }
    return merged(g);
  },

  /** A framed window with cross bars, a sill with a little plant, and curtains tied back on both sides. */
  window(d) {
    const w = d.w ?? 2;
    const wood = mat(P.woodLight);
    const curtain = mat(d.color ?? '#e8a8a8');
    const g = group(
      mesh(box(w + 0.2, 1.4, 0.08), wood, 0, 1.7, 0),
      mesh(box(w, 1.2, 0.09), glow(P.sky, 0.35), 0, 1.7, 0.005, false),
      mesh(box(0.05, 1.2, 0.1), wood, 0, 1.7, 0.01),
      mesh(box(w, 0.05, 0.1), wood, 0, 1.7, 0.01),
      mesh(box(w + 0.4, 0.07, 0.24), mat('#fff6ea'), 0, 1.06, 0.1),
      mesh(cyl(0.1, 0.08, 0.16, 10), mat('#e98a6a'), w / 2 - 0.25, 1.17, 0.12),
      mesh(sph(0.13, 1), mat(P.leaf1), w / 2 - 0.25, 1.33, 0.12),
      mesh(cyl(0.025, 0.025, w + 0.7, 6), mat(P.woodDark), 0, 2.5, 0.12),
    );
    (g.children[g.children.length - 1] as THREE.Mesh).rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) {
      const c = mesh(cyl(0.12, 0.2, 1.5, 8), curtain, sx * (w / 2 + 0.18), 1.72, 0.14);
      c.scale.set(1, 1, 0.45);
      g.add(c);
      g.add(mesh(box(0.3, 0.06, 0.06), mat('#e8c35a'), sx * (w / 2 + 0.18), 1.6, 0.22, false));
    }
    return merged(g);
  },

  sign(d) {
    const text = labelPlane(d.label ?? '', 0.36);
    const tw = (text.geometry as THREE.PlaneGeometry).parameters.width;
    text.position.z = 0.035;
    return group(mesh(box(tw + 0.3, 0.55, 0.06), mat(P.woodLight), 0, 0, 0), text);
  },

  cafeTable() {
    return group(
      mesh(cyl(0.42, 0.42, 0.05, 20), mat(P.woodLight), 0, 0.74, 0),
      mesh(cyl(0.05, 0.05, 0.7, 8), mat(P.dark), 0, 0.37, 0),
      mesh(cyl(0.25, 0.25, 0.04, 16), mat(P.dark), 0, 0.02, 0),
    );
  },

  stool(_d, r) {
    return group(
      mesh(cyl(0.22, 0.22, 0.07, 16), mat(pick(P.chairs, r)), 0, 0.445, 0),
      mesh(cyl(0.035, 0.035, 0.42, 6), mat(P.metal), 0, 0.21, 0),
      mesh(cyl(0.17, 0.17, 0.03, 14), mat(P.metal), 0, 0.015, 0),
    );
  },

  counter(d) {
    const w = d.w ?? 4;
    const dd = d.d ?? 0.9;
    return group(
      mesh(box(w, 1, dd), mat(P.wood), 0, 0.5, 0),
      mesh(box(w + 0.1, 0.06, dd + 0.1), mat(P.woodLight), 0, 1.03, 0),
      mesh(box(w, 0.08, 0.04), mat(P.woodDark), 0, 0.15, dd / 2 + 0.01),
    );
  },

  coffeeMachine() {
    return group(
      mesh(box(0.6, 0.55, 0.45), mat(P.machine), 0, 0.275, 0),
      mesh(box(0.62, 0.06, 0.47), mat(P.dark), 0, 0.58, 0),
      mesh(box(0.26, 0.08, 0.16), mat(P.dark), 0, 0.36, 0.25),
      mesh(box(0.36, 0.03, 0.22), mat(P.metal), 0, 0.02, 0.24),
      mesh(sph(0.03, 1), glow(P.red), 0.22, 0.45, 0.23, false),
      mesh(cyl(0.05, 0.04, 0.09, 10), mat(P.cup), 0, 0.08, 0.24),
    );
  },

  cup() {
    return group(
      mesh(cyl(0.05, 0.04, 0.09, 12), mat(P.cup), 0, 0.045, 0),
      mesh(cyl(0.045, 0.045, 0.005, 12), mat(P.coffee), 0, 0.092, 0, false),
    );
  },
  lake(d) {
    const pts = d.points ?? [];
    const cx = pts.reduce((a, p) => a + p[0], 0) / Math.max(pts.length, 1);
    const cz = pts.reduce((a, p) => a + p[1], 0) / Math.max(pts.length, 1);
    const shape = (k: number) =>
      new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * k, -(cz + (z - cz) * k))));
    const flat = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => {
      const o = mesh(geo, m, 0, y, 0, false);
      o.rotation.x = -Math.PI / 2;
      return o;
    };
    return group(
      flat(new THREE.ShapeGeometry(shape(1.06), 2), mat('#e8d8a8', 1), 0.012),
      flat(new THREE.ShapeGeometry(shape(1.0), 2), mat(P.waterRim, 0.6), 0.02),
      flat(new THREE.ShapeGeometry(shape(0.975), 2), mat('#e9f6fb'), 0.026), // a pale foam band along the shore
      flat(new THREE.ShapeGeometry(shape(0.95), 2), waterMat(P.water), 0.03),
    );
  },

  dock(d) {
    const w = d.w ?? 2;
    const dd = d.d ?? 8;
    const g = group();
    for (let z = -dd / 2 + 0.2; z < dd / 2; z += 0.42) g.add(mesh(box(w, 0.08, 0.38), mat(z % 0.84 < 0.42 ? P.wood : P.woodLight), 0, 0.16, z));
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) for (let z = -dd / 2 + 0.4; z < dd / 2; z += 2.2) g.add(mesh(cyl(0.08, 0.08, 0.6, 8), mat(P.woodDark), x, 0.0, z));
    return g;
  },

  /** A notched pad; some carry a pink or white flower. */
  lilyPad(_d, r) {
    const rad = 0.3 + r() * 0.15;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(rad, 16, 0.4, Math.PI * 2 - 0.5), mat(r() < 0.5 ? P.leaf1 : P.leaf2));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.05;
    pad.receiveShadow = true;
    const g = group(pad);
    if (r() < 0.4) {
      const color = r() < 0.5 ? '#f7a1c4' : '#ffffff';
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const petal = mesh(sph(0.05, 0), mat(color), 0.08 + Math.cos(a) * 0.05, 0.1, 0.05 + Math.sin(a) * 0.05, false);
        petal.scale.set(1, 0.5, 0.6);
        petal.rotation.y = -a;
        g.add(petal);
      }
      g.add(mesh(sph(0.03, 0), mat('#ffcf3a'), 0.08, 0.12, 0.05, false));
    }
    return g;
  },

  /** Two or three rounded stones together; half wear a soft moss cap. */
  rock(_d, r) {
    const g = group();
    const greys = ['#b8b2b8', '#a9a3ad', '#c4bec2'];
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const s = (0.14 + r() * 0.22) * (i === 0 ? 1.2 : 0.8);
      const o = mesh(sph(s, 1), mat(greys[i % 3]), (r() - 0.5) * 0.35, s * 0.45, (r() - 0.5) * 0.3);
      o.scale.set(1.25, 0.72, 1);
      g.add(o);
      if (i === 0 && r() < 0.5) {
        const moss = mesh(sph(s * 0.85, 1), mat('#8cc47a'), o.position.x, s * 0.72, o.position.z, false);
        moss.scale.set(1.2, 0.35, 1);
        g.add(moss);
      }
    }
    return g;
  },

  /** A tuft of tapered blades in a few greens; now and then a tiny white flower. */
  grass(_d, r) {
    const g = group();
    const greens = [P.leaf2, P.leaf3, P.leaf1];
    for (let i = 0; i < 5; i++) {
      const h = 0.24 + r() * 0.18;
      const blade = mesh(new THREE.ConeGeometry(0.03, h, 3), mat(greens[i % 3]), (r() - 0.5) * 0.2, h / 2, (r() - 0.5) * 0.2, false);
      blade.rotation.z = (r() - 0.5) * 0.6;
      blade.rotation.x = (r() - 0.5) * 0.4;
      g.add(blade);
    }
    if (r() < 0.3) g.add(mesh(sph(0.03, 0), mat('#ffffff'), 0.05, 0.36, 0, false));
    return g;
  },

  /** A low base with two rows of uneven round clumps, dotted with little flowers. */
  hedge(d, r) {
    const w = d.w ?? 2;
    const dd = d.d ?? 1;
    const g = group(mesh(box(w, 0.55, dd), mat(P.pine1), 0, 0.275, 0));
    const along = w > dd;
    const len = along ? w : dd;
    for (let k = -len / 2 + 0.45; k < len / 2; k += 0.9) {
      for (const off of [-0.2, 0.2]) {
        const rad = 0.42 + r() * 0.12;
        const kk = k + (off > 0 ? 0.45 : 0);
        if (Math.abs(kk) > len / 2 - 0.3) continue;
        g.add(mesh(sph(rad, 1), mat(off > 0 ? P.pine2 : '#58a874'), along ? kk : off, 0.6 + r() * 0.12, along ? off : kk));
      }
      if (r() < 0.35) g.add(mesh(sph(0.045, 0), mat(r() < 0.5 ? '#ffffff' : '#f7a1c4'), along ? k : (r() - 0.5) * 0.4, 1.02, along ? (r() - 0.5) * 0.4 : k, false));
    }
    return merged(g);
  },

  bandstand(d) {
    const r = d.w ?? 3.2;
    // The roof fades out while you stand under it, so the overhead camera can still see you.
    const roofMat = toonMat({ color: '#e98a8a', roughness: 0.85, flatShading: true, transparent: true });
    const roof = group(mesh(new THREE.ConeGeometry(r + 0.5, 1.3, 8), roofMat, 0, 3.35, 0), mesh(sph(0.15, 1), roofMat, 0, 4.05, 0));
    roof.children[0].rotation.y = Math.PI / 8;
    roof.userData.fadeRadius = r + 0.6;
    const g = group(mesh(cyl(r, r + 0.15, 0.08, 8), mat('#fff6ea'), 0, 0.04, 0, false), roof);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      g.add(mesh(cyl(0.08, 0.1, 2.7, 8), mat('#fff6ea'), Math.sin(a) * 3, 1.35, Math.cos(a) * 3));
    }
    return g;
  },

  swingSet(d) {
    const w = d.w ?? 4.8;
    const g = group(mesh(cyl(0.06, 0.06, w, 8), mat('#e98a8a'), 0, 2.4, 0));
    (g.children[0] as THREE.Mesh).rotation.z = Math.PI / 2;
    for (const sx of [-w / 2, w / 2]) {
      for (const sz of [-0.6, 0.6]) {
        const leg = mesh(cyl(0.05, 0.05, 2.5, 8), mat('#7ab8ff'), sx, 1.2, sz / 2);
        leg.rotation.x = sz > 0 ? -0.25 : 0.25;
        g.add(leg);
      }
    }
    return g;
  },

  log(d) {
    const o = mesh(cyl(0.22, 0.24, 1.3, 10), mat(P.trunk), 0, 0.22, 0);
    o.rotation.z = Math.PI / 2;
    return group(o, mesh(cyl(0.2, 0.2, 0.02, 10), mat(P.woodLight), 0.66, 0.22, 0, false));
  },

  leafPile() {
    return group(); // drawn and animated by the leaves life system
  },

  knowledgeTree() {
    // Grows with the town's study minutes today: setStage(0..4) is called by the game.
    const g = group(mesh(cyl(0.16, 0.24, 1.6, 8), mat(P.trunk), 0, 0.8, 0));
    const crown = group();
    crown.position.y = 1.7;
    const leaves = [P.leaf1, P.leaf2, P.leaf3];
    const blobs = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2;
      const b = mesh(sph(0.55, 1), mat(leaves[i % 3]), Math.cos(a) * 0.55, Math.sin(i * 1.7) * 0.25, Math.sin(a) * 0.55);
      crown.add(b);
      return b;
    });
    const blossoms = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2 * 3;
      const r = 0.7 + (i % 3) * 0.15;
      const o = mesh(sph(0.09, 0), glow(['#f7a1c4', '#ffd36e', '#ffffff', '#c3a6ff'][i % 4], 0.6), Math.cos(a) * r, 0.25 + Math.sin(i) * 0.35, Math.sin(a) * r, false);
      crown.add(o);
      return o;
    });
    g.add(crown);
    const plaque = labelPlane('🌳 Knowledge Tree', 0.18);
    plaque.position.set(0, 0.45, 0.27);
    g.add(plaque);
    g.userData.setStage = (stage: number) => {
      const k = 0.55 + stage * 0.22;
      crown.scale.setScalar(k);
      crown.position.y = 1.2 + k * 0.6;
      blobs.forEach((b, i) => (b.visible = i < 3 + stage));
      blossoms.forEach((b, i) => (b.visible = i < stage * 6));
    };
    g.userData.setStage(0);
    return g;
  },

  mound(d) {
    const r = d.w ?? 3;
    const o = mesh(sph(r, 2), mat(P.leaf3, 1), 0, -r * 0.88, 0, false);
    return group(o);
  },

  cherry(d, r) {
    const s = d.h ?? 1;
    const g = group(mesh(cyl(0.11 * s, 0.17 * s, 1.4 * s, 8), mat('#7a5446'), 0, 0.7 * s, 0));
    const pinks = ['#f7b7c8', '#f9c9d6', '#f2a2b8', '#fde0e8'];
    for (let i = 0; i < 5; i++) {
      g.add(mesh(sph((0.5 + r() * 0.3) * s), mat(pinks[i % 4]), (r() - 0.5) * 1.1 * s, (1.6 + r() * 0.6) * s, (r() - 0.5) * 1.1 * s));
    }
    return g;
  },

  /** A low red arched bridge running along z: deck, side rails with an arch, and posts. */
  bridge(d) {
    const len = d.d ?? 7;
    const w = d.w ?? 1.7;
    const red = mat('#c8503f');
    const g = group(mesh(box(w, 0.1, len), mat('#9a6a4f'), 0, 0.14, 0));
    for (const x of [-w / 2, w / 2]) {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const z = -len / 2 + u * len;
        const arch = Math.sin(u * Math.PI) * 0.35;
        g.add(mesh(box(0.08, 0.55 + arch, 0.08), red, x, (0.55 + arch) / 2 + 0.1, z));
      }
      const rail = mesh(box(0.1, 0.08, len), red, x, 0.75, 0);
      g.add(rail);
      const top = new THREE.Mesh(new THREE.TorusGeometry(len / 2, 0.05, 6, 24, Math.PI), red);
      top.rotation.y = Math.PI / 2;
      top.scale.set(1, 0.1, 1);
      top.position.set(x, 0.75, 0);
      g.add(top);
    }
    return g;
  },

  /** Raked gravel: pale stone with combed lines. */
  gravel(d) {
    const w = d.w ?? 2;
    const dd = d.d ?? 2;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g2 = c.getContext('2d')!;
    g2.fillStyle = '#e9e3d6';
    g2.fillRect(0, 0, 64, 64);
    g2.strokeStyle = '#d4ccbb';
    g2.lineWidth = 2;
    for (let y = 4; y < 64; y += 8) {
      g2.beginPath();
      g2.moveTo(0, y);
      g2.lineTo(64, y);
      g2.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / 1.2, dd / 1.2);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, dd), toonMat({ map: tex, roughness: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    m.receiveShadow = true;
    return group(m);
  },

  /** A checked picnic blanket. */
  blanket(d, r) {
    const w = d.w ?? 1.6;
    const dd = d.d ?? 2.2;
    const colors = ['#e46b6b', '#6b9be4', '#e4b86b', '#7cc47a'];
    const col = pick(colors, r);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g2 = c.getContext('2d')!;
    g2.fillStyle = '#fffaf0';
    g2.fillRect(0, 0, 64, 64);
    g2.fillStyle = col;
    g2.globalAlpha = 0.8;
    for (let i = 0; i < 64; i += 16) {
      g2.fillRect(i, 0, 8, 64);
      g2.fillRect(0, i, 64, 8);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / 0.8, dd / 0.8);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, dd), toonMat({ map: tex, roughness: 1 }));
    m.position.y = 0.02;
    m.receiveShadow = true;
    return group(m);
  },

  /** A stone lantern that glows at night like the street lamps. */
  lantern() {
    const stone = mat('#b9b2a6');
    return group(
      mesh(cyl(0.22, 0.26, 0.12, 6), stone, 0, 0.06, 0),
      mesh(cyl(0.08, 0.1, 0.55, 6), stone, 0, 0.4, 0),
      mesh(box(0.34, 0.26, 0.34), stone, 0, 0.8, 0),
      mesh(box(0.2, 0.16, 0.36), glow(P.lampGlow, 1.6, 'street'), 0, 0.8, 0, false),
      mesh(new THREE.ConeGeometry(0.34, 0.22, 4), stone, 0, 1.04, 0),
    );
  },

  cushion(_d, r) {
    const colors = ['#8fb8a8', '#c9a6d8', '#e8b48a', '#a7c4e8', '#e8a7b8'];
    const m = mesh(sph(0.32, 2), mat(pick(colors, r)), 0, 0.1, 0);
    m.scale.set(1, 0.32, 1);
    return group(m);
  },

  /** The raised wooden stage with a darker front skirt and two steps. */
  stage(d) {
    const w = d.w ?? 8;
    const dd = d.d ?? 5;
    const g = group(mesh(box(w, 0.3, dd), mat('#b98a5e'), 0, 0.15, 0));
    g.add(mesh(box(w + 0.1, 0.06, dd + 0.1), mat('#8a6040'), 0, 0.31, 0, false));
    for (let i = -w / 2 + 0.5; i < w / 2; i += 1) g.add(mesh(box(0.02, 0.005, dd), mat('#a37650'), i, 0.345, 0, false));
    g.add(mesh(box(2, 0.15, 0.5), mat('#a37650'), 0, 0.075, dd / 2 + 0.25));
    return g;
  },

  /** One amphitheatre seat: a wooden block bench with a low back, facing rot. */
  amphiSeat() {
    return group(
      mesh(box(0.9, 0.12, 0.45), mat(P.wood), 0, 0.42, 0),
      mesh(box(0.8, 0.36, 0.3), mat('#a37650'), 0, 0.18, 0),
      mesh(box(0.9, 0.3, 0.06), mat(P.wood), 0, 0.68, -0.2),
    );
  },

  /** A raised garden bed: dark soil in a low wooden frame. */
  soil(d) {
    const w = d.w ?? 2;
    const dd = d.d ?? 1.8;
    const frame = mat('#9a6a4f');
    const g = group(mesh(box(w, 0.12, dd), mat('#6b4a36'), 0, 0.06, 0));
    for (const z of [-dd / 2, dd / 2]) g.add(mesh(box(w + 0.1, 0.16, 0.08), frame, 0, 0.08, z));
    for (const x of [-w / 2, w / 2]) g.add(mesh(box(0.08, 0.16, dd), frame, x, 0.08, 0));
    return g;
  },

  /** A framed painting: a little landscape of hills, a sun and a tree. */
  frame(d, r) {
    const w = d.w ?? 1;
    const h = d.h ?? 0.75;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 96;
    const g2 = c.getContext('2d')!;
    const sky = pick(['#bfe3f5', '#fde2c8', '#d8d0f2'], r);
    g2.fillStyle = sky;
    g2.fillRect(0, 0, 128, 96);
    g2.fillStyle = '#ffd36e';
    g2.beginPath();
    g2.arc(30 + r() * 60, 28, 11, 0, Math.PI * 2);
    g2.fill();
    for (const [col, y] of [['#9bd48a', 60], ['#6fbf6a', 74]] as const) {
      g2.fillStyle = col;
      g2.beginPath();
      g2.moveTo(0, 96);
      for (let x = 0; x <= 128; x += 16) g2.lineTo(x, y + Math.sin(x * 0.05 + r() * 3) * 8);
      g2.lineTo(128, 96);
      g2.fill();
    }
    g2.fillStyle = '#8a5a3c';
    g2.fillRect(92, 50, 4, 16);
    g2.fillStyle = '#4f9e6a';
    g2.beginPath();
    g2.arc(94, 46, 10, 0, Math.PI * 2);
    g2.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    pic.position.set(0, 0, 0.035);
    pic.userData.keep = true;
    const gr = group(mesh(box(w + 0.14, h + 0.14, 0.05), mat(pick([P.woodDark, '#e8c35a', '#fff6ea'], r)), 0, 0, 0), pic);
    return merged(gr);
  },

  /** A hanging lamp: a cord from above, a shade, and a bulb that glows at night. */
  pendant(d) {
    const cord = 3.2 - (d.y ?? 2.3); // hangs from the top of the room down to d.y (makeDecor puts the group at d.y)
    return group(
      mesh(cyl(0.008, 0.008, cord, 4), mat(P.dark), 0, cord / 2, 0, false),
      mesh(new THREE.ConeGeometry(0.22, 0.2, 14, 1, true), toonMat({ color: d.color ?? '#e8c35a', side: THREE.DoubleSide }), 0, 0, 0),
      mesh(sph(0.07, 1), glow(P.lampGlow, 1.6, 'street'), 0, -0.08, 0, false),
    );
  },

  /** A chalkboard menu on a little easel. */
  chalkboard(d) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 160;
    const g2 = c.getContext('2d')!;
    g2.fillStyle = '#2f3b36';
    g2.fillRect(0, 0, 128, 160);
    g2.fillStyle = '#f4f0e6';
    g2.textAlign = 'center';
    g2.font = 'bold 18px ui-rounded, system-ui';
    g2.fillText('MENU', 64, 26);
    g2.font = '15px ui-rounded, system-ui';
    (d.label ?? 'Latte|Matcha|Cocoa|Espresso').split('|').forEach((t, i) => g2.fillText(t, 64, 56 + i * 24));
    g2.fillStyle = '#f7a1c4';
    g2.fillText('♥', 64, 150);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set(0, 1.0, 0.04);
    board.rotation.x = -0.18;
    board.userData.keep = true;
    const gr = group(mesh(box(0.7, 0.85, 0.05), mat(P.woodDark), 0, 1.0, 0), board);
    (gr.children[0] as THREE.Mesh).rotation.x = -0.18;
    for (const sx of [-0.3, 0.3]) {
      const leg = mesh(box(0.05, 1.2, 0.05), mat(P.woodDark), sx, 0.55, -0.08);
      leg.rotation.x = -0.18;
      gr.add(leg);
    }
    return merged(gr);
  },

  /** A string of small glowing bulbs, sagging gently along x. */
  stringLights(d) {
    const w = d.w ?? 6;
    const g = group();
    const n = Math.round(w * 2.5);
    const colors = ['#ffd36e', '#ff9e7a', '#a8e0ff', '#c3a6ff'];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = -w / 2 + u * w;
      const y = -Math.sin(u * Math.PI) * 0.25;
      g.add(mesh(sph(0.045, 1), glow(colors[i % 4], 1.4, 'street'), x, y, 0, false));
      if (i < n) {
        const x2 = -w / 2 + ((i + 1) / n) * w;
        const y2 = -Math.sin(((i + 1) / n) * Math.PI) * 0.25;
        const seg = mesh(cyl(0.006, 0.006, Math.hypot(x2 - x, y2 - y), 4), mat(P.dark), (x + x2) / 2, (y + y2) / 2 + 0.03, 0, false);
        seg.rotation.z = Math.atan2(y2 - y, x2 - x) - Math.PI / 2;
        g.add(seg);
      }
    }
    return merged(g);
  },

  /** A soft slanted beam of sunlight from a window (by day only; the sky dims it at night). */
  sunbeam(d) {
    const w = d.w ?? 2;
    const len = 3.2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), SUNBEAM);
    m.rotation.x = -Math.PI / 2 + 0.75;
    m.position.set(0, 1.2, len / 2 - 0.6);
    m.userData.sunbeam = true;
    return group(m);
  },

  /** A wooden signpost; d.label is "Arrow one|Arrow two|…", alternating left and right. */
  signpost(d) {
    const g = group(mesh(box(0.12, 2.2, 0.12), mat(P.woodDark), 0, 1.1, 0), mesh(new THREE.ConeGeometry(0.1, 0.16, 4), mat(P.woodDark), 0, 2.28, 0));
    const lines = (d.label ?? '').split('|').filter(Boolean);
    lines.forEach((t, i) => {
      const dir = i % 2 ? -1 : 1;
      const y = 1.95 - i * 0.36;
      const text = labelPlane(t, 0.2);
      const tw = (text.geometry as THREE.PlaneGeometry).parameters.width;
      const bw = tw + 0.35;
      const board = group();
      board.position.set(dir * (bw / 2 + 0.04), y, 0.07);
      board.add(mesh(box(bw, 0.28, 0.05), mat(i % 2 ? P.woodLight : '#e3b98a'), 0, 0, 0));
      const tip = mesh(new THREE.CylinderGeometry(0.0, 0.2, 0.05, 3), mat(i % 2 ? P.woodLight : '#e3b98a'), dir * (bw / 2 + 0.06), 0, 0);
      tip.rotation.set(Math.PI / 2, 0, dir * Math.PI / 2);
      board.add(tip);
      text.position.set(0, 0, 0.03);
      board.add(text);
      g.add(board);
    });
    return g;
  },

  /** A spotlight on a pole; its beam is drawn by the stage effects, which switch it on and off. */
  spotlight() {
    const head = mesh(cyl(0.16, 0.24, 0.4, 10), mat(P.dark), 0, 3, 0.1);
    head.rotation.x = 0.9;
    return group(mesh(cyl(0.05, 0.07, 3, 8), mat(P.dark), 0, 1.5, 0), head);
  },
};

/** The decor object at the origin, unrotated (used as an instancing template). */
export function decorTemplate(d: Decor): THREE.Object3D {
  return builders[d.kind](d, rng(d.seed ?? d.x * 131 + d.z * 71));
}

export function makeDecor(d: Decor): THREE.Object3D {
  const o = decorTemplate(d);
  o.position.set(d.x, d.y ?? 0, d.z);
  o.rotation.y = d.rot ?? 0;
  return o;
}
