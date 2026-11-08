import * as THREE from 'three';
import type { Toy } from '../../../shared/scenes/types';
import { glow, mat, mesh } from '../world/materials';
import { PALETTE as P } from '../world/palette';
import { Floaters } from './floaters';
import type { ToyFx, ToyView } from './registry';

export function pianoView(toy: Toy, fx: ToyFx): ToyView {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(1.4, 1.15, 0.55), mat('#5a3e36'), 0, 0.58, -0.1));
  root.add(mesh(new THREE.BoxGeometry(1.42, 0.06, 0.6), mat('#3f2b26'), 0, 1.18, -0.1));
  root.add(mesh(new THREE.BoxGeometry(1.3, 0.05, 0.22), mat('#fffaf0'), 0, 0.78, 0.24));
  const keys: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const k = mesh(new THREE.BoxGeometry(0.15, 0.04, 0.2), mat('#ffffff'), -0.56 + i * 0.16, 0.81, 0.25, false);
    keys.push(k);
    root.add(k);
  }
  for (const i of [0, 1, 3, 4, 5]) root.add(mesh(new THREE.BoxGeometry(0.08, 0.05, 0.12), mat(P.dark), -0.48 + i * 0.16, 0.84, 0.2, false));
  root.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.35), mat(P.woodDark), 0, 0.45, 0.8));
  for (const x of [-0.38, 0.38]) root.add(mesh(new THREE.BoxGeometry(0.06, 0.45, 0.3), mat(P.woodDark), x, 0.22, 0.8));
  const fl = new Floaters(root);
  const pressed = new Array(8).fill(0);
  return {
    root,
    update(ctx) {
      fl.update(ctx.now);
      keys.forEach((k, i) => (k.position.y = 0.81 - (ctx.now < pressed[i] ? 0.025 : 0)));
    },
    onEvent(e, ctx) {
      if (e.action !== 'note' || e.arg === undefined) return;
      pressed[e.arg] = ctx.now + 160;
      fl.text(e.arg % 2 ? '♪' : '♫', -0.56 + e.arg * 0.16, 1.4, 0, ctx.now);
      fx.sound('note', toy.x, toy.z, e.arg);
    },
  };
}

const TRACK_COLORS = ['#5a4e66', '#ff9e7a', '#7ab8ff', '#c3a6ff'];

export function jukeboxView(): ToyView {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), mat('#e98a8a'), 0, 0.6, 0));
  const top = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 16, 1, false, -Math.PI / 2, Math.PI), mat('#e98a8a'), 0, 1.2, 0);
  top.rotation.x = Math.PI / 2;
  root.add(top);
  const panels = TRACK_COLORS.map((c) => {
    const m = mesh(new THREE.BoxGeometry(0.56, 0.5, 0.04), glow(c, 1.2), 0, 0.85, 0.25, false);
    root.add(m);
    return m;
  });
  root.add(mesh(new THREE.BoxGeometry(0.6, 0.2, 0.04), mat(P.metal), 0, 0.35, 0.26, false));
  const fl = new Floaters(root);
  let lastNote = 0;
  return {
    root,
    update(ctx) {
      const track = ctx.state?.kind === 'jukebox' ? ctx.state.track : 0;
      panels.forEach((p, i) => (p.visible = i === track));
      if (track && ctx.now - lastNote > 700) {
        lastNote = ctx.now;
        fl.text(Math.random() < 0.5 ? '♪' : '♫', (Math.random() - 0.5) * 0.5, 1.5, 0.2, ctx.now, 0.3, 1800);
      }
      fl.update(ctx.now);
    },
  };
}

export function bellView(toy: Toy, fx: ToyFx): ToyView {
  const root = new THREE.Group();
  root.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 8), mat(P.woodDark), 0, 1.1, 0));
  root.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.1), mat(P.woodDark), 0.35, 2.15, 0));
  const hang = new THREE.Group();
  hang.position.set(0.6, 2.1, 0);
  hang.add(mesh(new THREE.ConeGeometry(0.22, 0.34, 14, 1, true), mat('#f2c46d', 0.4), 0, -0.22, 0));
  hang.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(P.dark), 0, -0.4, 0));
  root.add(hang);
  let rungAt = -1e9;
  const fl = new Floaters(root);
  return {
    root,
    update(ctx) {
      const t = (ctx.now - rungAt) / 1000;
      hang.rotation.z = t < 3 ? Math.sin(t * 12) * 0.5 * Math.exp(-t * 1.5) : 0;
      fl.update(ctx.now);
    },
    onEvent(e, ctx) {
      rungAt = ctx.now;
      fl.text('🔔', 0.6, 2.5, 0, ctx.now);
      fx.sound('bell', toy.x, toy.z);
      void e;
    },
  };
}

export function chimesView(toy: Toy, fx: ToyFx): ToyView {
  const root = new THREE.Group();
  const hang = new THREE.Group();
  hang.position.set(0.9, 2.0, 0.3);
  hang.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 12), mat(P.woodDark), 0, 0, 0));
  const tubes: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const len = 0.3 + i * 0.06;
    const t = mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 6), mat(P.metal, 0.3), Math.sin(a) * 0.13, -len / 2 - 0.05, Math.cos(a) * 0.13);
    tubes.push(t);
    hang.add(t);
  }
  root.add(hang);
  let rungAt = -1e9;
  return {
    root,
    update(ctx) {
      const t = (ctx.now - rungAt) / 1000;
      const k = t < 4 ? Math.exp(-t * 1.2) : 0;
      tubes.forEach((tb, i) => (tb.rotation.z = Math.sin(ctx.now / 300 + i * 1.7) * (0.04 + k * 0.35)));
    },
    onEvent(_e, ctx) {
      rungAt = ctx.now;
      fx.sound('chime', toy.x, toy.z);
    },
  };
}
