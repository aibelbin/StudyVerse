import * as THREE from 'three';
import { FLOWERS, type Flower } from '../../../shared/garden';
import { GIFTS, type Gift } from '../../../shared/gifts';
import type { Mug } from '../../../shared/mug';
import { toonMat } from './materials';
import { textSprite } from './text';

/** A small hand-held bouquet: green stems, three blooms in the flower's colours, a paper wrap. */
export function bouquetMesh(flower?: Flower): THREE.Group {
  const info = flower ? FLOWERS[flower] : { color: '#ff8fab', accent: '#ffd36e' };
  const g = new THREE.Group();
  const wrap = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.16, 8, 1, true), toonMat({ color: '#f4e6cf', side: THREE.DoubleSide, roughness: 0.9 }));
  wrap.rotation.x = Math.PI;
  wrap.position.y = 0.02;
  g.add(wrap);
  const petal = toonMat({ color: info.color, roughness: 0.6, emissive: flower === 'glowLily' ? info.color : '#000000', emissiveIntensity: flower === 'glowLily' ? 0.6 : 0 });
  const centre = toonMat({ color: info.accent });
  for (const [x, z] of [[-0.035, 0], [0.035, 0.01], [0, -0.03]]) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), petal);
    b.position.set(x, 0.13, z);
    g.add(b);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 4), centre);
    c.position.set(x, 0.16, z);
    g.add(c);
  }
  for (const [x, z] of [[-0.05, 0.02], [0.05, -0.02]]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), toonMat({ color: '#6fbf5f' }));
    leaf.scale.set(0.5, 1.4, 0.5);
    leaf.position.set(x, 0.1, z);
    g.add(leaf);
  }
  return g;
}

/** A gift as a little emoji sprite (a plain parcel if unknown). */
export function giftSprite(gift: Gift | undefined, h = 0.42): THREE.Sprite {
  return textSprite(gift ? GIFTS[gift].emoji : '🎁', h, { bg: null, font: 64, pad: 2 });
}

/** A personal mug: shaped body in the glaze colour, accent handle and rim, a drink disc on top when filled. */
export function mugMesh(mug: Mug, fill?: string): THREE.Group {
  const g = new THREE.Group();
  const glaze = toonMat({ color: mug.glaze, roughness: 0.6 });
  const accent = toonMat({ color: mug.accent });
  let h: number, r: number;
  if (mug.shape === 'round') {
    h = 0.13;
    r = 0.08;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), glaze);
    body.scale.set(1, 0.9, 1);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.02, 10), glaze);
    base.position.y = -0.065;
    g.add(body, base);
  } else {
    const [rt, rb, hh] = { classic: [0.07, 0.055, 0.13], tall: [0.06, 0.05, 0.17], tiny: [0.05, 0.045, 0.09] }[mug.shape];
    h = hh;
    r = rt;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, 14), glaze);
    g.add(body);
  }
  g.children.forEach((m) => (m.castShadow = true));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12), accent);
  handle.position.x = r;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.008, 6, 14), accent);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = mug.shape === 'round' ? 0.06 : h / 2;
  g.add(handle, rim);
  if (fill) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.01, 14), toonMat({ color: fill }));
    top.position.y = rim.position.y - 0.005;
    g.add(top);
  }
  return g;
}
