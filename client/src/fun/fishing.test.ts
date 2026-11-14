import { describe, expect, it } from 'vitest';
import { possible, SPECIES, SPECIES_IDS } from '../../../shared/catches';
import { BITE_MAX_MS, BITE_MIN_MS, BITE_WINDOW_MS, caughtText, FishingRound, pickSpecies } from './fishing';

describe('FishingRound', () => {
  it('waits 3–12 s, bites for 0.8 s, then it is gone', () => {
    expect(new FishingRound(1000, () => 0).biteAt).toBe(1000 + BITE_MIN_MS);
    expect(new FishingRound(1000, () => 1).biteAt).toBe(1000 + BITE_MAX_MS);
    const r = new FishingRound(0, () => 0.5);
    expect(r.phase(r.biteAt - 1)).toBe('waiting');
    expect(r.strike(r.biteAt - 1)).toBe('early');
    expect(r.strike(r.biteAt)).toBe('caught');
    expect(r.strike(r.biteAt + BITE_WINDOW_MS - 1)).toBe('caught');
    expect(r.phase(r.biteAt + BITE_WINDOW_MS)).toBe('gone');
    expect(r.strike(r.biteAt + BITE_WINDOW_MS)).toBe('missed');
  });
});

describe('pickSpecies', () => {
  const fish = SPECIES_IDS.filter((id) => SPECIES[id].kind === 'fish');

  it('only picks what is possible now, across the whole roll', () => {
    for (const now of [{ night: false, raining: false }, { night: true, raining: false }, { night: false, raining: true }]) {
      for (let i = 0; i <= 100; i++) {
        const id = pickSpecies(fish, now, () => (i === 100 ? 0.999999 : i / 100))!;
        expect(SPECIES[id].kind).toBe('fish');
        expect(possible(id, now), id).toBe(true);
      }
    }
  });

  it('rare ones come up less often, and nothing possible gives null', () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const id = pickSpecies(fish, { night: true, raining: false }, () => i / 1000)!;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    expect(seen.get('moonfish')!).toBeLessThan(seen.get('carp')!);
    expect(pickSpecies(['moonfish'], { night: false, raining: false })).toBeNull();
  });
});

it('caughtText', () => {
  expect(caughtText('eel', 52, true)).toBe('🐍 You caught an eel (52 cm)! New! 📖');
  expect(caughtText('bee', undefined, false)).toBe('🐝 You caught a bee!');
});
