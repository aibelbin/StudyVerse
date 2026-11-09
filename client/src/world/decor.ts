import * as THREE from 'three';
import type { Decor, DecorKind } from '../../../shared/scenes/types';
import { glow, mat, mesh } from './materials';
import { PALETTE as P } from './palette';
import { rng } from './rng';
import { labelTexture } from './text';

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
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 16 : 0;
    for (let col = -1; col < 4; col++) {
      const shade = 236 + Math.floor(r() * 14);
      g.fillStyle = `rgb(${shade}, ${shade - 18}, ${shade - 50})`;
      g.beginPath();
      g.roundRect(col * 32 + off + 2, row * 32 + 2, 28, 28, 9);
      g.fill();
    }
  }
  cobbleTex = new THREE.CanvasTexture(c);
  cobbleTex.wrapS = cobbleTex.wrapT = THREE.RepeatWrapping;
  cobbleTex.colorSpace = THREE.SRGBColorSpace;
  cobbleTex.anisotropy = 4;
  return cobbleTex;
}

const builders: Record<DecorKind, Builder> = {
  tree(d, r) {
    const s = d.h ?? 1;
    const g = group(mesh(cyl(0.12 * s, 0.18 * s, 1.3 * s, 8), mat(P.trunk), 0, 0.65 * s, 0));
    const greens = [P.leaf1, P.leaf2, P.leaf3];
    for (let i = 0; i < 4; i++) {
      g.add(mesh(sph((0.55 + r() * 0.3) * s), mat(greens[i % 3]), (r() - 0.5) * 0.8 * s, (1.5 + r() * 0.6) * s, (r() - 0.5) * 0.8 * s));
    }
    return g;
  },

  pine(d) {
    const s = d.h ?? 1;
    const g = group(mesh(cyl(0.1 * s, 0.14 * s, 0.8 * s, 8), mat(P.trunk), 0, 0.4 * s, 0));
    for (let i = 0; i < 3; i++) {
      g.add(mesh(new THREE.ConeGeometry((1 - i * 0.25) * s, 1.1 * s, 8), mat(i % 2 ? P.pine1 : P.pine2), 0, (1 + i * 0.6) * s, 0));
    }
    return g;
  },

  bush(_d, r) {
    const g = group();
    for (let i = 0; i < 3; i++) g.add(mesh(sph(0.35 + r() * 0.15), mat(i % 2 ? P.leaf1 : P.leaf2), (i - 1) * 0.35, 0.3, (r() - 0.5) * 0.3));
    return g;
  },

  flowers(_d, r) {
    const g = group();
    for (let i = 0; i < 9; i++) {
      const x = (r() - 0.5) * 0.9;
      const z = (r() - 0.5) * 0.5;
      g.add(mesh(cyl(0.012, 0.012, 0.26, 4), mat(P.leaf2), x, 0.13, z, false));
      g.add(mesh(sph(0.065, 0), mat(pick(P.flowers, r)), x, 0.28, z, false));
    }
    return g;
  },

  lampPost() {
    return group(
      mesh(cyl(0.05, 0.07, 2.4, 8), mat(P.dark), 0, 1.2, 0),
      mesh(sph(0.16, 2), glow(P.lampGlow, 1.6, 'street'), 0, 2.5, 0, false),
      mesh(new THREE.ConeGeometry(0.22, 0.16, 8), mat(P.dark), 0, 2.68, 0),
    );
  },

  bench() {
    const g = group(
      mesh(box(1.5, 0.08, 0.45), mat(P.wood), 0, 0.45, 0),
      mesh(box(1.5, 0.36, 0.06), mat(P.wood), 0, 0.75, -0.2),
    );
    for (const x of [-0.65, 0.65]) for (const z of [-0.17, 0.17]) g.add(mesh(box(0.06, 0.45, 0.06), mat(P.dark), x, 0.225, z));
    return g;
  },

  path(d) {
    const w = d.w ?? 1;
    const dd = d.d ?? 1;
    const tex = cobbles().clone();
    tex.repeat.set(w / 2.4, dd / 2.4);
    tex.needsUpdate = true;
    return mesh(box(w, 0.02, dd), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), 0, 0.01, 0, false);
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
      mesh(box(w, 0.03, dd), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), 0, 0.016, 0, false),
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
    const water = mesh(cyl(1, 1, 0.06, 32), new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.15, metalness: 0.1 }), 0, 0.04, 0, false);
    water.scale.set(sx, 1, sz);
    const g = group(rim, water);
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      const k = 0.3 + r() * 0.5;
      g.add(mesh(cyl(0.2, 0.2, 0.01, 10), mat(P.leaf1), Math.cos(a) * sx * k, 0.075, Math.sin(a) * sz * k, false));
    }
    return g;
  },

  building(d) {
    const w = d.w ?? 6;
    const dd = d.d ?? 5;
    const h = d.h ?? 4;
    const accent = d.accent ?? P.woodDark;
    const front = dd / 2;
    const g = group(mesh(box(w, h, dd), mat(d.color ?? '#f2dcc0'), 0, h / 2, 0));
    const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.3, 0), new THREE.Vector2(w / 2 + 0.3, 0), new THREE.Vector2(0, 1.7)]);
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: dd + 0.6, bevelEnabled: false });
    roofGeo.translate(0, 0, -(dd + 0.6) / 2);
    g.add(mesh(roofGeo, mat(accent), 0, h, 0));
    g.add(mesh(box(1.0, 1.7, 0.1), mat(P.woodDark), 0, 0.85, front + 0.03));
    g.add(mesh(sph(0.05, 1), mat(P.metal), 0.33, 0.85, front + 0.1, false));
    for (const x of [-w / 2 + 1.3, w / 2 - 1.3]) {
      g.add(mesh(box(1.2, 1.0, 0.08), mat(P.woodLight), x, 1.7, front + 0.02));
      g.add(mesh(box(1.0, 0.8, 0.1), glow(P.windowGlow, 0.5, 'window'), x, 1.7, front + 0.03, false));
    }
    const awning = mesh(box(w * 0.55, 0.08, 0.9), mat(accent), 0, 2.15, front + 0.4);
    awning.rotation.x = 0.28;
    g.add(awning);
    if (d.label) {
      const text = labelPlane(d.label, 0.42);
      const tw = (text.geometry as THREE.PlaneGeometry).parameters.width;
      g.add(mesh(box(tw + 0.4, 0.6, 0.08), mat(P.woodLight), 0, h - 0.55, front + 0.04));
      text.position.set(0, h - 0.55, front + 0.09);
      g.add(text);
    }
    return g;
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
    const books = new THREE.InstancedMesh(box(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), max);
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
    return g;
  },

  rug(d) {
    const w = d.w ?? 2;
    const dd = d.d ?? 3;
    return group(
      mesh(box(w, 0.02, dd), mat(d.color ?? '#d98c8c', 1), 0, 0.011, 0, false),
      mesh(box(w - 0.3, 0.022, dd - 0.3), mat(d.accent ?? '#f2c4b0', 1), 0, 0.012, 0, false),
    );
  },

  plant(_d, r) {
    const g = group(mesh(cyl(0.2, 0.15, 0.36, 12), mat(P.pot), 0, 0.18, 0), mesh(cyl(0.18, 0.18, 0.02, 12), mat(P.soil), 0, 0.36, 0, false));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r();
      const leaf = mesh(sph(0.16, 1), mat(i % 2 ? P.leaf1 : P.leaf2), Math.cos(a) * 0.12, 0.62, Math.sin(a) * 0.12);
      leaf.scale.set(0.6, 1.6, 0.6);
      leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(leaf);
    }
    return g;
  },

  window(d) {
    const w = d.w ?? 2;
    return group(
      mesh(box(w + 0.16, 1.36, 0.08), mat(P.woodLight), 0, 1.7, 0),
      mesh(box(w, 1.2, 0.09), glow(P.sky, 0.35), 0, 1.7, 0.005, false),
      mesh(box(0.05, 1.2, 0.1), mat(P.woodLight), 0, 1.7, 0.01),
      mesh(box(w, 0.05, 0.1), mat(P.woodLight), 0, 1.7, 0.01),
    );
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
      flat(new THREE.ShapeGeometry(shape(0.96), 2), new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.12, metalness: 0.1 }), 0.03),
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

  lilyPad(_d, r) {
    const pad = mesh(cyl(0.3 + r() * 0.15, 0.3 + r() * 0.15, 0.02, 12, ), mat(r() < 0.5 ? P.leaf1 : P.leaf2), 0, 0.05, 0, false);
    const g = group(pad);
    if (r() < 0.35) g.add(mesh(sph(0.08, 0), mat(r() < 0.5 ? '#f7a1c4' : '#ffffff'), 0.08, 0.1, 0.05, false));
    return g;
  },

  rock(_d, r) {
    const s = 0.18 + r() * 0.3;
    const o = mesh(sph(s, 0), mat(r() < 0.5 ? '#b8b2b8' : '#a9a3ad'), 0, s * 0.45, 0);
    o.scale.set(1.2, 0.7, 1);
    return group(o);
  },

  grass(_d, r) {
    const g = group();
    for (let i = 0; i < 3; i++) {
      const blade = mesh(new THREE.ConeGeometry(0.035, 0.28 + r() * 0.16, 3), mat(i % 2 ? P.leaf2 : P.leaf3), (r() - 0.5) * 0.16, 0.15, (r() - 0.5) * 0.16, false);
      blade.rotation.z = (r() - 0.5) * 0.5;
      g.add(blade);
    }
    return g;
  },

  hedge(d) {
    const w = d.w ?? 2;
    const dd = d.d ?? 1;
    const g = group(mesh(box(w, 0.8, dd), mat(P.pine1), 0, 0.4, 0));
    const along = w > dd;
    const len = along ? w : dd;
    for (let k = -len / 2 + 0.6; k < len / 2; k += 1.2) {
      g.add(mesh(sph(0.5, 1), mat(P.pine2), along ? k : 0, 0.75, along ? 0 : k));
    }
    return g;
  },

  bandstand(d) {
    const r = d.w ?? 3.2;
    // The roof fades out while you stand under it, so the overhead camera can still see you.
    const roofMat = new THREE.MeshStandardMaterial({ color: '#e98a8a', roughness: 0.85, flatShading: true, transparent: true });
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
