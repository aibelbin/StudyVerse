import * as THREE from 'three';
import type { Pose } from '../../../shared/scenes/types';
import type { Flower } from '../../../shared/garden';
import type { Gift } from '../../../shared/gifts';
import { ACT_EMOJI, type Act, type Anim, type Eyes, type HoldItem, type Look, type OutfitSlot } from '../../../shared/types';
import { SLOTS } from '../../../shared/wardrobe';
import { BODY, buildItem } from './outfits';
import { Overhead } from './overhead';
import { textSprite } from './text';
import { disposeTree, toonMat } from './materials';
import { bouquetMesh, giftSprite, mugMesh } from './items';
import { DEFAULT_MUG, type Mug } from '../../../shared/mug';

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
  private bodyMat = toonMat({ roughness: 0.75 });
  private limbMat = toonMat({ roughness: 0.8 });
  private inkMat = toonMat({ color: INK, roughness: 0.5 });
  private blushMat = toonMat({ color: '#ff9fb0', roughness: 1 });
  private bellyMat = toonMat({});
  private sparkMat = toonMat({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.4 });
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
  private cup: THREE.Group | null = null;
  private cupKind: string | null = null;
  private steam: THREE.Mesh[] = [];
  private sipAt = -1e9;
  private net: THREE.Group | null = null;
  private netAt = -1e9;
  private actKind: Act | null = null;
  private actAt = 0;
  private pops: { at: number; emoji: string }[] = [];
  private umbrella: THREE.Group | null = null;

  constructor(look: Look, name: string, isMe = false) {
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.rig) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    this.body = part(new THREE.SphereGeometry(1, 32, 24).scale(BODY.rx, BODY.ry, BODY.rz), this.bodyMat, 0, BODY.cy, 0);
    // a soft lighter belly patch on the front
    const belly = part(new THREE.SphereGeometry(1, 24, 16).scale(0.27, 0.25, 0.1), this.bellyMat, 0, 0.42, BODY.rz * 0.84);
    belly.castShadow = false;
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

    // A floating name with a soft dark outline, no bubble (your own is a touch warmer so you can spot yourself).
    const tag = textSprite(name, 0.32, { bg: null, fg: isMe ? '#fff1c4' : '#ffffff', outline: '#3a2f44cc', font: 44, pad: 10 });
    tag.position.y = 1.5;
    this.root.add(tag);
    this.overhead.group.position.y = 1.95;
    this.root.add(this.overhead.group);
    this.setLook(look);
  }

  setLook(look: Look): void {
    this.bodyMat.color.set(look.body);
    this.bellyMat.color.set(look.body).offsetHSL(0, -0.08, 0.1);
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
      if (style !== 'happy' && style !== 'sleepy') {
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), this.sparkMat);
        spark.position.set(s * 0.12 + 0.015, 0.017, 0.035); // a little shine in each eye
        this.eyes.add(spark);
      }
    }
  }

  /** A cup of coffee (or matcha, or cocoa) in the right hand, steaming. */
  setHolding(drink: HoldItem | null, flower?: Flower, gift?: Gift, mug: Mug = DEFAULT_MUG): void {
    const key = drink === 'bouquet' ? `bouquet:${flower}` : drink === 'gift' ? `gift:${gift}` : drink && `${drink}:${mug.shape}:${mug.glaze}:${mug.accent}`;
    if (key === this.cupKind) return;
    this.cupKind = key;
    if (this.cup) {
      this.cup.removeFromParent();
      disposeTree(this.cup);
      this.cup = null;
      this.steam = [];
    }
    if (!drink) return;
    if (drink === 'gift') {
      const g = new THREE.Group();
      const s = giftSprite(gift, 0.32);
      s.position.y = 0.1;
      g.add(s);
      g.position.set(0, -0.1, 0.1);
      this.arms[1].add(g);
      this.cup = g;
      return;
    }
    if (drink === 'bouquet') {
      const g = bouquetMesh(flower);
      g.position.set(0, -0.1, 0.07);
      this.arms[1].add(g);
      this.cup = g;
      return;
    }
    const fill = { espresso: '#5a3220', latte: '#c9a27a', matcha: '#8cc77a', cocoa: '#6b3e2a' }[drink];
    const g = mugMesh(mug, fill);
    const steamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), steamMat);
      this.steam.push(puff);
      g.add(puff);
    }
    g.position.set(0, -0.1, 0.07);
    this.arms[1].add(g); // the right hand (arms[1] is +x)
    this.cup = g;
  }

  /** Act out an emote from the wheel: an animation plus its emoji (and extras for love/sleepy/think). */
  act(kind: Act, now: number): void {
    this.actKind = kind;
    this.actAt = now;
    this.overhead.pop(ACT_EMOJI[kind], now);
    const extra: Partial<Record<Act, string>> = { love: '💗', sleepy: '💤', think: '💭' };
    const e = extra[kind];
    this.pops = e ? [700, 1400].map((d) => ({ at: now + d, emoji: e })) : [];
  }

  /** A quick bug-net swing in the right hand (~0.5 s). */
  swingNet(now: number): void {
    this.netAt = now;
    if (this.net) return;
    const g = new THREE.Group();
    const wood = toonMat({ color: '#a0703c' });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), wood);
    handle.position.y = -0.3;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 16), wood);
    hoop.position.y = -0.67;
    const bag = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 10, 1, true), toonMat({ color: '#ffffff', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    bag.rotation.x = -Math.PI / 2; // open end on the hoop
    bag.position.set(0, -0.67, -0.1);
    g.add(handle, hoop, bag);
    g.position.set(0, -0.1, 0.05);
    this.arms[1].add(g);
    this.net = g;
  }

  /** An umbrella held up in the left hand, over the head (built on first use). */
  setUmbrella(on: boolean): void {
    if (!on && !this.umbrella) return;
    if (!this.umbrella) {
      const g = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.8, 6), toonMat({ color: '#7a5636' }));
      handle.position.y = 0.4;
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.22, 12, 1, true), toonMat({ color: '#ff8fa8', side: THREE.DoubleSide }));
      canopy.position.y = 0.86;
      canopy.castShadow = true;
      g.add(handle, canopy);
      g.position.set(-0.38, 0.5, 0); // the left hand (arms[0] is -x), on the rig so it doesn't swing with the walk
      g.rotation.z = -0.35; // tilted in so the canopy sits over the head
      this.rig.add(g);
      this.umbrella = g;
      if (this.dimmed) this.applyDim(true);
    }
    this.umbrella.visible = on;
    this.overhead.group.position.y = on ? 2.45 : 1.95; // name tag clears the canopy
  }

  /** Raise the cup for a sip (the ☕ emote). */
  sip(now: number): void {
    this.sipAt = now;
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
    this.rig.rotation.x = 0;
    this.rig.position.x = 0;
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
    if (this.cup) {
      const sipping = now - this.sipAt < 1200;
      if (this.anim !== 'walk') a1.rotation.x = sipping ? -2.2 : this.anim === 'sit' ? a1.rotation.x : -0.7;
      this.cup.rotation.x = -a1.rotation.x * 0.9; // keep the cup upright
      this.steam.forEach((p, i) => {
        const k = ((now / 1400 + i / 3) % 1);
        p.position.set(Math.sin(now / 300 + i) * 0.02, 0.08 + k * 0.22, 0);
        p.scale.setScalar(0.6 + k);
        (p.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
      });
    }
    const swing = (now - this.netAt) / 500;
    if (this.net) this.net.visible = swing < 1;
    if (swing < 1) a1.rotation.x = -2.6 + swing * 2.2; // up high, then a sweep down
    const breathe = 1 + Math.sin(now * 0.0025) * 0.015;
    this.body.scale.set(1, breathe, 1);
    const blinking = this.eyeKey === 'dot' && (now + this.blinkAt) % 4200 < 120;
    this.eyes.scale.y = blinking ? 0.15 : 1;
    this.animateAct(now);
    while (this.pops.length && this.pops[0].at <= now) this.overhead.pop(this.pops.shift()!.emoji, now, 0.38);
    this.overhead.update(dt, now);
  }

  /** Overrides limbs (and, standing, the whole body) for the emote being acted out. */
  private animateAct(now: number): void {
    const kind = this.actKind;
    if (!kind) return;
    const t = (now - this.actAt) / 1000;
    if (this.anim === 'walk' || t > (kind === 'dance' ? 4 : 2.5)) {
      this.actKind = null;
      this.pops = [];
      return;
    }
    const body = this.anim !== 'sit'; // seated: arms and a little tilt only
    const [l0, l1] = this.legs;
    const [a0, a1] = this.arms;
    const fade = Math.min(1, t * 6, ((kind === 'dance' ? 4 : 2.5) - t) * 4); // ease in and out
    const set = (o: THREE.Object3D, x: number, z: number) => {
      o.rotation.x += (x - o.rotation.x) * fade;
      o.rotation.z += (z - o.rotation.z) * fade;
    };
    switch (kind) {
      case 'wave':
        set(a1, 0, 2.6 + Math.sin(t * 12) * 0.35);
        break;
      case 'cheer':
        set(a0, 0, -2.7);
        set(a1, 0, 2.7);
        if (body) this.rig.position.y = Math.abs(Math.sin(t * 7)) * 0.25 * fade;
        break;
      case 'dance': {
        const s = Math.sin(t * 6);
        set(a0, 0, -1.2 - s * 0.8);
        set(a1, 0, 1.2 - s * 0.8);
        this.rig.rotation.z = s * 0.2 * fade;
        if (body) {
          this.rig.rotation.y = this.facing + Math.sin(t * 3) * 0.6 * fade;
          this.rig.position.y = Math.abs(s) * 0.1 * fade;
          l0.rotation.x = s * 0.5 * fade;
          l1.rotation.x = -s * 0.5 * fade;
        }
        break;
      }
      case 'laugh':
        set(a0, -0.6, 0.5);
        set(a1, -0.6, -0.5);
        this.rig.rotation.x = (-0.25 + Math.sin(t * 30) * 0.04) * fade;
        this.rig.position.x = Math.sin(t * 40) * 0.02 * fade;
        break;
      case 'love': {
        const q = Math.sin(t * 9) * 0.08 * fade;
        this.body.scale.set(1 + q, 1 - q, 1 + q);
        set(a0, -0.4, 0.9);
        set(a1, -0.4, -0.9);
        break;
      }
      case 'think':
        set(a1, -2.0, 0.6);
        this.rig.rotation.z = 0.12 * fade;
        break;
      case 'sleepy':
        this.rig.rotation.x = (0.18 + Math.sin(t * 2) * 0.05) * fade;
        this.eyes.scale.y = 0.3;
        set(a0, 0.1, 0);
        set(a1, 0.1, 0);
        break;
      case 'clap': {
        const c = (1 + Math.sin(t * 14)) / 2;
        set(a0, -1.3, 0.15 + c * 0.45);
        set(a1, -1.3, -0.15 - c * 0.45);
        break;
      }
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    disposeTree(this.root);
  }
}
