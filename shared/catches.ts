import type { LifeKind } from './scenes/types';

export type CatchKind = 'fish' | 'bug';

export interface Species {
  kind: CatchKind;
  name: string;
  emoji: string;
  rarity: 1 | 2 | 3;
  when?: 'night' | 'rain';
  /** Bugs: the ambient critter it is netted from. */
  base?: LifeKind;
  /** Fish: size range in cm. */
  size?: [number, number];
}

const fish = (name: string, emoji: string, size: [number, number], rarity: 1 | 2 | 3 = 1, when?: Species['when']): Species =>
  ({ kind: 'fish', name, emoji, rarity, size, ...(when ? { when } : {}) });
const bug = (name: string, emoji: string, base: LifeKind, rarity: 1 | 2 | 3 = 1, when?: Species['when']): Species =>
  ({ kind: 'bug', name, emoji, rarity, base, ...(when ? { when } : {}) });

export const SPECIES = {
  carp: fish('carp', '🐟', [20, 60]),
  minnow: fish('minnow', '🐟', [3, 8]),
  perch: fish('perch', '🐟', [10, 35]),
  trout: fish('trout', '🐟', [20, 60]),
  bass: fish('bass', '🐟', [20, 55]),
  goldfish: fish('goldfish', '🐠', [5, 15]),
  catfish: fish('catfish', '🐟', [30, 90], 1, 'night'),
  eel: fish('eel', '🐍', [40, 100], 1, 'night'),
  koi: fish('koi', '🎏', [30, 70], 2),
  rainbowTrout: fish('rainbow trout', '🌈', [25, 65], 1, 'rain'),
  moonfish: fish('moonfish', '🌙', [20, 50], 3, 'night'),
  goldenCarp: fish('golden carp', '✨', [30, 70], 3),
  butterfly: bug('butterfly', '🦋', 'butterflies'),
  blueButterfly: bug('blue butterfly', '🦋', 'butterflies', 1, 'rain'),
  dragonfly: bug('dragonfly', '🪰', 'dragonflies'),
  bee: bug('bee', '🐝', 'bees'),
  ladybug: bug('ladybug', '🐞', 'ladybugs'),
  snail: bug('snail', '🐌', 'snails', 1, 'rain'),
  firefly: bug('firefly', '✨', 'fireflies', 1, 'night'),
  moth: bug('moth', '🦋', 'butterflies', 1, 'night'),
  beetle: bug('beetle', '🪲', 'ladybugs'),
  glowBeetle: bug('glow beetle', '🪲', 'fireflies', 3, 'night'),
} satisfies Record<string, Species>;

export type SpeciesId = keyof typeof SPECIES;
export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];

export const isSpecies = (v: unknown): v is SpeciesId => typeof v === 'string' && Object.hasOwn(SPECIES, v);

/** Night on the catcher's own clock (hour 0–23), like the sky. */
export const isNight = (hour: number): boolean => hour >= 20 || hour < 6;

/** Whether this species can be caught right now. */
export function possible(id: SpeciesId, now: { night: boolean; raining: boolean }): boolean {
  const w = SPECIES[id].when;
  return w === undefined || (w === 'night' ? now.night : now.raining);
}

/** One row of a player's journal. best = biggest fish in cm (null for bugs). */
export interface JournalEntry {
  species: SpeciesId;
  count: number;
  best: number | null;
  firstAt: number;
}

export const FIRST_CATCH_KP = 3;
export const FISH_REACH = 2.5;
export const FISH_GAP_MS = 5000;
export const BUG_GAP_MS = 3000;
