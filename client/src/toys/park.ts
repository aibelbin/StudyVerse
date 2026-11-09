import * as THREE from 'three';
import { rng } from '../../../shared/rng';
import type { Toy } from '../../../shared/scenes/types';
import { KOI_POND } from '../../../shared/scenes/town/zen';
import { glow, mat, mesh } from '../world/materials';
import { PALETTE as P } from '../world/palette';
import { labelTexture } from '../world/text';
import { Floaters } from './floaters';
import { koiLanding, koiLoop, STAGE_FLOOR } from './parkMath';
import type { ToyFx, ToyView } from './registry';

const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif';

// ---------- koi ----------

const KOI_COLORS: [string, string][] = [
  ['#ff8a3d', '#fff6ea'], ['#fff6ea', '#e8543f'], ['#ffb347', '#ffb347'], ['#f2f2f2', '#2b2b2b'], ['#ff7043', '#fff6ea'], ['#ffd27a', '#ff8a3d'],
];

function koiMesh(body: string, spot: string): THREE.Group {
  const g = new THREE.Group();
  const b = mesh(new THREE.SphereGeometry(0.1, 10, 6), mat(body, 0.5), 0, 0, 0, false);
  b.scale.set(1, 0.45, 2.4);
  g.add(b);
  const s = mesh(new THREE.SphereGeometry(0.06, 8, 5), mat(spot, 0.5), 0, 0.025, 0.05, false);
  s.scale.set(1, 0.4, 1.6);
  g.add(s);
  const tail = mesh(new THREE.ConeGeometry(0.08, 0.16, 4), mat(body, 0.5), 0, 0, -0.3, false);
  tail.rotation.x = -Math.PI / 2;
  tail.scale.set(1, 1, 0.3);
  tail.name = 'tail';
  g.add(tail);
  return g;
}

/** Six koi on lazy loops; tossed food pulls them over for a few seconds of splashing. */
export function koiView(toy: Toy, fx: ToyFx): ToyView {
  const root = new THREE.Group();
  const fl = new Floaters(root);
  const pond = { ...KOI_POND, x: 0, z: 0 }; // the toy sits at the pond centre
  const fish = KOI_COLORS.map(([b, s]) => {
    const g = koiMesh(b, s);
    g.position.y = 0.085;
    root.add(g);
    return { g, x: 0, z: 0, h: 0, init: false };
  });
  let food: { x: number; z: number; until: number } | null = null;
  return {
    root,
    update(ctx) {
      fl.update(ctx.now);
      const dt = Math.min(ctx.dt, 0.1);
      fish.forEach((f, i) => {
        const loop = koiLoop(i, ctx.now, pond);
        let tx = loop.x;
        let tz = loop.z;
        if (food && ctx.now < food.until) {
          const a = i * 1.1 + ctx.now * 0.004;
          tx = food.x + Math.cos(a) * 0.35;
          tz = food.z + Math.sin(a) * 0.35;
        }
        if (!f.init) {
          f.x = tx;
          f.z = tz;
          f.init = true;
        }
        const dx = tx - f.x;
        const dz = tz - f.z;
        const d = Math.hypot(dx, dz);
        const speed = food && ctx.now < food.until ? 1.6 : 0.9;
        const step = Math.min(d, speed * dt);
        if (d > 1e-3) {
          f.x += (dx / d) * step;
          f.z += (dz / d) * step;
          const want = Math.atan2(dx, dz);
          let dh = want - f.h;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          f.h += dh * Math.min(1, dt * 5);
        }
        f.g.position.x = f.x;
        f.g.position.z = f.z;
        f.g.rotation.y = f.h;
        const tail = f.g.getObjectByName('tail');
        if (tail) tail.rotation.y = Math.sin(ctx.now * 0.012 + i) * 0.5;
      });
      if (food && ctx.now >= food.until) food = null;
    },
    onEvent(e, ctx) {
      if (e.action !== 'feed') return;
      const p = fx.playerPos(e.by) ?? { x: toy.x, z: toy.z + 4 };
      const land = koiLanding(KOI_POND, p.x, p.z);
      const lx = land.x - toy.x;
      const lz = land.z - toy.z;
      const sx = p.x - toy.x;
      const sz = p.z - toy.z;
      for (let i = 0; i < 6; i++) {
        const pellet = mesh(new THREE.SphereGeometry(0.035, 5, 4), mat('#c98a4a'), 0, 0, 0, false);
        const ex = lx + (Math.random() - 0.5) * 0.6;
        const ez = lz + (Math.random() - 0.5) * 0.6;
        fl.add(pellet, ctx.now + i * 40, 600, (o, k) => o.position.set(sx + (ex - sx) * k, 1.0 + k * 1.0 - k * k * 1.9, sz + (ez - sz) * k));
      }
      fl.ring(lx, lz, ctx.now, 600, 0.6, 0.09);
      setTimeout(() => fx.sound('plop', land.x, land.z), 600);
      food = { x: lx, z: lz, until: ctx.now + 4600 };
      // the koi arrive and splash
      for (let i = 0; i < 4; i++) fl.ring(lx + (Math.random() - 0.5) * 0.8, lz + (Math.random() - 0.5) * 0.8, ctx.now, 1400 + i * 500, 0.5, 0.09);
      setTimeout(() => fx.sound('splash', land.x, land.z), 1500);
    },
  };
}

// ---------- cairn ----------

/** Stone i of a cairn with this seed: its size and how far off-centre it sits. */
function stoneOf(seed: number, i: number): { r: number; dx: number; dz: number; rot: number } {
  const r = rng(seed * 101 + i * 7919);
  return { r: Math.max(0.12, 0.3 - i * 0.012) * (0.9 + r() * 0.2), dx: (r() - 0.5) * 0.08, dz: (r() - 0.5) * 0.08, rot: r() * Math.PI };
}

const STONE_COLORS = ['#a9a39a', '#8f8a82', '#b8b1a6', '#9c958c', '#c2bcb2'];

/** The shared cairn: stones from the saved height and seed, a wobble that grows, a record sign. */
export function cairnView(toy: Toy, fx: ToyFx): ToyView {
  const root = new THREE.Group();
  const fl = new Floaters(root);
  const stack = new THREE.Group();
  root.add(stack);
  // pebble pile to take stones from
  const pr = rng(9);
  for (let i = 0; i < 7; i++) {
    const s = mesh(new THREE.IcosahedronGeometry(0.1 + pr() * 0.06, 0), mat(STONE_COLORS[i % 5]), 0.65 + (pr() - 0.5) * 0.4, 0.06, 0.35 + (pr() - 0.5) * 0.3);
    s.scale.y = 0.6;
    root.add(s);
  }
  const sign = new THREE.Group();
  sign.position.set(-0.85, 0, 0.45);
  sign.add(mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), mat(P.woodDark), 0, 0.35, 0));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), new THREE.MeshBasicMaterial({ transparent: true }));
  board.position.set(0, 0.78, 0.04);
  sign.add(mesh(new THREE.BoxGeometry(1.16, 0.4, 0.04), mat(P.woodLight), 0, 0.78, 0));
  sign.add(board);
  root.add(sign);
  let shown = { height: -1, seed: -1, record: -1, recordBy: '' as string | null };
  const build = (height: number, seed: number) => {
    stack.clear();
    let y = 0;
    for (let i = 0; i < height; i++) {
      const s = stoneOf(seed, i);
      const m = mesh(new THREE.IcosahedronGeometry(s.r, 1), mat(STONE_COLORS[(seed + i) % 5]), s.dx, 0, s.dz);
      m.scale.y = 0.5;
      m.rotation.y = s.rot;
      y += s.r * 0.5;
      m.position.y = y;
      y += s.r * 0.45;
      stack.add(m);
    }
  };
  const label = (record: number, by: string | null) => {
    const text = record ? `Record: ${record} stone${record === 1 ? '' : 's'}${by ? ` · ${by}` : ''}` : 'Stack a stone ✋';
    const { tex, aspect } = labelTexture(text, { fg: P.ink, font: 44, pad: 10 });
    const m = board.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.map = tex;
    m.needsUpdate = true;
    board.scale.set(Math.min(1, (0.34 * aspect) / 1.1), 1, 1);
  };
  return {
    root,
    update(ctx) {
      fl.update(ctx.now);
      const s = ctx.state?.kind === 'cairn' ? ctx.state : { height: 0, seed: 1, record: 0, recordBy: null };
      if (s.height !== shown.height || s.seed !== shown.seed) {
        if (s.height === 0 && shown.height > 0) {
          // it toppled: the old stones tumble outwards and fade
          stack.children.slice().forEach((o, i) => {
            const a = Math.random() * Math.PI * 2;
            const v = 0.8 + Math.random() * 1.2;
            const y0 = o.position.y;
            o.removeFromParent();
            fl.add(o, ctx.now, 1100, (m, k) => {
              m.position.set(Math.cos(a) * v * k, Math.max(0.06, y0 + k * 0.6 - k * k * (y0 + 1.2)), Math.sin(a) * v * k);
              m.rotation.x = k * 4 + i;
            });
          });
        }
        build(s.height, s.seed);
      }
      if (s.record !== shown.record || s.recordBy !== shown.recordBy) label(s.record, s.recordBy);
      shown = { height: s.height, seed: s.seed, record: s.record, recordBy: s.recordBy };
      const wob = Math.max(0, s.height - 3) * 0.004;
      stack.rotation.z = Math.sin(ctx.now * 0.0021) * wob;
      stack.rotation.x = Math.cos(ctx.now * 0.0017) * wob;
    },
    onEvent(e, ctx) {
      if (e.action !== 'stack') return;
      fx.sound('clatter', toy.x, toy.z, e.arg === 1 ? 1 : 0);
      if (e.arg === 1) fl.text('💥', 0, 1.2, 0, ctx.now, 0.4);
    },
  };
}

// ---------- meditation ring ----------

/** An incense bowl in the middle of the ring that smokes while someone is breathing there. */
export function cushionsView(): ToyView {
  const root = new THREE.Group();
  const fl = new Floaters(root);
  root.add(mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.1, 10), mat('#6a5a7a'), 0, 0.05, 0));
  root.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 4), mat('#8a4a3a'), 0, 0.2, 0, false));
  root.add(mesh(new THREE.SphereGeometry(0.015, 6, 4), glow('#ff8a5a', 2), 0, 0.33, 0, false));
  let nextWisp = 0;
  return {
    root,
    update(ctx) {
      fl.update(ctx.now);
      const on = ctx.state?.kind === 'meditate' && ctx.state.startedAt !== null;
      if (on && ctx.now > nextWisp) {
        nextWisp = ctx.now + 500;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false }));
        const sway = Math.random() * 6;
        fl.add(puff, ctx.now, 3000, (o, k) => {
          o.position.set(Math.sin(k * 5 + sway) * 0.08, 0.35 + k * 1.2, Math.cos(k * 4 + sway) * 0.05);
          o.scale.setScalar(1 + k * 2.5);
          ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k);
        });
      }
    },
  };
}

// ---------- stage instruments ----------

/** Up on the stage floor, with players seated at the right height. */
function onStage(root: THREE.Group): THREE.Group {
  const inner = new THREE.Group();
  inner.position.y = STAGE_FLOOR;
  root.add(inner);
  return inner;
}
const riderOnStage = () => ({ dx: 0, dy: STAGE_FLOOR, dz: 0 });

/** Drum kit facing the audience: eight pieces that bounce when hit (keys 1–8). */
export function drumsView(toy: Toy, fx: ToyFx): ToyView {
  const root = new THREE.Group();
  const kit = onStage(root);
  const fl = new Floaters(kit);
  const shell = mat('#c8503f');
  const head = mat('#fffaf0');
  const metal = mat('#e8c35a', 0.3);
  const piece = (o: THREE.Object3D) => {
    kit.add(o);
    return o;
  };
  const kick = piece(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 16), shell, 0, 0.32, 0.1));
  kick.rotation.x = Math.PI / 2;
  const drum = (r: number, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(mesh(new THREE.CylinderGeometry(r, r, 0.16, 14), shell));
    g.add(mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.01, 14), head, 0, 0.085, 0, false));
    return piece(g);
  };
  const cymbal = (r: number, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(mesh(new THREE.CylinderGeometry(r, r * 0.9, 0.015, 16), metal));
    kit.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, y, 5), mat(P.metal), x, y / 2, z, false));
    return piece(g);
  };
  const snare = drum(0.2, -0.38, 0.62, -0.12);
  const hatC = cymbal(0.17, -0.62, 0.9, 0.0);
  const hatO = cymbal(0.17, -0.62, 0.95, 0.0);
  const tomH = drum(0.14, -0.13, 0.75, 0.05);
  const tomL = drum(0.2, 0.42, 0.55, -0.1);
  const crash = cymbal(0.24, 0.6, 1.15, 0.12);
  const clap = piece(new THREE.Group());
  const parts = [kick, snare, hatC, hatO, tomH, tomL, crash, clap];
  const hitAt = new Array(8).fill(-1e9);
  const base = parts.map((p) => p.position.y);
  return {
    root,
    riderOffset: riderOnStage,
    update(ctx) {
      fl.update(ctx.now);
      parts.forEach((p, i) => {
        const k = Math.max(0, 1 - (ctx.now - hitAt[i]) / 180);
        p.position.y = base[i] - k * 0.03;
        if (i === 6 || i === 2 || i === 3) p.rotation.z = Math.sin(ctx.now * 0.05) * k * 0.15;
      });
    },
    onEvent(e, ctx) {
      if (e.action !== 'note' || e.arg === undefined) return;
      hitAt[e.arg] = ctx.now;
      const p = parts[e.arg].position;
      fl.text(e.arg === 7 ? '👏' : '♪', p.x, p.y + 0.3, p.z, ctx.now, 0.25, 900);
      fx.sound('drum', toy.x, toy.z, e.arg);
    },
  };
}

/** An acoustic guitar on a stand next to the stool; strings shimmer when strummed (keys 1–8 = chords). */
export function guitarView(toy: Toy, fx: ToyFx): ToyView {
  const root = new THREE.Group();
  const inner = onStage(root);
  const fl = new Floaters(inner);
  const g = new THREE.Group();
  g.position.set(0.55, 0, -0.55);
  g.rotation.set(-0.25, 0.4, 0);
  const wood = mat('#d9a066');
  const body1 = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 16), wood, 0, 0.35, 0);
  body1.rotation.x = Math.PI / 2;
  const body2 = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 16), wood, 0, 0.6, 0);
  body2.rotation.x = Math.PI / 2;
  const hole = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 12), mat('#3a2a20'), 0, 0.5, 0.005, false);
  hole.rotation.x = Math.PI / 2;
  g.add(body1, body2, hole, mesh(new THREE.BoxGeometry(0.06, 0.5, 0.04), mat('#7a5446'), 0, 0.95, 0));
  const strings = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.8), new THREE.MeshBasicMaterial({ color: '#fff6ea', transparent: true, opacity: 0.6 }));
  strings.position.set(0, 0.8, 0.05);
  g.add(strings);
  inner.add(g);
  inner.add(mesh(new THREE.BoxGeometry(0.3, 0.04, 0.3), mat(P.dark), 0.55, 0.02, -0.55));
  let strumAt = -1e9;
  return {
    root,
    riderOffset: riderOnStage,
    update(ctx) {
      fl.update(ctx.now);
      const k = Math.max(0, 1 - (ctx.now - strumAt) / 600);
      strings.scale.x = 1 + Math.sin(ctx.now * 0.09) * k * 0.8;
      (strings.material as THREE.MeshBasicMaterial).opacity = 0.6 + k * 0.4;
    },
    onEvent(e, ctx) {
      if (e.action !== 'note' || e.arg === undefined) return;
      strumAt = ctx.now;
      fl.text(['C', 'G', 'Am', 'F', 'Dm', 'Em', 'D', 'E'][e.arg] ?? '♪', 0.3, 1.5, 0, ctx.now, 0.28, 1100);
      fx.sound('strum', toy.x, toy.z, e.arg);
    },
  };
}

/** A synth keyboard on a stand with eight glowing keys (keys 1–8). */
export function keysView(toy: Toy, fx: ToyFx): ToyView {
  const root = new THREE.Group();
  const inner = onStage(root);
  const fl = new Floaters(inner);
  for (const x of [-0.45, 0.45]) {
    const leg = mesh(new THREE.BoxGeometry(0.04, 0.8, 0.04), mat(P.dark), x, 0.4, 0);
    leg.rotation.z = x > 0 ? 0.25 : -0.25;
    inner.add(leg);
  }
  inner.add(mesh(new THREE.BoxGeometry(1.1, 0.08, 0.32), mat('#3a3448'), 0, 0.8, 0));
  const keys = Array.from({ length: 8 }, (_, i) => {
    const k = mesh(new THREE.BoxGeometry(0.11, 0.03, 0.2), mat('#ffffff'), -0.42 + i * 0.12, 0.85, -0.03, false);
    inner.add(k);
    return k;
  });
  const lit = Array.from({ length: 8 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.031, 0.19), new THREE.MeshBasicMaterial({ color: '#c3a6ff', transparent: true, opacity: 0 }));
    m.position.set(-0.42 + i * 0.12, 0.852, -0.03);
    inner.add(m);
    return m;
  });
  const pressed = new Array(8).fill(-1e9);
  return {
    root,
    riderOffset: riderOnStage,
    update(ctx) {
      fl.update(ctx.now);
      keys.forEach((k, i) => {
        const on = ctx.now - pressed[i] < 220;
        k.position.y = on ? 0.835 : 0.85;
        (lit[i].material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - (ctx.now - pressed[i]) / 600) * 0.9;
        lit[i].position.y = k.position.y + 0.002;
      });
    },
    onEvent(e, ctx) {
      if (e.action !== 'note' || e.arg === undefined) return;
      pressed[e.arg] = ctx.now;
      fl.text('♫', -0.42 + e.arg * 0.12, 1.2, 0, ctx.now, 0.25, 1100);
      fx.sound('pad', toy.x, toy.z, e.arg);
    },
  };
}

// ---------- stage screen ----------

/** Draws the screen: the performer's line, or "Open mic". */
function screenTexture(text: string | null, by: string | null): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 400;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 400);
  grad.addColorStop(0, '#2e2a44');
  grad.addColorStop(1, '#4a3f6b');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 400);
  g.strokeStyle = '#ffd36e';
  g.lineWidth = 10;
  g.strokeRect(14, 14, 996, 372);
  g.fillStyle = '#fff6ea';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const line = text ?? 'Open mic 🎤';
  let size = 110;
  g.font = `800 ${size}px ${FONT}`;
  while (g.measureText(line).width > 940 && size > 40) {
    size -= 6;
    g.font = `800 ${size}px ${FONT}`;
  }
  g.fillText(line, 512, by ? 180 : 200);
  if (by) {
    g.font = `600 44px ${FONT}`;
    g.fillStyle = '#ffd36e';
    g.fillText(`— ${by}`, 512, 315);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The board behind the stage. It glows softly at night so the line can be read. */
export function stageScreenView(): ToyView {
  const root = new THREE.Group();
  for (const x of [-2.3, 2.3]) root.add(mesh(new THREE.BoxGeometry(0.14, 3.4, 0.14), mat(P.woodDark), x, 1.7, -0.4));
  root.add(mesh(new THREE.BoxGeometry(4.9, 2.1, 0.12), mat('#3a3448'), 0, 2.15, -0.42));
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.8), new THREE.MeshBasicMaterial({ map: screenTexture(null, null) }));
  panel.position.set(0, 2.15, -0.35);
  root.add(panel);
  let shown = '\u0000';
  return {
    root,
    update(ctx) {
      const s = ctx.state?.kind === 'stageScreen' ? ctx.state : null;
      const text = s?.text ?? null;
      const key = `${text}|${s?.by}`;
      if (key === shown) return;
      shown = key;
      const m = panel.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.map = screenTexture(text, s?.by ?? null);
      m.needsUpdate = true;
    },
  };
}
