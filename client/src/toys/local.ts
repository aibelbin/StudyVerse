import * as THREE from 'three';
import { mat, mesh } from '../world/materials';
import { PALETTE as P } from '../world/palette';
import { textSprite } from '../world/text';
import type { ToyView } from './registry';

const bob = (o: THREE.Object3D, base: number, now: number) => (o.position.y = base + Math.sin(now / 500) * 0.06);

/** The Boutique: a striped market stall with a little clothes rack. */
export function shopView(): ToyView {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(2.4, 0.9, 0.9), mat(P.woodLight), 0, 0.45, -0.6));
  for (const x of [-1.15, 1.15]) for (const z of [-1, -0.2]) root.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 8), mat(P.woodDark), x, 1.15, z));
  for (let i = 0; i < 6; i++) {
    const stripe = mesh(new THREE.BoxGeometry(0.42, 0.06, 1.2), mat(i % 2 ? '#fffaf0' : '#f7a1c4'), -1.05 + i * 0.42, 2.3, -0.55);
    stripe.rotation.x = 0.2;
    root.add(stripe);
  }
  const rail = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 6), mat(P.metal), 0, 1.55, -0.95);
  rail.rotation.z = Math.PI / 2;
  root.add(rail);
  ['#9cc9f0', '#ffd36e', '#e85a6a', '#a8d8a0'].forEach((c, i) => {
    root.add(mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55).scale(1, 1.1, 0.5), mat(c), -0.6 + i * 0.4, 1.35, -0.95));
  });
  const sign = textSprite('👕 Boutique', 0.32, { bg: '#ffffffdd', font: 40, pad: 12 });
  sign.position.set(0, 2.75, -0.3);
  root.add(sign);
  return { root, update: (ctx) => bob(sign, 2.75, ctx.now) };
}

/** The town notice board: a cork board on two posts with colourful notes pinned on. */
export function boardView(): ToyView {
  const root = new THREE.Group();
  for (const x of [-0.7, 0.7]) root.add(mesh(new THREE.BoxGeometry(0.1, 1.9, 0.1), mat(P.woodDark), x, 0.95, -0.2));
  root.add(mesh(new THREE.BoxGeometry(1.5, 0.95, 0.06), mat('#c99a6e'), 0, 1.35, -0.16));
  ['#fff6a0', '#ffd0e0', '#c8f0ff', '#d8ffc8', '#ffffff'].forEach((c, i) => {
    const n = mesh(new THREE.BoxGeometry(0.24, 0.22, 0.01), mat(c), -0.5 + (i % 3) * 0.45, 1.55 - Math.floor(i / 3) * 0.38, -0.12, false);
    n.rotation.z = (i - 2) * 0.08;
    root.add(n);
  });
  root.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.14), mat(P.woodDark), 0, 1.87, -0.16));
  const sign = textSprite('📌 Notes', 0.28, { bg: '#ffffffdd', font: 40, pad: 12 });
  sign.position.set(0, 2.25, -0.1);
  root.add(sign);
  return { root, update: (ctx) => bob(sign, 2.25, ctx.now) };
}

/** The gift stall: a little striped cart piled with wrapped presents, a balloon tied on, and a sign. */
export function giftShopView(): ToyView {
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(1.5, 0.75, 0.6), mat('#f7d0c8'), 0, 0.55, -0.3));
  root.add(mesh(new THREE.BoxGeometry(1.6, 0.06, 0.7), mat(P.woodLight), 0, 0.95, -0.3));
  for (const x of [-0.55, 0.55]) {
    const wheel = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14), mat(P.woodDark), x, 0.2, 0.0);
    wheel.rotation.x = Math.PI / 2;
    root.add(wheel);
  }
  for (const x of [-0.72, 0.72]) root.add(mesh(new THREE.BoxGeometry(0.05, 1.3, 0.05), mat(P.woodDark), x, 1.6, -0.55));
  const roof = mesh(new THREE.BoxGeometry(1.8, 0.06, 0.9), mat('#ff8fab'), 0, 2.28, -0.35);
  roof.rotation.x = 0.18;
  root.add(roof);
  for (let i = 0; i < 6; i++) root.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(i % 2 ? '#fff6ea' : '#ff8fab'), -0.75 + i * 0.3, 2.17, 0.06, false));
  const boxes: [number, number, number, string, string][] = [[-0.45, 1.1, 0.26, '#7ab8ff', '#ffd36e'], [0, 1.08, 0.22, '#c3a6ff', '#ffffff'], [0.42, 1.12, 0.3, '#8fd694', '#ff8fab'], [-0.1, 1.32, 0.18, '#ffd36e', '#ff6f8f']];
  for (const [x, y, s, c, r] of boxes) {
    root.add(mesh(new THREE.BoxGeometry(s, s, s), mat(c), x, y, -0.3));
    root.add(mesh(new THREE.BoxGeometry(s + 0.01, s + 0.01, 0.04), mat(r), x, y, -0.3, false));
    root.add(mesh(new THREE.BoxGeometry(0.04, s + 0.01, s + 0.01), mat(r), x, y, -0.3, false));
  }
  root.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.9, 4), mat('#ffffff'), 0.68, 1.4, -0.4, false));
  root.add(mesh(new THREE.SphereGeometry(0.17, 12, 10), mat('#ff5a6a'), 0.68, 1.95, -0.4));
  const sign = textSprite('🎁 Gifts', 0.28, { bg: '#ffffffdd', font: 40, pad: 12 });
  sign.position.set(0, 2.7, -0.3);
  root.add(sign);
  return { root, update: (ctx) => bob(sign, 2.7, ctx.now) };
}

/** A floating open book over the library shelf that hands out study quotes. */
export function quotesView(): ToyView {
  const root = new THREE.Group();
  const book = textSprite('📖', 0.45, { bg: null, font: 64, pad: 4 });
  book.position.set(0, 2.45, -0.6);
  root.add(book);
  return { root, update: (ctx) => bob(book, 2.45, ctx.now) };
}

/** A steaming cup sign over the café's coffee machine. */
export function coffeeView(): ToyView {
  const root = new THREE.Group();
  const cup = textSprite('☕ Make a coffee', 0.26, { bg: '#ffffffdd', font: 40, pad: 12 });
  cup.position.set(0, 2.1, -1.0);
  root.add(cup);
  return { root, update: (ctx) => bob(cup, 2.1, ctx.now) };
}

/** An easel in the studio: a wooden tripod holding a blank canvas, with a sign. */
export function easelView(): ToyView {
  const root = new THREE.Group();
  for (const [x, z] of [[-0.3, 0.25], [0.3, 0.25], [0, -0.3]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.9, 8), mat(P.woodLight), x, 0.95, z);
    leg.rotation.x = z < 0 ? -0.22 : 0.18;
    leg.rotation.z = -x * 0.5;
    root.add(leg);
  }
  root.add(mesh(new THREE.BoxGeometry(0.8, 0.06, 0.12), mat(P.woodDark), 0, 0.85, 0.2));
  const canvas = mesh(new THREE.BoxGeometry(0.72, 0.72, 0.03), mat('#fffdf7'), 0, 1.3, 0.16);
  canvas.rotation.x = -0.18;
  root.add(canvas);
  const sign = textSprite('🎨 Paint', 0.28, { bg: '#ffffffdd', font: 40, pad: 12 });
  sign.position.set(0, 2.15, 0);
  root.add(sign);
  return { root, update: (ctx) => bob(sign, 2.15, ctx.now) };
}

/** The gallery wall's sign (the wall and its frames are decor + the Pictures view). */
export function galleryView(): ToyView {
  const root = new THREE.Group();
  const sign = textSprite('🖼️ Gallery', 0.28, { bg: '#ffffffdd', font: 40, pad: 12 });
  sign.position.set(0, 1.4, 0);
  root.add(sign);
  return { root, update: (ctx) => bob(sign, 1.4, ctx.now) };
}
