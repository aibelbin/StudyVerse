import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { DecorKind } from '../../../shared/scenes/types';
import { decorTemplate } from './decor';

/** Kinds that don't need a browser canvas, so they can be built in Node. */
const KINDS: DecorKind[] = ['tree', 'pine', 'bush', 'flowers', 'grass', 'rock', 'lilyPad', 'hedge', 'bench', 'lampPost', 'plant', 'window', 'pendant', 'stringLights', 'sunbeam'];

const triangles = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((m) => {
    if (m instanceof THREE.Mesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  });
  return n;
};

describe('storybook decor', () => {
  it.each(KINDS)('%s builds real geometry for every variant', (kind) => {
    for (const seed of [13, 990, 1967, 2944]) {
      const o = decorTemplate({ kind, x: 0, z: 0, seed, w: 4, d: 1 });
      expect(triangles(o), `${kind} seed ${seed}`).toBeGreaterThanOrEqual(kind === 'sunbeam' ? 2 : 10); // a sunbeam is one soft quad
    }
  });

  it('gives each of the four tree variants a different shape', () => {
    const sizes = [13, 990, 1967, 2944].map((seed) => {
      const box = new THREE.Box3().setFromObject(decorTemplate({ kind: 'tree', x: 0, z: 0, seed }));
      return `${box.max.y.toFixed(1)}|${(box.max.x - box.min.x).toFixed(1)}`;
    });
    expect(new Set(sizes).size).toBeGreaterThanOrEqual(3);
  });

  it('merges a long hedge into a few meshes', () => {
    const o = decorTemplate({ kind: 'hedge', x: 0, z: 0, w: 140, d: 1, seed: 1 });
    let meshes = 0;
    o.traverse((m) => {
      if (m instanceof THREE.Mesh) meshes++;
    });
    expect(meshes).toBeLessThanOrEqual(6);
  });
});
