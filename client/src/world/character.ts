import * as THREE from 'three';
import type { Pose } from '../../../shared/scenes/types';
import type { Anim, Eyes, Look, OutfitSlot } from '../../../shared/types';
import { SLOTS } from '../../../shared/wardrobe';
import { BODY, buildItem } from './outfits';
import { Overhead } from './overhead';
import { textSprite } from './text';

const INK = '#2a2430';

/** A round, waddling blob with a face, stubby hands and bean feet. Faces +z when facing = 0. */
export class Character {
  readonly root = new THREE.Group();
  readonly overhead = new Overhead();
  anim: Anim = 'idle';
  /** How to sit when anim is 'sit'. */
  pose: Pose = 'sit';
  /** Rowing / steering motion while true. */
  active = false;
  facing = 0;

  private rig = new THREE.Group();
  private bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  private limbMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  private inkMat = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.5 });
  private blushMat = new THREE.MeshStandardMaterial({ color: '#ff9fb0', roughness: 1 });
  private body: THREE.Mesh;
  private eyes = new THREE.Group();
  private eyeKey = '';
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private anchors = {} as Record<OutfitSlot, THREE.Group>;
  private worn = {} as Record<OutfitSlot, string>;
  private phase = 0;
  private dimmed = false;
  private blinkAt = Math.random() * 4000;

  constructor(look: Look, name: string, isMe = false) {
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.rig) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    this.body = part(new THREE.SphereGeometry(1, 32, 24).scale(BODY.rx, BODY.ry, BODY.rz), this.bodyMat, 0, BODY.cy, 0);
    this.eyes.position.set(0, 0.68, 0.355);
    this.rig.add(this.eyes);
    for (const s of [-1, 1]) {
      const blush = part(new THREE.SphereGeometry(0.06, 10, 8), this.blushMat, s * 0.21, 0.6, 0.31);
      blush.scale.set(1, 0.55, 0.4);
      blush.castShadow = false;

      const leg = new THREE.Group();
      leg.position.set(s * 0.15, 0.12, 0);
      part(new THREE.SphereGeometry(0.1, 12, 8).scale(1, 0.6, 1.4), this.limbMat, 0, -0.06, 0.04, leg);
      this.rig.add(leg);
      this.legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(s * 0.38, 0.5, 0);
      part(new THREE.SphereGeometry(0.085, 12, 8), this.limbMat, 0, -0.07, 0, arm);
      this.rig.add(arm);
      this.arms.push(arm);
    }
    const mouth = part(new THREE.TorusGeometry(0.035, 0.012, 6, 12, Math.PI), this.inkMat, 0, 0.6, 0.385);
    mouth.rotation.z = Math.PI;
    mouth.castShadow = false;

    const anchorAt: Record<OutfitSlot, [number, number, number]> = {
      hat: [0, 0.97, 0], top: [0, BODY.cy, 0], face: [0, 0.68, 0.36], back: [0, 0.5, -0.38], neck: [0, 0.42, 0],
    };
    for (const slot of SLOTS) {
      const g = new THREE.Group();
      g.position.set(...anchorAt[slot]);
      this.rig.add(g);
      this.anchors[slot] = g;
      this.worn[slot] = '';
    }
    this.root.add(this.rig);

    const tag = textSprite(name, 0.28, { bg: isMe ? '#fff4d6ee' : '#ffffffd9', font: 40, pad: 14 });
    tag.position.y = 1.5;
    this.root.add(tag);
    this.overhead.group.position.y = 1.95;
    this.root.add(this.overhead.group);
    this.setLook(look);
  }

  setLook(look: Look): void {
    this.bodyMat.color.set(look.body);
    this.limbMat.color.set(look.body).offsetHSL(0, -0.05, -0.12);
    if (look.eyes !== this.eyeKey) this.buildEyes(look.eyes);
    for (const slot of SLOTS) {
      if (this.worn[slot] === look[slot]) continue;
      this.worn[slot] = look[slot];
      const a = this.anchors[slot];
      for (const c of [...a.children]) {
        c.removeFromParent();
        disposeTree(c);
      }
      if (look[slot] !== 'none') a.add(buildItem(look[slot]));
    }
    if (this.dimmed) this.applyDim(true);
  }

  private buildEyes(style: Eyes): void {
    this.eyeKey = style;
    for (const c of [...this.eyes.children]) {
      c.removeFromParent();
      if (c instanceof THREE.Mesh) c.geometry.dispose();
    }
    for (const s of [-1, 1]) {
      let geo: THREE.BufferGeometry;
      if (style === 'happy') geo = new THREE.TorusGeometry(0.04, 0.013, 6, 12, Math.PI);
      else if (style === 'sleepy') geo = new THREE.BoxGeometry(0.075, 0.016, 0.02);
      else geo = new THREE.SphereGeometry(0.045, 12, 10);
      const e = new THREE.Mesh(geo, this.inkMat);
      e.position.set(s * 0.12, 0, 0);
      this.eyes.add(e);
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
    const [l0, l1] = this.legs;
    const [a0, a1] = this.arms;
    if (this.anim === 'walk') {
      this.phase += dt * 11;
      const s = Math.sin(this.phase);
      l0.rotation.x = s * 0.6;
      l1.rotation.x = -s * 0.6;
      a0.rotation.x = -s * 0.5;
      a1.rotation.x = s * 0.5;
      a0.rotation.z = a1.rotation.z = 0;
      this.rig.position.y = Math.abs(s) * 0.05;
      this.rig.rotation.z = s * 0.12;
    } else if (this.anim === 'sit') {
      l0.rotation.x = l1.rotation.x = -1.3;
      this.rig.position.y = 0.38;
      this.rig.rotation.z = 0;
      let ax = -0.5;
      let az = 0;
      if (this.pose === 'swing' || this.pose === 'ride') [ax, az] = [-2.6, 0.2];
      else if (this.pose === 'row') ax = this.active ? -1.3 + Math.sin(now * 0.011) * 0.5 : -1.1;
      else if (this.pose === 'drive') [ax, az] = [-1.4 + Math.sin(now * 0.004) * (this.active ? 0.15 : 0), 0.35];
      a0.rotation.x = a1.rotation.x = ax;
      a0.rotation.z = az;
      a1.rotation.z = -az;
    } else {
      l0.rotation.x = l1.rotation.x = 0;
      const b = Math.sin(now * 0.003) * 0.06;
      a0.rotation.x = b;
      a1.rotation.x = -b;
      a0.rotation.z = a1.rotation.z = 0;
      this.rig.position.y = 0;
      this.rig.rotation.z = 0;
    }
    const breathe = 1 + Math.sin(now * 0.0025) * 0.015;
    this.body.scale.set(1, breathe, 1);
    const blinking = this.eyeKey === 'dot' && (now + this.blinkAt) % 4200 < 120;
    this.eyes.scale.y = blinking ? 0.15 : 1;
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
      if (!(x instanceof THREE.Sprite)) x.geometry.dispose();
      const mats = Array.isArray(x.material) ? x.material : [x.material];
      for (const m of mats) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    }
  });
}
