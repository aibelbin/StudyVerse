import type { PetKind } from '../types';

export const PET_KINDS: { kind: PetKind; label: string; emoji: string; price: number }[] = [
  { kind: 'frog', label: 'Frog', emoji: '🐸', price: 120 },
  { kind: 'duckling', label: 'Duckling', emoji: '🐥', price: 150 },
  { kind: 'kitten', label: 'Kitten', emoji: '🐱', price: 200 },
  { kind: 'bunny', label: 'Bunny', emoji: '🐰', price: 200 },
];

export const petPrice = (kind: PetKind) => PET_KINDS.find((p) => p.kind === kind)?.price ?? Infinity;
export const isPetKind = (v: unknown): v is PetKind => PET_KINDS.some((p) => p.kind === v);
