// shared/art.test.ts
import { describe, expect, it } from 'vitest';
import { PALETTE, cabinLook, cabinOwner, isJpeg, cabinSceneId, itemLabel, pngSize, seedOf, villageRows, villageSize } from './art';

/** A PNG header with the given size (the body doesn't matter for pngSize). */
function header(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

describe('village geometry', () => {
  it('always keeps a spare row of lots', () => {
    expect(villageRows(0)).toBe(1);
    expect(villageRows(6)).toBe(2);
    expect(villageRows(7)).toBe(3);
    expect(villageRows(12)).toBe(3);
    expect(villageSize(0)).toEqual({ w: 52, d: 38 });
    expect(villageSize(7)).toEqual({ w: 52, d: 62 });
  });
});

describe('cabins', () => {
  it('maps scene ids to owners and back', () => {
    expect(cabinSceneId('abc')).toBe('cabin:abc');
    expect(cabinOwner('cabin:abc')).toBe('abc');
    expect(cabinOwner('town')).toBeNull();
  });
  it('seeds looks from the owner id, deterministically', () => {
    expect(seedOf('abc')).toBe(seedOf('abc'));
    expect(seedOf('abc')).not.toBe(seedOf('abd'));
    expect(cabinLook('abc')).toEqual(cabinLook('abc'));
    expect(cabinLook('abc').wall).toMatch(/^#/);
  });
  it('names items for prompts', () => {
    expect(itemLabel({ spot: 'w1', kind: 'painting', painting: { id: 1, artist: 'a', artistName: 'A', title: 'Sunset', price: 10, mode: 'pixel', sold: 0, forSale: true, at: 0 } })).toBe("'Sunset'");
    expect(itemLabel({ spot: 's1', kind: 'keepsake', id: 1, gift: 'bear', fromName: 'Jo' })).toBe('plushie bear');
    expect(itemLabel({ spot: 's1', kind: 'bouquet', flower: 'rose' })).toBe('bouquet of roses');
  });
});

describe('pngSize', () => {
  it('reads the size out of a PNG header and rejects anything else', () => {
    expect(pngSize(header(32, 32))).toEqual({ w: 32, h: 32 });
    expect(pngSize(header(256, 192))).toEqual({ w: 256, h: 192 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
    const bad = header(32, 32);
    bad[1] = 0x41;
    expect(pngSize(bad)).toBeNull();
  });
});

describe('palette and jpeg', () => {
  it('palette has 24 unique entries', () => {
    expect(PALETTE.length).toBe(24);
    expect(new Set(PALETTE).size).toBe(24);
    expect(PALETTE).toContain('#ffffff');
    expect(PALETTE).toContain('#2a2430');
  });
  it('isJpeg checks the magic bytes', () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e]))).toBe(false);
  });
});
