import * as THREE from 'three';
import type { SceneDef } from '../../../shared/scenes/types';
import type { ToyState } from '../../../shared/toys';
import { glow } from './materials';
import { PALETTE as P } from './palette';
import { rng } from './rng';
import type { BuiltScene } from './sceneBuilder';

export interface SkyState {
  top: string;
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

const NIGHT: Key = { top: '#1b2445', bottom: '#3a3a6a', sunColor: '#9fb4ff', sunIntensity: 0.6, hemiSky: '#7f8fc8', hemiGround: '#2e3a4a', hemiIntensity: 0.55, fog: '#2a3050', night: 1 };
const DAWN: Key = { top: '#9fb8e8', bottom: '#ffd2c2', sunColor: '#ffc9a0', sunIntensity: 1.4, hemiSky: '#ffe0d0', hemiGround: '#7a9a6a', hemiIntensity: 1.2, fog: '#f6d6cc', night: 0.25 };
const DAY: Key = { top: '#9fd0f2', bottom: '#fde9d6', sunColor: '#fff0d6', sunIntensity: 2.4, hemiSky: '#fff3e0', hemiGround: '#7fae6a', hemiIntensity: 1.7, fog: '#fbe7d4', night: 0 };
const GOLDEN: Key = { top: '#8fc0ea', bottom: '#ffd29a', sunColor: '#ffb870', sunIntensity: 2.0, hemiSky: '#ffe4c0', hemiGround: '#86a868', hemiIntensity: 1.45, fog: '#f9d9b0', night: 0.05 };
const DUSK: Key = { top: '#4a4a8a', bottom: '#f2a0a0', sunColor: '#ff9a7a', sunIntensity: 0.9, hemiSky: '#c8a8d8', hemiGround: '#5a6a6a', hemiIntensity: 0.95, fog: '#c89aa8', night: 0.6 };

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

/** Applies the time of day to an outdoor scene: sky, sun, stars, moon, glowing lamps and a small light pool. */
export class SkyRig {
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private skyKey = '';
  private stars: THREE.Points;
  private moon: THREE.Mesh;
  private lights: THREE.PointLight[] = [];
  private spots: { x: number; z: number; y: number; fire?: string }[];
  private lastPool = -1e9;
  night = 0;

  constructor(private built: BuiltScene, def: SceneDef) {
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
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 14), new THREE.MeshBasicMaterial({ color: '#fff6d8', fog: false, transparent: true }));
    built.scene.add(this.stars, this.moon);

    this.spots = def.decor.filter((d) => d.kind === 'lampPost').map((d) => ({ x: d.x, z: d.z, y: 2.4 }));
    for (const t of def.toys) if (t.kind === 'campfire') this.spots.push({ x: t.x, z: t.z, y: 0.8, fire: t.id });
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight(P.lampGlow, 0, 9, 2);
      l.visible = false;
      this.lights.push(l);
      built.scene.add(l);
    }
  }

  update(hours: number, focus: { x: number; z: number }, now: number, toys: Record<string, ToyState>): void {
    const s = skyAt(hours);
    this.night = s.night;
    const b = this.built;
    const key = `${s.top}${s.bottom}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      const c = this.canvas.getContext('2d')!;
      const grad = c.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, s.top);
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

    this.stars.position.set(focus.x, 0, focus.z);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, s.night * 1.2 - 0.2);
    this.stars.visible = s.night > 0.2;
    this.moon.visible = s.night > 0.3;
    this.moon.position.set(focus.x - 60, 85, focus.z - 110);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (s.night - 0.3) * 2);

    glow(P.lampGlow, 1.6, 'street').emissiveIntensity = 0.3 + s.night * 1.6;
    glow(P.windowGlow, 0.5, 'window').emissiveIntensity = 0.4 + s.night * 1.4;

    if (now - this.lastPool > 500) {
      this.lastPool = now;
      const lit = this.spots.filter((p) => !p.fire || (toys[p.fire]?.kind === 'campfire' && (toys[p.fire] as { lit: boolean }).lit));
      lit.sort((a, c) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(c.x - focus.x, c.z - focus.z));
      this.lights.forEach((l, i) => {
        const p = lit[i];
        l.userData.fire = !!p?.fire;
        l.visible = !!p && (p.fire !== undefined || s.night > 0.05);
        if (p) l.position.set(p.x, p.y, p.z);
        l.color.set(p?.fire ? '#ff9a4a' : P.lampGlow);
      });
    }
    for (const l of this.lights) {
      if (!l.visible) continue;
      l.intensity = l.userData.fire ? 7 + Math.sin(now / 70) * 1.2 + Math.sin(now / 33) * 0.6 : 6 * s.night;
    }
  }
}

/** Indoor scenes only tint their windows towards the night sky. */
export function tintIndoorWindows(night: number): void {
  glow(P.sky, 0.35).color.set(lerpHex(P.sky, '#3a4a7a', night));
  glow(P.sky, 0.35).emissive.set(lerpHex(P.sky, '#3a4a7a', night));
}
