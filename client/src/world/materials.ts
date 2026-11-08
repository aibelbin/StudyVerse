import * as THREE from 'three';

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared flat-shaded material per colour (scenery only; characters own their materials). */
export function mat(color: string, roughness = 0.85): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
    cache.set(key, m);
  }
  return m;
}

export function glow(color: string, intensity = 1.6): THREE.MeshStandardMaterial {
  const key = `glow|${color}|${intensity}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
    cache.set(key, m);
  }
  return m;
}

export function mesh(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  castShadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}
