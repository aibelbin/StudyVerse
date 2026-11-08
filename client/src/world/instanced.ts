import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Decor, DecorKind } from '../../../shared/scenes/types';
import { decorTemplate } from './decor';

/** Decor drawn as a handful of InstancedMeshes instead of one mesh tree per object. */
export const INSTANCED_KINDS = new Set<DecorKind>(['tree', 'pine', 'bush', 'flowers', 'grass', 'rock', 'lilyPad']);
const SWAY_KINDS = new Set<DecorKind>(['tree', 'pine', 'bush', 'flowers', 'grass']);
const VARIANTS = 4;

export interface Sway {
  value: number;
}

const swayCache = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();

/** A copy of base whose vertices lean in the wind, more the higher they are. */
export function swayMaterial(base: THREE.MeshStandardMaterial, sway: Sway): THREE.MeshStandardMaterial {
  let m = swayCache.get(base);
  if (m) return m;
  m = base.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSway = sway;
    shader.vertexShader = `uniform float uSway;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 ip = vec2(0.0);
      #endif
      float k = max(position.y - 0.4, 0.0) * 0.035;
      transformed.x += sin(uSway * 1.6 + ip.x * 0.35 + ip.y * 0.25) * k;
      transformed.z += cos(uSway * 1.3 + ip.x * 0.2 + ip.y * 0.3) * k;`,
    );
  };
  m.customProgramCacheKey = () => 'sway';
  swayCache.set(base, m);
  return m;
}

const variantOf = (d: Decor) => Math.abs(Math.round(d.seed ?? d.x * 131 + d.z * 71)) % VARIANTS;

/** Bakes a template into one merged geometry per material, in template space. */
function bake(template: THREE.Object3D): { geo: THREE.BufferGeometry; mat: THREE.Material; shadow: boolean }[] {
  template.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; shadow: boolean }>();
  template.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    let e = byMat.get(o.material);
    if (!e) byMat.set(o.material, (e = { geos: [], shadow: false }));
    e.geos.push(g);
    e.shadow ||= o.castShadow;
  });
  return [...byMat].map(([mat, e]) => ({ geo: mergeGeometries(e.geos)!, mat, shadow: e.shadow }));
}

/** All instanced-kind decor of a scene as a few InstancedMeshes. */
export function buildInstanced(decor: Decor[], sway: Sway): THREE.Group {
  const groups = new Map<string, Decor[]>();
  for (const d of decor) {
    if (!INSTANCED_KINDS.has(d.kind)) continue;
    const key = `${d.kind}|${variantOf(d)}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(d);
  }
  const out = new THREE.Group();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (const [key, list] of groups) {
    const [kind, variant] = key.split('|');
    const template = decorTemplate({ ...list[0], x: 0, z: 0, y: 0, rot: 0, h: 1, seed: Number(variant) * 977 + 13 });
    for (const part of bake(template)) {
      const material = SWAY_KINDS.has(kind as DecorKind) && part.mat instanceof THREE.MeshStandardMaterial
        ? swayMaterial(part.mat, sway)
        : part.mat;
      const inst = new THREE.InstancedMesh(part.geo, material, list.length);
      list.forEach((d, i) => {
        const s = d.h ?? 1;
        m4.compose(pos.set(d.x, d.y ?? 0, d.z), q.setFromAxisAngle(up, d.rot ?? 0), scl.set(s, s, s));
        inst.setMatrixAt(i, m4);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = part.shadow;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      out.add(inst);
    }
  }
  return out;
}
