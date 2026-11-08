import * as THREE from 'three';
import { SCENES } from '../../../shared/scenes';
import type { Door, SceneDef } from '../../../shared/scenes/types';
import { makeDecor } from './decor';
import { buildInstanced, INSTANCED_KINDS, type Sway } from './instanced';
import { mat, mesh } from './materials';
import { PALETTE as P } from './palette';
import { rng } from './rng';
import { textSprite } from './text';

function gradient([top, bottom]: [string, string]): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function floorTexture(def: SceneDef): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = rng(def.id.length * 97);
  const { floor, floorAccent, indoor } = def.theme;
  g.fillStyle = floor;
  g.fillRect(0, 0, 256, 256);
  if (indoor) {
    for (let y = 0; y < 256; y += 32) {
      g.globalAlpha = 0.55;
      g.fillStyle = r() < 0.5 ? floorAccent : floor;
      g.fillRect(0, y, 256, 31);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(0,0,0,.08)';
      g.fillRect(0, y + 31, 256, 1);
      g.fillRect(Math.floor(r() * 256), y, 1, 32);
    }
  } else {
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = r() < 0.5 ? floorAccent : 'rgba(255,255,255,.18)';
      g.fillRect(r() * 256, r() * 256, 2, 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function floor(def: SceneDef): THREE.Mesh {
  const indoor = def.theme.indoor;
  const k = indoor ? 1 : 3;
  const w = def.size.w * k;
  const d = def.size.d * k;
  const tex = floorTexture(def);
  const tile = indoor ? 2 : 4;
  tex.repeat.set(w / tile, d / tile);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

/** Back and side walls at full height; the front (camera side) is a low sill with gaps for doors. */
function walls(def: SceneDef): THREE.Group {
  const { w, d } = def.size;
  const wm = mat(def.theme.wall ?? '#f0dcc4');
  const tm = mat(def.theme.trim ?? P.woodDark);
  const g = new THREE.Group();
  g.add(
    mesh(new THREE.BoxGeometry(w + 0.4, 3, 0.2), wm, 0, 1.5, -d / 2 - 0.1),
    mesh(new THREE.BoxGeometry(0.2, 3, d + 0.2), wm, -w / 2 - 0.1, 1.5, 0),
    mesh(new THREE.BoxGeometry(0.2, 3, d + 0.2), wm, w / 2 + 0.1, 1.5, 0),
    mesh(new THREE.BoxGeometry(w, 0.18, 0.04), tm, 0, 0.09, -d / 2 + 0.02),
  );
  const gaps = def.doors.map((dr) => [dr.box.x - dr.box.w / 2, dr.box.x + dr.box.w / 2]).sort((a, b) => a[0] - b[0]);
  let x0 = -w / 2 - 0.2;
  for (const [a, b] of [...gaps, [w / 2 + 0.2, w / 2 + 0.2]]) {
    if (a > x0) g.add(mesh(new THREE.BoxGeometry(a - x0, 0.35, 0.2), tm, (a + x0) / 2, 0.175, d / 2 + 0.1));
    x0 = Math.max(x0, b);
  }
  return g;
}

function doorMat(door: Door): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(door.box.w, 0.02, door.box.d), mat('#d98f6a', 1), door.box.x, 0.012, door.box.z, false));
  const label = textSprite(`↓ ${SCENES[door.toScene]?.name ?? 'Out'}`, 0.26, { bg: '#ffffffcc', font: 36, pad: 12 });
  label.position.set(door.box.x, 0.9, door.box.z);
  g.add(label);
  return g;
}

export interface BuiltScene {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Sun position relative to what it shines on; outdoor shadows follow the player. */
  sunOffset: THREE.Vector3;
  sway: Sway;
  outdoor: boolean;
}

const SHADOW_EXTENT = 22;

export function buildScene(def: SceneDef): BuiltScene {
  const th = def.theme;
  const scene = new THREE.Scene();
  scene.background = Array.isArray(th.background) ? gradient(th.background) : new THREE.Color(th.background);
  if (th.fog) scene.fog = new THREE.Fog(th.fog.color, th.fog.near, th.fog.far);

  const hemi = new THREE.HemisphereLight(th.hemi.sky, th.hemi.ground, th.hemi.intensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(th.sun.color, th.sun.intensity);
  const sunOffset = new THREE.Vector3(th.sun.x, th.sun.y, th.sun.z);
  sun.position.copy(sunOffset);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const ext = th.indoor ? Math.max(def.size.w, def.size.d) / 2 + 3 : SHADOW_EXTENT;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 80 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  scene.add(floor(def));
  if (th.indoor) {
    scene.add(walls(def));
    for (const door of def.doors) scene.add(doorMat(door));
  }
  const sway: Sway = { value: 0 };
  scene.add(buildInstanced(def.decor, sway));
  for (const d of def.decor) if (!INSTANCED_KINDS.has(d.kind)) scene.add(makeDecor(d));

  if (th.indoor) {
    const lamps = def.decor.filter((d) => d.kind === 'deskLamp' || d.kind === 'lampPost').slice(0, 8);
    for (const d of lamps) {
      const post = d.kind === 'lampPost';
      const light = new THREE.PointLight(P.lampGlow, post ? 6 : 1.6, post ? 7 : 3, 2);
      light.position.set(d.x, post ? 2.4 : 1.05, d.z);
      scene.add(light);
    }
  }
  return { scene, sun, hemi, sunOffset, sway, outdoor: !th.indoor };
}

/** Keeps the outdoor shadow area centred on the player. */
export function followSun(b: BuiltScene, x: number, z: number): void {
  if (!b.outdoor) return;
  b.sun.target.position.set(x, 0, z);
  b.sun.position.set(x + b.sunOffset.x, b.sunOffset.y, z + b.sunOffset.z);
}
