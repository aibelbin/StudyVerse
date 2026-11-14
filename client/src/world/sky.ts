import * as THREE from 'three';
import type { SceneDef } from '../../../shared/scenes/types';
import { skyDir, STAR_COUNT, STAR_SEED, starField, type Constellation } from '../../../shared/stars';
import type { ToyState } from '../../../shared/toys';
import { serverNow } from '../game/clock';
import { glow } from './materials';
import { SUNBEAM } from './decor';
import { PALETTE as P } from './palette';
import { rng } from './rng';
import type { BuiltScene } from './sceneBuilder';

export interface SkyState {
  top: string;
  /** The band just above the horizon (sunrise peach, sunset gold...). */
  horizon: string;
  bottom: string;
  sunColor: string;
  sunIntensity: number;
  /** Direction to the sun (or moon), scaled as a light offset. */
  sunDir: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fog: string;
  /** 0 by day, 1 at night. */
  night: number;
}

type Key = Omit<SkyState, 'sunDir'>;

// Storybook light: a modest sky fill so the toon bands show, a warm sun, and fog in the horizon's colour.
const NIGHT: Key = { top: '#16204a', horizon: '#2c3270', bottom: '#3a3a6a', sunColor: '#a8b8ff', sunIntensity: 0.75, hemiSky: '#8090d0', hemiGround: '#2e3a4a', hemiIntensity: 0.5, fog: '#2c3264', night: 1 };
const DAWN: Key = { top: '#8fb0e8', horizon: '#ffc8b0', bottom: '#ffe2c8', sunColor: '#ffc29a', sunIntensity: 1.45, hemiSky: '#ffe0d4', hemiGround: '#7a9a6a', hemiIntensity: 0.8, fog: '#f8d4c4', night: 0.25 };
const DAY: Key = { top: '#7cc4f2', horizon: '#cfeaf8', bottom: '#fdf0dc', sunColor: '#fff2dc', sunIntensity: 1.75, hemiSky: '#fff6e8', hemiGround: '#86b070', hemiIntensity: 0.9, fog: '#f6ecdc', night: 0 };
const GOLDEN: Key = { top: '#7fb4e6', horizon: '#ffd08a', bottom: '#ffe6b8', sunColor: '#ffb468', sunIntensity: 2.0, hemiSky: '#ffe4c4', hemiGround: '#8aa868', hemiIntensity: 0.8, fog: '#fad8ac', night: 0.05 };
const DUSK: Key = { top: '#3e3e86', horizon: '#f59a9a', bottom: '#ffc7a0', sunColor: '#ff9a7a', sunIntensity: 1.1, hemiSky: '#c8a8e0', hemiGround: '#5a6a6a', hemiIntensity: 0.62, fog: '#c898ac', night: 0.6 };

const KEYS: [number, Key][] = [
  [0, NIGHT], [5, NIGHT], [6, DAWN], [8, DAY], [17, DAY], [18, GOLDEN], [19.5, DUSK], [21, NIGHT], [24, NIGHT],
];

export function lerpHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (pa >> shift) & 255;
    const cb = (pb >> shift) & 255;
    out |= Math.round(ca + (cb - ca) * k) << shift;
  }
  return `#${out.toString(16).padStart(6, '0')}`;
}

/** The sun arcs east to west from 6:00 to 18:00; outside that a fixed moon stands in. */
function sunDir(h: number): [number, number, number] {
  if (h < 5.5 || h > 19.5) return [-10, 20, 8];
  const t = Math.min(1, Math.max(0, (h - 6) / 12));
  const a = t * Math.PI;
  return [Math.cos(a) * 18, 6 + Math.sin(a) * 18, 10];
}

/** Sky, light and fog for a time of day in hours (wraps around midnight). */
export function skyAt(hours: number): SkyState {
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const [h0, a] = KEYS[i];
  const [h1, b] = KEYS[i + 1];
  const k = h1 === h0 ? 0 : (h - h0) / (h1 - h0);
  const n = (x: number, y: number) => x + (y - x) * k;
  return {
    top: lerpHex(a.top, b.top, k),
    horizon: lerpHex(a.horizon, b.horizon, k),
    bottom: lerpHex(a.bottom, b.bottom, k),
    sunColor: lerpHex(a.sunColor, b.sunColor, k),
    sunIntensity: n(a.sunIntensity, b.sunIntensity),
    sunDir: sunDir(h),
    hemiSky: lerpHex(a.hemiSky, b.hemiSky, k),
    hemiGround: lerpHex(a.hemiGround, b.hemiGround, k),
    hemiIntensity: n(a.hemiIntensity, b.hemiIntensity),
    fog: lerpHex(a.fog, b.fog, k),
    night: n(a.night, b.night),
  };
}

/** The sky greyed towards overcast by clouds g (0..1): cloudy sun × 0.6, a touch darker in rain. Pure. */
export function overcast(s: SkyState, g: number, rain: number): SkyState {
  if (g <= 0) return s;
  const grey = lerpHex('#aab2bc', '#2e323c', s.night);
  const k = g * 0.65;
  const to = (c: string, f = 1) => lerpHex(c, grey, k * f);
  return {
    ...s,
    top: to(s.top), horizon: to(s.horizon), bottom: to(s.bottom), fog: to(s.fog), hemiSky: to(s.hemiSky, 0.6),
    sunColor: lerpHex(s.sunColor, '#e8ecf0', k),
    sunIntensity: s.sunIntensity * (1 - 0.4 * g - 0.15 * rain),
    hemiIntensity: s.hemiIntensity * (1 - 0.1 * g),
  };
}

/** Hours on the local clock, or a valid `?time=HH[:MM]` override. */
export function clockHours(date: Date, override: string | null): number {
  const m = override?.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (m) {
    const h = Number(m[1]) + Number(m[2] ?? 0) / 60;
    if (h < 24) return h;
  }
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

const LIGHTS = 4;

export const SHOOT_SLOT = 30_000;
const SHOOT_MS = 600;

/** The shooting star of a 30 s slot (every other slot, at a seeded moment, so one every 30–90 s, ~60 on average) in unit-square sky coords; the same for everyone. */
export function shootingStar(slot: number): { at: number; from: [number, number]; to: [number, number] } | null {
  if (slot % 2) return null;
  const r = rng(slot);
  const x = 0.15 + r() * 0.7;
  const y = r() * 0.4;
  const dx = (r() < 0.5 ? -1 : 1) * (0.15 + r() * 0.15);
  return { at: slot * SHOOT_SLOT + r() * (SHOOT_SLOT - SHOOT_MS), from: [x, y], to: [x + dx, y + 0.15 + r() * 0.15] };
}

const DOME = (x: number, y: number, r: number) => skyDir(x, y).map((v) => v * r) as [number, number, number];

/** A soft round glow (radial gradient) for the sun and the moon. */
function glowSprite(color: string, size: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(0.25, color);
  grad.addColorStop(0.35, `${color}88`);
  grad.addColorStop(1, `${color}00`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  return s;
}

/** Applies the time of day to an outdoor scene: sky, sun, stars, moon, glowing lamps and a small light pool. */
export class SkyRig {
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private skyKey = '';
  private stars: THREE.Points;
  private stars2: THREE.Points;
  private moon: THREE.Mesh;
  private moonGlow: THREE.Sprite;
  private sunGlow: THREE.Sprite;
  /** The shared star field, everyone's constellations and the shooting star, on the dome facing north. */
  private dome = new THREE.Group();
  private field = starField(STAR_SEED, STAR_COUNT).map((s) => DOME(s.x, s.y, 145));
  private fieldStars: THREE.Points;
  private lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#cfdcff', fog: false, transparent: true, depthWrite: false }));
  private shoot = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3)),
    new THREE.LineBasicMaterial({ color: '#ffffff', fog: false, transparent: true, depthWrite: false }),
  );
  private lights: THREE.PointLight[] = [];
  private spots: { x: number; z: number; y: number; fire?: string }[];
  private lastPool = -1e9;
  night = 0;

  constructor(readonly built: BuiltScene, def: SceneDef) {
    this.canvas.width = 2;
    this.canvas.height = 256;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    built.scene.background = this.tex;

    const r = rng(77);
    const pos: number[] = [];
    for (let i = 0; i < 600; i++) {
      const a = r() * Math.PI * 2;
      const y = 0.15 + r() * 0.85;
      const s = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * s * 150, y * 150, Math.sin(a) * s * 150);
    }
    // Two star layers that fade in and out of step, so the sky twinkles.
    const half = pos.length / 2 - ((pos.length / 2) % 3);
    const layer = (p: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      return new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
    };
    this.stars = layer(pos.slice(0, half));
    this.stars2 = layer(pos.slice(half));
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff6d8', fog: false, transparent: true }));
    this.moonGlow = glowSprite('#fff2c8', 44);
    this.sunGlow = glowSprite('#fff4d0', 70);
    this.fieldStars = layer(this.field.flat());
    (this.fieldStars.material as THREE.PointsMaterial).size = 3;
    this.shoot.frustumCulled = false;
    this.dome.add(this.fieldStars, this.lines, this.shoot);
    built.scene.add(this.stars, this.stars2, this.moon, this.moonGlow, this.sunGlow, this.dome);

    this.spots = def.decor.filter((d) => d.kind === 'lampPost').map((d) => ({ x: d.x, z: d.z, y: 2.4 }));
    for (const t of def.toys) if (t.kind === 'campfire') this.spots.push({ x: t.x, z: t.z, y: 0.8, fire: t.id });
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight(P.lampGlow, 0, 9, 2); // always 'visible': toggling would recompile every shader
      this.lights.push(l);
      built.scene.add(l);
    }
  }

  setConstellations(cs: Constellation[]): void {
    this.lines.geometry.dispose();
    this.lines.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(cs.flatMap((c) => c.edges.flatMap(([a, b]) => [...this.field[a], ...this.field[b]])), 3));
  }

  /** cloud and rain (0..1) come from the weather fade. */
  update(hours: number, focus: { x: number; z: number }, now: number, toys: Record<string, ToyState>, cloud = 0, rain = 0): void {
    const s = overcast(skyAt(hours), cloud, rain);
    this.night = s.night;
    const b = this.built;
    const key = `${s.top}${s.horizon}${s.bottom}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      const c = this.canvas.getContext('2d')!;
      const grad = c.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, s.top);
      grad.addColorStop(0.62, s.horizon);
      grad.addColorStop(1, s.bottom);
      c.fillStyle = grad;
      c.fillRect(0, 0, 2, 256);
      this.tex.needsUpdate = true;
    }
    if (b.scene.fog instanceof THREE.Fog) b.scene.fog.color.set(s.fog);
    b.hemi.color.set(s.hemiSky);
    b.hemi.groundColor.set(s.hemiGround);
    b.hemi.intensity = s.hemiIntensity;
    b.sun.color.set(s.sunColor);
    b.sun.intensity = s.sunIntensity;
    b.sunOffset.set(...s.sunDir);

    const starA = Math.max(0, s.night * 1.2 - 0.2) * (1 - cloud);
    const tw = now / 900;
    for (const [st, ph] of [[this.stars, 0], [this.stars2, Math.PI]] as const) {
      st.position.set(focus.x, 0, focus.z);
      (st.material as THREE.PointsMaterial).opacity = starA * (0.7 + 0.3 * Math.sin(tw + ph));
      st.visible = s.night > 0.2;
    }
    this.dome.position.set(focus.x, 0, focus.z);
    this.dome.visible = s.night > 0.2;
    (this.fieldStars.material as THREE.PointsMaterial).opacity = starA;
    (this.lines.material as THREE.LineBasicMaterial).opacity = starA * 0.55;
    const t = serverNow();
    const shot = shootingStar(Math.floor(t / SHOOT_SLOT));
    const k = shot ? (t - shot.at) / SHOOT_MS : -1;
    this.shoot.visible = !!shot && s.night > 0.6 && k >= 0 && k < 1;
    if (shot && this.shoot.visible) {
      const at = (q: number) => DOME(shot.from[0] + (shot.to[0] - shot.from[0]) * q, shot.from[1] + (shot.to[1] - shot.from[1]) * q, 140);
      const p = this.shoot.geometry.getAttribute('position') as THREE.BufferAttribute;
      p.set([...at(Math.max(0, k - 0.35)), ...at(k)]);
      p.needsUpdate = true;
      (this.shoot.material as THREE.LineBasicMaterial).opacity = 1 - k * 0.7;
    }
    const moonA = Math.min(1, Math.max(0, (s.night - 0.3) * 2)) * (1 - cloud);
    this.moon.visible = this.moonGlow.visible = s.night > 0.3;
    this.moon.position.set(focus.x - 60, 85, focus.z - 110);
    this.moonGlow.position.copy(this.moon.position);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = moonA;
    this.moonGlow.material.opacity = moonA * 0.55;
    // A soft sun disc by day, far off in the sun's direction.
    const [sx, sy, sz] = s.sunDir;
    this.sunGlow.visible = s.night < 0.6;
    this.sunGlow.position.set(focus.x + sx * 6, sy * 6, focus.z + sz * 6 - 60);
    this.sunGlow.material.opacity = (1 - s.night) * 0.9 * (1 - cloud);

    glow(P.lampGlow, 1.6, 'street').emissiveIntensity = 0.3 + s.night * 1.6;
    glow(P.windowGlow, 0.5, 'window').emissiveIntensity = 0.4 + s.night * 1.4;

    if (now - this.lastPool > 500) {
      this.lastPool = now;
      const lit = this.spots.filter((p) => !p.fire || (toys[p.fire]?.kind === 'campfire' && (toys[p.fire] as { lit: boolean }).lit));
      lit.sort((a, c) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(c.x - focus.x, c.z - focus.z));
      this.lights.forEach((l, i) => {
        const p = lit[i];
        l.userData.fire = !!p?.fire;
        l.userData.on = !!p && (p.fire !== undefined || s.night > 0.05);
        if (p) l.position.set(p.x, p.y, p.z);
        l.color.set(p?.fire ? '#ff9a4a' : P.lampGlow);
      });
    }
    for (const l of this.lights) {
      if (!l.userData.on) {
        l.intensity = 0;
        continue;
      }
      l.intensity = l.userData.fire ? 7 + Math.sin(now / 70) * 1.2 + Math.sin(now / 33) * 0.6 : 6 * s.night;
    }
  }
}

/** Indoor scenes only tint their windows towards the night sky. */
export function tintIndoorWindows(night: number): void {
  SUNBEAM.opacity = 0.16 * (1 - night);
  glow(P.sky, 0.35).color.set(lerpHex(P.sky, '#3a4a7a', night));
  glow(P.sky, 0.35).emissive.set(lerpHex(P.sky, '#3a4a7a', night));
}
