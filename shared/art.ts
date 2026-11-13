// shared/art.ts
import { FLOWERS, type Flower } from './garden';
import { GIFTS, type Gift } from './gifts';

export type PaintMode = 'pixel' | 'free' | 'photo';
export const PAINT_MODES: PaintMode[] = ['pixel', 'free', 'photo'];
/** Canvas side in pixels per mode (freehand may be saved smaller, see FREE_MIN). */
export const PAINT_SIZE: Record<PaintMode, number> = { pixel: 32, free: 256, photo: 256 };
export const FREE_MIN = 64;
export const PAINTING_MAX_BYTES = 65536;
/** Base64 of PAINTING_MAX_BYTES plus padding. */
export const PAINT_B64_MAX = 90_000;
export const TITLE_MAX = 24;
export const PRICE_RANGE = [1, 100] as const;
export const FOR_SALE_MAX = 3;
export const PAINTINGS_MAX = 40;
export const PAINT_GAP_MS = 30_000;
export const GALLERY_WALL = 16;
/** Newest photos pinned on the studio cork board. */
export const GALLERY_PHOTOS = 8;
/** How close you stand to a cabin spot to use it. */
export const SPOT_RADIUS = 1.3;

export interface CabinEntry {
  owner: string;
  name: string;
  lot: number;
  locked: boolean;
}

export interface PaintingMeta {
  id: number;
  artist: string;
  artistName: string;
  title: string;
  price: number;
  mode: PaintMode;
  sold: number;
  forSale: boolean;
  at: number;
}

export type CabinItem =
  | { spot: string; kind: 'painting'; painting: PaintingMeta }
  | { spot: string; kind: 'keepsake'; id: number; gift: Gift; flower?: Flower; fromName: string }
  | { spot: string; kind: 'bouquet'; flower: Flower };

export interface CabinState {
  owner: string;
  locked: boolean;
  items: CabinItem[];
}

/** What the owner picks for a spot: a painting id, a keepsake id, or a bag item id (a bouquet). */
export interface SpotPick {
  kind: 'painting' | 'keepsake' | 'bouquet';
  id: number;
}
export const SPOT_PICK_KINDS: SpotPick['kind'][] = ['painting', 'keepsake', 'bouquet'];

// ---------- village geometry ----------

export const LOT_XS = [-20, -13, -6, 6, 13, 20] as const;
export const ROW_D = 12;
export const VILLAGE_W = 52;

/** Rows of six lots for n cabins: always at least one spare row. */
export const villageRows = (n: number) => Math.ceil(n / 6) + 1;
export const villageSize = (n: number) => ({ w: VILLAGE_W, d: 16 + ROW_D * villageRows(n) });

export const cabinSceneId = (owner: string) => `cabin:${owner}`;
export const cabinOwner = (sceneId: string): string | null => (sceneId.startsWith('cabin:') ? sceneId.slice(6) : null);
export const lotSpawn = (lot: number) => `lot-${lot}`;

/** FNV-1a: a stable 31-bit seed from an id string. */
export function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 1) || 1;
}

export const CABIN_LOOKS = [
  { wall: '#f7e1c6', roof: '#b56a5a' },
  { wall: '#e8f0d8', roof: '#6d8f6a' },
  { wall: '#f6d6cf', roof: '#8c5a6e' },
  { wall: '#dcebf5', roof: '#5a7a9c' },
  { wall: '#fff0c8', roof: '#c98a5a' },
  { wall: '#e6dcf2', roof: '#7a5f9c' },
];
export const cabinLook = (owner: string) => CABIN_LOOKS[seedOf(owner) % CABIN_LOOKS.length];

// ---------- paintings ----------

export const PALETTE = [
  '#ffffff', '#e8e4ea', '#9a93a3', '#2a2430',
  '#5a3d3a', '#8a5a44', '#d9a27a', '#f6d7b8',
  '#f4a6a6', '#e85d6f', '#b8404f', '#f7b985',
  '#f2d06b', '#fbe9a0', '#b9d99a', '#6fae6b',
  '#2f6b55', '#8fd3d0', '#6aa7d8', '#3f5fa8',
  '#c9b6ec', '#9372c9', '#f3b6dc', '#4a3a6a',
];

/** True if these bytes start with the JPEG magic FF D8 FF. */
export const isJpeg = (b: Uint8Array) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export const artUrl = (id: number) => `/art/${id}.png`;

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG's IHDR chunk, or null if these bytes aren't a PNG. */
export function pngSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 24 || PNG_SIG.some((v, i) => b[i] !== v)) return null;
  if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

/** True if a PNG of this size is allowed for the mode. */
export function sizeOk(mode: PaintMode, w: number, h: number): boolean {
  if (w !== h) return false;
  return mode === 'pixel' ? w === PAINT_SIZE.pixel : w >= FREE_MIN && w <= PAINT_SIZE.free;
}

/** "'Sunset'", "plushie bear", "bouquet of roses" — for prompts and toasts. */
export function itemLabel(it: CabinItem): string {
  if (it.kind === 'painting') return `'${it.painting.title}'`;
  if (it.kind === 'bouquet') return `bouquet of ${FLOWERS[it.flower].plural}`;
  return it.flower ? `bouquet of ${FLOWERS[it.flower].plural}` : GIFTS[it.gift].name;
}
