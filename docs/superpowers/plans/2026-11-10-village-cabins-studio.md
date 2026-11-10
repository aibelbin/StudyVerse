# Village, Cabins and Art Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A village scene of per-player cabins (free, auto-assigned, latchable, decoratable with fixed spots) behind a gate on the town's east street, plus an art studio where players paint (pixel or freehand), hang paintings for sale and buy prints with KP.

**Architecture:** Two new *dynamic* scenes (`village`, built from the cabin roster; `cabin:<ownerId>`, a shell template per owner) resolved by a shared `SceneBook` on both server and client, next to the static scenes (`town`, `studio`, …). Paintings are PNG blobs in SQLite served over HTTP (`/art/<id>.png`); the WebSocket carries metadata only. New server logic lives in `server/src/cabins.ts` and `server/src/studio.ts` behind a small `Port` interface so `world.ts` only gains dispatch lines; new client UI lives under `client/src/art/`.

**Tech Stack:** TypeScript, Three.js (client), Node 24 `node:sqlite`, `ws`, Vite, Vitest. Spec: `docs/superpowers/specs/2026-11-10-village-cabins-studio-design.md`.

## Global Constraints

- Ponytail rules: smallest change that fully solves the task; reuse existing helpers (`merge`, `studyDesk`, `simpleToy`, `textSprite`, `h`, `openModal`); no unrequested abstractions; one small test per non-trivial branch.
- No AI attribution anywhere in git (no `Co-Authored-By`, no "Generated with"). Commit messages are short imperative sentences like the existing history (`feat: …`, `fix: …`, `docs: …`, `test: …`).
- Painting limits (exact): `PAINTING_MAX_BYTES = 65536`, title ≤ 24 chars, price 1–100 KP, ≤ 3 for sale per artist, ≤ 40 paintings per artist, one `paint` per 30 s, wall shows 16 newest. WebSocket `maxPayload` becomes `128 * 1024`.
- Village geometry (exact): lots at `x ∈ [-20, -13, -6, 6, 13, 20]`, rows 12 m apart, `rows(n) = ceil(n / 6) + 1`, size `{ w: 52, d: 16 + 12·rows }`.
- Cabin shell: 7 × 6 m, spots `w1..w6` (wall) and `s1..s4` (shelf), one desk slot `cabin:<owner>-desk-n`.
- No outlines in the 3D scene (toon shading only). Everything must work on phones (pointer events, modals, E prompts in `[E] …` form so the touch UI can parse them).
- Run `npx vitest run <file>` for single files, `npm test` for all, `npm run typecheck` before each commit that touches TypeScript.

---

## File structure

**Shared (data both sides agree on)**
- Create `shared/art.ts` — types (`CabinEntry`, `PaintingMeta`, `CabinItem`, `CabinState`, `SpotPick`, `PaintMode`), limits, lot geometry (`villageRows`, `villageSize`, `LOT_XS`), `seedOf`, `cabinLook`, `cabinSceneId`/`cabinOwner`, `lotSpawn`, `pngSize`, `artUrl`, `itemLabel`.
- Create `shared/scenes/village.ts` — `villageScene(roster)`.
- Create `shared/scenes/cabin.ts` — `cabinScene(entry)`, `CABIN_SPOTS`.
- Create `shared/scenes/studio.ts` — `studio` scene, `GALLERY_FRAMES`.
- Create `shared/scenes/book.ts` — `SceneBook`.
- Modify `shared/scenes/types.ts` (new `DecorKind`s, `Spot`, `spots?`), `shared/scenes/index.ts` (studio), `shared/scenes/town.ts` (gate door/spawn/signpost, `OUTDOOR_THEME`), `shared/scenes/town/edges.ts` (function of size), `shared/toys.ts` (`easel`, `gallery`), `shared/protocol.ts`, `shared/types.ts` (`FeedKind` `art`).

**Server**
- Create `server/src/port.ts` — the `Port` interface modules use to talk to the world.
- Create `server/src/cabins.ts` — `Cabins` (roster, lots, latch, items).
- Create `server/src/studio.ts` — `Studio` (paint, sale, buy, gallery, portfolio).
- Create `server/src/pngFixture.ts` — `makePng(w, h)` for tests.
- Modify `server/src/db.ts` (tables + methods), `server/src/world.ts` (book, dispatch, join hook, latch check, `afterEnter`), `server/src/server.ts` (`/art/` route, `maxPayload`), `server/src/validate.ts`, `server/src/toys.ts`, `server/src/feed.ts`.

**Client**
- Create `client/src/world/book.ts` — the client's `SceneBook` singleton.
- Create `client/src/world/items.ts` — `bouquetMesh` (moved from `character.ts`), `giftSprite`.
- Create `client/src/art/paintCore.ts` (+ test) — pure pixel ops, palette, undo.
- Create `client/src/art/paint.ts` — the easel modal.
- Create `client/src/art/catalogue.ts` — gallery/portfolio modal.
- Create `client/src/art/cabinPanel.ts` — spot picker.
- Create `client/src/art/views.ts` — `Pictures` (frames with textures) and `Shelves`.
- Modify `client/src/world/decor.ts` (`cabin`, `gate`, `galleryWall`, `shelf`, `bed`), `client/src/world/sceneBuilder.ts`, `client/src/toys/local.ts`, `client/src/toys/registry.ts`, `client/src/game/interaction.ts` (+ test), `client/src/game/game.ts`, `client/src/hud/hud.ts`, `client/src/hud/admin.ts`, `client/src/hud/minimap.ts`, `client/src/main.ts`, `client/src/style.css`.

---

### Task 1: Shared art types, limits and geometry

**Files:**
- Create: `shared/art.ts`
- Test: `shared/art.test.ts`

**Interfaces:**
- Produces: everything in `shared/art.ts` below; later tasks import `CabinEntry`, `PaintingMeta`, `CabinItem`, `CabinState`, `SpotPick`, `PaintMode`, `PAINT_MODES`, limits, `villageRows`, `villageSize`, `LOT_XS`, `seedOf`, `cabinLook`, `cabinSceneId`, `cabinOwner`, `lotSpawn`, `pngSize`, `artUrl`, `itemLabel`, `SPOT_PICK_KINDS`.

- [ ] **Step 1: Write the failing test**

```ts
// shared/art.test.ts
import { describe, expect, it } from 'vitest';
import { cabinLook, cabinOwner, cabinSceneId, itemLabel, pngSize, seedOf, villageRows, villageSize } from './art';

/** A PNG header with the given size (the body doesn't matter for pngSize). */
function header(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

describe('village geometry', () => {
  it('always keeps a spare row of lots', () => {
    expect(villageRows(0)).toBe(1);
    expect(villageRows(6)).toBe(2);
    expect(villageRows(7)).toBe(3);
    expect(villageRows(12)).toBe(3);
    expect(villageSize(0)).toEqual({ w: 52, d: 28 });
    expect(villageSize(7)).toEqual({ w: 52, d: 52 });
  });
});

describe('cabins', () => {
  it('maps scene ids to owners and back', () => {
    expect(cabinSceneId('abc')).toBe('cabin:abc');
    expect(cabinOwner('cabin:abc')).toBe('abc');
    expect(cabinOwner('town')).toBeNull();
  });
  it('seeds looks from the owner id, deterministically', () => {
    expect(seedOf('abc')).toBe(seedOf('abc'));
    expect(seedOf('abc')).not.toBe(seedOf('abd'));
    expect(cabinLook('abc')).toEqual(cabinLook('abc'));
    expect(cabinLook('abc').wall).toMatch(/^#/);
  });
  it('names items for prompts', () => {
    expect(itemLabel({ spot: 'w1', kind: 'painting', painting: { id: 1, artist: 'a', artistName: 'A', title: 'Sunset', price: 10, mode: 'pixel', sold: 0, forSale: true, at: 0 } })).toBe("'Sunset'");
    expect(itemLabel({ spot: 's1', kind: 'keepsake', id: 1, gift: 'bear', fromName: 'Jo' })).toBe('plushie bear');
    expect(itemLabel({ spot: 's1', kind: 'bouquet', flower: 'rose' })).toBe('bouquet of roses');
  });
});

describe('pngSize', () => {
  it('reads the size out of a PNG header and rejects anything else', () => {
    expect(pngSize(header(32, 32))).toEqual({ w: 32, h: 32 });
    expect(pngSize(header(256, 192))).toEqual({ w: 256, h: 192 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
    const bad = header(32, 32);
    bad[1] = 0x41;
    expect(pngSize(bad)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run shared/art.test.ts`
Expected: FAIL — `Cannot find module './art'`.

- [ ] **Step 3: Write `shared/art.ts`**

```ts
// shared/art.ts
import { FLOWERS, type Flower } from './garden';
import { GIFTS, type Gift } from './gifts';

export type PaintMode = 'pixel' | 'free';
export const PAINT_MODES: PaintMode[] = ['pixel', 'free'];
/** Canvas side in pixels per mode (freehand may be saved smaller, see FREE_MIN). */
export const PAINT_SIZE: Record<PaintMode, number> = { pixel: 32, free: 256 };
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
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run shared/art.test.ts`
Expected: PASS (3 describe blocks, 5 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/art.ts shared/art.test.ts
git commit -m "feat: shared art and village types, limits and lot geometry"
```

---

### Task 2: Scene types and new toy kinds

**Files:**
- Modify: `shared/scenes/types.ts`, `shared/toys.ts`, `server/src/toys.ts`, `client/src/toys/registry.ts`, `client/src/toys/local.ts`

**Interfaces:**
- Produces: `Spot` type and `SceneDef.spots?`, `DecorKind` gains `'cabin' | 'gate' | 'galleryWall' | 'shelf' | 'bed'`, `ToyKind` gains `'easel' | 'gallery'` (both in `LOCAL_TOYS`), client views `easelView()`, `galleryView()`.

- [ ] **Step 1: Add the types**

In `shared/scenes/types.ts`, extend `DecorKind` (append to the last line of the union):

```ts
  | 'signpost' | 'frame' | 'pendant' | 'chalkboard' | 'stringLights' | 'sunbeam'
  | 'cabin' | 'gate' | 'galleryWall' | 'shelf' | 'bed';
```

Add after the `Spawn` interface:

```ts
/** A fixed place in a cabin where its owner hangs a painting (wall) or shows a keepsake (shelf). */
export interface Spot {
  id: string;
  kind: 'wall' | 'shelf';
  x: number;
  z: number;
  /** Height of the frame centre / shelf top. */
  y: number;
  /** Which way the frame faces (same convention as Decor.rot). */
  rot: number;
}
```

And in `SceneDef`, after `props?: Prop[];`:

```ts
  /** Cabins: the owner's decorating spots. */
  spots?: Spot[];
```

- [ ] **Step 2: Add the toy kinds**

In `shared/toys.ts`:

```ts
export type ToyKind =
  | 'swing' | 'seesaw' | 'merryGoRound' | 'slide' | 'piano' | 'jukebox' | 'ducks'
  | 'fountain' | 'bell' | 'chimes' | 'stones' | 'campfire' | 'telescope' | 'rowboat'
  | 'shop' | 'board' | 'quotes' | 'coffee' | 'truck'
  | 'koi' | 'cushions' | 'cairn' | 'drums' | 'guitar' | 'keys' | 'stageScreen' | 'plot' | 'golfTee' | 'golfBoard' | 'giftShop'
  | 'easel' | 'gallery';

export const TOY_KINDS: ToyKind[] = [
  'swing', 'seesaw', 'merryGoRound', 'slide', 'piano', 'jukebox', 'ducks',
  'fountain', 'bell', 'chimes', 'stones', 'campfire', 'telescope', 'rowboat',
  'shop', 'board', 'quotes', 'coffee', 'truck',
  'koi', 'cushions', 'cairn', 'drums', 'guitar', 'keys', 'stageScreen', 'plot', 'golfTee', 'golfBoard', 'giftShop',
  'easel', 'gallery',
];

/** Toys whose E opens something on your own screen instead of telling the server. */
export const LOCAL_TOYS: ToyKind[] = ['telescope', 'shop', 'board', 'quotes', 'coffee', 'stageScreen', 'giftShop', 'easel', 'gallery'];
```

In `server/src/toys.ts` `HANDLERS`, after `giftShop: none,`:

```ts
  easel: none,
  gallery: none,
```

- [ ] **Step 3: Client prompts and views**

In `client/src/toys/local.ts` append:

```ts
/** An easel in the studio: a wooden tripod holding a blank canvas, with a sign. */
export function easelView(): ToyView {
  const root = new THREE.Group();
  for (const [x, z] of [[-0.3, 0.25], [0.3, 0.25], [0, -0.3]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.9, 8), mat(P.woodLight), x, 0.95, z);
    leg.rotation.x = z < 0 ? -0.22 : 0.18;
    leg.rotation.z = -x * 0.5;
    root.add(leg);
  }
  root.add(mesh(new THREE.BoxGeometry(0.8, 0.06, 0.12), mat(P.woodDark), 0, 0.85, 0.2));
  const canvas = mesh(new THREE.BoxGeometry(0.72, 0.72, 0.03), mat('#fffdf7'), 0, 1.3, 0.16);
  canvas.rotation.x = -0.18;
  root.add(canvas);
  const sign = textSprite('🎨 Paint', 0.28, { bg: '#ffffffdd', font: 40, pad: 12 });
  sign.position.set(0, 2.15, 0);
  root.add(sign);
  return { root, update: (ctx) => bob(sign, 2.15, ctx.now) };
}

/** The gallery wall's sign (the wall and its frames are decor + the Pictures view). */
export function galleryView(): ToyView {
  const root = new THREE.Group();
  const sign = textSprite('🖼️ Gallery', 0.28, { bg: '#ffffffdd', font: 40, pad: 12 });
  sign.position.set(0, 1.4, 0);
  root.add(sign);
  return { root, update: (ctx) => bob(sign, 1.4, ctx.now) };
}
```

In `client/src/toys/registry.ts`: import the two views (`import { boardView, coffeeView, easelView, galleryView, giftShopView, quotesView, shopView } from './local';`), add prompts in `toyPrompt` before `default`:

```ts
    case 'easel': return '[E] paint something 🎨';
    case 'gallery': return '[E] browse the gallery 🖼️';
```

and cases in `build`:

```ts
    case 'easel': return easelView();
    case 'gallery': return galleryView();
```

- [ ] **Step 4: Typecheck and run the scene tests**

Run: `npm run typecheck && npx vitest run shared/scenes/scenes.test.ts`
Expected: typecheck clean. The test `every kind of toy is somewhere` FAILS for `easel` and `gallery` — that's expected until Task 4 adds the studio. Everything else passes.

- [ ] **Step 5: Commit**

```bash
git add shared/scenes/types.ts shared/toys.ts server/src/toys.ts client/src/toys/registry.ts client/src/toys/local.ts
git commit -m "feat: spot/decor/toy kinds for cabins and the studio"
```

---

### Task 3: Hedge edges as a function of size; the town's village gate

**Files:**
- Modify: `shared/scenes/town/edges.ts`, `shared/scenes/town.ts`, `shared/scenes/scenes.test.ts`

**Interfaces:**
- Produces: `edges(w: number, d: number, seed = 907): Parts`; `OUTDOOR_THEME: Theme` exported from `town.ts`; town door `to-village` (→ scene `village`, spawn `gate`), town spawn `from-village`, `gate` decor at the east hedge, `TOWN_STREET_Z` constant.

- [ ] **Step 1: Add the tests**

Append to the `describe('scene data')` block in `shared/scenes/scenes.test.ts`:

```ts
  it('has a gate to the village at the east end of the street', () => {
    const door = SCENES.town.doors.find((d) => d.id === 'to-village')!;
    expect(door).toMatchObject({ toScene: 'village', toSpawn: 'gate' });
    expect(door.box.x).toBeGreaterThan(70);
    const spawn = SCENES.town.spawns.find((s) => s.id === 'from-village')!;
    expect(Math.abs(spawn.z - door.box.z)).toBeLessThan(0.1);
    expect(SCENES.town.decor.some((d) => d.kind === 'gate')).toBe(true);
  });
```

Also relax the signpost check in `puts the signposts on grass, clear of paths`: change `expect(p.label!.split('|').length).toBe(3);` to `expect(p.label!.split('|').length).toBeGreaterThanOrEqual(2);`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run shared/scenes/scenes.test.ts`
Expected: the new test FAILS (`to-village` door undefined).

- [ ] **Step 3: Make `edges` a function**

Replace the whole of `shared/scenes/town/edges.ts` with:

```ts
import { merge, tree, type Parts } from '../kit';
import { rng } from '../../rng';

/** Hedges 1.5 m inside the edge of a w × d outdoor scene, with a tree line just outside them. */
export function edges(w: number, d: number, seed = 907): Parts {
  const HX = w / 2 - 1.5;
  const HZ = d / 2 - 1.5;
  const r = rng(seed);
  const trees: Partial<Parts>[] = [];
  const add = (x: number, z: number) => {
    const t = tree(x + (r() - 0.5) * 1.5, z + (r() - 0.5) * 1.5, 0.9 + r() * 0.5, r() < 0.5 ? 'pine' : 'tree');
    trees.push({ decor: t.decor }); // outside the play area: no colliders needed
  };
  for (let x = -(w / 2 + 2); x <= w / 2 + 2; x += 3.2) for (const z of [-HZ - 2.5, -HZ - 5.5, HZ + 2.5, HZ + 5.5]) add(x, z);
  for (let z = -HZ - 0.5; z <= HZ + 0.5; z += 3.2) for (const x of [-(w / 2 + 1), -(w / 2 + 4), w / 2 + 1, w / 2 + 4]) add(x, z);
  return merge(...trees, {
    decor: [
      { kind: 'hedge', x: 0, z: -HZ, w: HX * 2 + 1, d: 1 },
      { kind: 'hedge', x: 0, z: HZ, w: HX * 2 + 1, d: 1 },
      { kind: 'hedge', x: -HX, z: 0, w: 1, d: HZ * 2 - 1 },
      { kind: 'hedge', x: HX, z: 0, w: 1, d: HZ * 2 - 1 },
    ],
    colliders: [
      { x: 0, z: -HZ, w: HX * 2, d: 1 },
      { x: 0, z: HZ, w: HX * 2, d: 1 },
      { x: -HX, z: 0, w: 1, d: HZ * 2 },
      { x: HX, z: 0, w: 1, d: HZ * 2 },
    ],
  });
}
```

(For 150 × 130 this reproduces the old constants exactly: HX 73.5, HZ 63.5, tree x from −77 to 77, side columns at ±76/±79.)

- [ ] **Step 4: Town: theme export, gate door, spawn, signpost**

In `shared/scenes/town.ts`:

1. Change the import to `import { edges } from './town/edges';` (unchanged name) and the `placed` line to use `edges(150, 130)`:

```ts
const placed = merge(shift(merge(base, meadows(base, water.outline)), 0, TOWN_DZ), edges(150, 130));
```

2. Add the street constant and the gate parts after `const zones = …`:

```ts
/** The main street's z in final town coordinates (the gate to the village sits at its east end). */
export const TOWN_STREET_Z = 1.5 + TOWN_DZ;
const gate: Decor[] = [
  { kind: 'gate', x: 73.5, z: TOWN_STREET_Z, rot: Math.PI / 2, label: 'Village' },
  { kind: 'signpost', x: 66, z: TOWN_STREET_Z - 2.6, label: 'Village|Studio' },
];
const gateColliders: Box[] = [{ x: 66, z: TOWN_STREET_Z - 2.6, w: 0.3, d: 0.3 }];
```

(add `import type { Box } from '../geometry';` at the top.)

3. Extract the theme so the village can share it. Replace the inline `theme: { … }` in `export const town` with `theme: OUTDOOR_THEME,` and add above `export const town`:

```ts
export const OUTDOOR_THEME: Theme = {
  indoor: false,
  floor: '#9fd38a',
  floorAccent: '#8cc77a',
  background: ['#9fd0f2', '#fde9d6'],
  fog: { color: '#fbe7d4', near: 34, far: 78 },
  hemi: { sky: '#fff3e0', ground: '#7fae6a', intensity: 1.7 },
  sun: { color: '#fff0d6', intensity: 2.4, x: 12, y: 22, z: 10 },
};
```

(add `Theme` to the type import from `./types`.)

4. Wire the gate into the scene object:

```ts
  decor: [...paths, ...zones.decor, ...gate, ...grass, ...rocks],
  colliders: [...zones.colliders, ...gateColliders],
  …
  doors: [...doors, { id: 'to-village', box: { x: 72.4, z: TOWN_STREET_Z, w: 1.4, d: 2.4 }, toScene: 'village', toSpawn: 'gate' }],
  spawns: [...spawns, { id: 'from-village', x: 70.4, z: TOWN_STREET_Z, facing: -Math.PI / 2 }],
```

- [ ] **Step 5: Run the scene tests**

Run: `npx vitest run shared/scenes/scenes.test.ts`
Expected: the gate test PASSES; only `every kind of toy is somewhere` still fails (studio comes next). `npm run typecheck` clean.

- [ ] **Step 6: Commit**

```bash
git add shared/scenes/town/edges.ts shared/scenes/town.ts shared/scenes/scenes.test.ts
git commit -m "feat: hedge edges for any map size and a village gate on the east street"
```

---

> **Format note (user asked to save tokens):** tasks 4–16 are written tersely — exact names, numbers and tests, code only where it isn't obvious from the codebase. Follow existing patterns (`cafe.ts`/`library.ts` for scenes, `NotesBoard` for modals, `world.gifts.test.ts` for server tests). Ponytail rules apply.

### Task 4: Studio scene (static)

**Create** `shared/scenes/studio.ts`; **modify** `shared/scenes/index.ts` (`SCENES = { town, library, cafe, studio }`).

- Indoor 16 × 12, theme: floor `#d9c8b4` / `#cbb59d`, background `#3b3140`, fog null, hemi `{sky '#fff3e6', ground '#a78a74', 1.05}`, sun `{'#ffe9cf', 1.45, x -4, y 12, z 8}`, wall `#fbf3e4`, trim `#b07f5a`.
- `export const GALLERY_FRAMES: Spot[]` = 16 wall spots `g0..g15`: x ∈ `[-6.3,-4.5,-2.7,-0.9,0.9,2.7,4.5,6.3]`, y 2.35 (g0–7) and 1.3 (g8–15), z −5.86, rot 0, kind `'wall'`.
- decor: `galleryWall` `{x 0, z -5.92, w 15}`; `sign` `{x 0, z -5.9, y 2.95, label '🎨 the gallery'}`; `rug` `{x 0, z 0.6, w 12, d 3.2, color '#f4e3cf', accent '#e9d2b8'}`; `pendant` ×3 at the easels (y 2.3); `stool` beside each easel (+1.2 z); `plant()` at (±7.3, −4.8) and (±7.3, 4.8).
- toys: `simpleToy('gallery','gallery', 0, -4.6, 3)`; `simpleToy('easel-1','easel', -4.5, 0.2, 1.6, {x -4.5, z 0.2, w .9, d .9})`, `easel-2` at (0, 1.0), `easel-3` at (4.5, 0.2).
- door `to-village` `{x 0, z 5.6, w 1.6, d .8}` → `village` / `studio-door`; spawn `entrance` (0, 4.4, facing π). `name: 'Studio'`, `where: 'in the Studio'`.
- Test: `scenes.test.ts` now fully passes (`every kind of toy is somewhere`). Commit `feat: the art studio scene`.

### Task 5: Village + cabin scenes and the SceneBook

**Create** `shared/scenes/village.ts`, `shared/scenes/cabin.ts`, `shared/scenes/book.ts`, test `shared/scenes/village.test.ts`.

`villageScene(roster: CabinEntry[]): SceneDef` (id `village`, name `Village`, where `in the village`, theme `OUTDOOR_THEME`):
- `size = villageSize(n)`, `hd = size.d/2`, `rowZ(r) = hd - 18 - 12r`. Parts: `edges(size.w, size.d)`; lane `path {x 0, z 0, w 3, d size.d-4}`; studio spur `path {x -7, z hd-6.9, w 14, d 2}`; `building(-14, hd-11, 10, 7, 4, '#fbf3e4', '#b07f5a', 'Studio')`; `gate {x 0, z hd-1.5, label 'Town'}`; `signpost {x 2.4, z hd-6, label 'Studio|Cabins'}` (+0.3 collider).
- doors: `to-town {x 0, z hd-2.6, w 2.4, d 1.2}` → `town`/`from-village`; `to-studio {x -14, z hd-6.9, w 1.4, d .8}` → `studio`/`entrance`. spawns: `gate (0, hd-4.2, π)`, `studio-door (-14, hd-5.8, 0)`.
- per row r: footpath `path {x 0, z rowZ, w 50, d 2}`, `lampPost(±2.2, rowZ+1.6)`, `tree(±22.5, rowZ-8, 1.1)`. Per lot k = 6r+c, x = `LOT_XS[c]`, z = `rowZ - 4.5`:
  - occupied (`roster.find(lot === k)`): `cabin {x, z, w 5, d 4.5, h 2.6, color look.wall, accent look.roof, label: (locked ? '🔒 ' : '') + name, seed: seedOf(owner)}`; collider 5 × 4.5; `flowers` at (x∓1.9, z+2.6); door `cabin-<owner> {x, z+2.8, w 1.4, d .8}` → `cabinSceneId(owner)`/`entrance`; spawn `lotSpawn(k)` at (x, z+3.6, facing 0).
  - empty: `flowers` ×2, `bush`, `signpost {x+1.6, z+1.9, label 'free lot'}` + collider.
- life: butterflies `(0,0,r 20,10)`, birds `(0, hd-10, r 8, 4)`.

`cabinScene(e: CabinEntry): SceneDef` (id `cabinSceneId(e.owner)`, name `${e.name}'s cabin`, where `at ${e.name}'s cabin`, 7 × 6, indoor; theme like the café but `wall: look.wall`, `trim: look.roof`, floor `#d8b58f`/`#c9a47f`):
- `studyDesk(`${id}-desk`, -1.9, -1.6, ['north'])`, `plant(±3.1, 2.4)`, `bed {x 2.3, z -1.9, w 1.2, d 2, seed}` (+collider), `rug {0, 0.6, 2.4×2, color look.roof, accent look.wall}`, `window {x 1.9, z -2.95, w 1.4, y 0, color '#9fc8e8'}` + `sunbeam`, `stringLights {0, -2.85, y 2.8, w 6.5}`, `shelf {x 3.28, z -0.3, y 1.3, rot -π/2, w 1.3}` and `{… z 1.6 …}`, `sign {x -1.2, z -2.92, y 2.6, label name's cabin}`.
- `export const CABIN_SPOTS: Spot[]`: wall `w1 (-2.4, -2.93, y 1.85, rot 0)`, `w2 (-0.8, …)`, `w3 (0.6, …)`, `w4 (-3.43, -1.6, y 1.85, rot π/2)`, `w5 (-3.43, 0.4, y 1.65, π/2)`, `w6 (-3.43, 2.0, y 1.9, π/2)`; shelf `s1 (3.2, -0.65, y 1.3, -π/2)`, `s2 (3.2, 0.05)`, `s3 (3.2, 1.25)`, `s4 (3.2, 1.95)`.
- door `to-village {0, 2.6, 1.6×.8}` → `village`/`lotSpawn(e.lot)`; spawn `entrance (0, 1.6, π)`.

`SceneBook` (`shared/scenes/book.ts`): `constructor(fixed = SCENES)`, `version = 0`, `setRoster(r)` (clears memo, `version++`), `get(id)` (fixed → memo → `village` / `cabin:*` built from the roster, memoised), `name(id)` (`get(id)?.name ?? id`). Keep `getScene` in `index.ts` only if still imported; otherwise delete it.

Tests (`village.test.ts`): run the scene invariants from `scenes.test.ts` (slots inside bounds/outside colliders, toys reachable, spawns clear of colliders and doors, doors inside bounds) over `villageScene` for rosters of 0, 1, 6 and 7 entries and `cabinScene` for one entry; `rows` grow 1→2→3 and the gate spawn stays inside; every occupied lot has a door + spawn and every empty one a `free lot` signpost; `SceneBook.get('cabin:x')` is undefined until the roster has `x`, memo invalidates on `setRoster`. Commit `feat: village and cabin scenes resolved through a SceneBook`.

### Task 6: Protocol, feed kind and message validation

**Modify** `shared/protocol.ts`, `shared/types.ts` (`FeedKind` + `'art'`), `server/src/validate.ts`, `server/src/validate.test.ts`.

- `ClientMsg` += `{t:'paint'; title; price; forSale; mode: PaintMode; png: string}`, `{t:'setSale'; id; on}`, `{t:'buyPrint'; id}`, `{t:'getGallery'}`, `{t:'getPortfolio'}`, `{t:'cabin'; action:'place'; spot; item: SpotPick} | {t:'cabin'; action:'clear'; spot} | {t:'cabin'; action:'lock'; on}`.
- `ServerMsg` += `{t:'village'; cabins: CabinEntry[]}`, `{t:'gallery'; forSale: PaintingMeta[]}`, `{t:'portfolio'; mine: PaintingMeta[]; prints: PaintingMeta[]}`, `{t:'cabinState'; state: CabinState}`; `welcome.cabins: CabinEntry[]`. `ErrorCode` += `'bad_art' | 'locked' | 'bad_cabin'`.
- `parseClientMsg`: `paint` — title string, control chars → space, collapse whitespace, trim, ≤ `TITLE_MAX` code points; price integer in `PRICE_RANGE`; `forSale` boolean; `mode ∈ PAINT_MODES`; `png` string ≤ `PAINT_B64_MAX` matching `/^[A-Za-z0-9+/=]+$/`. `setSale`/`buyPrint` integer ids. `cabin` via `parseCabin` (`spot` ≤ 8 chars; `item.kind ∈ SPOT_PICK_KINDS`, integer `item.id`). Tests: one accepted and one rejected shape per message. Commit `feat: studio and cabin messages`.

### Task 7: Store tables and methods

**Modify** `server/src/db.ts` (+ `Store` interface), test `server/src/db.test.ts`.

Tables (CREATE IF NOT EXISTS, in the constructor): `cabins(owner_id PK, lot INTEGER UNIQUE, locked INTEGER NOT NULL DEFAULT 0, created_at)`, `cabin_items(owner_id, spot, kind, ref, PRIMARY KEY(owner_id, spot))`, `paintings(id PK AUTOINCREMENT, artist_id, title, price, mode, png BLOB, for_sale INTEGER, sold INTEGER DEFAULT 0, created_at)` + index on `(for_sale, id)`, `prints(painting_id, owner_id, at, PRIMARY KEY(painting_id, owner_id))`.

Methods: `addCabin(owner, lot, at)`, `cabinOf(owner): {lot, locked} | null`, `cabinCount()`, `cabins(): CabinEntry[]` (JOIN profiles for the current name, ORDER BY lot), `setCabinLocked(owner, on)`, `setCabinItem(owner, spot, kind, ref)` (upsert), `takeCabinItem(owner, spot): {kind, ref} | null`, `cabinItems(owner)`, `keepsake(owner, id): {gift, fromName, flower?} | null`, `addPainting(artist, title, price, mode, png: Buffer, forSale, at): number`, `painting(id): PaintingMeta | null`, `paintingPng(id): Buffer | null`, `forSale(): PaintingMeta[]` (newest first), `byArtist(artist)`, `prints(owner)`, `paintingCount(artist)`, `forSaleCount(artist)`, `setForSale(id, artist, on): boolean`, `ownsPainting(owner, id)` (artist or print), `buyPrint(buyer, id, pay): {ok:true; artist; price; title} | {ok:false; reason:'gone'|'own'|'owned'|'kp'}` — one BEGIN/COMMIT like `spend()`: check for_sale, not own, no print yet, `UPDATE profiles SET kp = kp - ? WHERE id = ? AND kp >= ?` (pay), credit the artist the full `price`, insert the print, `sold + 1`.

Tests: cabins get consecutive lots and names come from profiles; items upsert/take; buyPrint happy path moves KP and each refusal reason; `forSale` order. Commit `feat: store cabins, cabin items, paintings and prints`.

### Task 8: Server cabins module and world wiring

**Create** `server/src/port.ts`, `server/src/cabins.ts`, test `server/src/world.cabins.test.ts`; **modify** `server/src/world.ts`.

`Port` (what modules may ask of the world): `now()`, `send(id, msg)`, `toScene(scene, msg)`, `toAll(msg)`, `error(id, code, message)`, `feed(kind, text)`, `priceFor(id, price)`, `walletChanged(id)` (reload + push `wallet`), `bagChanged(id)` (push `bag`), `sceneOf(id)`, `nameOf(id)`. World builds it as an object literal over its private methods.

`Cabins(store, book, port)`: `ensure(ownerId, at): boolean` (creates with `lot = cabinCount()`, refreshes `book.setRoster`), `roster()`, `broadcast()` (`village`), `canEnter(playerId, sceneId)`, `sendState(owner, toId?)` (resolve items: painting via `store.painting`, keepsake via `store.keepsake`; drop stale rows), `handle(p, msg)` for `place` / `clear` / `lock` — all require `sceneOf(p) === cabinSceneId(p)`, else `bad_cabin`. `place`: spot from `CABIN_SPOTS` with matching kind (`painting`→wall; `keepsake`/`bouquet`→shelf); ownership via `ownsPainting` / `keepsake` / `takeBagItem` (kind `bouquet`, ref = flower); an occupied spot is cleared first (a bouquet goes back to the bag). `lock`: `setCabinLocked` + `book.setRoster` + `broadcast()` + `sendState`.

World: `private book = new SceneBook(scenes)`; `scene(id)` → `this.book.get(id)!`; `cabins = new Cabins(store, this.book, port)`; in `join()` after the ban check: `const fresh = this.cabins.ensure(profile.id, now)`, after the player is placed: `if (fresh) this.cabins.broadcast()`; welcome gets `cabins: this.cabins.roster()`; `enterScene`: `const target = this.book.get(door.toScene); if (!target) bad_door`; `if (!this.cabins.canEnter(p.id, target.id)) return this.error(p, 'locked', 'The door is latched 🔒')`; new `private afterEnter(p)` called at the end of `enterScene`, `placeNear` and `join` → `const o = cabinOwner(p.scene); if (o) this.cabins.sendState(o, p.id)`; dispatch `case 'cabin': return this.cabins.handle(p, msg)`.

Tests: newcomer gets lot 0, the next lot 1 and everyone receives `village`; walking the gate → village → own cabin door yields `sceneSnapshot` + `cabinState`; latch keeps a visitor out (`locked`) but not the owner, and `village` carries `locked`; place painting on `w1` / keepsake on `s1` / bag bouquet on `s2` (bag empties), clear `s2` (bag refills), wrong kind → `bad_cabin`, visitor can't place. Seed data with `store.addPainting`, `store.addKeepsake`, `store.addBagItem('…','bouquet','rose')` before joining. Commit `feat: cabins — lots on first join, latch, fixed decorating spots`.

### Task 9: Server studio module, HTTP art route

**Create** `server/src/studio.ts`, `server/src/pngFixture.ts` (`makePng(w, h): Buffer` — signature, IHDR, one zlib IDAT of white RGBA scanlines, IEND, with a tiny CRC32), tests `server/src/world.studio.test.ts`; **modify** `server/src/world.ts`, `server/src/server.ts`, `server/src/feed.ts`, `server/src/server.test.ts`.

`Studio(store, port)`: `paint(p, msg)` — must be in `studio`; rate `PAINT_GAP_MS` (Map in Studio); `Buffer.from(png, 'base64')` ≤ `PAINTING_MAX_BYTES`; `pngSize` + `sizeOk(mode, …)`; `paintingCount < PAINTINGS_MAX`; if `forSale`, `forSaleCount < FOR_SALE_MAX`; title empty → `'Untitled'`; insert; `sendPortfolio(p)`; if for sale `sendGallery` to the studio scene (`toScene`) and feed `art` `🎨 ${name} hung '${title}' in the studio`. `setSale(p, id, on)` (artist only; cap when relisting). `buyPrint(p, id)` → `store.buyPrint(p, id, priceFor(p, price))`; reasons → `bad_art` ("That one isn't for sale any more" / "That's your own painting" / "You already have a print") or `no_kp`; on success `walletChanged` buyer + artist, portfolio to buyer, gallery to the studio scene, feed `🖼️ ${buyer} bought '${title}' from ${artist} for ${price} KP`. `sendGallery(scene | id)`, `sendPortfolio(id)`.

World: `studio = new Studio(store, port)`; dispatch `paint`/`setSale`/`buyPrint`/`getGallery`/`getPortfolio`; `afterEnter`: `if (p.scene === 'studio') this.studio.sendGallery(p.id)`. `feed.ts`: add `art` and `bought` text helpers. `server.ts`: `maxPayload: 128 * 1024`; in `handler` before static: `/^\/art\/(\d+)\.png$/` → `store.paintingPng(id)` → 200 `image/png`, `cache-control: public, max-age=31536000, immutable`, else 404.

Tests: paint for sale → `gallery` to everyone in the studio, `portfolio` to the artist, feed line; second paint within 30 s refused; 4th for-sale refused; bad PNG / wrong size / 64 KB+1 refused with `bad_art`; buy moves KP (buyer −12, artist +12), repeat → owned, own → refused, poor → `no_kp`; admin buyer pays 0 and the artist still gets 12; `setSale` off/on. `server.test.ts`: after a paint over the socket, `fetch('/art/1.png')` is 200 image/png immutable; `/art/999.png` is 404. Commit `feat: the studio — paint, hang for sale, buy prints; paintings served over HTTP`.

### Task 10: Client scene book, lookups, error and village refresh

**Create** `client/src/world/book.ts` (`export const book = new SceneBook(SCENES)`); **modify** `game.ts` (`book.get`), `sceneBuilder.ts` (door label `book.name`), `hud.ts` + `admin.ts` (`book.name(p.scene)`), `minimap.ts` (`cabin` drawn like `building`, 5 × 4.5), `main.ts` (`book.setRoster(m.cabins)` on `welcome` and `village`, then `game?.onVillage()`).

Game: `SceneRuntime.version: number`; in `enter()` drop a cached runtime whose `version !== book.version` when the scene isn't in `SCENES`; `onVillage()` = if `def.id === 'village'`: `runtimes.delete('village')` and `enter({...me, x, z, facing}, remote views)`. `onError`: treat `locked` like `bad_door` while transitioning (step back, end transition) and toast the message. Typecheck + `npm test`. Commit `feat: client resolves village and cabin scenes; latched doors bounce you back`.

### Task 11: Decor builders and item meshes

**Modify** `client/src/world/decor.ts` (+ `decor.test.ts` for `shelf` and `bed`, which need no canvas); **create** `client/src/world/items.ts`; **modify** `character.ts` to import `bouquetMesh` from it.

- `cabin`: stone base, `sidingTex(d.color)` walls (w 5 × h 2.6 × d 4.5), two `tileTex(d.accent)` roof slopes (rise 1.4) + ridge + gables, door (seeded colour from `['#5f9a72','#c9705a','#e8c35a','#f2a65a','#7a8fc4','#8fd694']`) on the +z face, one window with a flower box, a `labelPlane(d.label, 0.3)` plaque above the door, a doormat. `merged()`.
- `gate`: two posts (0.22 × 2.8) 1.6 m apart, a beam, `labelPlane(d.label, 0.34)` hanging under it, two lanterns (`glow(P.lampGlow, 1.6, 'street')`).
- `galleryWall`: a pale panel (w × 2.4 × 0.04) at y 1.75 and a wooden rail at y 2.95.
- `shelf`: plank `box(w, 0.05, 0.3)` at the origin (y from `d.y`) with two brackets below.
- `bed`: frame (1.2 × 0.3 × 2) wood, mattress `#fff6ea`, pillow at −z, blanket in a seeded `P.chairs` colour.
- `items.ts`: `export { bouquetMesh }` (moved verbatim) and `giftSprite(gift: Gift): THREE.Sprite` (`textSprite(GIFTS[gift].emoji, 0.42, {bg: null, font: 64, pad: 2})`).
Commit `feat: cabin, gate, gallery wall, shelf and bed decor`.

### Task 12: Paint core (pure) with tests

**Create** `client/src/art/paintCore.ts`, `client/src/art/paintCore.test.ts`.

`PALETTE` (24 hex colours incl. `#ffffff` and `#2a2430`), `hexToRgba`, `blank(n)` (white opaque RGBA), `stamp(data, n, cx, cy, radius, rgba)` (radius 0 = one pixel), `line(data, n, x0, y0, x1, y1, radius, rgba)`, `floodFill(data, n, x, y, rgba)` (4-way, exact match, no-op on same colour), `class Undo` (max 20 snapshots: `push`, `pop`, `size`). Tests: stamp radius 0 paints exactly one pixel; line connects diagonal endpoints without gaps; flood fill stops at a border and ignores same-colour; undo caps at 20 and pops in order; palette has 24 unique entries. Commit `feat: paint core`.

### Task 13: Easel modal (paint tool)

**Create** `client/src/art/paint.ts`; **modify** `client/src/style.css`.

`openPaint(hud, onSave: (p: {title; price; forSale; mode; png}) => void)`: step 1 modal with two `.choice` buttons (`Pixel art · 32×32`, `Freehand · 256×256`); step 2 editor (wide modal): one `<canvas>` of `PAINT_SIZE[mode]` px shown at `min(80vw, 420px)` square (`image-rendering: pixelated` in pixel mode), tool buttons brush/eraser/fill, three sizes (free radii 3/7/14; pixel always 0), palette swatches, undo, clear; title input (`maxLength TITLE_MAX`), price `<input type=number min 1 max 100 value 10>`; buttons `Hang for sale`, `Keep for myself`, `Cancel`. Pointer events (`setPointerCapture`), map client coords → pixel via `getBoundingClientRect`, `Undo.push` on pointerdown, `putImageData` after each op. Export `canvas.toDataURL('image/png').split(',')[1]`; if bytes (`b64.length*3/4`) > `PAINTING_MAX_BYTES` and mode is free, redraw onto a 192 px canvas and retry once, then toast `Too detailed to save — try fewer colours`. CSS: `.paint-canvas`, `.paint-tools`, `.swatch`/`.swatch.on`, `.paint-footer`. Manual check in the browser (`npm run dev:client` + `dev:server`) on desktop and in DevTools phone mode. Commit `feat: easel paint tool (pixel and freehand)`.

### Task 14: Catalogue modal

**Create** `client/src/art/catalogue.ts`; **modify** `style.css`.

`class Catalogue(hud, wallet: () => Wallet|null, meId: () => string, send)`: `setGallery(list)`, `setPortfolio(mine, prints)`, `owned()` (mine + prints), `show(tab: 'sale' | 'mine')` (sends `getGallery` + `getPortfolio`, wide modal, re-renders on updates while open like `NotesBoard`). Tiles `.art-tile`: `<img src=artUrl(id)>` (`.pixel` → `image-rendering: pixelated`), title, `by name · sold ×N`; Buy button label `${price} ✨` (admin: `free`), disabled/relabelled `yours` / `owned` / unaffordable; Mine tab: own paintings with a `For sale` toggle (`setSale`) and the count `n/3 for sale`, then `Prints you own`. Commit `feat: gallery catalogue and portfolio`.

### Task 15: Art views, spot targets, latch button, game wiring

**Create** `client/src/art/views.ts`; **modify** `client/src/game/interaction.ts` (+ test), `game.ts`, `hud.ts`.

- `Pictures(frames: Spot[], size = 0.8)`: per frame a wooden border + a `MeshBasicMaterial` plane; `set(items: {id; painting: PaintingMeta|null}[])` loads `artUrl` with `TextureLoader` (sRGB; `NearestFilter` for pixel), caches by painting id, hides the plane when null. `Shelves(spots)`: `set(items: CabinItem[])` → `giftSprite` / `bouquetMesh` (scaled 2.2) at `(x, y + 0.05, z)`.
- `pickTarget(..., others, spots: {spot: Spot; prompt: string}[] = [])` → new `Target` kind `'spot'` within `SPOT_RADIUS`; test: a spot in range wins over a farther toy, out of range ignored.
- Game: `SceneRuntime.pictures/shelves`; create them in `enter()` for `studio` (`GALLERY_FRAMES`) and for scenes with `spots`; fields `gallery: PaintingMeta[]`, `cabinState: CabinState | null`; messages `gallery` → `applyGallery()` (first 16 onto the frames), `cabinState` (owner matches `cabinOwner(def.id)`) → `applyCabin()`; `mySpots()` only when `cabinOwner(def.id) === me.id`; `spotPrompt`: filled → `[E] take down the ${itemLabel(it)}`, empty wall → `[E] hang a painting here`, empty shelf → `[E] put something on the shelf`; `interact()` on a `spot`: filled → send `cabin clear`, empty → `this.onSpot(spot)` (public hook); `promptText()` returns `t.prompt` for spots too.
- Latch: `Hud.latch: boolean | null`, `onToggleLatch`, a `🔒/🔓` mini button in `setStatus` (add `latch` to the key); Game sets `hud.latch` each frame (own cabin → `cabinState.locked`, else null) and wires `onToggleLatch` → `cabin lock !locked`.
Commit `feat: gallery frames, cabin walls and shelves in 3D; spot prompts; door latch`.

### Task 16: Spot picker, main.ts wiring, polish, full verification

**Create** `client/src/art/cabinPanel.ts`; **modify** `client/src/main.ts`, `README.md` (one paragraph: village, cabins, studio, KP for prints).

- `openSpotPicker(hud, spot, {paintings, keepsakes, bouquets: BagItem[], pick: (item: SpotPick) => void})`: wall → painting thumbnails; shelf → keepsakes (emoji + from) then bouquets; empty state text per kind.
- main.ts: `const catalogue = new Catalogue(…)`; `gallery`/`portfolio` messages → catalogue; on `welcome` also `conn.send({t:'getPortfolio'})`; `onLocalToy`: `easel` → `openPaint(hud, p => conn.send({t:'paint', ...p}))`, `gallery` → `catalogue.show('sale')`; `game.onSpot = (spot) => openSpotPicker(hud, spot, {paintings: catalogue.owned(), keepsakes: game.myView()?.keepsakes ?? [], bouquets: bag.filter(i => i.kind === 'bouquet'), pick: item => conn.send({t:'cabin', action:'place', spot: spot.id, item})})`.
- Verify: `npm run typecheck`, `npm test`, `npm run build`; run locally and walk: town → gate → village (empty lots + your cabin) → studio (paint pixel + freehand, hang, buy with a second browser profile) → cabin (hang, shelve, latch; visitor bounced). Check phone layout (`?touch`).
- Final review per [[no-per-step-reviews]]: `/pstack:thermo-nuclear-code-quality-review` on `main...HEAD` (or read its SKILL.md and apply it), fix findings, then push to `main` and deploy to gpu-sys with the `data.db` backup (see memory `studyverse-status`).
Commit `feat: cabin spot picker and studio wiring`.
