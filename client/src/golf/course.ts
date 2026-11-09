import * as THREE from 'three';
import { BALL_R, CUP_R, FELT, HOLES, windmillAngle, type Hole, type Piece } from '../../../shared/golf';
import type { ToyState } from '../../../shared/toys';
import { mat, mesh, toonMat } from '../world/materials';
import { PALETTE as P } from '../world/palette';
import { labelTexture } from '../world/text';
import type { ToyView } from '../toys/registry';
import { loopMesh } from './sim';

const FELT_COLOR = '#5cbf6c';
const RAIL_COLOR = '#c98a5a';
const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif';

/** A box from the ground up whose top slopes from y0 (−x side) to y1 (+x side). */
function prism(w: number, d: number, y0: number, y1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, 1, d);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const top = pos.getY(i) > 0;
    const u = (x + w / 2) / w;
    pos.setY(i, top ? y0 + (y1 - y0) * u : 0);
  }
  g.computeVertexNormals();
  return g;
}

function sign(text: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), mat(P.woodDark), 0, 0.35, 0));
  const { tex, aspect } = labelTexture(text, { fg: '#fffaf0', bg: '#3f7d4a', font: 44, pad: 12 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.3 * aspect, 0.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  plane.position.set(0, 0.85, 0.04);
  g.add(plane);
  return g;
}

function flag(n: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5), mat('#f2f2f2'), 0, 0.45, 0, false));
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 40;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ff5a5a';
  x.fillRect(0, 0, 64, 40);
  x.fillStyle = '#ffffff';
  x.font = `800 30px ${FONT}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(String(n), 32, 21);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.19), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  f.position.set(0.16, 0.8, 0);
  g.add(f);
  return g;
}

function piece(p: Piece, root: THREE.Group, blades: THREE.Group[], sailGroups: THREE.Group[]): void {
  switch (p.kind) {
    case 'floor': {
      const y0 = p.y ?? FELT;
      const m = mesh(prism(p.w, p.d, y0, y0 + (p.rise ?? 0)), mat(FELT_COLOR, 0.95), p.x, 0, p.z);
      m.castShadow = false;
      root.add(m);
      break;
    }
    case 'wall': {
      const y0 = p.y0 ?? 0;
      const tall = p.h > 1;
      root.add(mesh(new THREE.BoxGeometry(p.w, p.h - y0, p.d), mat(tall ? '#fff6ea' : RAIL_COLOR), p.x, (y0 + p.h) / 2, p.z));
      break;
    }
    case 'water': {
      const pit = mesh(new THREE.BoxGeometry(p.w, 0.3, p.d), mat('#3a5a7a'), p.x, -0.13, p.z, false);
      root.add(pit);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), toonMat({ color: '#5fb8e8', roughness: 0.1 }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(p.x, 0.02, p.z);
      root.add(water);
      break;
    }
    case 'windmill': {
      root.add(mesh(new THREE.ConeGeometry(1.0, 0.8, 4), mat('#d9574a'), p.x, 2.0, p.z));
      const g = new THREE.Group();
      g.position.set(p.bladeX, p.hubY, p.z);
      g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(P.dark)));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const b = mesh(new THREE.BoxGeometry(0.3, p.bladeLen, 0.26), mat(i % 2 ? '#fffaf0' : '#e8c35a'), 0, Math.cos(a) * p.bladeLen / 2, Math.sin(a) * p.bladeLen / 2);
        b.rotation.x = -a;
        g.add(b);
      }
      root.add(g);
      blades.push(g);
      // Big sails on the side facing the camera, turning with the gate (the gate itself is seen edge-on).
      const sails = new THREE.Group();
      sails.position.set(p.x, 1.25, p.z + 2.08);
      sails.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 10), mat(P.dark), 0, 0, 0));
      (sails.children[0] as THREE.Mesh).rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group();
        arm.rotation.z = (i / 4) * Math.PI * 2;
        arm.add(mesh(new THREE.BoxGeometry(0.06, 1.2, 0.04), mat(P.woodDark), 0, 0.65, 0));
        arm.add(mesh(new THREE.BoxGeometry(0.34, 0.9, 0.02), mat(i % 2 ? '#fffaf0' : '#ffd8c8'), 0.2, 0.75, 0.02));
        sails.add(arm);
      }
      root.add(sails);
      sailGroups.push(sails);
      break;
    }
    case 'loop': {
      const m = loopMesh(p);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(m.vertices, 3));
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      geo.computeVertexNormals();
      root.add(new THREE.Mesh(geo, toonMat({ color: '#ff9e7a', side: THREE.DoubleSide, roughness: 0.5 })));
      for (const dx of [-p.r - 0.1, p.r + 0.1]) root.add(mesh(new THREE.BoxGeometry(0.08, p.r * 2.2, 0.08), mat(P.dark), p.x + dx, p.r * 1.1, p.z + p.offset / 2 + p.width / 2 + 0.15));
      break;
    }
    case 'volcano': {
      root.add(mesh(new THREE.CylinderGeometry(p.r1, p.r0, p.h, 20), mat('#8a5a3c'), p.x, FELT + p.h / 2, p.z));
      const top = mesh(new THREE.CylinderGeometry(p.r1, p.r1, 0.012, 20), mat(FELT_COLOR), p.x, FELT + p.h + 0.006, p.z, false);
      root.add(top);
      const lava = new THREE.Mesh(new THREE.TorusGeometry(p.r1, 0.035, 6, 24), toonMat({ color: '#ff7a3c', emissive: '#ff5a1c', emissiveIntensity: 0.8 }));
      lava.rotation.x = Math.PI / 2;
      lava.position.set(p.x, FELT + p.h + 0.02, p.z);
      root.add(lava);
      break;
    }
  }
}

function holeView(h: Hole, root: THREE.Group, blades: THREE.Group[], sails: THREE.Group[]): void {
  for (const p of h.pieces) piece(p, root, blades, sails);
  const cup = mesh(new THREE.CylinderGeometry(CUP_R, CUP_R, 0.01, 18), mat('#1f1a17'), h.cup.x, h.cup.y + 0.006, h.cup.z, false);
  root.add(cup);
  const f = flag(h.n);
  f.position.set(h.cup.x, h.cup.y, h.cup.z);
  root.add(f);
  const tee = mesh(new THREE.BoxGeometry(0.6, 0.012, 0.6), mat('#3f8d4f'), h.tee.x, FELT + 0.006, h.tee.z, false);
  root.add(tee);
  const s = sign(`${h.n} · ${h.name} · par ${h.par}`);
  const north = h.tee.z < 48;
  s.position.set(h.tee.x, 0, north ? h.bounds.z - h.bounds.d / 2 - 0.3 : h.bounds.z + h.bounds.d / 2 + 0.3);
  root.add(s);
}

/** The whole course; update() turns the windmill from server time. */
export class GolfCourse {
  readonly root = new THREE.Group();
  private blades: THREE.Group[] = [];
  private sails: THREE.Group[] = [];

  constructor() {
    for (const h of HOLES) holeView(h, this.root, this.blades, this.sails);
  }

  update(serverNow: number): void {
    const a = windmillAngle(serverNow);
    for (const b of this.blades) b.rotation.x = a;
    for (const s of this.sails) s.rotation.z = -a;
  }
}

/** A golf ball, tinted with its player's colour. */
export function ballMesh(color: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(BALL_R, 2), toonMat({ color, roughness: 0.35 }));
  m.castShadow = true;
  return m;
}

function boardTexture(s: Extract<ToyState, { kind: 'golfBoard' }> | null, today: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2f5d3a';
  g.fillRect(0, 0, 512, 384);
  g.strokeStyle = '#e8c35a';
  g.lineWidth = 8;
  g.strokeRect(8, 8, 496, 368);
  g.fillStyle = '#fffaf0';
  g.textAlign = 'center';
  g.font = `800 44px ${FONT}`;
  g.fillText("⛳ Today's best", 256, 64);
  const top = s && s.day === today ? s.top : [];
  g.font = `700 34px ${FONT}`;
  if (!top.length) {
    g.fillStyle = '#cfe8d2';
    g.fillText('Nobody yet: go round!', 256, 200);
  }
  top.forEach((e, i) => {
    g.textAlign = 'left';
    g.fillStyle = i === 0 ? '#ffd36e' : '#fffaf0';
    g.fillText(`${i + 1}. ${e.name}`, 48, 130 + i * 50);
    g.textAlign = 'right';
    g.fillText(String(e.strokes), 464, 130 + i * 50);
  });
  g.textAlign = 'center';
  g.font = `600 22px ${FONT}`;
  g.fillStyle = '#cfe8d2';
  g.fillText('Par 18 · a full round pays KP once a day', 256, 360);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Local calendar day, like the server's dayOf. */
export function today(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The "Today's best" board by the course entrance. */
export function golfBoardView(): ToyView {
  const root = new THREE.Group();
  for (const x of [-1.2, 1.2]) root.add(mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), mat(P.woodDark), x, 1.2, -0.5));
  root.add(mesh(new THREE.BoxGeometry(2.6, 1.9, 0.1), mat(P.woodDark), 0, 1.5, -0.52));
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshBasicMaterial({ map: boardTexture(null, today()) }));
  panel.position.set(0, 1.5, -0.46);
  root.add(panel);
  let key = '';
  return {
    root,
    update(ctx) {
      const s = ctx.state?.kind === 'golfBoard' ? ctx.state : null;
      const day = today(ctx.now);
      const k = `${day}|${JSON.stringify(s?.top ?? [])}|${s?.day}`;
      if (k === key) return;
      key = k;
      const m = panel.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.map = boardTexture(s, day);
      m.needsUpdate = true;
    },
  };
}
