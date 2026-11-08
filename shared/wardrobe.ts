import type { Eyes, Look, OutfitSlot } from './types';

export interface Item {
  id: string;
  slot: OutfitSlot;
  name: string;
  /** Knowledge Points; 0 = free for everyone. */
  price: number;
  color: string;
  accent?: string;
}

export const SLOTS: OutfitSlot[] = ['hat', 'top', 'face', 'back', 'neck'];

export const SLOT_LABELS: Record<OutfitSlot, string> = { hat: 'Hats', top: 'Tops', face: 'Face', back: 'Back', neck: 'Neck' };

export const ITEMS: Item[] = [
  { id: 'beanie', slot: 'hat', name: 'Beanie', price: 0, color: '#ef7d7d', accent: '#fffaf2' },
  { id: 'cap', slot: 'hat', name: 'Cap', price: 0, color: '#6d9cf0' },
  { id: 'bucket', slot: 'hat', name: 'Bucket hat', price: 40, color: '#efd27a' },
  { id: 'flower', slot: 'hat', name: 'Flower crown', price: 60, color: '#7cc47a' },
  { id: 'chef', slot: 'hat', name: 'Chef hat', price: 80, color: '#ffffff' },
  { id: 'headphones', slot: 'hat', name: 'Headphones', price: 90, color: '#5a4e66', accent: '#ff9e7a' },
  { id: 'frogHood', slot: 'hat', name: 'Frog hood', price: 120, color: '#7cc47a', accent: '#ffffff' },
  { id: 'wizard', slot: 'hat', name: 'Wizard hat', price: 150, color: '#7a6ad8', accent: '#ffd36e' },
  { id: 'crown', slot: 'hat', name: 'Crown', price: 400, color: '#ffd36e', accent: '#ff6b6b' },
  { id: 'tee', slot: 'top', name: 'T-shirt', price: 20, color: '#fffaf0' },
  { id: 'vest', slot: 'top', name: 'Sweater vest', price: 60, color: '#c98a5a' },
  { id: 'hoodie', slot: 'top', name: 'Hoodie', price: 80, color: '#9cc9f0' },
  { id: 'raincoat', slot: 'top', name: 'Raincoat', price: 90, color: '#ffd36e' },
  { id: 'overalls', slot: 'top', name: 'Overalls', price: 100, color: '#6d8fd0', accent: '#ffd36e' },
  { id: 'roundGlasses', slot: 'face', name: 'Round glasses', price: 40, color: '#5a4e66' },
  { id: 'sunglasses', slot: 'face', name: 'Sunglasses', price: 70, color: '#2a2430' },
  { id: 'monocle', slot: 'face', name: 'Monocle', price: 120, color: '#ffd36e' },
  { id: 'backpack', slot: 'back', name: 'Backpack', price: 60, color: '#ff9e7a', accent: '#c96a4a' },
  { id: 'cape', slot: 'back', name: 'Cape', price: 150, color: '#e85a6a' },
  { id: 'guitar', slot: 'back', name: 'Guitar', price: 200, color: '#c98a5a', accent: '#5a3e36' },
  { id: 'wings', slot: 'back', name: 'Angel wings', price: 300, color: '#ffffff' },
  { id: 'scarf', slot: 'neck', name: 'Scarf', price: 30, color: '#e85a6a', accent: '#fffaf0' },
  { id: 'bowtie', slot: 'neck', name: 'Bow tie', price: 40, color: '#7a6ad8' },
  { id: 'lei', slot: 'neck', name: 'Flower lei', price: 50, color: '#f7a1c4' },
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function itemById(id: string): Item | undefined {
  return BY_ID.get(id);
}

/** 'none' and price-0 items need no purchase. */
export function isFree(id: string): boolean {
  return id === 'none' || itemById(id)?.price === 0;
}

export const EYES: Eyes[] = ['dot', 'happy', 'sleepy'];
export const EYE_LABELS: Record<Eyes, string> = { dot: '• •', happy: '^ ^', sleepy: '- -' };
export const BODY_COLORS = ['#f4a6a6', '#f7c873', '#a8d8a0', '#9cc9f0', '#c9b2f2', '#f2b5d4', '#8fd3c7', '#f0e6d2'];
export const FREE_HATS = ['none', 'beanie', 'cap'];

export const DEFAULT_LOOK: Look = { body: '#9cc9f0', eyes: 'dot', hat: 'beanie', top: 'none', face: 'none', back: 'none', neck: 'none' };

const COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * A clean Look from untrusted input, or null. Accepts the old `{ body, skin, hat }` shape:
 * the colour and hat are kept, everything else starts empty.
 */
export function normalizeLook(raw: unknown): Look | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.body !== 'string' || !COLOR.test(r.body)) return null;
  const out: Look = { ...DEFAULT_LOOK, body: r.body, hat: 'none' };
  if (EYES.includes(r.eyes as Eyes)) out.eyes = r.eyes as Eyes;
  else if (r.eyes !== undefined) return null;
  for (const slot of SLOTS) {
    const v = r[slot];
    if (v === undefined) continue;
    if (typeof v !== 'string') return null;
    if (v === 'none' || itemById(v)?.slot === slot) out[slot] = v;
    else if ('skin' in r && slot === 'hat') out.hat = 'none'; // an old hat we no longer stock
    else return null;
  }
  return out;
}

/** The items a look wears (not 'none'). */
export function lookItems(look: Look): string[] {
  return SLOTS.map((s) => look[s]).filter((id) => id !== 'none');
}

/** A look with every paid item taken off (what a brand-new player may wear). */
export function freeOnly(look: Look): Look {
  const out = { ...look };
  for (const slot of SLOTS) if (!isFree(out[slot])) out[slot] = 'none';
  return out;
}
