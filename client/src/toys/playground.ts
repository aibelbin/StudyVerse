import * as THREE from 'three';
import type { SceneDef, Toy } from '../../../shared/scenes/types';
import { seesawAngle, spinAt, swingAngle } from '../../../shared/toys';
import { mat, mesh } from '../world/materials';
import { PALETTE as P } from '../world/palette';
import type { ToyView } from './registry';

const SEAT_Y = 0.45; // the sit pose assumes a chair-height seat
const ROPE = 1.9;
const PIVOT_Y = 2.4;

export function swingView(toy: Toy, def: SceneDef): ToyView {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = PIVOT_Y;
  for (const x of [-0.28, 0.28]) pivot.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, ROPE, 4), mat(P.dark), x, -ROPE / 2, 0));
  pivot.add(mesh(new THREE.BoxGeometry(0.66, 0.06, 0.32), mat('#ffd36e'), 0, -ROPE, 0));
  root.add(pivot);
  const index = def.toys.filter((t) => t.kind === 'swing').indexOf(toy);
  const phase = index * 1.3;
  const slotId = toy.slotIds![0];
  let angle = 0;
  return {
    root,
    update(ctx) {
      angle = ctx.occupied.has(slotId) ? swingAngle(ctx.now, phase) : 0.05 * Math.sin(ctx.now / 900 + phase);
      pivot.rotation.x = angle;
    },
    riderOffset(slot) {
      const seatZ = toy.z - ROPE * Math.sin(angle);
      return { dx: 0, dy: PIVOT_Y - ROPE * Math.cos(angle) + 0.03 - SEAT_Y, dz: seatZ - slot.z };
    },
  };
}

export function seesawView(toy: Toy): ToyView {
  const root = new THREE.Group();
  root.add(mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.45, 8), mat(P.dark), 0, 0.22, 0));
  const board = new THREE.Group();
  board.position.y = 0.45;
  board.add(mesh(new THREE.BoxGeometry(4.2, 0.08, 0.36), mat('#7ab8ff'), 0, 0, 0));
  for (const x of [-1.7, 1.7]) board.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), mat('#e98a8a'), x, 0.25, 0));
  root.add(board);
  const [w, e] = toy.slotIds!;
  let angle = -0.25;
  return {
    root,
    update(ctx) {
      const a = ctx.occupied.has(w);
      const b = ctx.occupied.has(e);
      const target = a && b ? seesawAngle(ctx.now) : a ? 0.25 : b ? -0.25 : -0.25;
      angle += (target - angle) * (1 - Math.exp(-ctx.dt * (a && b ? 30 : 4)));
      board.rotation.z = angle;
    },
    riderOffset(slot) {
      const x = slot.x - toy.x;
      return { dx: x * Math.cos(angle) - x, dy: 0.45 + x * Math.sin(angle) + 0.06 - SEAT_Y, dz: 0 };
    },
  };
}

export function merryGoRoundView(toy: Toy): ToyView {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 24), mat('#f7a1c4'), 0, 0.18, 0));
  spin.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), mat(P.metal), 0, 0.8, 0));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const bar = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), mat('#ffd36e'), Math.sin(a) * 0.7, 0.95, Math.cos(a) * 0.7);
    bar.rotation.set(Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1);
    spin.add(bar);
  }
  root.add(spin);
  let heading = toy.rot ?? 0;
  return {
    root,
    update(ctx) {
      const s = ctx.state?.kind === 'merryGoRound' ? ctx.state : null;
      heading = (toy.rot ?? 0) + (s ? spinAt(s, ctx.now).angle : 0);
      spin.rotation.y = heading - (toy.rot ?? 0);
    },
    pose: () => ({ x: toy.x, z: toy.z, heading }),
    riderOffset: () => ({ dx: 0, dy: 0.24 - SEAT_Y, dz: 0 }),
  };
}

/** Where a slider is along the slide, u in [0, 1]: climb the ladder, then whoosh down the chute. */
export function slidePath(u: number): { dz: number; y: number } {
  if (u < 0.33) {
    const k = u / 0.33;
    return { dz: 0.6 * k, y: 1.6 * k };
  }
  const k = (u - 0.33) / 0.67;
  const e = k * k * (3 - 2 * k);
  return { dz: 0.6 + 3.6 * e, y: 1.6 * (1 - e) };
}

export const SLIDE_MS = 1500;

export function slideView(): ToyView {
  const root = new THREE.Group();
  for (const x of [-0.3, 0.3]) root.add(mesh(new THREE.BoxGeometry(0.06, 1.8, 0.06), mat('#7ab8ff'), x, 0.9, 0));
  for (let y = 0.3; y < 1.7; y += 0.35) root.add(mesh(new THREE.BoxGeometry(0.6, 0.04, 0.05), mat(P.metal), 0, y, 0));
  root.add(mesh(new THREE.BoxGeometry(0.8, 0.08, 0.7), mat('#ffd36e'), 0, 1.6, 0.4));
  const chute = mesh(new THREE.BoxGeometry(0.7, 0.06, 4.0), mat('#e98a8a'), 0, 0.9, 2.4);
  chute.rotation.x = Math.atan2(1.45, 3.6);
  root.add(chute);
  for (const x of [-0.37, 0.37]) {
    const rail = mesh(new THREE.BoxGeometry(0.05, 0.16, 4.0), mat('#e98a8a'), x, 0.98, 2.4);
    rail.rotation.x = chute.rotation.x;
    root.add(rail);
  }
  return { root, update() {} };
}
