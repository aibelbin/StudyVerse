import * as THREE from 'three';
import type { PetKind, PetView } from '../../../shared/types';
import { textSprite } from '../world/text';
import { toonMat } from '../world/materials';

const std = (c: string) => toonMat({ color: c, roughness: 0.75 });

/** What pops over a pet when it starts doing something (the same for everyone watching). */
const POPS: Partial<Record<PetView['anim'], string>> = {
  sniff: '❓', play: '❤️', pounce: '❗', zoom: '💨', binky: '✨', flop: '😌', quack: 'Quack!', croak: 'Ribbit!', tongue: '🪰',
};

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
  private anim: PetView['anim'] = 'idle';
  private animAt = 0;
  private lastZ = 0;
  private lastRipple = 0;
  private tongue: THREE.Mesh | null = null;
  private pops: { s: THREE.Sprite; born: number }[] = [];
  private ripples: { m: THREE.Mesh; born: number }[] = [];

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
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.025, 8, 6), '#2a2430', s * 0.07, 0.27, 0.18);
      add(new THREE.SphereGeometry(0.008, 6, 4), '#ffffff', s * 0.07 + 0.008, 0.28, 0.203); // eye shine
      const foot = add(new THREE.SphereGeometry(0.045, 8, 6), c.body, s * 0.09, 0.03, 0.08); // little feet
      foot.scale.set(1, 0.5, 1.3);
    }
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
      // A sticky tongue that flicks out to catch flies (hidden until then).
      const tg = new THREE.CylinderGeometry(0.018, 0.022, 0.5, 6);
      tg.rotateX(Math.PI / 2);
      tg.translate(0, 0, 0.25);
      this.tongue = add(tg, '#ff6f8f', 0, 0.2, 0.2);
      this.tongue.scale.set(1, 1, 0.01);
    }
    for (const s of [-1, 1]) {
      const b = add(new THREE.SphereGeometry(0.03, 8, 6), c.extra, s * 0.12, 0.2, 0.17);
      b.scale.set(1, 0.6, 0.4);
    }
    this.root.add(this.rig);
    // A plain floating name with a soft dark outline (no bubble).
    const tag = textSprite(name, 0.25, { bg: null, fg: '#ffffff', outline: '#3a2f44cc', font: 44, pad: 10 });
    tag.position.y = 0.75;
    this.root.add(tag);
  }

  /** One-shot emoji (or a word) over the pet when it starts doing something. */
  private pop(text: string, now: number): void {
    const s = textSprite(text, text.length > 2 ? 0.16 : 0.24, text.length > 2 ? { bg: null, font: 40, pad: 6, fg: '#ffffff', outline: '#3a2f44' } : { bg: null, font: 56, pad: 4 });
    s.position.set(0, 0.62, 0);
    this.root.add(s);
    this.pops.push({ s, born: now });
  }

  update(dt: number, now: number, anim: PetView['anim'], facing: number): void {
    if (anim !== this.anim) {
      this.anim = anim;
      this.animAt = now;
      const pop = POPS[anim];
      if (pop) this.pop(pop, now);
    }
    if (anim === 'sleep' && now - this.lastZ > 2200) {
      this.lastZ = now;
      this.pop('💤', now);
    }
    const t = (now - this.animAt) / 1000;
    const r = this.rig;
    this.root.rotation.y = 0;
    r.rotation.set(0, facing, 0);
    r.position.set(0, 0, 0);
    r.scale.set(1, 1 + Math.sin(now / 400) * 0.03, 1);
    if (this.tongue) this.tongue.scale.set(1, 1, 0.01);
    const hopY = (rate: number, height: number) => {
      this.phase += dt * rate;
      return Math.abs(Math.sin(this.phase)) * height;
    };
    switch (anim) {
      case 'walk':
        r.position.y = hopY(12, 0.1);
        r.rotation.z = Math.sin(this.phase) * 0.08;
        break;
      case 'run':
      case 'zoom':
        r.position.y = hopY(20, 0.12);
        r.rotation.z = Math.sin(this.phase) * 0.12;
        r.rotation.x = 0.12;
        break;
      case 'hop':
        r.position.y = hopY(8, 0.32);
        r.scale.y = 1 + Math.cos(this.phase * 2) * 0.12;
        break;
      case 'leap':
        r.position.y = hopY(6, 0.45);
        r.rotation.x = -Math.cos(this.phase) * 0.3;
        break;
      case 'sit':
        r.position.y = -0.03;
        r.scale.y = 0.94;
        break;
      case 'sleep':
        r.position.y = -0.06;
        r.scale.set(1.08, 0.78 + Math.sin(now / 900) * 0.03, 1.08);
        r.rotation.z = 0.35;
        break;
      case 'flop':
        r.position.y = 0.04;
        r.rotation.z = Math.min(1.35, t * 4);
        break;
      case 'sniff':
        r.rotation.x = 0.25 + Math.sin(now / 90) * 0.08;
        r.rotation.y = facing + Math.sin(now / 700) * 0.6;
        break;
      case 'play':
        r.position.y = Math.abs(Math.sin(now / 160)) * 0.12;
        r.rotation.y = facing + Math.sin(now / 220) * 0.7;
        r.rotation.z = Math.sin(now / 160) * 0.15;
        break;
      case 'pounce': {
        const k = t % 1.6;
        if (k < 0.6) {
          r.scale.y = 0.8; // wiggle, crouched
          r.rotation.y = facing + Math.sin(now / 50) * 0.08;
        } else if (k < 1.0) {
          const u = (k - 0.6) / 0.4;
          r.position.y = Math.sin(u * Math.PI) * 0.35;
          r.position.x = Math.sin(facing) * u * 0.5;
          r.position.z = Math.cos(facing) * u * 0.5;
        }
        break;
      }
      case 'binky': {
        const k = t % 1.4;
        if (k < 0.7) {
          const u = k / 0.7;
          r.position.y = Math.sin(u * Math.PI) * 0.45;
          r.rotation.y = facing + Math.sin(u * Math.PI) * 1.2;
          r.rotation.z = Math.sin(u * Math.PI * 2) * 0.3;
        }
        break;
      }
      case 'swim':
        r.position.y = -0.13 + Math.sin(now / 500) * 0.02;
        r.rotation.z = Math.sin(now / 700) * 0.06;
        if (now - this.lastRipple > 900) {
          this.lastRipple = now;
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.06;
          this.root.add(ring);
          this.ripples.push({ m: ring, born: now });
        }
        break;
      case 'quack':
      case 'croak':
        r.scale.set(1 + Math.max(0, Math.sin(t * 9)) * 0.1, 1 + Math.max(0, Math.sin(t * 9)) * 0.12, 1);
        break;
      case 'tongue': {
        const k = t % 1.2;
        if (this.tongue && k > 0.5 && k < 0.8) this.tongue.scale.set(1, 1, Math.sin(((k - 0.5) / 0.3) * Math.PI));
        break;
      }
      default:
        break;
    }
    if (this.tail) this.tail.rotation.z = Math.sin(now / (anim === 'play' || anim === 'pounce' ? 110 : 250)) * 0.4;
    for (const p of this.pops) {
      const k = (now - p.born) / 1500;
      p.s.position.y = 0.62 + k * 0.5;
      p.s.material.opacity = 1 - k * k;
    }
    this.pops = this.pops.filter((p) => {
      if (now - p.born < 1500) return true;
      p.s.removeFromParent();
      p.s.material.map?.dispose();
      p.s.material.dispose();
      return false;
    });
    this.ripples = this.ripples.filter((p) => {
      const k = (now - p.born) / 1400;
      if (k >= 1) {
        p.m.removeFromParent();
        p.m.geometry.dispose();
        (p.m.material as THREE.Material).dispose();
        return false;
      }
      p.m.scale.setScalar(1 + k * 3);
      (p.m.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
      return true;
    });
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
