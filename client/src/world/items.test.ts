import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MUG_SHAPES } from '../../../shared/mug';
import { mugMesh } from './items';

describe('mugMesh', () => {
  for (const shape of MUG_SHAPES) {
    it(`builds a ${shape} mug`, () => {
      const g = mugMesh({ shape, glaze: '#fffaf2', accent: '#c98a5a' }, '#5a3220');
      let n = 0;
      g.traverse((o) => o instanceof THREE.Mesh && n++);
      expect(n).toBeGreaterThanOrEqual(3);
      // the drink disc (last child) must reach the body's top, or the body hides it
      const top = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).max.y;
      expect(top(g.children.at(-1)!)).toBeGreaterThanOrEqual(top(g.children[0]) - 1e-6);
    });
  }
});
