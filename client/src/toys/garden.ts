import * as THREE from 'three';
import { FLOWERS, stageOf, type Flower, type PlotState, type Stage } from '../../../shared/garden';
import type { Toy } from '../../../shared/scenes/types';
import { SPOT_OFFSETS } from '../../../shared/scenes/town/garden';
import { mat, mesh } from '../world/materials';
import { PALETTE as P } from '../world/palette';
import { labelTexture } from '../world/text';
import { Floaters } from './floaters';
import type { ToyView } from './registry';

const SOIL_TOP = 0.12;
/** Plants are drawn larger than life so they read from the camera. */
const PLANT_SCALE = 1.7;
const STEM = '#5fa64f';

/** Glow-lily blooms share one material so night can light them all at once. */
const glowLily = new THREE.MeshStandardMaterial({ color: FLOWERS.glowLily.color, emissive: FLOWERS.glowLily.color, emissiveIntensity: 0.1, roughness: 0.4 });

function petalMat(f: Flower): THREE.Material {
  return f === 'glowLily' ? glowLily : mat(FLOWERS[f].color, 0.6);
}

/** Just the flower head, at the origin (stem tops and the vase use it). */
export function flowerHead(f: Flower, s = 1): THREE.Group {
  const info = FLOWERS[f];
  const g = new THREE.Group();
  const add = (o: THREE.Mesh, x = 0, y = 0, z = 0) => {
    o.position.set(x * s, y * s, z * s);
    o.scale.multiplyScalar(s);
    o.castShadow = false;
    g.add(o);
    return o;
  };
  switch (f) {
    case 'tulip': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.11, 6), petalMat(f)), 0, 0.04, 0);
      break;
    }
    case 'daisy':
    case 'poppy': {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const p = add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), petalMat(f)), Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
        p.scale.set(s, s * 0.35, s * 0.7);
        p.rotation.y = -a;
      }
      add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 5), mat(info.accent)), 0, 0.01, 0);
      break;
    }
    case 'sunflower': {
      const disc = add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 14), petalMat(f)), 0, 0, 0);
      disc.rotation.x = Math.PI / 2.4;
      const mid = add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 12), mat(info.accent)), 0, 0.005, 0.01);
      mid.rotation.x = Math.PI / 2.4;
      break;
    }
    case 'lavender': {
      for (let i = 0; i < 6; i++) add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), petalMat(f)), 0, i * 0.035, 0);
      break;
    }
    case 'rose': {
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), petalMat(f)), 0, 0.03, 0);
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), mat(info.accent)), 0, 0.075, 0);
      break;
    }
    case 'lotus': {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const p = add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), petalMat(f)), Math.cos(a) * 0.04, 0.03, Math.sin(a) * 0.04);
        p.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
      }
      add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), mat(info.accent)), 0, 0.03, 0);
      break;
    }
    case 'glowLily': {
      const c = add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 6, 1, true), petalMat(f)), 0, 0.04, 0);
      c.rotation.x = Math.PI;
      add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), mat(info.accent)), 0, 0.06, 0);
      break;
    }
  }
  return g;
}

/** One plant at a stage: a seed mound, a sprout, a bud, or the flower in bloom. */
function plantMesh(f: Flower, stage: Stage): THREE.Group {
  const g = new THREE.Group();
  if (stage === 'seed') {
    const m = mesh(new THREE.SphereGeometry(0.08, 6, 4), mat('#5a3d2c'), 0, SOIL_TOP, 0, false);
    m.scale.y = 0.4;
    g.add(m, mesh(new THREE.SphereGeometry(0.02, 5, 4), mat('#e8d8a8'), 0, SOIL_TOP + 0.03, 0, false));
    return g;
  }
  const tall = f === 'sunflower' ? 0.85 : f === 'lotus' ? 0.06 : f === 'lavender' ? 0.4 : 0.42;
  const h = stage === 'sprout' ? Math.min(0.14, tall) : stage === 'bud' ? tall * 0.7 : tall;
  if (f === 'lotus') {
    const pad = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.015, 12), mat('#4f9e6a'), 0, SOIL_TOP + 0.01, 0, false);
    g.add(pad);
  } else {
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.015, h, 5), mat(STEM), 0, SOIL_TOP + h / 2, 0, false));
  }
  for (const side of [-1, 1]) {
    const leaf = mesh(new THREE.SphereGeometry(0.04, 6, 4), mat('#6fbf5f'), side * 0.04, SOIL_TOP + Math.max(0.05, h * 0.35), 0, false);
    leaf.scale.set(1.3, 0.35, 0.7);
    leaf.rotation.z = side * 0.5;
    if (f !== 'lotus') g.add(leaf);
  }
  const top = SOIL_TOP + h;
  if (stage === 'bud') {
    const bud = mesh(new THREE.SphereGeometry(0.035, 6, 5), mat(FLOWERS[f].color, 0.6), 0, top + 0.02, 0, false);
    bud.scale.set(0.8, 1.3, 0.8);
    g.add(bud);
  } else if (stage === 'bloom') {
    const head = flowerHead(f, f === 'sunflower' ? 1.2 : 1);
    head.position.y = top;
    g.add(head);
  }
  return g;
}

/** A garden plot: four plants by stage, the owner's sign, the vase, and a sparkle while watered. */
export function plotView(_toy: Toy): ToyView {
  const root = new THREE.Group();
  const fl = new Floaters(root);
  const plants = new THREE.Group();
  root.add(plants);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(1.94, 1.74), new THREE.MeshBasicMaterial({ color: '#2a1a12', transparent: true, opacity: 0.35, depthWrite: false }));
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = SOIL_TOP + 0.005;
  wet.visible = false;
  root.add(wet);

  const sign = new THREE.Group();
  sign.position.set(-0.7, 0, 1.05);
  sign.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), mat(P.woodDark), 0, 0.25, 0));
  sign.add(mesh(new THREE.BoxGeometry(0.82, 0.24, 0.03), mat(P.woodLight), 0, 0.52, 0));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.2), new THREE.MeshBasicMaterial({ transparent: true }));
  board.position.set(0, 0.52, 0.02);
  sign.add(board);
  root.add(sign);

  const vase = new THREE.Group();
  vase.position.set(0.72, 0, 1.0);
  vase.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.26, 10), mat('#7ab8ff', 0.4), 0, 0.13, 0));
  const vaseFlowers = new THREE.Group();
  vaseFlowers.position.y = 0.26;
  vaseFlowers.scale.setScalar(1.5);
  vase.add(vaseFlowers);
  root.add(vase);

  let plantKey = '';
  let signKey = '';
  let vaseKey = '';
  let nextTwinkle = 0;
  return {
    root,
    update(ctx) {
      fl.update(ctx.now);
      const s = ctx.state?.kind === 'plot' ? (ctx.state as PlotState) : null;
      const spots = s?.spots ?? [];
      const key = spots.map((sp) => (sp ? `${sp.flower}:${stageOf(sp.progress, FLOWERS[sp.flower].growMin)}` : '-')).join('|');
      if (key !== plantKey) {
        plantKey = key;
        plants.clear();
        spots.forEach((sp, i) => {
          if (!sp) return;
          const m = plantMesh(sp.flower, stageOf(sp.progress, FLOWERS[sp.flower].growMin));
          m.position.set(SPOT_OFFSETS[i].dx, SOIL_TOP * (1 - PLANT_SCALE), SPOT_OFFSETS[i].dz); // keep the base on the soil
          m.scale.setScalar(PLANT_SCALE);
          plants.add(m);
        });
      }
      const name = s?.ownerName ? `${s.ownerName}'s garden` : 'Free plot 🌱';
      if (name !== signKey) {
        signKey = name;
        const { tex, aspect } = labelTexture(name, { fg: P.ink, font: 44, pad: 8 });
        const m = board.material as THREE.MeshBasicMaterial;
        m.map?.dispose();
        m.map = tex;
        m.needsUpdate = true;
        board.scale.set(Math.min(1, (0.2 * aspect) / 0.78), 1, 1);
      }
      const v = s?.vase ?? '';
      if (v !== vaseKey) {
        vaseKey = v;
        vaseFlowers.clear();
        if (s?.vase) {
          for (const [x, z, h] of [[-0.03, 0, 0.16], [0.03, 0.02, 0.2], [0, -0.03, 0.13]]) {
            vaseFlowers.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, h, 4), mat(STEM), x, h / 2, z, false));
            const head = flowerHead(s.vase, 1.3);
            head.position.set(x, h, z);
            vaseFlowers.add(head);
          }
        }
      }
      // watered: darker soil and a twinkle now and then
      const watered = !!s && s.boostMin > 0;
      wet.visible = watered;
      if (watered && ctx.now > nextTwinkle) {
        nextTwinkle = ctx.now + 1200 + Math.random() * 1500;
        fl.text('✨', (Math.random() - 0.5) * 1.6, SOIL_TOP + 0.1, (Math.random() - 0.5) * 1.4, ctx.now, 0.18, 1100);
      }
      glowLily.emissiveIntensity = 0.1 + ctx.night * 1.6;
      plants.rotation.z = Math.sin(ctx.now * 0.0011) * 0.01;
    },
  };
}
