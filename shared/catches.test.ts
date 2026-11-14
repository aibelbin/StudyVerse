import { describe, expect, it } from 'vitest';
import { isNight, isSpecies, possible, SPECIES, SPECIES_IDS } from './catches';

describe('species', () => {
  it('has 12 fish and 10 bugs; fish have sizes, bugs a base critter', () => {
    const all = SPECIES_IDS.map((id) => SPECIES[id]);
    expect(all.filter((s) => s.kind === 'fish')).toHaveLength(12);
    expect(all.filter((s) => s.kind === 'bug')).toHaveLength(10);
    expect(new Set(all.map((s) => s.name)).size).toBe(22);
    for (const s of all) expect(s.kind === 'fish' ? s.size && s.size[0] < s.size[1] && !s.base : s.base && !s.size, s.name).toBeTruthy();
  });

  it('knows its ids', () => {
    expect(isSpecies('moonfish')).toBe(true);
    expect(isSpecies('shark')).toBe(false);
    expect(isSpecies('toString')).toBe(false);
  });

  it('night is 20:00 to 06:00', () => {
    expect([19, 20, 23, 0, 5, 6].map(isNight)).toEqual([false, true, true, true, true, false]);
  });

  it('possible respects night and rain', () => {
    const day = { night: false, raining: false };
    expect(possible('carp', day)).toBe(true);
    expect(possible('moonfish', day)).toBe(false);
    expect(possible('moonfish', { night: true, raining: false })).toBe(true);
    expect(possible('snail', day)).toBe(false);
    expect(possible('snail', { night: false, raining: true })).toBe(true);
    expect(possible('glowBeetle', { night: false, raining: true })).toBe(false);
  });
});
