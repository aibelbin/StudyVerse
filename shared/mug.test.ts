import { describe, expect, it } from 'vitest';
import { PALETTE } from './art';
import { DEFAULT_MUG, isMug } from './mug';

describe('mug', () => {
  it('accepts palette colours and known shapes', () => {
    expect(isMug({ shape: 'tall', glaze: PALETTE[0], accent: PALETTE[5] })).toBe(true);
  });
  it('rejects bad shape, colour or type', () => {
    expect(isMug({ shape: 'cube', glaze: PALETTE[0], accent: PALETTE[5] })).toBe(false);
    expect(isMug({ shape: 'tall', glaze: '#123456', accent: PALETTE[5] })).toBe(false);
    expect(isMug({ shape: 'tall', glaze: PALETTE[0] })).toBe(false);
    expect(isMug(null)).toBe(false);
  });
  it('the default shape is classic', () => {
    expect(DEFAULT_MUG.shape).toBe('classic');
  });
});
