import * as THREE from 'three';
import { rng } from '../../../shared/rng';
import type { SceneDef } from '../../../shared/scenes/types';
import { toonMat } from './materials';

/** World-space shapes for the painted ground, in canvas pixels. */
export interface PaintPlan {
  w: number;
  h: number;
  base: string;
  patches: { x: number; y: number; r: number; color: string; alpha: number }[];
  specks: { x: number; y: number; color: string }[];
  shades: { x: number; y: number; r: number; alpha: number }[];
}

const GREENS = ['#a8d98f', '#8fc67a', '#b8e2a0', '#86bf72'];
const SPECKS = ['#ffffff', '#ffd2e0', '#fff1a8', '#e8d8ff'];
const SHADE: Partial<Record<string, number>> = { tree: 1.4, pine: 1.1, cherry: 1.4, bush: 0.8, rock: 0.5, building: 0, mound: 0.9 };

/**
 * Where to paint: soft patches of greens, tiny flower specks off the paths, and darker grass
 * under trees, bushes and buildings. Pure, so it can be tested; the same seed paints the same ground.
 */
export function paintPlan(def: SceneDef, seed: number, px = 2048): PaintPlan {
  const w = px;
  const h = Math.round(px * (def.size.d / def.size.w));
  const r = rng(seed);
  const sx = w / def.size.w;
  const toU = (x: number) => (x / def.size.w + 0.5) * w;
  const toV = (z: number) => (z / def.size.d + 0.5) * h;
  const paths = def.decor.filter((d) => d.kind === 'path' || d.kind === 'parking');
  const onPath = (x: number, z: number) => paths.some((p) => Math.abs(x - p.x) <= (p.w ?? 0) / 2 && Math.abs(z - p.z) <= (p.d ?? 0) / 2);
  const patches = Array.from({ length: 260 }, () => ({
    x: r() * w, y: r() * h, r: (3 + r() * 9) * sx, color: GREENS[Math.floor(r() * GREENS.length)], alpha: 0.25 + r() * 0.25,
  }));
  const specks: PaintPlan['specks'] = [];
  for (let i = 0; i < 2500; i++) {
    const x = (r() - 0.5) * def.size.w;
    const z = (r() - 0.5) * def.size.d;
    if (!onPath(x, z)) specks.push({ x: toU(x), y: toV(z), color: SPECKS[Math.floor(r() * SPECKS.length)] });
  }
  const shades: PaintPlan['shades'] = [];
  for (const d of def.decor) {
    const k = SHADE[d.kind];
    if (k === undefined) continue;
    const size = d.kind === 'building' ? Math.max(d.w ?? 6, d.d ?? 5) * 0.7 : k * (d.h ?? 1) * (d.w && d.kind === 'mound' ? d.w / 2 : 1);
    shades.push({ x: toU(d.x), y: toV(d.z), r: size * sx, alpha: d.kind === 'building' ? 0.3 : 0.22 });
  }
  return { w, h, base: def.theme.floor, patches, specks, shades };
}

/** Paints a plan onto a canvas. */
export function paintGround(plan: PaintPlan): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = plan.w;
  c.height = plan.h;
  const g = c.getContext('2d')!;
  g.fillStyle = plan.base;
  g.fillRect(0, 0, plan.w, plan.h);
  const blob = (x: number, y: number, rad: number, rgba: (a: number) => string, alpha: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, rgba(alpha));
    grad.addColorStop(0.6, rgba(alpha * 0.6));
    grad.addColorStop(1, rgba(0));
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  for (const p of plan.patches) {
    const [cr, cg, cb] = hex(p.color);
    blob(p.x, p.y, p.r, (a) => `rgba(${cr},${cg},${cb},${a})`, p.alpha);
  }
  for (const s of plan.shades) blob(s.x, s.y, s.r, (a) => `rgba(52,96,52,${a})`, s.alpha);
  for (const s of plan.specks) {
    g.fillStyle = s.color;
    g.fillRect(s.x, s.y, 2, 2);
  }
  return c;
}

let cloudTex: THREE.CanvasTexture | null = null;

/** A tiling field of soft cloud shapes (white = shadow). */
function cloudTexture(): THREE.CanvasTexture {
  if (cloudTex) return cloudTex;
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, n, n);
  const r = rng(4242);
  for (let i = 0; i < 26; i++) {
    const x = r() * n;
    const y = r() * n;
    const rad = 14 + r() * 30;
    for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      grad.addColorStop(0, 'rgba(255,255,255,0.8)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  cloudTex = new THREE.CanvasTexture(c);
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  return cloudTex;
}

/** Shared by every ground material: seconds (for the drift), strength (0 at night or on Lite) and rain wetness 0..1 (darker ground, lake ripples). */
export const CLOUDS = { t: { value: 0 }, k: { value: 0 }, wet: { value: 0 } };

/** Adds drifting cloud shadows to a ground material (in its own shader, so it costs almost nothing). */
export function withCloudShadows(m: THREE.Material): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.cloudMap = { value: cloudTexture() };
    sh.uniforms.cloudT = CLOUDS.t;
    sh.uniforms.cloudK = CLOUDS.k;
    sh.uniforms.cloudWet = CLOUDS.wet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCloudXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D cloudMap;\nuniform float cloudT;\nuniform float cloudK;\nuniform float cloudWet;\nvarying vec2 vCloudXZ;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ float cl = texture2D(cloudMap, vCloudXZ / 70.0 - vec2(cloudT / 70.0, cloudT / 300.0)).r; diffuseColor.rgb *= (1.0 - cloudK * cl) * (1.0 - 0.22 * cloudWet); }');
  };
}

const waterCache = new Map<string, THREE.MeshToonMaterial>();

/**
 * Storybook water: the base colour with soft light ripples that drift over time, worked out in the
 * shader from world position (shares the cloud clock, so there's nothing to update per object).
 */
export function waterMat(color: string): THREE.MeshToonMaterial {
  const hit = waterCache.get(color);
  if (hit) return hit;
  const m = toonMat({ color });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.waterT = CLOUDS.t;
    sh.uniforms.waterRain = CLOUDS.wet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float waterT;\nuniform float waterRain;\nvarying vec2 vWaterXZ;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 p = vWaterXZ;
  float a = sin(p.x * 1.1 + waterT * 0.8) * sin(p.y * 0.9 - waterT * 0.6);
  float b = sin((p.x + p.y) * 0.55 + waterT * 0.45);
  float rip = a + 0.5 * b;
  diffuseColor.rgb += smoothstep(0.85, 1.35, rip) * 0.16;
  diffuseColor.rgb -= smoothstep(0.9, 1.4, -rip) * 0.05;
  // rain: one expanding ring per 1.25 m cell, each on its own beat
  vec2 cell = floor(p * 0.8);
  float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float ph = fract(waterT * 0.9 + h);
  float d = length(fract(p * 0.8) - 0.5 - (vec2(fract(h * 7.0), fract(h * 13.0)) - 0.5) * 0.4);
  diffuseColor.rgb += smoothstep(0.05, 0.0, abs(d - ph * 0.4)) * (1.0 - ph) * 0.3 * waterRain;
}`);
  };
  m.customProgramCacheKey = () => 'water';
  waterCache.set(color, m);
  return m;
}
