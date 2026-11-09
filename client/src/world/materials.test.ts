import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { glow, mat, RAMP_BANDS, rampTexture, toonMat } from './materials';

describe('toon materials', () => {
  it('uses one four-band ramp that gets brighter', () => {
    expect(RAMP_BANDS).toHaveLength(4);
    for (let i = 1; i < RAMP_BANDS.length; i++) expect(RAMP_BANDS[i]).toBeGreaterThan(RAMP_BANDS[i - 1]);
    expect(rampTexture().magFilter).toBe(THREE.NearestFilter);
    expect(rampTexture()).toBe(rampTexture());
  });

  it('keeps colour, emissive, opacity and side, and drops roughness and metalness', () => {
    const m = toonMat({ color: '#ff0000', emissive: '#00ff00', emissiveIntensity: 2, transparent: true, opacity: 0.5, side: THREE.DoubleSide, roughness: 0.2, metalness: 0.9 });
    expect(m).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(m.color.getHexString()).toBe('ff0000');
    expect(m.emissive.getHexString()).toBe('00ff00');
    expect(m.emissiveIntensity).toBe(2);
    expect([m.transparent, m.opacity, m.side]).toEqual([true, 0.5, THREE.DoubleSide]);
    expect('roughness' in m).toBe(false);
    expect(m.gradientMap).toBe(rampTexture());
  });

  it('caches scenery colours and tagged glows', () => {
    expect(mat('#123456')).toBe(mat('#123456'));
    expect(glow('#ffffff', 1.6, 'street')).toBe(glow('#ffffff', 1.6, 'street'));
    expect(glow('#ffffff', 1.6, 'street')).not.toBe(glow('#ffffff', 1.6, 'window'));
  });
});
