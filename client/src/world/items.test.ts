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
    });
  }
});
