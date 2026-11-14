import * as THREE from 'three';
import type { SceneDef } from '../../../shared/scenes/types';
import type { WeatherKind } from '../../../shared/weather';
import { disposeTree } from './materials';
import type { Quality } from './quality';

export const FADE_S = 5;

/** How much of each look is showing, 0..1. */
export interface WeatherMix {
  cloud: number;
  rain: number;
  rainbow: number;
}

/** Moves every part of the mix towards the weather's look, a full change taking FADE_S seconds. Pure. */
export function fadeMix(m: WeatherMix, kind: WeatherKind | null, dt: number): WeatherMix {
  const step = dt / FADE_S;
  const to = (v: number, t: number) => (v < t ? Math.min(t, v + step) : Math.max(t, v - step));
  return { cloud: to(m.cloud, kind === 'cloudy' || kind === 'rain' ? 1 : 0), rain: to(m.rain, kind === 'rain' ? 1 : 0), rainbow: to(m.rainbow, kind === 'rainbow' ? 1 : 0) };
}

const DROPS: Record<Quality, number> = { high: 600, lite: 250 };

/** v moved by whole multiples of size into [c - size/2, c + size/2): drops stay put in the world and only wrap round as you walk. Pure. */
export const wrapAround = (v: number, c: number, size: number): number => c - size / 2 + ((((v - c + size / 2) % size) + size) % size);
const BOX = { w: 26, h: 12, d: 22 };
const BANDS = ['#ff6a6a', '#ffa45a', '#ffe066', '#7ad27a', '#6ab4ff', '#7a7ae8', '#b07ad8'];

/** Rain drops around the player and a rainbow over the lake, for one outdoor scene. */
export class WeatherRig {
  private drops: THREE.Points;
  private speed: Float32Array;
  private rainbow: THREE.Mesh | null = null;

  constructor(private scene: THREE.Scene, def: SceneDef) {
    const n = DROPS.high;
    const pos = new Float32Array(n * 3);
    this.speed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set([(Math.random() - 0.5) * BOX.w, Math.random() * BOX.h, (Math.random() - 0.5) * BOX.d], i * 3);
      this.speed[i] = 9 + Math.random() * 4;
    }
    this.drops = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ color: '#cfe2f4', size: 0.07, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    scene.add(this.drops);

    const w = def.water?.outline;
    if (w) {
      const cx = w.reduce((s, p) => s + p[0], 0) / w.length;
      const cz = w.reduce((s, p) => s + p[1], 0) / w.length;
      const geo = new THREE.RingGeometry(11, 13, 48, BANDS.length, 0, Math.PI);
      const p = geo.getAttribute('position');
      const col: number[] = [];
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const k = (Math.hypot(p.getX(i), p.getY(i)) - 11) / 2; // 0 inside (violet) .. 1 outside (red)
        c.set(BANDS[Math.min(BANDS.length - 1, Math.floor((1 - k) * BANDS.length))]);
        col.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      this.rainbow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      this.rainbow.position.set(cx, 0, cz);
      this.rainbow.rotation.x = -0.87; // leans back to face the fixed camera (which looks ~50° down)
      this.rainbow.visible = false;
      scene.add(this.rainbow);
    }
  }

  update(m: WeatherMix, focus: { x: number; z: number }, dt: number, quality: Quality): void {
    this.drops.visible = m.rain > 0.01;
    if (this.drops.visible) {
      const n = DROPS[quality];
      this.drops.geometry.setDrawRange(0, n);
      (this.drops.material as THREE.PointsMaterial).opacity = 0.75 * m.rain;
      const a = this.drops.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) {
        const y = a.getY(i) - this.speed[i] * dt;
        a.setXYZ(i, wrapAround(a.getX(i), focus.x, BOX.w), y < 0 ? y + BOX.h : y, wrapAround(a.getZ(i), focus.z - 3, BOX.d));
      }
      a.needsUpdate = true;
    }
    if (this.rainbow) {
      this.rainbow.visible = m.rainbow > 0.01;
      (this.rainbow.material as THREE.MeshBasicMaterial).opacity = 0.45 * m.rainbow;
    }
  }

  dispose(): void {
    for (const o of [this.drops, this.rainbow]) {
      if (!o) continue;
      this.scene.remove(o);
      disposeTree(o);
    }
  }
}
