import * as THREE from 'three';

/** The storybook light ramp: four soft bands from shade to full light. */
export const RAMP_BANDS = [0.38, 0.62, 0.85, 1];
let ramp: THREE.DataTexture | null = null;

/** One shared 4×1 gradient map for every toon material (nearest filtering keeps the bands crisp). */
export function rampTexture(): THREE.DataTexture {
  if (ramp) return ramp;
  const data = new Uint8Array(RAMP_BANDS.length * 4);
  RAMP_BANDS.forEach((v, i) => data.set([v * 255, v * 255, v * 255, 255], i * 4));
  ramp = new THREE.DataTexture(data, RAMP_BANDS.length, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

export type ToonParams = THREE.MeshToonMaterialParameters & { roughness?: number; metalness?: number; flatShading?: boolean };

/**
 * A toon material on the shared ramp. Takes what MeshStandardMaterial takes, so call sites stay
 * readable; roughness, metalness and flat shading don't apply to the storybook look and are dropped.
 */
export function toonMat(p: ToonParams = {}): THREE.MeshToonMaterial {
  const { roughness: _r, metalness: _m, flatShading: _f, ...rest } = p;
  return new THREE.MeshToonMaterial({ gradientMap: rampTexture(), ...rest });
}

const cache = new Map<string, THREE.MeshToonMaterial>();

/** Shared toon material per colour (scenery only; characters own their materials). */
export function mat(color: string, _roughness = 0.85): THREE.MeshToonMaterial {
  let m = cache.get(color);
  if (!m) {
    m = toonMat({ color });
    cache.set(color, m);
  }
  return m;
}

/** Emissive material. A tag gives a separate instance (e.g. 'street' lamps that day/night dims). */
export function glow(color: string, intensity = 1.6, tag = ''): THREE.MeshToonMaterial {
  const key = `glow|${color}|${intensity}|${tag}`;
  let m = cache.get(key);
  if (!m) {
    m = toonMat({ color, emissive: color, emissiveIntensity: intensity });
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
