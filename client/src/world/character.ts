import * as THREE from 'three';
import type { Anim, Hat, Look } from '../../../shared/types';
import { Overhead } from './overhead';
import { textSprite } from './text';

const HAT_COLORS: Record<Exclude<Hat, 'none'>, string> = {
  beanie: '#ef7d7d',
  cap: '#6d9cf0',
  bucket: '#efd27a',
  flower: '#7cc47a',
};

function makeHat(h: Exclude<Hat, 'none'>): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.MeshStandardMaterial({ color: HAT_COLORS[h], roughness: 0.85 });
  const white = new THREE.MeshStandardMaterial({ color: '#fffaf2', roughness: 0.9 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  if (h === 'beanie') {
    add(new THREE.SphereGeometry(0.375, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), c, 0, 1.36, 0);
    add(new THREE.TorusGeometry(0.37, 0.05, 8, 28), white, 0, 1.42, 0).rotation.x = Math.PI / 2;
    add(new THREE.SphereGeometry(0.08, 10, 8), white, 0, 1.76, 0);
  } else if (h === 'cap') {
    add(new THREE.SphereGeometry(0.372, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), c, 0, 1.35, 0);
    add(new THREE.BoxGeometry(0.34, 0.025, 0.26), c, 0, 1.52, 0.38).rotation.x = 0.15;
  } else if (h === 'bucket') {
    add(new THREE.CylinderGeometry(0.27, 0.33, 0.24, 18), c, 0, 1.67, 0);
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 24), c, 0, 1.56, 0);
  } else {
    const colors = ['#f7a1c4', '#ffd36e', '#ffffff'];
    add(new THREE.TorusGeometry(0.29, 0.025, 6, 32), c, 0, 1.55, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.MeshStandardMaterial({ color: colors[i % 3], roughness: 0.8 });
      add(new THREE.SphereGeometry(0.07, 10, 8), m, Math.cos(a) * 0.29, 1.57, Math.sin(a) * 0.29);
    }
  }
  return g;
}

/** A chunky, big-headed, waddling little person. Faces +z when facing = 0. */
export class Character {
  readonly root = new THREE.Group();
  readonly overhead = new Overhead();
  anim: Anim = 'idle';
  facing = 0;

  private rig = new THREE.Group();
  private bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  private legMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  private skinMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  private darkMat = new THREE.MeshStandardMaterial({ color: '#3b3346', roughness: 0.6 });
  private blushMat = new THREE.MeshStandardMaterial({ color: '#ff9fb0', roughness: 1 });
  private hatGroup = new THREE.Group();
  private hatKey = '';
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private body: THREE.Mesh;
  private phase = 0;
  private dimmed = false;

  constructor(look: Look, name: string, isMe = false) {
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.rig) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    this.body = part(new THREE.CapsuleGeometry(0.26, 0.28, 6, 14), this.bodyMat, 0, 0.62, 0);
    part(new THREE.SphereGeometry(0.36, 24, 18), this.skinMat, 0, 1.32, 0);
    part(new THREE.BoxGeometry(0.07, 0.018, 0.02), this.darkMat, 0, 1.235, 0.352);
    for (const s of [-1, 1]) {
      part(new THREE.SphereGeometry(0.045, 10, 8), this.darkMat, s * 0.12, 1.36, 0.325);
      const blush = part(new THREE.SphereGeometry(0.06, 10, 8), this.blushMat, s * 0.21, 1.25, 0.29);
      blush.scale.set(1, 0.6, 0.4);
      blush.castShadow = false;

      const leg = new THREE.Group();
      leg.position.set(s * 0.11, 0.32, 0);
      part(new THREE.CapsuleGeometry(0.08, 0.16, 4, 10), this.legMat, 0, -0.16, 0, leg);
      this.rig.add(leg);
      this.legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(s * 0.3, 0.9, 0);
      arm.rotation.z = s * 0.25;
      part(new THREE.CapsuleGeometry(0.07, 0.2, 4, 10), this.bodyMat, 0, -0.16, 0, arm);
      this.rig.add(arm);
      this.arms.push(arm);
    }
    this.rig.add(this.hatGroup);
    this.root.add(this.rig);

    const tag = textSprite(name, 0.28, { bg: isMe ? '#fff4d6ee' : '#ffffffd9', font: 40, pad: 14 });
    tag.position.y = 2.0;
    this.root.add(tag);
    this.overhead.group.position.y = 2.5;
    this.root.add(this.overhead.group);
    this.setLook(look);
  }

  setLook(look: Look): void {
    this.bodyMat.color.set(look.body);
    this.legMat.color.set(look.body).offsetHSL(0, -0.05, -0.18);
    this.skinMat.color.set(look.skin);
    if (look.hat !== this.hatKey) {
      this.hatKey = look.hat;
      for (const c of [...this.hatGroup.children]) {
        c.removeFromParent();
        disposeTree(c);
      }
      if (look.hat !== 'none') this.hatGroup.add(makeHat(look.hat));
      if (this.dimmed) this.applyDim(true);
    }
  }

  /** Faded look while their connection is lost. */
  setDim(on: boolean): void {
    if (on === this.dimmed) return;
    this.dimmed = on;
    this.applyDim(on);
  }

  private applyDim(on: boolean): void {
    this.rig.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.transparent = on;
        m.opacity = on ? 0.4 : 1;
        m.depthWrite = !on;
      }
    });
  }

  update(dt: number, now: number): void {
    this.rig.rotation.y = this.facing;
    if (this.anim === 'walk') {
      this.phase += dt * 11;
      const s = Math.sin(this.phase);
      this.legs[0].rotation.x = s * 0.7;
      this.legs[1].rotation.x = -s * 0.7;
      this.arms[0].rotation.x = -s * 0.6;
      this.arms[1].rotation.x = s * 0.6;
      this.rig.position.y = Math.abs(s) * 0.06;
      this.rig.rotation.z = s * 0.09;
    } else if (this.anim === 'sit') {
      for (const l of this.legs) l.rotation.x = -Math.PI / 2;
      for (const a of this.arms) a.rotation.x = -0.9;
      this.rig.position.y = 0.16;
      this.rig.rotation.z = 0;
    } else {
      for (const l of this.legs) l.rotation.x = 0;
      const b = Math.sin(now * 0.003) * 0.05;
      this.arms[0].rotation.x = b;
      this.arms[1].rotation.x = -b;
      this.rig.position.y = 0;
      this.rig.rotation.z = 0;
    }
    this.body.scale.y = 1 + Math.sin(now * 0.0025) * 0.02;
    this.overhead.update(dt, now);
  }

  dispose(): void {
    this.root.removeFromParent();
    disposeTree(this.root);
  }
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((x) => {
    if (x instanceof THREE.Mesh || x instanceof THREE.Sprite) {
      x.geometry.dispose();
      const mats = Array.isArray(x.material) ? x.material : [x.material];
      for (const m of mats) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    }
  });
}
