import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, isFree, ITEMS, itemById, lookItems, normalizeLook } from './wardrobe';

describe('catalog', () => {
  it('has unique ids and sane prices', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const i of ITEMS) expect(i.price).toBeGreaterThanOrEqual(0);
  });
  it('knows what is free', () => {
    expect(isFree('none')).toBe(true);
    expect(isFree('beanie')).toBe(true);
    expect(isFree('crown')).toBe(false);
    expect(itemById('crown')?.slot).toBe('hat');
  });
});

describe('normalizeLook', () => {
  it('keeps a valid new look', () => {
    const l = { ...DEFAULT_LOOK, top: 'hoodie', face: 'sunglasses', eyes: 'happy' };
    expect(normalizeLook(l)).toEqual(l);
  });
  it('upgrades an old look, keeping colour and hat', () => {
    expect(normalizeLook({ body: '#111111', skin: '#222222', hat: 'bucket' })).toEqual({ ...DEFAULT_LOOK, body: '#111111', hat: 'bucket' });
    expect(normalizeLook({ body: '#111111', skin: '#222222', hat: 'none' })).toEqual({ ...DEFAULT_LOOK, body: '#111111', hat: 'none' });
  });
  it('rejects items in the wrong slot, unknown items and bad colours', () => {
    expect(normalizeLook({ ...DEFAULT_LOOK, hat: 'hoodie' })).toBeNull();
    expect(normalizeLook({ ...DEFAULT_LOOK, neck: 'laser' })).toBeNull();
    expect(normalizeLook({ ...DEFAULT_LOOK, body: 'red' })).toBeNull();
    expect(normalizeLook({ ...DEFAULT_LOOK, eyes: 'lasers' })).toBeNull();
    expect(normalizeLook(null)).toBeNull();
  });
  it('drops extra fields', () => {
    expect(normalizeLook({ ...DEFAULT_LOOK, evil: 1 })).toEqual(DEFAULT_LOOK);
  });
  it('lists worn items', () => {
    expect(lookItems({ ...DEFAULT_LOOK, top: 'tee' })).toEqual(['beanie', 'tee']);
  });
});
