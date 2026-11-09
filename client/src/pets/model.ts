import * as THREE from 'three';
import type { PetKind, PetView } from '../../../shared/types';
import { textSprite } from '../world/text';

const std = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });

const COLORS: Record<PetKind, { body: string; belly: string; extra: string }> = {
  duckling: { body: '#ffd84d', belly: '#fff0a0', extra: '#ff9e3d' },
  kitten: { body: '#f2b07a', belly: '#fff2e0', extra: '#ff9fb0' },
  bunny: { body: '#f4ece6', belly: '#ffffff', extra: '#ffb3c6' },
  frog: { body: '#7cc47a', belly: '#d8f0b0', extra: '#ff9fb0' },
};

/** A tiny round animal in the same blob style as the players, with a hop when it walks. */
export class PetModel {
  readonly root = new THREE.Group();
  private rig = new THREE.Group();
  private tail: THREE.Object3D | null = null;
  private phase = Math.random() * 10;

  constructor(kind: PetKind, name: string) {
    const c = COLORS[kind];
    const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, parent: THREE.Object3D = this.rig) => {
      const m = new THREE.Mesh(geo, std(color));
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    add(new THREE.SphereGeometry(0.2, 16, 12).scale(1, 0.9, 1.1), c.body, 0, 0.2, 0);
    add(new THREE.SphereGeometry(0.12, 12, 8).scale(1, 0.8, 0.5), c.belly, 0, 0.17, 0.14);
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.025, 8, 6), '#2a2430', s * 0.07, 0.27, 0.18);
    if (kind === 'duckling') {
      add(new THREE.ConeGeometry(0.05, 0.1, 6).rotateX(Math.PI / 2), c.extra, 0, 0.22, 0.24);
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.07, 8, 6).scale(0.4, 0.8, 1.2), c.body, s * 0.19, 0.2, -0.02);
    } else if (kind === 'kitten') {
      for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.06, 0.12, 4), c.body, s * 0.1, 0.38, 0.02).rotation.z = -s * 0.25;
      this.tail = add(new THREE.CylinderGeometry(0.025, 0.02, 0.28, 6), c.body, 0, 0.26, -0.24);
      this.tail.rotation.x = -0.7;
      add(new THREE.SphereGeometry(0.02, 6, 4), c.extra, 0, 0.23, 0.215);
    } else if (kind === 'bunny') {
      for (const s of [-1, 1]) {
        const ear = add(new THREE.SphereGeometry(0.05, 8, 6).scale(0.6, 2.4, 0.5), c.body, s * 0.07, 0.46, -0.02);
        ear.rotation.z = -s * 0.15;
      }
      this.tail = add(new THREE.SphereGeometry(0.06, 8, 6), c.belly, 0, 0.18, -0.22);
    } else {
      for (const s of [-1, 1]) {
        add(new THREE.SphereGeometry(0.06, 10, 8), c.body, s * 0.08, 0.33, 0.1);
        add(new THREE.SphereGeometry(0.03, 8, 6), '#2a2430', s * 0.08, 0.35, 0.15);
      }
    }
    for (const s of [-1, 1]) {
      const b = add(new THREE.SphereGeometry(0.03, 8, 6), c.extra, s * 0.12, 0.2, 0.17);
      b.scale.set(1, 0.6, 0.4);
    }
    this.root.add(this.rig);
    const tag = textSprite(name, 0.16, { bg: '#ffffffcc', font: 34, pad: 10 });
    tag.position.y = 0.75;
    this.root.add(tag);
  }

  update(dt: number, now: number, anim: PetView['anim'], facing: number): void {
    this.rig.rotation.y = facing;
    if (anim === 'walk') {
      this.phase += dt * 12;
      this.rig.position.y = Math.abs(Math.sin(this.phase)) * 0.1;
      this.rig.rotation.z = Math.sin(this.phase) * 0.08;
    } else {
      this.rig.position.y = anim === 'sit' ? -0.03 : 0;
      this.rig.rotation.z = 0;
    }
    if (this.tail) this.tail.rotation.z = Math.sin(now / 250) * 0.4;
    this.rig.scale.y = 1 + Math.sin(now / 400) * 0.03;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }
}
