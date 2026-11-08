import * as THREE from 'three';
import { glow, mat, mesh } from '../world/materials';
import { PALETTE as P } from '../world/palette';
import type { ToyView } from './registry';

export function campfireView(): ToyView {
  const root = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = mesh(new THREE.IcosahedronGeometry(0.14, 0), mat('#a9a3ad'), Math.sin(a) * 0.55, 0.08, Math.cos(a) * 0.55);
    s.scale.y = 0.7;
    root.add(s);
  }
  for (const r of [0.4, -0.4]) {
    const l = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 7), mat(P.trunk), 0, 0.12, 0);
    l.rotation.set(Math.PI / 2, 0, r * 2);
    root.add(l);
  }
  const fire = new THREE.Group();
  const flames = [
    mesh(new THREE.ConeGeometry(0.22, 0.6, 7), glow('#ff8a3d', 2.2), 0, 0.42, 0, false),
    mesh(new THREE.ConeGeometry(0.14, 0.45, 7), glow('#ffd36e', 2.4), 0.08, 0.36, 0.05, false),
    mesh(new THREE.ConeGeometry(0.12, 0.38, 7), glow('#ffb347', 2.4), -0.08, 0.33, -0.04, false),
  ];
  fire.add(...flames, mesh(new THREE.SphereGeometry(0.2, 8, 6), glow('#ff6b3d', 1.4), 0, 0.15, 0, false));
  root.add(fire);
  return {
    root,
    update(ctx) {
      const lit = ctx.state?.kind === 'campfire' && ctx.state.lit;
      fire.visible = lit;
      if (!lit) return;
      flames.forEach((f, i) => {
        const k = 1 + Math.sin(ctx.now / (90 + i * 23) + i) * 0.15 + Math.sin(ctx.now / 47 + i * 2) * 0.06;
        f.scale.set(1, k, 1);
        f.rotation.y = ctx.now / 400 + i;
      });
    },
  };
}

export function telescopeView(): ToyView {
  const root = new THREE.Group();
  root.position.y = 0.3; // sits on the mound
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), mat(P.woodDark), Math.sin(a) * 0.22, 0.55, Math.cos(a) * 0.22);
    leg.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
    root.add(leg);
  }
  const tube = mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.9, 12), mat('#7ab8ff', 0.4), 0, 1.25, -0.1);
  tube.rotation.x = -0.9;
  root.add(tube, mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 12), mat(P.metal), 0, 1.53, -0.45, false));
  return { root, update() {} };
}
