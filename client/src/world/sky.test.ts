import { describe, expect, it } from 'vitest';
import { clockHours, lerpHex, SHOOT_SLOT, shootingStar, skyAt } from './sky';

describe('skyAt', () => {
  it('is bright at noon and dark late at night', () => {
    expect(skyAt(12).night).toBe(0);
    expect(skyAt(23).night).toBe(1);
    expect(skyAt(12).sunIntensity).toBeGreaterThan(skyAt(23).sunIntensity);
  });
  it('blends between keyframes', () => {
    const golden = skyAt(18);
    const dusk = skyAt(19.5);
    const mid = skyAt(18.75);
    expect(mid.night).toBeGreaterThan(golden.night);
    expect(mid.night).toBeLessThan(dusk.night);
  });
  it('wraps cleanly at midnight', () => {
    expect(skyAt(0)).toEqual(skyAt(24));
    expect(skyAt(-1)).toEqual(skyAt(23));
  });
  it('keeps the sun above the horizon', () => {
    for (let h = 0; h < 24; h += 0.5) expect(skyAt(h).sunDir[1]).toBeGreaterThan(0);
  });
});

describe('lerpHex', () => {
  it('blends colours', () => {
    expect(lerpHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(lerpHex('#000000', '#fe0000', 0.5)).toBe('#7f0000');
  });
});

describe('clockHours', () => {
  const d = new Date(2026, 10, 9, 14, 45);
  it('reads the local clock', () => {
    expect(clockHours(d, null)).toBeCloseTo(14.75);
  });
  it('honours a ?time=HH:MM override', () => {
    expect(clockHours(d, '21:30')).toBe(21.5);
    expect(clockHours(d, '7')).toBe(7);
  });
  it('ignores a bad override', () => {
    expect(clockHours(d, 'late')).toBeCloseTo(14.75);
    expect(clockHours(d, '25:00')).toBeCloseTo(14.75);
  });

  it('has a three-colour sky that blends smoothly between keys', () => {
    const golden = skyAt(18);
    const dusk = skyAt(19.5);
    const mid = skyAt(18.75);
    expect(golden.horizon).toBe('#ffd08a');
    expect(dusk.horizon).toBe('#f59a9a');
    expect(mid.horizon).not.toBe(golden.horizon);
    expect(mid.horizon).not.toBe(dusk.horizon);
    expect(skyAt(13)).toMatchObject({ top: '#7cc4f2', horizon: '#cfeaf8', bottom: '#fdf0dc' });
  });
});

describe('shootingStar', () => {
  it('falls in every other 30 s slot, inside its slot, the same for everyone', () => {
    const slot = 58_000_000;
    expect(shootingStar(slot + 1)).toBeNull();
    const s = shootingStar(slot)!;
    expect(shootingStar(slot)).toEqual(s);
    expect(s.at).toBeGreaterThanOrEqual(slot * SHOOT_SLOT);
    expect(s.at + 600).toBeLessThan((slot + 1) * SHOOT_SLOT);
  });
});
