import * as THREE from 'three';
import { FLOWERS, type Flower } from '../../../shared/garden';
import { GIFTS, type Gift } from '../../../shared/gifts';
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
