import { PALETTE } from './art';

export const MUG_SHAPES = ['classic', 'tall', 'round', 'tiny'] as const;
export type MugShape = (typeof MUG_SHAPES)[number];
export interface Mug {
  shape: MugShape;
  glaze: string;
  accent: string;
}
export const MUG_PRICE = 10;
export const DEFAULT_MUG: Mug = { shape: 'classic', glaze: '#fffaf2', accent: '#c98a5a' };

export function isMug(x: unknown): x is Mug {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Record<string, unknown>;
  return (MUG_SHAPES as readonly unknown[]).includes(m.shape) && PALETTE.includes(m.glaze as string) && PALETTE.includes(m.accent as string);
}
