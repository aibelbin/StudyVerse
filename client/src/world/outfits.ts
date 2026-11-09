import * as THREE from 'three';
import { itemById } from '../../../shared/wardrobe';
import { toonMat } from './materials';

/**
 * Wardrobe item meshes, built in the local space of the anchor they hang on:
 * hat → top of the head (y = 0), face → front of the face, back → middle of the back,
 * neck → where a neck would be, top → body centre (the shell hugs the lower half).
 */
export const BODY = { rx: 0.42, ry: 0.47, rz: 0.4, cy: 0.52 };

const std = (color: string, roughness = 0.8) => toonMat({ color, roughness, flatShading: false });

function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  g.add(o);
  return o;
}

/** A slice of an egg slightly bigger than the body, for clothes that wrap around it. */
function shell(from: number, to: number, grow = 1.04): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, from * Math.PI, (to - from) * Math.PI)
    .scale(BODY.rx * grow, BODY.ry * grow, BODY.rz * grow);
}

export function buildItem(id: string): THREE.Group {
  const g = new THREE.Group();
  const item = itemById(id);
  if (!item) return g;
  const c = std(item.color);
  const a = std(item.accent ?? '#ffffff');
  switch (id) {
    case 'beanie':
      add(g, new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c, 0, -0.08, 0);
      add(g, new THREE.TorusGeometry(0.29, 0.045, 8, 24), a, 0, -0.07, 0).rotation.x = Math.PI / 2;
      add(g, new THREE.SphereGeometry(0.07, 10, 8), a, 0, 0.24, 0);
      break;
    case 'cap':
      add(g, new THREE.SphereGeometry(0.29, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c, 0, -0.07, 0);
      add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20, 1, false, -Math.PI / 2, Math.PI), c, 0, -0.06, 0.22);
      break;
    case 'bucket':
      add(g, new THREE.CylinderGeometry(0.22, 0.27, 0.2, 20), c, 0, 0.04, 0);
      add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.025, 24), c, 0, -0.05, 0);
      break;
    case 'flower':
      add(g, new THREE.TorusGeometry(0.26, 0.025, 6, 28), std('#7cc47a'), 0, -0.04, 0).rotation.x = Math.PI / 2;
      for (let i = 0; i < 9; i++) {
        const t = (i / 9) * Math.PI * 2;
        add(g, new THREE.SphereGeometry(0.06, 8, 6), std(['#f7a1c4', '#ffd36e', '#ffffff'][i % 3]), Math.cos(t) * 0.26, -0.02, Math.sin(t) * 0.26);
      }
      break;
    case 'chef':
      add(g, new THREE.CylinderGeometry(0.22, 0.22, 0.2, 20), c, 0, 0.04, 0);
      for (const [x, z] of [[0, 0], [0.12, 0.08], [-0.12, 0.08], [0.1, -0.1], [-0.1, -0.1]]) add(g, new THREE.SphereGeometry(0.14, 10, 8), c, x, 0.22, z);
      break;
    case 'headphones': {
      const band = add(g, new THREE.TorusGeometry(0.33, 0.03, 8, 24, Math.PI), c, 0, -0.18, 0);
      band.rotation.z = 0;
      for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14), a, s * 0.34, -0.2, 0).rotation.z = Math.PI / 2;
      break;
    }
    case 'frogHood':
      add(g, new THREE.SphereGeometry(0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), c, 0, -0.12, -0.02);
      for (const s of [-1, 1]) {
        add(g, new THREE.SphereGeometry(0.09, 10, 8), a, s * 0.14, 0.17, 0.12);
        add(g, new THREE.SphereGeometry(0.045, 8, 6), std('#2a2430'), s * 0.14, 0.18, 0.2);
      }
      break;
    case 'wizard': {
      add(g, new THREE.CylinderGeometry(0.4, 0.4, 0.025, 24), c, 0, -0.04, 0);
      const cone = add(g, new THREE.ConeGeometry(0.25, 0.6, 20), c, 0.03, 0.26, 0);
      cone.rotation.z = -0.15;
      add(g, new THREE.OctahedronGeometry(0.05), a, 0.06, 0.2, 0.22);
      break;
    }
    case 'crown':
      add(g, new THREE.CylinderGeometry(0.22, 0.22, 0.14, 8, 1, true), toonMat({ color: item.color, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }), 0, 0.02, 0);
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        add(g, new THREE.ConeGeometry(0.04, 0.1, 6), std(item.color, 0.3), Math.cos(t) * 0.21, 0.13, Math.sin(t) * 0.21);
      }
      add(g, new THREE.SphereGeometry(0.04, 8, 6), a, 0, 0.03, 0.22);
      break;
    case 'tee':
      add(g, shell(0.55, 1), c);
      break;
    case 'vest':
      add(g, shell(0.5, 0.95), c);
      add(g, new THREE.ConeGeometry(0.08, 0.14, 3), std('#fffaf0'), 0, 0.03, BODY.rz * 1.03).rotation.x = Math.PI;
      break;
    case 'hoodie':
      add(g, shell(0.5, 1), c);
      add(g, new THREE.TorusGeometry(0.22, 0.08, 8, 20), c, 0, 0.12, -0.22).rotation.x = 1.1;
      for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), std('#ffffff'), s * 0.07, -0.02, BODY.rz * 1.05);
      break;
    case 'raincoat':
      add(g, shell(0.45, 1, 1.06), c);
      for (const y of [-0.05, -0.17, -0.29]) add(g, new THREE.SphereGeometry(0.025, 6, 4), std('#5a4e66'), 0, y, BODY.rz * 1.03);
      break;
    case 'overalls':
      add(g, shell(0.62, 1), c);
      for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.05, 0.3, 0.03), c, s * 0.12, 0.02, BODY.rz * 0.98).rotation.x = -0.35;
      for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(0.025, 6, 4), a, s * 0.12, -0.1, BODY.rz * 1.04);
      break;
    case 'roundGlasses':
      for (const s of [-1, 1]) add(g, new THREE.TorusGeometry(0.07, 0.012, 6, 18), c, s * 0.11, 0, 0.02);
      add(g, new THREE.BoxGeometry(0.08, 0.012, 0.012), c, 0, 0.01, 0.02);
      break;
    case 'sunglasses':
      for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.13, 0.08, 0.02), std(item.color, 0.2), s * 0.1, 0, 0.03);
      add(g, new THREE.BoxGeometry(0.34, 0.02, 0.015), c, 0, 0.03, 0.03);
      break;
    case 'monocle':
      add(g, new THREE.TorusGeometry(0.075, 0.012, 6, 18), std(item.color, 0.3), 0.11, 0, 0.03);
      add(g, new THREE.CylinderGeometry(0.004, 0.004, 0.25, 4), std(item.color, 0.3), 0.18, -0.13, 0.02);
      break;
    case 'backpack':
      add(g, new THREE.BoxGeometry(0.36, 0.38, 0.18), c, 0, 0, -0.06);
      add(g, new THREE.BoxGeometry(0.28, 0.14, 0.06), a, 0, -0.08, -0.17);
      break;
    case 'cape': {
      const cape = add(g, new THREE.PlaneGeometry(0.62, 0.62), toonMat({ color: item.color, side: THREE.DoubleSide }), 0, -0.12, -0.04);
      cape.rotation.x = 0.18;
      break;
    }
    case 'guitar': {
      const gt = new THREE.Group();
      add(gt, new THREE.SphereGeometry(0.16, 12, 10).scale(1, 1.15, 0.35), c, 0, -0.12, 0);
      add(gt, new THREE.BoxGeometry(0.05, 0.42, 0.03), a, 0, 0.18, 0);
      gt.rotation.z = 0.6;
      gt.position.z = -0.05;
      g.add(gt);
      break;
    }
    case 'wings':
      for (const s of [-1, 1]) {
        const w = add(g, new THREE.SphereGeometry(0.22, 12, 8).scale(1, 0.55, 0.12), std(item.color), s * 0.22, 0.08, -0.06);
        w.rotation.z = s * 0.5;
      }
      break;
    case 'scarf':
      add(g, new THREE.TorusGeometry(0.41, 0.06, 8, 30), c, 0, 0, 0).rotation.x = Math.PI / 2;
      add(g, new THREE.BoxGeometry(0.1, 0.24, 0.05), c, 0.16, -0.13, 0.39).rotation.z = 0.15;
      break;
    case 'bowtie':
      for (const s of [-1, 1]) add(g, new THREE.ConeGeometry(0.06, 0.1, 4), c, s * 0.05, 0, BODY.rz * 1.02).rotation.z = (s * Math.PI) / 2;
      add(g, new THREE.SphereGeometry(0.025, 6, 4), c, 0, 0, BODY.rz * 1.04);
      break;
    case 'lei':
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        add(g, new THREE.SphereGeometry(0.05, 8, 6), std(['#f7a1c4', '#ffd36e', '#ff9e7a'][i % 3]), Math.cos(t) * 0.41, Math.sin(t * 2) * 0.01, Math.sin(t) * 0.41);
      }
      break;
  }
  return g;
}
