# Virtual Study World: Core Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cozy top-down 3D multiplayer browser town (Town, Library, Café) where friends walk with WASD, sit at desks, and run individual Pomodoro sessions that everyone can see. Early quits are announced in a shared feed.

**Architecture:** One Node process serves the built client and a WebSocket endpoint (`/ws`). It keeps all live state in memory (`World`) and saves profiles to SQLite through `node:sqlite`. The pure game logic (sessions, feed, world rules, geometry, scene data) has no I/O and is unit-tested directly. The browser client uses Vite, TypeScript, and Three.js, and every mesh is built procedurally from primitives (no art assets). Scene layouts live in `shared/` as data, so the client and server agree on seats, doors, and colliders.

**Tech Stack:** Node ≥ 24 (dev machine has v26), TypeScript, `ws`, `node:sqlite`, `tsx` (runs the server), Vite, Three.js, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-08-virtual-study-world-core-design.md`. Every task implicitly includes it.
- **The dev machine is a fanless MacBook Air.** Run only quick tests, typechecks, and builds. No long-running or CPU-heavy jobs. Do not copy anything to or run anything on `fox` without asking the user first.
- Disconnect grace: **60 s**. Rain cloud: **3 min**. Focus **1–120 min**, break **1–30 min**. Presets **25/5** and **50/10**.
- Names: **1–16 characters** after trimming and collapsing whitespace. Duplicates are allowed.
- Hats: `none`, `beanie`, `cap`, `bucket`, `flower`.
- Feed: the server keeps **50** events and sends the latest **10** on `welcome`. The HUD shows the last **6** and fades each one after **30 s**.
- Feed copy, exactly:
  - `🌷 {name} arrived`
  - `👋 {name} headed home`
  - `📚 {name} started a {n} min session {where}`
  - `✨ {name} finished a {n} min session!`
  - `🥀 {name} left {m} min into a {n} min session`
  - `🥀 {name} disconnected and didn't come back, {m} min into a {n} min session`
  - `{a} cheered {b} {emoji}`
- The invite code comes from the `INVITE_CODE` environment variable. The server refuses to start without it.
- Only a SHA-256 hash of each token is stored. Tokens are 32 random bytes in hex.
- Imports between folders use relative paths (`../../shared/...`). There are no path aliases or workspaces.
- Coordinates: Three.js y-up. The ground is the x/z plane, and +z points toward the camera (down the screen). `facing` is in radians, `facing = atan2(dx, dz)`, and 0 means facing +z.

---

## File Map

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, .gitignore, README.md
shared/
  constants.ts        tunable numbers (grace, speeds, radii, feed sizes)
  types.ts            Look, Hat, Anim, Session, PlayerView, FeedEvent, OnlineEntry, EmoteKind
  looks.ts            HATS, HAT_LABELS, BODY_COLORS, SKIN_TONES, DEFAULT_LOOK
  geometry.ts         Box, Bounds, inBox, clampToBounds, moveWithCollision, dist
  protocol.ts         ClientMsg, ServerMsg, ErrorCode
  scenes/types.ts     SceneDef, Seat, Door, Spawn, Decor, DecorKind, Theme
  scenes/kit.ts       helpers that return decor + colliders + seats (studyDesk, cafeTable, bench, ...)
  scenes/town.ts, library.ts, cafe.ts
  scenes/index.ts     SCENES, START_SCENE, START_SPAWN, getScene, findSeat
server/src/
  validate.ts         parseClientMsg, isLook, cleanName
  db.ts               ProfileStore (node:sqlite)
  sessions.ts         pure Pomodoro state machine
  feed.ts             Feed ring buffer + feedText copy
  world.ts            World: all game rules, transport-agnostic (Conn interface)
  server.ts           startServer: HTTP static + /ws + auth + tick loop
  index.ts            env → startServer
client/
  index.html
  src/main.ts         boot: join/auth flow, wires Connection ↔ Game ↔ Hud
  src/style.css
  src/net/connection.ts   WebSocket with backoff reconnect
  src/net/interp.ts       remote-player interpolation + snapping
  src/game/clock.ts       server clock offset
  src/game/interaction.ts pickTarget (nearest seat / player)
  src/game/input.ts       keyboard
  src/game/cameraRig.ts   fixed-angle follow camera
  src/game/transition.ts  fade overlay
  src/game/game.ts        orchestrator: scenes, players, movement, doors, frame loop
  src/world/palette.ts, rng.ts, materials.ts, text.ts
  src/world/decor.ts      procedural mesh builders per DecorKind
  src/world/sceneBuilder.ts SceneDef → THREE.Scene (lights, floor, walls, decor)
  src/world/character.ts  goofy character + animation
  src/world/overhead.ts   progress ring, rain cloud, emotes
  src/hud/dom.ts          tiny h() element helper
  src/hud/format.ts       formatClock, sessionLeftMs, statusText
  src/hud/hud.ts          panels, feed, prompt, toasts, modals, player card
  src/hud/joinScreen.ts   invite code + name + look picker
  src/hud/chime.ts        WebAudio chime
```

Tests sit next to the code as `*.test.ts`.

---

### Task 1: Project scaffold and shared foundations (types, constants, looks, geometry)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`
- Modify: `.gitignore` (already exists from the spec commit; verify its contents)
- Create: `shared/constants.ts`, `shared/types.ts`, `shared/looks.ts`, `shared/geometry.ts`
- Test: `shared/geometry.test.ts`

**Interfaces:**
- Produces:
  - `inBox(b: Box, x: number, z: number, pad = 0): boolean`
  - `clampToBounds(x, z, r, bounds: Bounds): {x, z}`
  - `moveWithCollision(x, z, dx, dz, r, colliders: Box[], bounds: Bounds): {x, z}`
  - `dist(ax, az, bx, bz): number`
  - all types in `shared/types.ts`, all constants in `shared/constants.ts`, and `HATS`, `HAT_LABELS`, `BODY_COLORS`, `SKIN_TONES`, `DEFAULT_LOOK`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "virtual-study-world",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev:server": "INVITE_CODE=${INVITE_CODE:-cozy} tsx watch server/src/index.ts",
    "dev:client": "vite",
    "build": "vite build",
    "start": "tsx server/src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install three ws tsx && npm install -D typescript vite vitest @types/three @types/ws @types/node`
Expected: installs without errors, and `package.json` now lists `dependencies` and `devDependencies`.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["shared", "server", "client/src", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
});
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'client/src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 6: Verify `.gitignore`**

Run: `cat .gitignore`
Expected: it contains `node_modules/`, `dist/`, `*.db`, `.env`, `.DS_Store`. Add any that are missing.

- [ ] **Step 7: Create `shared/constants.ts`**

```ts
export const GRACE_MS = 60_000;            // disconnect grace before counting as gone
export const RAIN_MS = 3 * 60_000;         // rain cloud after an early quit
export const FOCUS_RANGE = [1, 120] as const;
export const BREAK_RANGE = [1, 30] as const;
export const NAME_MAX = 16;
export const FEED_KEEP = 50;
export const FEED_ON_WELCOME = 10;
export const MOVE_SPEED = 3.2;             // m/s, local player walking speed
export const MAX_SPEED = 12;               // m/s, server ignores moves faster than this
export const PLAYER_RADIUS = 0.3;
export const SEAT_RADIUS = 1.2;            // how close you must be to sit
export const INTERACT_RADIUS = 1.5;        // how close you must be to open a player card
export const DOOR_PAD = 1.0;               // server-side slack when checking door proximity
export const CHEER_FEED_COOLDOWN_MS = 5_000;
```

- [ ] **Step 8: Create `shared/types.ts`**

```ts
export type Hat = 'none' | 'beanie' | 'cap' | 'bucket' | 'flower';

/** Colors are '#rrggbb'. */
export interface Look {
  body: string;
  skin: string;
  hat: Hat;
}

export type Anim = 'idle' | 'walk' | 'sit';
export type Phase = 'focus' | 'break';

export interface Session {
  phase: Phase;
  focusMin: number;
  breakMin: number;
  /** Server epoch ms when the current phase began. */
  phaseStartedAt: number;
}

/** Everything other clients may know about a player. */
export interface PlayerView {
  id: string;
  name: string;
  look: Look;
  scene: string;
  x: number;
  z: number;
  facing: number;
  anim: Anim;
  seatId: string | null;
  session: Session | null;
  connected: boolean;
  /** Server epoch ms until which the rain cloud shows; 0 = none. */
  rainUntil: number;
}

export interface OnlineEntry {
  id: string;
  name: string;
  scene: string;
}

export type FeedKind = 'arrive' | 'leave' | 'start' | 'finish' | 'quit' | 'cheer';

export interface FeedEvent {
  kind: FeedKind;
  text: string;
  at: number;
}

export type EmoteKind = 'wave' | 'clap' | 'flex' | 'coffee';
```

- [ ] **Step 9: Create `shared/looks.ts`**

```ts
import type { Hat, Look } from './types';

export const HATS: Hat[] = ['none', 'beanie', 'cap', 'bucket', 'flower'];

export const HAT_LABELS: Record<Hat, string> = {
  none: 'No hat',
  beanie: 'Beanie',
  cap: 'Cap',
  bucket: 'Bucket hat',
  flower: 'Flower crown',
};

export const BODY_COLORS = ['#f4a6a6', '#f7c873', '#a8d8a0', '#9cc9f0', '#c9b2f2', '#f2b5d4', '#8fd3c7', '#f0e6d2'];
export const SKIN_TONES = ['#fde3cf', '#f3c9a5', '#e0ac83', '#c68a5e', '#9a6440', '#6b4329'];

export const DEFAULT_LOOK: Look = { body: '#9cc9f0', skin: '#f3c9a5', hat: 'beanie' };
```

- [ ] **Step 10: Write the failing test `shared/geometry.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { clampToBounds, dist, inBox, moveWithCollision } from './geometry';

describe('inBox', () => {
  const b = { x: 0, z: 0, w: 2, d: 1 };
  it('is true at the centre and on the edge', () => {
    expect(inBox(b, 0, 0)).toBe(true);
    expect(inBox(b, 1, 0.5)).toBe(true);
  });
  it('is false outside, unless padded', () => {
    expect(inBox(b, 1.2, 0)).toBe(false);
    expect(inBox(b, 1.2, 0, 0.3)).toBe(true);
  });
});

describe('moveWithCollision', () => {
  const bounds = { w: 10, d: 10 };
  it('moves freely in open space', () => {
    expect(moveWithCollision(0, 0, 0.5, -0.25, 0.3, [], bounds)).toEqual({ x: 0.5, z: -0.25 });
  });
  it('stops at a wall on x but keeps sliding along z', () => {
    const wall = { x: 2, z: 0, w: 1, d: 10 };
    expect(moveWithCollision(1, 0, 0.5, 0.5, 0.3, [wall], bounds)).toEqual({ x: 1, z: 0.5 });
  });
  it('clamps to the scene bounds minus the radius', () => {
    expect(moveWithCollision(4.6, 0, 1, 0, 0.3, [], bounds)).toEqual({ x: 4.7, z: 0 });
  });
});

describe('clampToBounds and dist', () => {
  it('clamps both axes', () => {
    expect(clampToBounds(-9, 9, 0.5, { w: 10, d: 4 })).toEqual({ x: -4.5, z: 1.5 });
  });
  it('measures straight-line distance', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
  });
});
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npx vitest run shared/geometry.test.ts`
Expected: FAIL, because `./geometry` cannot be resolved.

- [ ] **Step 12: Implement `shared/geometry.ts`**

```ts
/** Axis-aligned box on the ground plane: centre (x, z), full width w (along x) and depth d (along z). */
export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Scene floor, centred on the origin. */
export interface Bounds {
  w: number;
  d: number;
}

export function inBox(b: Box, x: number, z: number, pad = 0): boolean {
  return Math.abs(x - b.x) <= b.w / 2 + pad && Math.abs(z - b.z) <= b.d / 2 + pad;
}

function blocked(x: number, z: number, r: number, colliders: Box[]): boolean {
  return colliders.some((b) => Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r);
}

export function clampToBounds(x: number, z: number, r: number, bounds: Bounds): { x: number; z: number } {
  const hx = bounds.w / 2 - r;
  const hz = bounds.d / 2 - r;
  return { x: Math.max(-hx, Math.min(hx, x)), z: Math.max(-hz, Math.min(hz, z)) };
}

/** Moves a circle of radius r, resolving each axis separately so it slides along walls. */
export function moveWithCollision(
  x: number,
  z: number,
  dx: number,
  dz: number,
  r: number,
  colliders: Box[],
  bounds: Bounds,
): { x: number; z: number } {
  let nx = x;
  let nz = z;
  if (dx !== 0 && !blocked(x + dx, nz, r, colliders)) nx = x + dx;
  if (dz !== 0 && !blocked(nx, z + dz, r, colliders)) nz = z + dz;
  return clampToBounds(nx, nz, r, bounds);
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
```

- [ ] **Step 13: Run the tests and the typecheck**

Run: `npx vitest run shared/geometry.test.ts && npx tsc --noEmit`
Expected: 7 tests pass and the typecheck prints no errors.

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts .gitignore shared
git commit -m "feat: scaffold project with shared types, constants and collision geometry"
```

---

### Task 2: Scene data (Town, Library, Café) with layout validation

**Files:**
- Create: `shared/scenes/types.ts`, `shared/scenes/kit.ts`, `shared/scenes/town.ts`, `shared/scenes/library.ts`, `shared/scenes/cafe.ts`, `shared/scenes/index.ts`
- Test: `shared/scenes/scenes.test.ts`

**Interfaces:**
- Consumes: `Box`, `Bounds`, and `inBox` from `shared/geometry.ts`, and `PLAYER_RADIUS` from `shared/constants.ts`
- Produces:
  - `SceneDef`, `Seat`, `Door`, `Spawn`, `Decor`, `DecorKind`, `Theme`
  - `SCENES: Record<string, SceneDef>`, `START_SCENE = 'town'`, `START_SPAWN = 'start'`
  - `getScene(id): SceneDef | undefined`, `findSeat(sceneId, seatId): Seat | undefined`
- Known IDs used by later tasks and tests:
  - Town seat `park-b1-a` at (5.55, 5)
  - Town door `to-library`, box centre (-9, -5.6); Town door `to-cafe`, box centre (9, -5.6)
  - Library spawn `entrance` at (0, 4.2); Library door `to-town`
  - Town spawns `start` (0, 0), `from-library`, `from-cafe`
  - `where` strings: Town `in the park`, Library `in the Library`, Café `in the Café`

- [ ] **Step 1: Create `shared/scenes/types.ts`**

```ts
import type { Bounds, Box } from '../geometry';

export interface Seat {
  id: string;
  x: number;
  z: number;
  /** Direction the sitter faces (radians, 0 = +z). */
  facing: number;
  deskId: string;
}

export interface Door {
  id: string;
  box: Box;
  toScene: string;
  toSpawn: string;
}

export interface Spawn {
  id: string;
  x: number;
  z: number;
  facing: number;
}

export type DecorKind =
  | 'tree' | 'pine' | 'bush' | 'flowers' | 'lampPost' | 'bench' | 'path' | 'building' | 'pond'
  | 'desk' | 'chair' | 'deskLamp' | 'bookshelf' | 'rug' | 'plant' | 'window' | 'sign'
  | 'cafeTable' | 'stool' | 'counter' | 'coffeeMachine' | 'cup';

/** Visual-only object. Size fields mean different things per kind (see client/src/world/decor.ts). */
export interface Decor {
  kind: DecorKind;
  x: number;
  z: number;
  y?: number;
  rot?: number;
  w?: number;
  d?: number;
  h?: number;
  color?: string;
  accent?: string;
  label?: string;
  seed?: number;
}

export interface Theme {
  indoor: boolean;
  floor: string;
  floorAccent: string;
  /** Solid colour, or [top, bottom] sky gradient. */
  background: string | [string, string];
  fog: { color: string; near: number; far: number } | null;
  hemi: { sky: string; ground: string; intensity: number };
  sun: { color: string; intensity: number; x: number; y: number; z: number };
  wall?: string;
  trim?: string;
}

export interface SceneDef {
  id: string;
  name: string;
  /** Used in the feed: "started a 25 min session in the park". */
  where: string;
  size: Bounds;
  theme: Theme;
  colliders: Box[];
  seats: Seat[];
  doors: Door[];
  spawns: Spawn[];
  decor: Decor[];
}
```

- [ ] **Step 2: Create `shared/scenes/kit.ts`**

```ts
import type { Box } from '../geometry';
import type { Decor, Seat } from './types';

/** A reusable chunk of a scene: what it looks like, what blocks movement, where you can sit. */
export interface Parts {
  decor: Decor[];
  colliders: Box[];
  seats: Seat[];
}

export function merge(...ps: Partial<Parts>[]): Parts {
  const out: Parts = { decor: [], colliders: [], seats: [] };
  for (const p of ps) {
    out.decor.push(...(p.decor ?? []));
    out.colliders.push(...(p.colliders ?? []));
    out.seats.push(...(p.seats ?? []));
  }
  return out;
}

/** 1.4 x 0.8 desk with a lamp. 'north' seats sit behind the desk facing the camera (+z); 'south' seats face away. */
export function studyDesk(id: string, x: number, z: number, sides: ('north' | 'south')[] = ['north', 'south']): Parts {
  const p: Parts = {
    decor: [
      { kind: 'desk', x, z, w: 1.4, d: 0.8, seed: x * 7 + z },
      { kind: 'deskLamp', x: x + 0.5, z: z - 0.15, seed: x * 3 - z },
    ],
    colliders: [{ x, z, w: 1.4, d: 0.8 }],
    seats: [],
  };
  for (const side of sides) {
    const sz = side === 'north' ? z - 0.75 : z + 0.75;
    const facing = side === 'north' ? 0 : Math.PI;
    p.decor.push({ kind: 'chair', x, z: sz, rot: facing, seed: x * 11 + sz });
    p.seats.push({ id: `${id}-${side[0]}`, x, z: sz, facing, deskId: id });
  }
  return p;
}

/** Round café table with a stool on the west and east side, both facing the table. */
export function cafeTable(id: string, x: number, z: number): Parts {
  return {
    decor: [
      { kind: 'cafeTable', x, z },
      { kind: 'stool', x: x - 0.75, z, seed: x * 5 + z },
      { kind: 'stool', x: x + 0.75, z, seed: x * 5 - z },
      { kind: 'cup', x: x - 0.12, z: z + 0.08, y: 0.77 },
    ],
    colliders: [{ x, z, w: 0.8, d: 0.8 }],
    seats: [
      { id: `${id}-w`, x: x - 0.75, z, facing: Math.PI / 2, deskId: id },
      { id: `${id}-e`, x: x + 0.75, z, facing: -Math.PI / 2, deskId: id },
    ],
  };
}

/** Park bench running along x, two seats. facing 0 = sitters face +z (towards the camera). */
export function bench(id: string, x: number, z: number, facing: number): Parts {
  return {
    decor: [{ kind: 'bench', x, z, rot: facing }],
    colliders: [],
    seats: [
      { id: `${id}-a`, x: x - 0.45, z, facing, deskId: id },
      { id: `${id}-b`, x: x + 0.45, z, facing, deskId: id },
    ],
  };
}

export function tree(x: number, z: number, scale = 1, kind: 'tree' | 'pine' = 'tree'): Parts {
  return {
    decor: [{ kind, x, z, h: scale, seed: x * 13 + z * 7 }],
    colliders: [{ x, z, w: 0.6 * scale, d: 0.6 * scale }],
  };
}

export function lampPost(x: number, z: number): Parts {
  return { decor: [{ kind: 'lampPost', x, z }], colliders: [{ x, z, w: 0.3, d: 0.3 }] };
}

export function plant(x: number, z: number): Parts {
  return { decor: [{ kind: 'plant', x, z, seed: x * 17 + z }], colliders: [{ x, z, w: 0.5, d: 0.5 }] };
}

/** Bookshelf of width w. rot 0 faces +z (against a north wall); ±PI/2 for side walls. */
export function bookshelf(x: number, z: number, w = 2.2, rot = 0): Parts {
  const sideways = Math.abs(Math.sin(rot)) > 0.5;
  return {
    decor: [{ kind: 'bookshelf', x, z, w, rot, seed: x * 19 + z * 3 }],
    colliders: [sideways ? { x, z, w: 0.45, d: w } : { x, z, w, d: 0.45 }],
  };
}

/** Outdoor building with its door in the middle of the south (+z) face. */
export function building(x: number, z: number, w: number, d: number, h: number, color: string, accent: string, label: string): Parts {
  return {
    decor: [{ kind: 'building', x, z, w, d, h, color, accent, label }],
    colliders: [{ x, z, w, d }],
  };
}
```

- [ ] **Step 3: Create `shared/scenes/town.ts`**

```ts
import { bench, building, lampPost, merge, tree } from './kit';
import type { SceneDef } from './types';

const parts = merge(
  building(-9, -9, 8, 6, 4.2, '#f2dcc0', '#8c5a6e', 'Library'),
  building(9, -9, 7, 6, 3.6, '#f7d0c8', '#5f9a72', 'Café'),
  bench('park-b1', 6, 5, 0),
  bench('park-b2', 6, 11.5, Math.PI),
  bench('park-b3', -6, 5, 0),
  bench('park-b4', -10, 5, 0),
  tree(-16, -1, 1.1), tree(-14, 4, 0.9), tree(-17, 9, 1.2), tree(-12, 12, 1), tree(-3, 12.5, 0.9),
  tree(2.5, 13.5, 1.1), tree(12, 13, 1), tree(16, 9.5, 1.2), tree(17, 3, 0.9), tree(15.5, -1.5, 1),
  tree(-1.5, -10, 1, 'pine'), tree(1.8, -11.5, 1.2, 'pine'), tree(-17, -11, 1.3, 'pine'),
  tree(17, -11, 1.2, 'pine'), tree(15, -13.5, 1, 'pine'), tree(-15, -13.5, 0.9, 'pine'),
  lampPost(-4, -2.6), lampPost(4, -2.6), lampPost(-1.6, 6), lampPost(1.6, 10),
  {
    decor: [
      { kind: 'path', x: 0, z: -4, w: 32, d: 2 },
      { kind: 'path', x: 0, z: 5, w: 2, d: 18 },
      { kind: 'path', x: -9, z: -5.4, w: 1.6, d: 1.4 },
      { kind: 'path', x: 9, z: -5.4, w: 1.6, d: 1.4 },
      { kind: 'pond', x: 6, z: 8, w: 6, d: 4, seed: 4 },
      { kind: 'flowers', x: -12, z: -5.4, seed: 1 }, { kind: 'flowers', x: -6, z: -5.4, seed: 2 },
      { kind: 'flowers', x: 5.6, z: -5.4, seed: 3 }, { kind: 'flowers', x: 12.4, z: -5.4, seed: 4 },
      { kind: 'flowers', x: -8, z: 7.5, seed: 5 }, { kind: 'flowers', x: 3, z: 6.5, seed: 6 },
      { kind: 'bush', x: -13.5, z: -5.6, seed: 7 }, { kind: 'bush', x: 13, z: -5.6, seed: 8 },
      { kind: 'bush', x: 9.5, z: 10.5, seed: 9 }, { kind: 'bush', x: -4, z: 9, seed: 10 },
    ],
    colliders: [{ x: 6, z: 8, w: 5, d: 3 }],
  },
);

export const town: SceneDef = {
  id: 'town',
  name: 'Town',
  where: 'in the park',
  size: { w: 40, d: 30 },
  theme: {
    indoor: false,
    floor: '#9fd38a',
    floorAccent: '#8cc77a',
    background: ['#9fd0f2', '#fde9d6'],
    fog: { color: '#fbe7d4', near: 30, far: 70 },
    hemi: { sky: '#fff3e0', ground: '#7fae6a', intensity: 1.7 },
    sun: { color: '#fff0d6', intensity: 2.4, x: 12, y: 22, z: 10 },
  },
  ...parts,
  doors: [
    { id: 'to-library', box: { x: -9, z: -5.6, w: 1.4, d: 0.8 }, toScene: 'library', toSpawn: 'entrance' },
    { id: 'to-cafe', box: { x: 9, z: -5.6, w: 1.4, d: 0.8 }, toScene: 'cafe', toSpawn: 'entrance' },
  ],
  spawns: [
    { id: 'start', x: 0, z: 0, facing: 0 },
    { id: 'from-library', x: -9, z: -3.6, facing: 0 },
    { id: 'from-cafe', x: 9, z: -3.6, facing: 0 },
  ],
};
```

- [ ] **Step 4: Create `shared/scenes/library.ts`**

```ts
import { bookshelf, merge, plant, studyDesk } from './kit';
import type { SceneDef } from './types';

const parts = merge(
  studyDesk('lib-1', -5.5, -2), studyDesk('lib-2', -2.5, -2), studyDesk('lib-3', 2.5, -2), studyDesk('lib-4', 5.5, -2),
  studyDesk('lib-5', -5.5, 1.8), studyDesk('lib-6', -2.5, 1.8), studyDesk('lib-7', 2.5, 1.8), studyDesk('lib-8', 5.5, 1.8),
  bookshelf(-6, -5.6), bookshelf(-3, -5.6), bookshelf(3, -5.6), bookshelf(6, -5.6),
  bookshelf(-7.6, 0, 3, Math.PI / 2), bookshelf(7.6, 0, 3, -Math.PI / 2),
  plant(-7.3, -4.3), plant(7.3, -4.3), plant(-7.3, 4.6), plant(7.3, 4.6),
  {
    decor: [
      { kind: 'window', x: 0, z: -5.95, w: 2.2, y: 0 },
      { kind: 'rug', x: 0, z: -0.1, w: 2.4, d: 7.5, color: '#d98c8c', accent: '#f2c4b0' },
      { kind: 'sign', x: 0, z: -5.92, y: 2.55, label: 'shhh… studying 📚' },
    ],
  },
);

export const library: SceneDef = {
  id: 'library',
  name: 'Library',
  where: 'in the Library',
  size: { w: 16, d: 12 },
  theme: {
    indoor: true,
    floor: '#c99f78',
    floorAccent: '#b88e69',
    background: '#3d2f3a',
    fog: null,
    hemi: { sky: '#fff2e0', ground: '#a07a5a', intensity: 1.8 },
    sun: { color: '#ffe2b8', intensity: 1.6, x: 6, y: 12, z: 8 },
    wall: '#f0dcc4',
    trim: '#b07f5a',
  },
  ...parts,
  doors: [{ id: 'to-town', box: { x: 0, z: 5.6, w: 1.6, d: 0.8 }, toScene: 'town', toSpawn: 'from-library' }],
  spawns: [{ id: 'entrance', x: 0, z: 4.2, facing: Math.PI }],
};
```

- [ ] **Step 5: Create `shared/scenes/cafe.ts`**

```ts
import { cafeTable, merge, plant } from './kit';
import type { SceneDef } from './types';

const parts = merge(
  cafeTable('cafe-1', -4.5, -0.5), cafeTable('cafe-2', -1.5, -0.5), cafeTable('cafe-3', 1.5, -0.5), cafeTable('cafe-4', 4.5, -0.5),
  cafeTable('cafe-5', -4.5, 2.6), cafeTable('cafe-6', 4.5, 2.6),
  plant(-6.4, -4.4), plant(6.4, -4.4), plant(6.4, 4.4), plant(-6.4, 4.4),
  {
    decor: [
      { kind: 'counter', x: -1, z: -3.6, w: 6, d: 0.9 },
      { kind: 'coffeeMachine', x: -2.8, z: -3.65, y: 1.06 },
      { kind: 'cup', x: -1.6, z: -3.5, y: 1.06 }, { kind: 'cup', x: -1.35, z: -3.7, y: 1.06 },
      { kind: 'sign', x: -1, z: -4.92, y: 2.3, label: '☕ MENU ☕' },
      { kind: 'window', x: 4.2, z: -4.95, w: 2, y: 0 },
      { kind: 'rug', x: 0, z: 2.6, w: 3, d: 2, color: '#e8b4a8', accent: '#f7dcd2' },
    ],
    colliders: [{ x: -1, z: -3.6, w: 6, d: 0.9 }],
  },
);

export const cafe: SceneDef = {
  id: 'cafe',
  name: 'Café',
  where: 'in the Café',
  size: { w: 14, d: 10 },
  theme: {
    indoor: true,
    floor: '#e8c9a8',
    floorAccent: '#dab691',
    background: '#3f2e33',
    fog: null,
    hemi: { sky: '#fff0e6', ground: '#b08a70', intensity: 1.8 },
    sun: { color: '#ffe6c8', intensity: 1.5, x: -5, y: 12, z: 8 },
    wall: '#f6d6cf',
    trim: '#9c6b55',
  },
  ...parts,
  doors: [{ id: 'to-town', box: { x: 0, z: 4.6, w: 1.6, d: 0.8 }, toScene: 'town', toSpawn: 'from-cafe' }],
  spawns: [{ id: 'entrance', x: 0, z: 3.4, facing: Math.PI }],
};
```

- [ ] **Step 6: Create `shared/scenes/index.ts`**

```ts
import { cafe } from './cafe';
import { library } from './library';
import { town } from './town';
import type { SceneDef, Seat } from './types';

export const SCENES: Record<string, SceneDef> = { town, library, cafe };
export const START_SCENE = 'town';
export const START_SPAWN = 'start';

export function getScene(id: string): SceneDef | undefined {
  return SCENES[id];
}

export function findSeat(sceneId: string, seatId: string): Seat | undefined {
  return SCENES[sceneId]?.seats.find((s) => s.id === seatId);
}
```

- [ ] **Step 7: Write the failing test `shared/scenes/scenes.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS } from '../constants';
import { inBox } from '../geometry';
import { findSeat, SCENES, START_SCENE, START_SPAWN } from './index';

const scenes = Object.values(SCENES);
const inside = (w: number, d: number, x: number, z: number, pad: number) =>
  Math.abs(x) <= w / 2 - pad && Math.abs(z) <= d / 2 - pad;

describe('scene data', () => {
  it('has the start scene and spawn', () => {
    expect(SCENES[START_SCENE].spawns.some((s) => s.id === START_SPAWN)).toBe(true);
  });

  it('keys match ids', () => {
    for (const [key, s] of Object.entries(SCENES)) expect(s.id).toBe(key);
  });

  it.each(scenes.map((s) => [s.id, s] as const))('%s: seats are inside bounds and outside colliders', (_id, s) => {
    for (const seat of s.seats) {
      expect(inside(s.size.w, s.size.d, seat.x, seat.z, PLAYER_RADIUS), seat.id).toBe(true);
      expect(s.colliders.some((c) => inBox(c, seat.x, seat.z, 0.05)), seat.id).toBe(false);
    }
  });

  it.each(scenes.map((s) => [s.id, s] as const))('%s: spawns are clear of colliders and doors', (_id, s) => {
    for (const sp of s.spawns) {
      expect(inside(s.size.w, s.size.d, sp.x, sp.z, PLAYER_RADIUS), sp.id).toBe(true);
      expect(s.colliders.some((c) => inBox(c, sp.x, sp.z, PLAYER_RADIUS)), sp.id).toBe(false);
      expect(s.doors.some((d) => inBox(d.box, sp.x, sp.z)), sp.id).toBe(false);
    }
  });

  it.each(scenes.map((s) => [s.id, s] as const))('%s: doors lead somewhere real and are reachable', (_id, s) => {
    for (const door of s.doors) {
      const target = SCENES[door.toScene];
      expect(target, door.id).toBeDefined();
      expect(target.spawns.some((sp) => sp.id === door.toSpawn), door.id).toBe(true);
      expect(s.colliders.some((c) => inBox(c, door.box.x, door.box.z, PLAYER_RADIUS)), door.id).toBe(false);
    }
  });

  it('seat ids are unique across all scenes', () => {
    const ids = scenes.flatMap((s) => s.seats.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has the seats later tests rely on', () => {
    const seat = findSeat('town', 'park-b1-a')!;
    expect(seat.x).toBeCloseTo(5.55);
    expect(seat.z).toBe(5);
    expect(SCENES.library.seats.length).toBe(16);
    expect(SCENES.cafe.seats.length).toBe(12);
  });
});
```

- [ ] **Step 8: Run the test**

Run: `npx vitest run shared/scenes`
Expected: PASS. Scene data and its test arrive together, so there is no separate failing run. If a layout check fails, fix the coordinates in the scene file rather than loosening the test.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add shared/scenes
git commit -m "feat: add Town, Library and Café scene data with layout validation"
```

---

### Task 3: Protocol types and client-message validation

**Files:**
- Create: `shared/protocol.ts`, `server/src/validate.ts`
- Test: `server/src/validate.test.ts`

**Interfaces:**
- Consumes: types from `shared/types.ts`, `HATS` from `shared/looks.ts`, `NAME_MAX`
- Produces:
  - `ClientMsg`, `ServerMsg`, and `ErrorCode` (all message shapes below)
  - `parseClientMsg(raw: string): ClientMsg | null`
  - `isLook(v: unknown): v is Look`
  - `cleanName(v: unknown): string | null`

- [ ] **Step 1: Create `shared/protocol.ts`**

```ts
import type { Anim, EmoteKind, FeedEvent, Look, OnlineEntry, PlayerView } from './types';

export type ClientMsg =
  | { t: 'hello'; token?: string; inviteCode?: string; name?: string; look?: Look }
  | { t: 'move'; x: number; z: number; facing: number; anim: Anim }
  | { t: 'enterScene'; doorId: string }
  | { t: 'sit'; seatId: string }
  | { t: 'stand' }
  | { t: 'startSession'; focusMin: number; breakMin: number }
  | { t: 'cancelSession' }
  | { t: 'emote'; kind: EmoteKind; targetId?: string }
  | { t: 'updateLook'; look: Look };

export type ErrorCode =
  | 'bad_invite'
  | 'unknown_token'
  | 'bad_profile'
  | 'seat_taken'
  | 'bad_seat'
  | 'not_seated'
  | 'bad_session'
  | 'bad_door'
  | 'connected_elsewhere';

export type ServerMsg =
  | {
      t: 'welcome';
      you: PlayerView;
      token?: string;
      serverTime: number;
      players: PlayerView[];
      online: OnlineEntry[];
      feed: FeedEvent[];
    }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'sceneSnapshot'; scene: string; you: PlayerView; players: PlayerView[] }
  | { t: 'playerJoined'; player: PlayerView }
  | { t: 'playerLeft'; id: string }
  | { t: 'playerMoved'; id: string; x: number; z: number; facing: number; anim: Anim }
  | { t: 'playerUpdated'; player: PlayerView }
  | { t: 'emote'; fromId: string; kind: EmoteKind; targetId?: string }
  | { t: 'online'; list: OnlineEntry[] }
  | { t: 'feed'; event: FeedEvent };
```

- [ ] **Step 2: Write the failing test `server/src/validate.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { cleanName, isLook, parseClientMsg } from './validate';

const look = { body: '#aabbcc', skin: '#112233', hat: 'cap' };

describe('parseClientMsg', () => {
  it('parses a valid move and drops extra fields', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'move', x: 1, z: 2, facing: 0.5, anim: 'walk', evil: true }))).toEqual({
      t: 'move', x: 1, z: 2, facing: 0.5, anim: 'walk',
    });
  });
  it('rejects non-numeric coordinates', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'move', x: '1', z: 2, facing: 0, anim: 'walk' }))).toBeNull();
  });
  it('rejects unknown types, garbage and arrays', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'explode' }))).toBeNull();
    expect(parseClientMsg('not json')).toBeNull();
    expect(parseClientMsg('[1,2]')).toBeNull();
  });
  it('parses hello with a token or with invite + profile', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'hello', token: 'abc' }))).toEqual({ t: 'hello', token: 'abc' });
    expect(parseClientMsg(JSON.stringify({ t: 'hello', inviteCode: 'cozy', name: 'Sam', look }))).toEqual({
      t: 'hello', inviteCode: 'cozy', name: 'Sam', look,
    });
  });
  it('rejects hello with a bad look', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'hello', inviteCode: 'x', name: 'Sam', look: { ...look, hat: 'crown' } }))).toBeNull();
  });
  it('requires integer session lengths', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'startSession', focusMin: 25, breakMin: 5 }))).toEqual({ t: 'startSession', focusMin: 25, breakMin: 5 });
    expect(parseClientMsg(JSON.stringify({ t: 'startSession', focusMin: 2.5, breakMin: 5 }))).toBeNull();
  });
  it('parses emotes with an optional target', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'emote', kind: 'clap' }))).toEqual({ t: 'emote', kind: 'clap' });
    expect(parseClientMsg(JSON.stringify({ t: 'emote', kind: 'flex', targetId: 'p2' }))).toEqual({ t: 'emote', kind: 'flex', targetId: 'p2' });
    expect(parseClientMsg(JSON.stringify({ t: 'emote', kind: 'dance' }))).toBeNull();
  });
});

describe('cleanName', () => {
  it('trims and collapses whitespace', () => expect(cleanName('  Sam   the  owl ')).toBe('Sam the owl'));
  it('rejects empty and too long names', () => {
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(17))).toBeNull();
    expect(cleanName('x'.repeat(16))).toBe('x'.repeat(16));
    expect(cleanName(42)).toBeNull();
  });
});

describe('isLook', () => {
  it('accepts valid looks and rejects bad colours', () => {
    expect(isLook(look)).toBe(true);
    expect(isLook({ ...look, body: 'red' })).toBe(false);
    expect(isLook(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run server/src/validate.test.ts`
Expected: FAIL, because `./validate` cannot be resolved.

- [ ] **Step 4: Implement `server/src/validate.ts`**

```ts
import { NAME_MAX } from '../../shared/constants';
import { HATS } from '../../shared/looks';
import type { ClientMsg } from '../../shared/protocol';
import type { Anim, EmoteKind, Hat, Look } from '../../shared/types';

const ANIMS: Anim[] = ['idle', 'walk', 'sit'];
const EMOTES: EmoteKind[] = ['wave', 'clap', 'flex', 'coffee'];
const COLOR = /^#[0-9a-fA-F]{6}$/;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

export function isLook(v: unknown): v is Look {
  if (!v || typeof v !== 'object') return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.body === 'string' && COLOR.test(l.body) &&
    typeof l.skin === 'string' && COLOR.test(l.skin) &&
    HATS.includes(l.hat as Hat)
  );
}

export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.replace(/\s+/g, ' ').trim();
  return n.length >= 1 && [...n].length <= NAME_MAX ? n : null;
}

/** Turns untrusted text into a well-formed ClientMsg (fresh object, no extra fields) or null. */
export function parseClientMsg(raw: string): ClientMsg | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;

  switch (m.t) {
    case 'hello': {
      const out: Extract<ClientMsg, { t: 'hello' }> = { t: 'hello' };
      if (m.token !== undefined) {
        if (!isStr(m.token, 128)) return null;
        out.token = m.token;
      }
      if (m.inviteCode !== undefined) {
        if (!isStr(m.inviteCode, 64)) return null;
        out.inviteCode = m.inviteCode;
      }
      if (m.name !== undefined) {
        if (!isStr(m.name, 64)) return null;
        out.name = m.name;
      }
      if (m.look !== undefined) {
        if (!isLook(m.look)) return null;
        out.look = { body: m.look.body, skin: m.look.skin, hat: m.look.hat };
      }
      return out;
    }
    case 'move':
      if (!isNum(m.x) || !isNum(m.z) || !isNum(m.facing) || !ANIMS.includes(m.anim as Anim)) return null;
      return { t: 'move', x: m.x, z: m.z, facing: m.facing, anim: m.anim as Anim };
    case 'enterScene':
      return isStr(m.doorId, 64) ? { t: 'enterScene', doorId: m.doorId } : null;
    case 'sit':
      return isStr(m.seatId, 64) ? { t: 'sit', seatId: m.seatId } : null;
    case 'stand':
      return { t: 'stand' };
    case 'cancelSession':
      return { t: 'cancelSession' };
    case 'startSession':
      if (!Number.isInteger(m.focusMin) || !Number.isInteger(m.breakMin)) return null;
      return { t: 'startSession', focusMin: m.focusMin as number, breakMin: m.breakMin as number };
    case 'emote': {
      if (!EMOTES.includes(m.kind as EmoteKind)) return null;
      if (m.targetId !== undefined && !isStr(m.targetId, 64)) return null;
      const out: Extract<ClientMsg, { t: 'emote' }> = { t: 'emote', kind: m.kind as EmoteKind };
      if (m.targetId !== undefined) out.targetId = m.targetId as string;
      return out;
    }
    case 'updateLook':
      return isLook(m.look) ? { t: 'updateLook', look: { body: m.look.body, skin: m.look.skin, hat: m.look.hat } } : null;
    default:
      return null;
  }
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run server/src/validate.test.ts && npx tsc --noEmit`
Expected: all tests pass and there are no type errors.

- [ ] **Step 6: Commit**

```bash
git add shared/protocol.ts server/src/validate.ts server/src/validate.test.ts
git commit -m "feat: define wire protocol and validate client messages"
```

---
### Task 4: Profile store (node:sqlite)

**Files:**
- Create: `server/src/db.ts`
- Test: `server/src/db.test.ts`

**Interfaces:**
- Consumes: `Look`
- Produces:
  - `interface Profile { id: string; name: string; look: Look }`
  - `class ProfileStore { constructor(path: string); create(name, look, now?): { profile: Profile; token: string }; findByToken(token, now?): Profile | null; updateLook(id, look): void; close(): void }`
  - `path` may be `':memory:'`

- [ ] **Step 1: Write the failing test `server/src/db.test.ts`**

```ts
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../../shared/looks';
import { ProfileStore } from './db';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const tempDb = () => {
  const d = mkdtempSync(join(tmpdir(), 'vsw-'));
  dirs.push(d);
  return join(d, 'test.db');
};

describe('ProfileStore', () => {
  it('creates a profile and finds it again by token', () => {
    const s = new ProfileStore(':memory:');
    const { profile, token } = s.create('Sam', DEFAULT_LOOK);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(s.findByToken(token)).toEqual(profile);
    s.close();
  });

  it('returns null for an unknown token', () => {
    const s = new ProfileStore(':memory:');
    expect(s.findByToken('nope')).toBeNull();
    s.close();
  });

  it('persists profiles and look changes across reopen', () => {
    const path = tempDb();
    const a = new ProfileStore(path);
    const { profile, token } = a.create('Alex', DEFAULT_LOOK);
    a.updateLook(profile.id, { body: '#111111', skin: '#222222', hat: 'cap' });
    a.close();
    const b = new ProfileStore(path);
    expect(b.findByToken(token)).toEqual({ ...profile, look: { body: '#111111', skin: '#222222', hat: 'cap' } });
    b.close();
  });

  it('never stores the raw token', () => {
    const path = tempDb();
    const s = new ProfileStore(path);
    const { token } = s.create('Jo', DEFAULT_LOOK);
    s.close();
    const raw = readFileSync(path).toString('latin1');
    expect(raw.includes(token)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/src/db.test.ts`
Expected: FAIL, because `./db` cannot be resolved.

- [ ] **Step 3: Implement `server/src/db.ts`**

```ts
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Look } from '../../shared/types';

export interface Profile {
  id: string;
  name: string;
  look: Look;
}

interface Row {
  id: string;
  name: string;
  look_json: string;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export class ProfileStore {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      look_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )`);
  }

  create(name: string, look: Look, now = Date.now()): { profile: Profile; token: string } {
    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    this.db
      .prepare('INSERT INTO profiles (id, token_hash, name, look_json, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, hash(token), name, JSON.stringify(look), now, now);
    return { profile: { id, name, look }, token };
  }

  findByToken(token: string, now = Date.now()): Profile | null {
    const row = this.db
      .prepare('SELECT id, name, look_json FROM profiles WHERE token_hash = ?')
      .get(hash(token)) as unknown as Row | undefined;
    if (!row) return null;
    this.db.prepare('UPDATE profiles SET last_seen_at = ? WHERE id = ?').run(now, row.id);
    return { id: row.id, name: row.name, look: JSON.parse(row.look_json) as Look };
  }

  updateLook(id: string, look: Look): void {
    this.db.prepare('UPDATE profiles SET look_json = ? WHERE id = ?').run(JSON.stringify(look), id);
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/src/db.test.ts && npx tsc --noEmit`
Expected: 4 tests pass and there are no type errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/db.ts server/src/db.test.ts
git commit -m "feat: add SQLite profile store with hashed device tokens"
```

---

### Task 5: Pomodoro state machine and feed

**Files:**
- Create: `server/src/sessions.ts`, `server/src/feed.ts`
- Test: `server/src/sessions.test.ts`, `server/src/feed.test.ts`

**Interfaces:**
- Consumes: `Session`, `FeedEvent`, `FeedKind`, `FOCUS_RANGE`, `BREAK_RANGE`, `FEED_KEEP`
- Produces:
  - `validLengths(focusMin, breakMin): boolean`
  - `newSession(focusMin, breakMin, now): Session`
  - `stepSession(s, now): { session: Session | null; event: 'focusDone' | 'breakDone' | null }`
  - `elapsedMin(s, now): number`
  - `class Feed { push(kind, text, at): FeedEvent; recent(n): FeedEvent[] }`
  - `feedText.{arrive, leave, start, finish, quit, quitDisconnect, cheer}`

- [ ] **Step 1: Write the failing test `server/src/sessions.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { elapsedMin, newSession, stepSession, validLengths } from './sessions';

const MIN = 60_000;

describe('sessions', () => {
  it('validates lengths', () => {
    expect(validLengths(25, 5)).toBe(true);
    expect(validLengths(120, 30)).toBe(true);
    expect(validLengths(0, 5)).toBe(false);
    expect(validLengths(121, 5)).toBe(false);
    expect(validLengths(25, 31)).toBe(false);
    expect(validLengths(25.5, 5)).toBe(false);
  });

  it('stays in focus until the focus time is up', () => {
    const s = newSession(25, 5, 0);
    expect(stepSession(s, 25 * MIN - 1)).toEqual({ session: s, event: null });
  });

  it('moves to break exactly at the end of focus, timed from the planned end', () => {
    const s = newSession(25, 5, 0);
    expect(stepSession(s, 25 * MIN + 400)).toEqual({
      session: { phase: 'break', focusMin: 25, breakMin: 5, phaseStartedAt: 25 * MIN },
      event: 'focusDone',
    });
  });

  it('ends after the break', () => {
    const b = { phase: 'break' as const, focusMin: 25, breakMin: 5, phaseStartedAt: 25 * MIN };
    expect(stepSession(b, 30 * MIN)).toEqual({ session: null, event: 'breakDone' });
  });

  it('counts whole elapsed minutes', () => {
    expect(elapsedMin(newSession(25, 5, 0), 12 * MIN + 59_000)).toBe(12);
  });
});
```

- [ ] **Step 2: Write the failing test `server/src/feed.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Feed, feedText } from './feed';

describe('Feed', () => {
  it('keeps only the newest 50 events', () => {
    const f = new Feed();
    for (let i = 0; i < 60; i++) f.push('arrive', `e${i}`, i);
    const all = f.recent(100);
    expect(all).toHaveLength(50);
    expect(all[0].text).toBe('e10');
    expect(all[49].text).toBe('e59');
  });

  it('returns the most recent n in chronological order', () => {
    const f = new Feed();
    ['a', 'b', 'c'].forEach((t, i) => f.push('arrive', t, i));
    expect(f.recent(2).map((e) => e.text)).toEqual(['b', 'c']);
  });
});

describe('feedText', () => {
  it('matches the spec copy', () => {
    expect(feedText.arrive('Sam')).toBe('🌷 Sam arrived');
    expect(feedText.leave('Sam')).toBe('👋 Sam headed home');
    expect(feedText.start('Sam', 50, 'in the Library')).toBe('📚 Sam started a 50 min session in the Library');
    expect(feedText.finish('Sam', 50)).toBe('✨ Sam finished a 50 min session!');
    expect(feedText.quit('Sam', 12, 25)).toBe('🥀 Sam left 12 min into a 25 min session');
    expect(feedText.quitDisconnect('Sam', 12, 25)).toBe("🥀 Sam disconnected and didn't come back, 12 min into a 25 min session");
    expect(feedText.cheer('Sam', 'Alex', '💪')).toBe('Sam cheered Alex 💪');
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx vitest run server/src/sessions.test.ts server/src/feed.test.ts`
Expected: FAIL, because the modules cannot be resolved.

- [ ] **Step 4: Implement `server/src/sessions.ts`**

```ts
import { BREAK_RANGE, FOCUS_RANGE } from '../../shared/constants';
import type { Session } from '../../shared/types';

const MIN = 60_000;

export function validLengths(focusMin: number, breakMin: number): boolean {
  return (
    Number.isInteger(focusMin) && Number.isInteger(breakMin) &&
    focusMin >= FOCUS_RANGE[0] && focusMin <= FOCUS_RANGE[1] &&
    breakMin >= BREAK_RANGE[0] && breakMin <= BREAK_RANGE[1]
  );
}

export function newSession(focusMin: number, breakMin: number, now: number): Session {
  return { phase: 'focus', focusMin, breakMin, phaseStartedAt: now };
}

export type StepEvent = 'focusDone' | 'breakDone' | null;

/** Advances a session to `now`. The break starts at the planned end of focus, not at the tick that noticed it. */
export function stepSession(s: Session, now: number): { session: Session | null; event: StepEvent } {
  if (s.phase === 'focus') {
    const end = s.phaseStartedAt + s.focusMin * MIN;
    if (now < end) return { session: s, event: null };
    return { session: { ...s, phase: 'break', phaseStartedAt: end }, event: 'focusDone' };
  }
  if (now < s.phaseStartedAt + s.breakMin * MIN) return { session: s, event: null };
  return { session: null, event: 'breakDone' };
}

export function elapsedMin(s: Session, now: number): number {
  return Math.floor((now - s.phaseStartedAt) / MIN);
}
```

- [ ] **Step 5: Implement `server/src/feed.ts`**

```ts
import { FEED_KEEP } from '../../shared/constants';
import type { FeedEvent, FeedKind } from '../../shared/types';

export class Feed {
  private events: FeedEvent[] = [];

  push(kind: FeedKind, text: string, at: number): FeedEvent {
    const e: FeedEvent = { kind, text, at };
    this.events.push(e);
    if (this.events.length > FEED_KEEP) this.events.shift();
    return e;
  }

  recent(n: number): FeedEvent[] {
    return this.events.slice(-n);
  }
}

export const feedText = {
  arrive: (name: string) => `🌷 ${name} arrived`,
  leave: (name: string) => `👋 ${name} headed home`,
  start: (name: string, min: number, where: string) => `📚 ${name} started a ${min} min session ${where}`,
  finish: (name: string, min: number) => `✨ ${name} finished a ${min} min session!`,
  quit: (name: string, elapsed: number, total: number) => `🥀 ${name} left ${elapsed} min into a ${total} min session`,
  quitDisconnect: (name: string, elapsed: number, total: number) =>
    `🥀 ${name} disconnected and didn't come back, ${elapsed} min into a ${total} min session`,
  cheer: (from: string, to: string, emoji: string) => `${from} cheered ${to} ${emoji}`,
};
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run server/src/sessions.test.ts server/src/feed.test.ts && npx tsc --noEmit`
Expected: all tests pass and there are no type errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/sessions.ts server/src/sessions.test.ts server/src/feed.ts server/src/feed.test.ts
git commit -m "feat: add Pomodoro state machine and town feed"
```

---

### Task 6: World (all game rules, transport-agnostic)

**Files:**
- Create: `server/src/world.ts`
- Test: `server/src/world.test.ts`

**Interfaces:**
- Consumes:
  - `Profile` (Task 4); sessions and feed (Task 5); scenes (Task 2); geometry and constants (Task 1); `ClientMsg`, `ServerMsg`, `ErrorCode` (Task 3)
- Produces:
  - `interface Conn { send(msg: ServerMsg): void; close(code: ErrorCode): void }`
  - `class World`:
    - `constructor(now?: () => number)`
    - `join(profile, conn, newToken?)`
    - `disconnect(id, conn)`
    - `handle(id, msg: ClientMsg)`
    - `tick()`
    - `view(id): PlayerView | undefined`
- Rules (from spec §6): only seated players can start a session. Standing up or cancelling during focus is an early quit (feed message plus `rainUntil = now + RAIN_MS`). Standing during a break is free and the break keeps running. A closed socket keeps the player for `GRACE_MS`; after that, the player is removed with the disconnect-quit copy (if in focus) or the "headed home" copy. A second connection with the same profile replaces the first one, and the old connection is closed with `connected_elsewhere`.

- [ ] **Step 1: Write the failing test `server/src/world.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { GRACE_MS, RAIN_MS } from '../../shared/constants';
import { DEFAULT_LOOK } from '../../shared/looks';
import type { ClientMsg, ErrorCode, ServerMsg } from '../../shared/protocol';
import { findSeat } from '../../shared/scenes';
import { World, type Conn } from './world';

const MIN = 60_000;

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  closed: ErrorCode | null = null;
  send(m: ServerMsg) { this.msgs.push(m); }
  close(code: ErrorCode) { this.closed = code; }
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
  feed(): string[] { return this.of('feed').map((m) => m.event.text); }
}

let t: number;
let w: World;
const prof = (id: string, name: string) => ({ id, name, look: DEFAULT_LOOK });
const send = (id: string, m: ClientMsg) => w.handle(id, m);
/** Walk somewhere far away: advance the clock so the speed check allows it. */
const goTo = (id: string, x: number, z: number) => { t += 10_000; send(id, { t: 'move', x, z, facing: 0, anim: 'idle' }); };
const seat = findSeat('town', 'park-b1-a')!;
const seatB = findSeat('town', 'park-b1-b')!;
function sitDown(id: string, s = seat) { goTo(id, s.x, s.z + 0.5); send(id, { t: 'sit', seatId: s.id }); }

beforeEach(() => { t = 1_000_000; w = new World(() => t); });

describe('joining', () => {
  it('welcomes a new player in the town and tells others', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a, 'tok');
    w.join(prof('b', 'Alex'), b);
    const welcomeA = a.of('welcome')[0];
    expect(welcomeA.token).toBe('tok');
    expect(welcomeA.you).toMatchObject({ id: 'a', scene: 'town', x: 0, z: 0, connected: true });
    expect(b.of('welcome')[0].players.map((p) => p.id)).toEqual(['a']);
    expect(a.of('playerJoined')[0].player.id).toBe('b');
    expect(a.feed()).toEqual(['🌷 Sam arrived', '🌷 Alex arrived']);
    expect(a.of('online').at(-1)!.list.map((o) => o.name)).toEqual(['Sam', 'Alex']);
  });

  it('a second connection replaces the first', () => {
    const a1 = new FakeConn(), a2 = new FakeConn();
    w.join(prof('a', 'Sam'), a1);
    w.join(prof('a', 'Sam'), a2);
    expect(a1.closed).toBe('connected_elsewhere');
    w.disconnect('a', a1); // the old socket closing must not mark the player as gone
    expect(w.view('a')!.connected).toBe(true);
    expect(a2.of('welcome')).toHaveLength(1);
  });
});

describe('seats', () => {
  it('sits at a free seat and rejects a taken one', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    sitDown('a');
    expect(w.view('a')).toMatchObject({ seatId: seat.id, x: seat.x, z: seat.z, anim: 'sit' });
    expect(b.of('playerUpdated').at(-1)!.player.seatId).toBe(seat.id);
    sitDown('b');
    expect(b.of('error').at(-1)!.code).toBe('seat_taken');
  });

  it('rejects sitting from far away', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    send('a', { t: 'sit', seatId: seat.id });
    expect(a.of('error').at(-1)!.code).toBe('bad_seat');
  });

  it('ignores movement while seated', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    sitDown('a');
    goTo('a', 0, 0);
    expect(w.view('a')!.x).toBe(seat.x);
  });
});

describe('sessions', () => {
  it('requires a seat', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    expect(a.of('error').at(-1)!.code).toBe('not_seated');
  });

  it('rejects out-of-range lengths', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 500, breakMin: 5 });
    expect(a.of('error').at(-1)!.code).toBe('bad_session');
  });

  it('runs focus → break → done and announces start and finish', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    expect(a.feed()).toContain('📚 Sam started a 25 min session in the park');
    t += 25 * MIN; w.tick();
    expect(w.view('a')!.session!.phase).toBe('break');
    expect(a.feed()).toContain('✨ Sam finished a 25 min session!');
    t += 5 * MIN; w.tick();
    expect(w.view('a')!.session).toBeNull();
  });

  it('standing during focus is an early quit with a rain cloud and frees the seat', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    t += 12 * MIN;
    send('a', { t: 'stand' });
    expect(b.feed()).toContain('🥀 Sam left 12 min into a 25 min session');
    expect(w.view('a')).toMatchObject({ session: null, seatId: null, rainUntil: t + RAIN_MS });
    sitDown('b');
    expect(w.view('b')!.seatId).toBe(seat.id);
  });

  it('cancelling during focus is also an early quit', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    t += 3 * MIN;
    send('a', { t: 'cancelSession' });
    expect(a.feed()).toContain('🥀 Sam left 3 min into a 25 min session');
    expect(w.view('a')!.seatId).toBe(seat.id);
  });

  it('standing during a break is free and the break keeps running', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    t += 25 * MIN; w.tick();
    send('a', { t: 'stand' });
    expect(a.feed().some((x) => x.startsWith('🥀'))).toBe(false);
    expect(w.view('a')!.session!.phase).toBe('break');
  });
});

describe('disconnects', () => {
  it('reconnecting within the grace period keeps the session', () => {
    const a1 = new FakeConn(), a2 = new FakeConn();
    w.join(prof('a', 'Sam'), a1);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    w.disconnect('a', a1);
    expect(w.view('a')!.connected).toBe(false);
    t += GRACE_MS - 1_000; w.tick();
    w.join(prof('a', 'Sam'), a2);
    expect(a2.of('welcome')[0].you).toMatchObject({ connected: true, seatId: seat.id });
    expect(a2.of('welcome')[0].you.session!.phase).toBe('focus');
  });

  it('staying away past the grace period during focus is announced and removes the player', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    t += 10 * MIN;
    w.disconnect('a', a);
    t += GRACE_MS + 1_000; w.tick();
    expect(b.feed()).toContain("🥀 Sam disconnected and didn't come back, 11 min into a 25 min session");
    expect(b.of('playerLeft').at(-1)!.id).toBe('a');
    expect(w.view('a')).toBeUndefined();
    sitDown('b');
    expect(w.view('b')!.seatId).toBe(seat.id);
  });

  it('leaving outside a session says headed home', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    w.disconnect('a', a);
    t += GRACE_MS; w.tick();
    expect(b.feed()).toContain('👋 Sam headed home');
  });
});

describe('scenes and emotes', () => {
  it('goes through a door into the library', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    goTo('a', -9, -5.5);
    send('a', { t: 'enterScene', doorId: 'to-library' });
    const snap = a.of('sceneSnapshot')[0];
    expect(snap.scene).toBe('library');
    expect(snap.you).toMatchObject({ x: 0, z: 4.2, scene: 'library' });
    expect(b.of('playerLeft').at(-1)!.id).toBe('a');
    expect(b.of('online').at(-1)!.list.find((o) => o.id === 'a')!.scene).toBe('library');
  });

  it('rejects a door you are not standing at', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    send('a', { t: 'enterScene', doorId: 'to-library' });
    expect(a.of('error').at(-1)!.code).toBe('bad_door');
    expect(w.view('a')!.scene).toBe('town');
  });

  it('cheers go to the feed (with a cooldown), waves do not', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    send('a', { t: 'emote', kind: 'wave', targetId: 'b' });
    send('a', { t: 'emote', kind: 'flex', targetId: 'b' });
    send('a', { t: 'emote', kind: 'clap', targetId: 'b' });
    expect(b.of('emote')).toHaveLength(3);
    expect(b.feed().filter((x) => x.includes('cheered'))).toEqual(['Sam cheered Alex 💪']);
  });

  it('second seat on the same bench is independent', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    sitDown('a');
    sitDown('b', seatB);
    expect(w.view('b')!.seatId).toBe(seatB.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/src/world.test.ts`
Expected: FAIL, because `./world` cannot be resolved.

- [ ] **Step 3: Implement `server/src/world.ts`**

```ts
import {
  CHEER_FEED_COOLDOWN_MS, DOOR_PAD, FEED_ON_WELCOME, GRACE_MS, MAX_SPEED, PLAYER_RADIUS, RAIN_MS, SEAT_RADIUS,
} from '../../shared/constants';
import { clampToBounds, dist, inBox } from '../../shared/geometry';
import type { ClientMsg, ErrorCode, ServerMsg } from '../../shared/protocol';
import { getScene, START_SCENE, START_SPAWN } from '../../shared/scenes';
import type { Anim, EmoteKind, FeedKind, Look, OnlineEntry, PlayerView, Session } from '../../shared/types';
import type { Profile } from './db';
import { Feed, feedText } from './feed';
import { elapsedMin, newSession, stepSession, validLengths } from './sessions';

/** What the World needs from a network connection. */
export interface Conn {
  send(msg: ServerMsg): void;
  close(code: ErrorCode): void;
}

interface Player {
  id: string;
  name: string;
  look: Look;
  scene: string;
  x: number;
  z: number;
  facing: number;
  anim: Anim;
  seatId: string | null;
  session: Session | null;
  rainUntil: number;
  conn: Conn | null;
  disconnectedAt: number | null;
  lastMoveAt: number;
  lastCheerFeedAt: number;
}

const EMOJI: Record<EmoteKind, string> = { wave: '👋', clap: '👏', flex: '💪', coffee: '☕' };

export class World {
  private players = new Map<string, Player>();
  private seats = new Map<string, string>(); // seatId -> playerId
  private feed = new Feed();

  constructor(private now: () => number = Date.now) {}

  view(id: string): PlayerView | undefined {
    const p = this.players.get(id);
    return p && this.toView(p);
  }

  join(profile: Profile, conn: Conn, newToken?: string): void {
    const existing = this.players.get(profile.id);
    if (existing) {
      const old = existing.conn;
      existing.conn = conn;
      existing.disconnectedAt = null;
      existing.name = profile.name;
      existing.look = profile.look;
      if (old) old.close('connected_elsewhere');
      this.sendWelcome(existing, newToken);
      this.toScene(existing.scene, { t: 'playerUpdated', player: this.toView(existing) }, existing.id);
      return;
    }
    const spawn = getScene(START_SCENE)!.spawns.find((s) => s.id === START_SPAWN)!;
    const p: Player = {
      id: profile.id, name: profile.name, look: profile.look, scene: START_SCENE,
      x: spawn.x, z: spawn.z, facing: spawn.facing, anim: 'idle',
      seatId: null, session: null, rainUntil: 0,
      conn, disconnectedAt: null, lastMoveAt: this.now(), lastCheerFeedAt: 0,
    };
    this.players.set(p.id, p);
    this.sendWelcome(p, newToken);
    this.toScene(p.scene, { t: 'playerJoined', player: this.toView(p) }, p.id);
    this.pushFeed('arrive', feedText.arrive(p.name));
    this.broadcastOnline();
  }

  /** Only the player's current connection counts; a replaced socket closing is ignored. */
  disconnect(id: string, conn: Conn): void {
    const p = this.players.get(id);
    if (!p || p.conn !== conn) return;
    p.conn = null;
    p.disconnectedAt = this.now();
    this.toScene(p.scene, { t: 'playerUpdated', player: this.toView(p) }, p.id);
  }

  handle(id: string, msg: ClientMsg): void {
    const p = this.players.get(id);
    if (!p || !p.conn) return;
    switch (msg.t) {
      case 'move': return this.move(p, msg.x, msg.z, msg.facing, msg.anim);
      case 'enterScene': return this.enterScene(p, msg.doorId);
      case 'sit': return this.sit(p, msg.seatId);
      case 'stand': return this.stand(p);
      case 'startSession': return this.startSession(p, msg.focusMin, msg.breakMin);
      case 'cancelSession': return this.cancelSession(p);
      case 'emote': return this.emote(p, msg.kind, msg.targetId);
      case 'updateLook':
        p.look = msg.look;
        return this.updated(p);
      case 'hello':
        return;
    }
  }

  /** Call about once a second: advances timers and expires disconnected players. */
  tick(): void {
    const t = this.now();
    for (const p of [...this.players.values()]) {
      if (p.session) {
        const { session, event } = stepSession(p.session, t);
        p.session = session;
        if (event === 'focusDone') this.pushFeed('finish', feedText.finish(p.name, session!.focusMin));
        if (event) this.updated(p);
      }
      if (!p.conn && p.disconnectedAt !== null && t - p.disconnectedAt >= GRACE_MS) this.remove(p);
    }
  }

  // ---------- rules ----------

  private move(p: Player, x: number, z: number, facing: number, anim: Anim): void {
    if (p.seatId) return;
    const t = this.now();
    const c = clampToBounds(x, z, PLAYER_RADIUS, getScene(p.scene)!.size);
    const allowed = (MAX_SPEED * Math.max(t - p.lastMoveAt, 50)) / 1000 + 0.5;
    if (dist(p.x, p.z, c.x, c.z) > allowed) return;
    p.x = c.x;
    p.z = c.z;
    p.facing = facing;
    p.anim = anim === 'sit' ? 'idle' : anim;
    p.lastMoveAt = t;
    this.toScene(p.scene, { t: 'playerMoved', id: p.id, x: p.x, z: p.z, facing, anim: p.anim }, p.id);
  }

  private enterScene(p: Player, doorId: string): void {
    const door = getScene(p.scene)!.doors.find((d) => d.id === doorId);
    if (!door || p.seatId || !inBox(door.box, p.x, p.z, DOOR_PAD)) {
      return this.error(p, 'bad_door', 'You are not at that door.');
    }
    const target = getScene(door.toScene)!;
    const spawn = target.spawns.find((s) => s.id === door.toSpawn)!;
    this.toScene(p.scene, { t: 'playerLeft', id: p.id }, p.id);
    p.scene = target.id;
    p.x = spawn.x;
    p.z = spawn.z;
    p.facing = spawn.facing;
    p.anim = 'idle';
    p.lastMoveAt = this.now();
    p.conn!.send({ t: 'sceneSnapshot', scene: target.id, you: this.toView(p), players: this.scenePlayers(target.id, p.id) });
    this.toScene(target.id, { t: 'playerJoined', player: this.toView(p) }, p.id);
    this.broadcastOnline();
  }

  private sit(p: Player, seatId: string): void {
    if (p.seatId) return;
    const seat = getScene(p.scene)!.seats.find((s) => s.id === seatId);
    if (!seat || dist(p.x, p.z, seat.x, seat.z) > SEAT_RADIUS + 0.3) {
      return this.error(p, 'bad_seat', 'Get a little closer to that seat.');
    }
    if (this.seats.has(seatId)) return this.error(p, 'seat_taken', 'That seat is taken!');
    this.seats.set(seatId, p.id);
    p.seatId = seatId;
    p.x = seat.x;
    p.z = seat.z;
    p.facing = seat.facing;
    p.anim = 'sit';
    this.updated(p);
  }

  private stand(p: Player): void {
    if (!p.seatId) return;
    if (p.session?.phase === 'focus') this.earlyQuit(p);
    this.seats.delete(p.seatId);
    p.seatId = null;
    p.anim = 'idle';
    this.updated(p);
  }

  private startSession(p: Player, focusMin: number, breakMin: number): void {
    if (!p.seatId) return this.error(p, 'not_seated', 'Sit at a desk first.');
    if (!validLengths(focusMin, breakMin) || p.session?.phase === 'focus') {
      return this.error(p, 'bad_session', 'Focus 1–120 min, break 1–30 min.');
    }
    p.session = newSession(focusMin, breakMin, this.now());
    this.pushFeed('start', feedText.start(p.name, focusMin, getScene(p.scene)!.where));
    this.updated(p);
  }

  private cancelSession(p: Player): void {
    if (!p.session) return;
    if (p.session.phase === 'focus') this.earlyQuit(p);
    else p.session = null;
    this.updated(p);
  }

  private earlyQuit(p: Player): void {
    const s = p.session!;
    const t = this.now();
    this.pushFeed('quit', feedText.quit(p.name, elapsedMin(s, t), s.focusMin));
    p.session = null;
    p.rainUntil = t + RAIN_MS;
  }

  private emote(p: Player, kind: EmoteKind, targetId?: string): void {
    const target = targetId ? this.players.get(targetId) : undefined;
    if (targetId && (!target || target.scene !== p.scene)) return;
    this.toScene(p.scene, { t: 'emote', fromId: p.id, kind, ...(targetId ? { targetId } : {}) });
    const t = this.now();
    if (target && kind !== 'wave' && t - p.lastCheerFeedAt >= CHEER_FEED_COOLDOWN_MS) {
      p.lastCheerFeedAt = t;
      this.pushFeed('cheer', feedText.cheer(p.name, target.name, EMOJI[kind]));
    }
  }

  private remove(p: Player): void {
    if (p.session?.phase === 'focus') {
      this.pushFeed('quit', feedText.quitDisconnect(p.name, elapsedMin(p.session, this.now()), p.session.focusMin));
    } else {
      this.pushFeed('leave', feedText.leave(p.name));
    }
    if (p.seatId) this.seats.delete(p.seatId);
    this.players.delete(p.id);
    this.toScene(p.scene, { t: 'playerLeft', id: p.id });
    this.broadcastOnline();
  }

  // ---------- messaging ----------

  private sendWelcome(p: Player, token?: string): void {
    p.conn!.send({
      t: 'welcome',
      you: this.toView(p),
      ...(token ? { token } : {}),
      serverTime: this.now(),
      players: this.scenePlayers(p.scene, p.id),
      online: this.online(),
      feed: this.feed.recent(FEED_ON_WELCOME),
    });
  }

  private updated(p: Player): void {
    this.toScene(p.scene, { t: 'playerUpdated', player: this.toView(p) });
  }

  private error(p: Player, code: ErrorCode, message: string): void {
    p.conn?.send({ t: 'error', code, message });
  }

  private pushFeed(kind: FeedKind, text: string): void {
    const event = this.feed.push(kind, text, this.now());
    this.toAll({ t: 'feed', event });
  }

  private scenePlayers(scene: string, exceptId: string): PlayerView[] {
    return [...this.players.values()].filter((q) => q.scene === scene && q.id !== exceptId).map((q) => this.toView(q));
  }

  private online(): OnlineEntry[] {
    return [...this.players.values()].map((q) => ({ id: q.id, name: q.name, scene: q.scene }));
  }

  private broadcastOnline(): void {
    this.toAll({ t: 'online', list: this.online() });
  }

  private toScene(scene: string, msg: ServerMsg, exceptId?: string): void {
    for (const q of this.players.values()) if (q.scene === scene && q.id !== exceptId) q.conn?.send(msg);
  }

  private toAll(msg: ServerMsg): void {
    for (const q of this.players.values()) q.conn?.send(msg);
  }

  private toView(p: Player): PlayerView {
    return {
      id: p.id, name: p.name, look: p.look, scene: p.scene,
      x: p.x, z: p.z, facing: p.facing, anim: p.anim,
      seatId: p.seatId, session: p.session, connected: p.conn !== null, rainUntil: p.rainUntil,
    };
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/src/world.test.ts && npx tsc --noEmit`
Expected: all tests pass and there are no type errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/world.ts server/src/world.test.ts
git commit -m "feat: add World with seats, sessions, early-quit, disconnect grace, doors and emotes"
```

---

### Task 7: Server transport (HTTP static, /ws, auth, tick) and entry point

**Files:**
- Create: `server/src/server.ts`, `server/src/index.ts`
- Test: `server/src/server.test.ts`

**Interfaces:**
- Consumes: `World`, `Conn` (Task 6); `ProfileStore` (Task 4); `parseClientMsg`, `cleanName`, `isLook` (Task 3)
- Produces:
  - `startServer(opts: ServerOptions): Promise<RunningServer>`
  - `ServerOptions { port; dbPath; inviteCode; staticDir?; now?; tickMs? }`
  - `RunningServer { port: number; world: World; close(): Promise<void> }`
  - WebSocket endpoint at path `/ws`; `GET /health` returns `ok`
  - Env vars: `PORT` (default 8787), `INVITE_CODE` (required), `DB_PATH` (default `data.db`). Static files come from `dist/client` if that directory exists.

- [ ] **Step 1: Write the failing test `server/src/server.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { DEFAULT_LOOK } from '../../shared/looks';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import { findSeat } from '../../shared/scenes';
import { startServer, type RunningServer } from './server';

type Msg<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;

class TestClient {
  private inbox: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      const i = this.waiters.findIndex((w) => w.pred(m));
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m);
      else this.inbox.push(m);
    });
  }

  static async open(port: number): Promise<TestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    return new TestClient(ws);
  }

  send(m: ClientMsg) { this.ws.send(JSON.stringify(m)); }

  next<T extends ServerMsg['t']>(t: T, pred: (m: Msg<T>) => boolean = () => true): Promise<Msg<T>> {
    const match = (m: ServerMsg) => m.t === t && pred(m as Msg<T>);
    const i = this.inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0] as Msg<T>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${t}`)), 2000);
      this.waiters.push({ pred: match, resolve: (m) => { clearTimeout(timer); resolve(m as Msg<T>); } });
    });
  }

  close() { this.ws.close(); }
}

let srv: RunningServer;
let t: number;
const clients: TestClient[] = [];
const open = async () => { const c = await TestClient.open(srv.port); clients.push(c); return c; };
const join = async (name: string) => {
  const c = await open();
  c.send({ t: 'hello', inviteCode: 'cozy', name, look: DEFAULT_LOOK });
  const welcome = await c.next('welcome');
  return { c, welcome };
};

beforeEach(async () => {
  t = 1_000_000;
  srv = await startServer({ port: 0, dbPath: ':memory:', inviteCode: 'cozy', now: () => t, tickMs: 20 });
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await srv.close();
});

describe('server', () => {
  it('answers /health', async () => {
    const r = await fetch(`http://127.0.0.1:${srv.port}/health`);
    expect(await r.text()).toBe('ok');
  });

  it('rejects a wrong invite code', async () => {
    const c = await open();
    c.send({ t: 'hello', inviteCode: 'nope', name: 'Sam', look: DEFAULT_LOOK });
    expect((await c.next('error')).code).toBe('bad_invite');
  });

  it('rejects an unknown token', async () => {
    const c = await open();
    c.send({ t: 'hello', token: 'f'.repeat(64) });
    expect((await c.next('error')).code).toBe('unknown_token');
  });

  it('creates a profile, then recognises its token on a new connection', async () => {
    const { c, welcome } = await join('Sam');
    expect(welcome.token).toMatch(/^[0-9a-f]{64}$/);
    c.close();
    const again = await open();
    again.send({ t: 'hello', token: welcome.token! });
    const w2 = await again.next('welcome');
    expect(w2.token).toBeUndefined();
    expect(w2.you.id).toBe(welcome.you.id);
    expect(w2.you.name).toBe('Sam');
  });

  it('two players see each other, study, and an early quit is broadcast', async () => {
    const { c: a, welcome: wa } = await join('Sam');
    const { c: b } = await join('Alex');
    expect((await a.next('playerJoined')).player.name).toBe('Alex');

    const seat = findSeat('town', 'park-b1-a')!;
    t += 10_000;
    a.send({ t: 'move', x: seat.x, z: seat.z + 0.5, facing: 0, anim: 'walk' });
    a.send({ t: 'sit', seatId: seat.id });
    await b.next('playerUpdated', (m) => m.player.id === wa.you.id && m.player.seatId === seat.id);

    a.send({ t: 'startSession', focusMin: 25, breakMin: 5 });
    await b.next('feed', (m) => m.event.text === '📚 Sam started a 25 min session in the park');

    t += 12 * 60_000;
    a.send({ t: 'stand' });
    await b.next('feed', (m) => m.event.text === '🥀 Sam left 12 min into a 25 min session');
    const upd = await b.next('playerUpdated', (m) => m.player.id === wa.you.id && m.player.seatId === null);
    expect(upd.player.rainUntil).toBeGreaterThan(t);
  });

  it('ignores garbage without crashing', async () => {
    const { c } = await join('Sam');
    c.ws.send('{{{nope');
    c.send({ t: 'emote', kind: 'wave' });
    expect((await c.next('emote')).kind).toBe('wave');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/src/server.test.ts`
Expected: FAIL, because `./server` cannot be resolved.

- [ ] **Step 3: Implement `server/src/server.ts`**

```ts
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerMsg } from '../../shared/protocol';
import { ProfileStore } from './db';
import { cleanName, isLook, parseClientMsg } from './validate';
import { World, type Conn } from './world';

export interface ServerOptions {
  port: number;
  dbPath: string;
  inviteCode: string;
  staticDir?: string | null;
  now?: () => number;
  tickMs?: number;
}

export interface RunningServer {
  port: number;
  world: World;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function serveStatic(dir: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  if (rel.split(/[/\\]/).includes('..')) {
    res.writeHead(400).end();
    return;
  }
  let file = join(dir, rel || 'index.html');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(dir, 'index.html'); // single-page fallback
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const store = new ProfileStore(opts.dbPath);
  const world = new World(opts.now);

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200).end('ok');
      return;
    }
    if (opts.staticDir) void serveStatic(opts.staticDir, req, res);
    else res.writeHead(404).end('not found');
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 8 * 1024 });

  wss.on('connection', (ws: WebSocket) => {
    let playerId: string | null = null;
    let garbage = 0;
    const conn: Conn = {
      send: (msg: ServerMsg) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code) => {
        conn.send({ t: 'error', code, message: 'The town is open in another tab or device.' });
        ws.close(4001, code);
      },
    };

    ws.on('message', (data) => {
      const msg = parseClientMsg(String(data));
      if (!msg) {
        if (++garbage >= 20) ws.close(4002, 'too many bad messages');
        return;
      }
      if (playerId) {
        if (msg.t === 'updateLook') store.updateLook(playerId, msg.look);
        world.handle(playerId, msg);
        return;
      }
      if (msg.t !== 'hello') return;
      if (msg.token) {
        const profile = store.findByToken(msg.token);
        if (!profile) {
          conn.send({ t: 'error', code: 'unknown_token', message: "We don't recognise this device. Please join again." });
          return;
        }
        playerId = profile.id;
        world.join(profile, conn);
        return;
      }
      if (msg.inviteCode !== opts.inviteCode) {
        conn.send({ t: 'error', code: 'bad_invite', message: "That invite code isn't right." });
        return;
      }
      const name = cleanName(msg.name);
      if (!name || !isLook(msg.look)) {
        conn.send({ t: 'error', code: 'bad_profile', message: 'Pick a name (1–16 characters) and a look.' });
        return;
      }
      const { profile, token } = store.create(name, msg.look);
      playerId = profile.id;
      world.join(profile, conn, token);
    });

    ws.on('close', () => {
      if (playerId) world.disconnect(playerId, conn);
    });
  });

  const timer = setInterval(() => world.tick(), opts.tickMs ?? 1000);
  await new Promise<void>((resolve) => http.listen(opts.port, resolve));
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    world,
    close: async () => {
      clearInterval(timer);
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => http.close(() => r()));
      store.close();
    },
  };
}
```

- [ ] **Step 4: Implement `server/src/index.ts`**

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './server';

const inviteCode = process.env.INVITE_CODE;
if (!inviteCode) {
  console.error('Set INVITE_CODE to the code your friends will use to join, e.g. INVITE_CODE=cozy npm start');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? 'data.db';
const built = resolve('dist/client');
const staticDir = existsSync(built) ? built : null;

const server = await startServer({ port, dbPath, inviteCode, staticDir });
console.log(`🏡 Virtual Study World on http://localhost:${server.port}${staticDir ? '' : ' (API only, run `npm run build` for the client)'}`);

const shutdown = () => void server.close().then(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run server && npx tsc --noEmit`
Expected: all server tests pass, including these 6 new ones, and there are no type errors.

- [ ] **Step 6: Smoke-test the entry point**

Run: `(INVITE_CODE=cozy PORT=8799 DB_PATH=:memory: npx tsx server/src/index.ts & PID=$!; sleep 2; curl -s localhost:8799/health; kill $PID)`
Expected: it prints `🏡 Virtual Study World on http://localhost:8799 (API only…)` and then `ok`.

- [ ] **Step 7: Commit**

```bash
git add server/src/server.ts server/src/server.test.ts server/src/index.ts
git commit -m "feat: add WebSocket server with invite/token auth, static hosting and tick loop"
```

---
### Task 8: Client logic (connection, interpolation, clock, interaction, formatting)

**Files:**
- Create: `client/src/net/connection.ts`, `client/src/net/interp.ts`, `client/src/game/clock.ts`, `client/src/game/interaction.ts`, `client/src/hud/format.ts`
- Test: `client/src/net/connection.test.ts`, `client/src/net/interp.test.ts`, `client/src/game/interaction.test.ts`, `client/src/hud/format.test.ts`

**Interfaces:**
- Consumes: `ClientMsg`, `ServerMsg`, `Seat`, `Session`, `PlayerView`, `SEAT_RADIUS`, `INTERACT_RADIUS`
- Produces:
  - `type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'stopped'`
  - `backoffDelay(attempt): number`
  - `class Connection(url)`, with `onMessage`, `onOpen`, `onStatus`, `connect()`, `send(msg)`, `stop()`
  - `interface Pose { x; z; facing }`
  - `class Interp`, with `push(pose, t)` and `sample(now): Pose`
  - `lerpAngle(a, b, k)`
  - `syncClock(serverTime)`, `serverNow()`
  - `type Target = { kind: 'seat'; seat: Seat; dist } | { kind: 'player'; id; dist }`
  - `pickTarget(x, z, seats, taken: Set<string>, others: {id,x,z}[]): Target | null`
  - `formatClock(ms)`, `sessionLeftMs(s, now)`, `statusText(view, now)`

- [ ] **Step 1: Write the failing tests**

`client/src/net/connection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { backoffDelay } from './connection';

describe('backoffDelay', () => {
  it('backs off 1, 2, 4, 8 s and then retries every 10 s', () => {
    expect([0, 1, 2, 3, 4, 9].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
  });
});
```

`client/src/net/interp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Interp, lerpAngle } from './interp';

describe('Interp', () => {
  it('returns the only sample', () => {
    const i = new Interp();
    i.push({ x: 1, z: 2, facing: 0 }, 1000);
    expect(i.sample(5000)).toEqual({ x: 1, z: 2, facing: 0 });
  });

  it('interpolates 100 ms behind real time', () => {
    const i = new Interp();
    i.push({ x: 0, z: 0, facing: 0 }, 1000);
    i.push({ x: 1, z: 0, facing: 0 }, 1100);
    expect(i.sample(1150).x).toBeCloseTo(0.5);
  });

  it('holds the newest sample after it runs out', () => {
    const i = new Interp();
    i.push({ x: 0, z: 0, facing: 0 }, 1000);
    i.push({ x: 1, z: 0, facing: 0 }, 1100);
    expect(i.sample(9999).x).toBe(1);
  });

  it('snaps when an update is more than 2 m from where it is drawn', () => {
    const i = new Interp();
    i.push({ x: 0, z: 0, facing: 0 }, 1000);
    i.sample(1100);
    i.push({ x: 5, z: 0, facing: 0 }, 1200);
    expect(i.sample(1201).x).toBe(5);
  });

  it('starts moving smoothly after standing still for a while', () => {
    const i = new Interp();
    i.push({ x: 0, z: 0, facing: 0 }, 1000);
    i.sample(1100);
    i.push({ x: 0.3, z: 0, facing: 0 }, 5000);
    expect(i.sample(5000).x).toBe(0); // no jump
    expect(i.sample(5060).x).toBeCloseTo(0.15); // halfway through the 80 ms ease
  });
});

describe('lerpAngle', () => {
  it('takes the short way round', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI);
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5);
  });
});
```

`client/src/game/interaction.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickTarget } from './interaction';

const seat = (id: string, x: number, z: number) => ({ id, x, z, facing: 0, deskId: 'd' });

describe('pickTarget', () => {
  it('picks the nearest free seat in range', () => {
    const t = pickTarget(0, 0, [seat('a', 1, 0), seat('b', 0.5, 0)], new Set(), []);
    expect(t).toMatchObject({ kind: 'seat', seat: { id: 'b' } });
  });
  it('skips taken seats', () => {
    const t = pickTarget(0, 0, [seat('a', 1, 0), seat('b', 0.5, 0)], new Set(['b']), []);
    expect(t).toMatchObject({ kind: 'seat', seat: { id: 'a' } });
  });
  it('prefers a closer player over a seat', () => {
    const t = pickTarget(0, 0, [seat('a', 1, 0)], new Set(), [{ id: 'p', x: 0, z: 0.4 }]);
    expect(t).toMatchObject({ kind: 'player', id: 'p' });
  });
  it('returns null when nothing is in range', () => {
    expect(pickTarget(0, 0, [seat('a', 5, 0)], new Set(), [{ id: 'p', x: 0, z: 3 }])).toBeNull();
  });
});
```

`client/src/hud/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../../../shared/types';
import { formatClock, sessionLeftMs, statusText } from './format';

const base: PlayerView = {
  id: 'a', name: 'Sam', look: { body: '#ffffff', skin: '#ffffff', hat: 'none' }, scene: 'town',
  x: 0, z: 0, facing: 0, anim: 'idle', seatId: null, session: null, connected: true, rainUntil: 0,
};

describe('format', () => {
  it('formats a countdown as m:ss, never negative', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(1_500)).toBe('0:02');
    expect(formatClock(-5)).toBe('0:00');
  });
  it('computes time left in the current phase', () => {
    expect(sessionLeftMs({ phase: 'break', focusMin: 25, breakMin: 5, phaseStartedAt: 0 }, 60_000)).toBe(4 * 60_000);
  });
  it('describes what a player is doing', () => {
    expect(statusText(base, 0)).toBe('🚶 Wandering');
    expect(statusText({ ...base, seatId: 's' }, 0)).toBe('🪑 Sitting');
    expect(statusText({ ...base, connected: false }, 0)).toBe('💤 Connection lost…');
    expect(statusText({ ...base, seatId: 's', session: { phase: 'focus', focusMin: 25, breakMin: 5, phaseStartedAt: 0 } }, 60_000))
      .toBe('📖 Studying · 24:00 left');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client`
Expected: FAIL, because the modules cannot be resolved.

- [ ] **Step 3: Implement `client/src/net/connection.ts`**

```ts
import type { ClientMsg, ServerMsg } from '../../../shared/protocol';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'stopped';

export function backoffDelay(attempt: number): number {
  return [1000, 2000, 4000, 8000][attempt] ?? 10000;
}

/** A WebSocket that reconnects with backoff until stop() is called. */
export class Connection {
  onMessage: (m: ServerMsg) => void = () => {};
  onOpen: () => void = () => {};
  onStatus: (s: ConnStatus) => void = () => {};

  private ws: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private url: string) {}

  connect(): void {
    if (this.stopped) return;
    this.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.onStatus('open');
      this.onOpen();
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      this.onStatus('reconnecting');
      this.timer = setTimeout(() => this.connect(), backoffDelay(this.attempt++));
    };
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.onStatus('stopped');
  }
}
```

- [ ] **Step 4: Implement `client/src/net/interp.ts`**

```ts
export interface Pose {
  x: number;
  z: number;
  facing: number;
}

interface Sample extends Pose {
  t: number;
}

export const INTERP_DELAY_MS = 100;
export const SNAP_DIST = 2;
const IDLE_GAP_MS = 250;
const EASE_MS = 80;

export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** Smooths a remote player's position by drawing it slightly in the past, between received samples. */
export class Interp {
  private buf: Sample[] = [];
  private drawn: Pose | null = null;

  push(p: Pose, t: number): void {
    const pose = { x: p.x, z: p.z, facing: p.facing };
    if (this.drawn && Math.hypot(pose.x - this.drawn.x, pose.z - this.drawn.z) > SNAP_DIST) {
      this.buf = [];
      this.drawn = { ...pose };
    }
    const last = this.buf[this.buf.length - 1];
    if (last && t - last.t > IDLE_GAP_MS) {
      // They stood still for a while: restamp the old pose just before this one so the first step eases in.
      this.buf = [{ ...last, t: t - EASE_MS }];
    }
    this.buf.push({ ...pose, t });
    if (this.buf.length > 20) this.buf.shift();
  }

  sample(now: number): Pose {
    const b = this.buf;
    if (b.length === 0) return this.drawn ?? { x: 0, z: 0, facing: 0 };
    const target = now - INTERP_DELAY_MS;
    while (b.length > 2 && b[1].t <= target) b.shift();
    let pose: Pose;
    if (b.length === 1 || target <= b[0].t) pose = b[0];
    else if (target >= b[b.length - 1].t) pose = b[b.length - 1];
    else {
      let i = 0;
      while (b[i + 1].t < target) i++;
      const a = b[i];
      const c = b[i + 1];
      const k = (target - a.t) / (c.t - a.t || 1);
      pose = { x: a.x + (c.x - a.x) * k, z: a.z + (c.z - a.z) * k, facing: lerpAngle(a.facing, c.facing, k) };
    }
    this.drawn = { x: pose.x, z: pose.z, facing: pose.facing };
    return this.drawn;
  }
}
```

- [ ] **Step 5: Implement `client/src/game/clock.ts`**

```ts
let offset = 0;

/** Call with welcome.serverTime so countdowns match the server. */
export function syncClock(serverTime: number): void {
  offset = serverTime - Date.now();
}

export function serverNow(): number {
  return Date.now() + offset;
}
```

- [ ] **Step 6: Implement `client/src/game/interaction.ts`**

```ts
import { INTERACT_RADIUS, SEAT_RADIUS } from '../../../shared/constants';
import type { Seat } from '../../../shared/scenes/types';

export type Target =
  | { kind: 'seat'; seat: Seat; dist: number }
  | { kind: 'player'; id: string; dist: number };

/** What [E] would act on right now: the closest free seat or nearby player. */
export function pickTarget(
  x: number,
  z: number,
  seats: Seat[],
  taken: Set<string>,
  others: { id: string; x: number; z: number }[],
): Target | null {
  let best: Target | null = null;
  for (const s of seats) {
    if (taken.has(s.id)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d <= SEAT_RADIUS && (!best || d < best.dist)) best = { kind: 'seat', seat: s, dist: d };
  }
  for (const o of others) {
    const d = Math.hypot(o.x - x, o.z - z);
    if (d <= INTERACT_RADIUS && (!best || d < best.dist)) best = { kind: 'player', id: o.id, dist: d };
  }
  return best;
}
```

- [ ] **Step 7: Implement `client/src/hud/format.ts`**

```ts
import type { PlayerView, Session } from '../../../shared/types';

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function sessionLeftMs(s: Session, now: number): number {
  return s.phaseStartedAt + (s.phase === 'focus' ? s.focusMin : s.breakMin) * 60_000 - now;
}

export function statusText(v: PlayerView, now: number): string {
  if (v.session) {
    const label = v.session.phase === 'focus' ? '📖 Studying' : '☕ On a break';
    return `${label} · ${formatClock(sessionLeftMs(v.session, now))} left`;
  }
  if (!v.connected) return '💤 Connection lost…';
  return v.seatId ? '🪑 Sitting' : '🚶 Wandering';
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run client && npx tsc --noEmit`
Expected: all client tests pass and there are no type errors.

- [ ] **Step 9: Commit**

```bash
git add client/src/net client/src/game client/src/hud
git commit -m "feat: add client connection, interpolation, interaction picking and formatting"
```

---

### Task 9: 3D world rendering (materials, decor, scenes, characters, overhead)

There are no unit tests here because this is visual code that needs WebGL. Verification is a typecheck, a production build, and a throwaway preview page that renders every scene with a few characters.

**Files:**
- Create: `client/src/world/palette.ts`, `client/src/world/rng.ts`, `client/src/world/materials.ts`, `client/src/world/text.ts`, `client/src/world/decor.ts`, `client/src/world/sceneBuilder.ts`, `client/src/world/overhead.ts`, `client/src/world/character.ts`
- Create (temporary, deleted at the end of this task): `client/preview.html`, `client/src/preview.ts`

**Interfaces:**
- Consumes: `SceneDef`, `Decor`, `DecorKind`, `SCENES`, `Look`, `Hat`, `Anim`, `EmoteKind`, `Session`
- Produces:
  - `buildScene(def: SceneDef): THREE.Scene`, which includes its own lights, background, and fog
  - `class Character(look, name, isMe?)`:
    - fields: `root: THREE.Group`, `overhead: Overhead`, `anim: Anim`, `facing: number`
    - methods: `setLook(look)`, `setDim(on)`, `update(dt, nowMs)`, `dispose()`
  - `class Overhead` with `setSession(session|null, serverNow)`, `setRain(on)`, `emote(kind, nowMs)`, `update(dt, nowMs)`
  - `textSprite(text, height, opts)`, `labelTexture(text, opts)`

- [ ] **Step 1: Create `client/src/world/palette.ts`**

```ts
export const PALETTE = {
  ink: '#4a4058',
  trunk: '#8a5a3c',
  leaf1: '#7cc47a',
  leaf2: '#5fb36b',
  leaf3: '#9bd48a',
  pine1: '#4f9e6a',
  pine2: '#62b07a',
  wood: '#c99a6e',
  woodDark: '#9c6f4c',
  woodLight: '#e6c69c',
  metal: '#c8ccd2',
  dark: '#5a4e66',
  path: '#efdcb6',
  water: '#8fd0e8',
  waterRim: '#d9eef0',
  lampGlow: '#ffd9a0',
  windowGlow: '#ffe7b0',
  sky: '#cfeaff',
  paper: '#fffaf0',
  pot: '#d9825b',
  soil: '#6b4a35',
  cup: '#fffaf2',
  coffee: '#7a4a2e',
  machine: '#e9e3da',
  red: '#ff6b6b',
  books: ['#e88d8d', '#f2c46d', '#8cc7a1', '#87b5e5', '#b9a2e3', '#f0a5c8', '#7fcfc4', '#f4e1b0'],
  chairs: ['#f2b5a0', '#a8d8c0', '#f7d88a', '#b9c8f0', '#e7b8e0'],
  lampShades: ['#ffcf8a', '#f6a6a6', '#a8d8a0', '#a6c8f6'],
  flowers: ['#f7a1c4', '#ffd36e', '#ffffff', '#c3a6ff', '#ff9e7a'],
} as const;
```

- [ ] **Step 2: Create `client/src/world/rng.ts`**

```ts
/** Deterministic PRNG, so every client draws identical scenery. */
export function rng(seed: number): () => number {
  let s = Math.imul(Math.round(seed) | 0, 2654435761) >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
}
```

- [ ] **Step 3: Create `client/src/world/materials.ts`**

```ts
import * as THREE from 'three';

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared flat-shaded material per colour (scenery only; characters own their materials). */
export function mat(color: string, roughness = 0.85): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
    cache.set(key, m);
  }
  return m;
}

export function glow(color: string, intensity = 1.6): THREE.MeshStandardMaterial {
  const key = `glow|${color}|${intensity}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
    cache.set(key, m);
  }
  return m;
}

export function mesh(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  castShadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}
```

- [ ] **Step 4: Create `client/src/world/text.ts`**

```ts
import * as THREE from 'three';

export interface LabelOpts {
  font?: number;
  fg?: string;
  bg?: string | null;
  pad?: number;
  weight?: number;
}

const FONT_FAMILY = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif';

export function labelTexture(text: string, o: LabelOpts = {}): { tex: THREE.CanvasTexture; aspect: number } {
  const font = o.font ?? 48;
  const pad = o.pad ?? 16;
  const f = `${o.weight ?? 700} ${font}px ${FONT_FAMILY}`;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = f;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  const h = font + pad * 2;
  c.width = w;
  c.height = h;
  g.font = f; // resizing the canvas resets the context
  if (o.bg) {
    g.fillStyle = o.bg;
    g.beginPath();
    g.roundRect(0, 0, w, h, h / 2);
    g.fill();
  }
  g.fillStyle = o.fg ?? '#4a4058';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + font * 0.05);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: w / h };
}

/** Camera-facing label that always draws on top (name tags, emotes). */
export function textSprite(text: string, height: number, o: LabelOpts = {}): THREE.Sprite {
  const { tex, aspect } = labelTexture(text, o);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(height * aspect, height, 1);
  s.renderOrder = 10;
  return s;
}
```

- [ ] **Step 5: Create `client/src/world/decor.ts`**

```ts
import * as THREE from 'three';
import type { Decor, DecorKind } from '../../../shared/scenes/types';
import { glow, mat, mesh } from './materials';
import { PALETTE as P } from './palette';
import { rng } from './rng';
import { labelTexture } from './text';

type Builder = (d: Decor, r: () => number) => THREE.Object3D;

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
const pick = <T,>(arr: readonly T[], r: () => number): T => arr[Math.floor(r() * arr.length)];

function group(...kids: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (kids.length) g.add(...kids);
  return g;
}

function labelPlane(text: string, height: number): THREE.Mesh {
  const { tex, aspect } = labelTexture(text, { fg: P.ink, font: 56, pad: 10 });
  return new THREE.Mesh(
    new THREE.PlaneGeometry(height * aspect, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
}

const builders: Record<DecorKind, Builder> = {
  tree(d, r) {
    const s = d.h ?? 1;
    const g = group(mesh(cyl(0.12 * s, 0.18 * s, 1.3 * s, 8), mat(P.trunk), 0, 0.65 * s, 0));
    const greens = [P.leaf1, P.leaf2, P.leaf3];
    for (let i = 0; i < 4; i++) {
      g.add(mesh(sph((0.55 + r() * 0.3) * s), mat(greens[i % 3]), (r() - 0.5) * 0.8 * s, (1.5 + r() * 0.6) * s, (r() - 0.5) * 0.8 * s));
    }
    return g;
  },

  pine(d) {
    const s = d.h ?? 1;
    const g = group(mesh(cyl(0.1 * s, 0.14 * s, 0.8 * s, 8), mat(P.trunk), 0, 0.4 * s, 0));
    for (let i = 0; i < 3; i++) {
      g.add(mesh(new THREE.ConeGeometry((1 - i * 0.25) * s, 1.1 * s, 8), mat(i % 2 ? P.pine1 : P.pine2), 0, (1 + i * 0.6) * s, 0));
    }
    return g;
  },

  bush(_d, r) {
    const g = group();
    for (let i = 0; i < 3; i++) g.add(mesh(sph(0.35 + r() * 0.15), mat(i % 2 ? P.leaf1 : P.leaf2), (i - 1) * 0.35, 0.3, (r() - 0.5) * 0.3));
    return g;
  },

  flowers(_d, r) {
    const g = group();
    for (let i = 0; i < 9; i++) {
      const x = (r() - 0.5) * 0.9;
      const z = (r() - 0.5) * 0.5;
      g.add(mesh(cyl(0.012, 0.012, 0.26, 4), mat(P.leaf2), x, 0.13, z, false));
      g.add(mesh(sph(0.065, 0), mat(pick(P.flowers, r)), x, 0.28, z, false));
    }
    return g;
  },

  lampPost() {
    return group(
      mesh(cyl(0.05, 0.07, 2.4, 8), mat(P.dark), 0, 1.2, 0),
      mesh(sph(0.16, 2), glow(P.lampGlow), 0, 2.5, 0, false),
      mesh(new THREE.ConeGeometry(0.22, 0.16, 8), mat(P.dark), 0, 2.68, 0),
    );
  },

  bench() {
    const g = group(
      mesh(box(1.5, 0.08, 0.45), mat(P.wood), 0, 0.45, 0),
      mesh(box(1.5, 0.36, 0.06), mat(P.wood), 0, 0.75, -0.2),
    );
    for (const x of [-0.65, 0.65]) for (const z of [-0.17, 0.17]) g.add(mesh(box(0.06, 0.45, 0.06), mat(P.dark), x, 0.225, z));
    return g;
  },

  path(d) {
    return mesh(box(d.w ?? 1, 0.02, d.d ?? 1), mat(P.path, 1), 0, 0.01, 0, false);
  },

  pond(d, r) {
    const sx = (d.w ?? 4) / 2;
    const sz = (d.d ?? 3) / 2;
    const rim = mesh(cyl(1.08, 1.08, 0.05, 32), mat(P.waterRim), 0, 0.025, 0, false);
    rim.scale.set(sx, 1, sz);
    const water = mesh(cyl(1, 1, 0.06, 32), new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.15, metalness: 0.1 }), 0, 0.04, 0, false);
    water.scale.set(sx, 1, sz);
    const g = group(rim, water);
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      const k = 0.3 + r() * 0.5;
      g.add(mesh(cyl(0.2, 0.2, 0.01, 10), mat(P.leaf1), Math.cos(a) * sx * k, 0.075, Math.sin(a) * sz * k, false));
    }
    return g;
  },

  building(d) {
    const w = d.w ?? 6;
    const dd = d.d ?? 5;
    const h = d.h ?? 4;
    const accent = d.accent ?? P.woodDark;
    const front = dd / 2;
    const g = group(mesh(box(w, h, dd), mat(d.color ?? '#f2dcc0'), 0, h / 2, 0));
    const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.3, 0), new THREE.Vector2(w / 2 + 0.3, 0), new THREE.Vector2(0, 1.7)]);
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: dd + 0.6, bevelEnabled: false });
    roofGeo.translate(0, 0, -(dd + 0.6) / 2);
    g.add(mesh(roofGeo, mat(accent), 0, h, 0));
    g.add(mesh(box(1.0, 1.7, 0.1), mat(P.woodDark), 0, 0.85, front + 0.03));
    g.add(mesh(sph(0.05, 1), mat(P.metal), 0.33, 0.85, front + 0.1, false));
    for (const x of [-w / 2 + 1.3, w / 2 - 1.3]) {
      g.add(mesh(box(1.2, 1.0, 0.08), mat(P.woodLight), x, 1.7, front + 0.02));
      g.add(mesh(box(1.0, 0.8, 0.1), glow(P.windowGlow, 0.5), x, 1.7, front + 0.03, false));
    }
    const awning = mesh(box(w * 0.55, 0.08, 0.9), mat(accent), 0, 2.15, front + 0.4);
    awning.rotation.x = 0.28;
    g.add(awning);
    if (d.label) {
      const text = labelPlane(d.label, 0.42);
      const tw = (text.geometry as THREE.PlaneGeometry).parameters.width;
      g.add(mesh(box(tw + 0.4, 0.6, 0.08), mat(P.woodLight), 0, h - 0.55, front + 0.04));
      text.position.set(0, h - 0.55, front + 0.09);
      g.add(text);
    }
    return g;
  },

  desk(d, r) {
    const w = d.w ?? 1.4;
    const dd = d.d ?? 0.8;
    const g = group(mesh(box(w, 0.06, dd), mat(P.wood), 0, 0.74, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(box(0.06, 0.71, 0.06), mat(P.woodDark), sx * (w / 2 - 0.08), 0.355, sz * (dd / 2 - 0.08)));
    const stack = 2 + Math.floor(r() * 2);
    for (let i = 0; i < stack; i++) g.add(mesh(box(0.3, 0.05, 0.22), mat(pick(P.books, r)), -w / 2 + 0.3, 0.795 + i * 0.05, (r() - 0.5) * 0.05));
    g.add(mesh(box(0.36, 0.01, 0.26), mat(P.paper), 0.05, 0.775, 0, false));
    return g;
  },

  chair(_d, r) {
    const c = pick(P.chairs, r);
    const g = group(mesh(box(0.46, 0.06, 0.46), mat(c), 0, 0.45, 0), mesh(box(0.46, 0.46, 0.06), mat(c), 0, 0.72, -0.2));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(box(0.05, 0.45, 0.05), mat(P.woodDark), sx * 0.19, 0.225, sz * 0.19));
    return g;
  },

  deskLamp(_d, r) {
    return group(
      mesh(cyl(0.09, 0.1, 0.03), mat(P.dark), 0, 0.785, 0),
      mesh(cyl(0.015, 0.015, 0.36, 6), mat(P.dark), 0, 0.95, 0),
      mesh(new THREE.ConeGeometry(0.14, 0.16, 14), mat(pick(P.lampShades, r)), 0, 1.15, 0),
      mesh(sph(0.045, 1), glow(P.lampGlow), 0, 1.04, 0, false),
    );
  },

  bookshelf(d, r) {
    const w = d.w ?? 2.2;
    const H = 2.1;
    const D = 0.45;
    const g = group(
      mesh(box(w, H, 0.05), mat(P.woodDark), 0, H / 2, -D / 2 + 0.025),
      mesh(box(0.06, H, D), mat(P.woodDark), -w / 2 + 0.03, H / 2, 0),
      mesh(box(0.06, H, D), mat(P.woodDark), w / 2 - 0.03, H / 2, 0),
    );
    for (let i = 0; i < 5; i++) g.add(mesh(box(w, 0.05, D), mat(P.wood), 0, 0.03 + i * 0.5, 0));
    const max = 4 * Math.ceil(w / 0.05);
    const books = new THREE.InstancedMesh(box(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), max);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    let n = 0;
    for (let shelf = 0; shelf < 4; shelf++) {
      let x = -w / 2 + 0.08;
      while (x < w / 2 - 0.14 && n < max) {
        if (r() < 0.08) {
          x += 0.15;
          continue;
        }
        const bw = 0.05 + r() * 0.06;
        const bh = 0.28 + r() * 0.14;
        m4.makeScale(bw, bh, 0.3).setPosition(x + bw / 2, 0.055 + shelf * 0.5 + bh / 2, 0.02);
        books.setMatrixAt(n, m4);
        books.setColorAt(n, col.set(pick(P.books, r)));
        n++;
        x += bw + 0.005;
      }
    }
    books.count = n;
    books.castShadow = true;
    books.receiveShadow = true;
    books.instanceMatrix.needsUpdate = true;
    if (books.instanceColor) books.instanceColor.needsUpdate = true;
    g.add(books);
    return g;
  },

  rug(d) {
    const w = d.w ?? 2;
    const dd = d.d ?? 3;
    return group(
      mesh(box(w, 0.02, dd), mat(d.color ?? '#d98c8c', 1), 0, 0.011, 0, false),
      mesh(box(w - 0.3, 0.022, dd - 0.3), mat(d.accent ?? '#f2c4b0', 1), 0, 0.012, 0, false),
    );
  },

  plant(_d, r) {
    const g = group(mesh(cyl(0.2, 0.15, 0.36, 12), mat(P.pot), 0, 0.18, 0), mesh(cyl(0.18, 0.18, 0.02, 12), mat(P.soil), 0, 0.36, 0, false));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r();
      const leaf = mesh(sph(0.16, 1), mat(i % 2 ? P.leaf1 : P.leaf2), Math.cos(a) * 0.12, 0.62, Math.sin(a) * 0.12);
      leaf.scale.set(0.6, 1.6, 0.6);
      leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(leaf);
    }
    return g;
  },

  window(d) {
    const w = d.w ?? 2;
    return group(
      mesh(box(w + 0.16, 1.36, 0.08), mat(P.woodLight), 0, 1.7, 0),
      mesh(box(w, 1.2, 0.09), glow(P.sky, 0.35), 0, 1.7, 0.005, false),
      mesh(box(0.05, 1.2, 0.1), mat(P.woodLight), 0, 1.7, 0.01),
      mesh(box(w, 0.05, 0.1), mat(P.woodLight), 0, 1.7, 0.01),
    );
  },

  sign(d) {
    const text = labelPlane(d.label ?? '', 0.36);
    const tw = (text.geometry as THREE.PlaneGeometry).parameters.width;
    text.position.z = 0.035;
    return group(mesh(box(tw + 0.3, 0.55, 0.06), mat(P.woodLight), 0, 0, 0), text);
  },

  cafeTable() {
    return group(
      mesh(cyl(0.42, 0.42, 0.05, 20), mat(P.woodLight), 0, 0.74, 0),
      mesh(cyl(0.05, 0.05, 0.7, 8), mat(P.dark), 0, 0.37, 0),
      mesh(cyl(0.25, 0.25, 0.04, 16), mat(P.dark), 0, 0.02, 0),
    );
  },

  stool(_d, r) {
    return group(
      mesh(cyl(0.22, 0.22, 0.07, 16), mat(pick(P.chairs, r)), 0, 0.445, 0),
      mesh(cyl(0.035, 0.035, 0.42, 6), mat(P.metal), 0, 0.21, 0),
      mesh(cyl(0.17, 0.17, 0.03, 14), mat(P.metal), 0, 0.015, 0),
    );
  },

  counter(d) {
    const w = d.w ?? 4;
    const dd = d.d ?? 0.9;
    return group(
      mesh(box(w, 1, dd), mat(P.wood), 0, 0.5, 0),
      mesh(box(w + 0.1, 0.06, dd + 0.1), mat(P.woodLight), 0, 1.03, 0),
      mesh(box(w, 0.08, 0.04), mat(P.woodDark), 0, 0.15, dd / 2 + 0.01),
    );
  },

  coffeeMachine() {
    return group(
      mesh(box(0.6, 0.55, 0.45), mat(P.machine), 0, 0.275, 0),
      mesh(box(0.62, 0.06, 0.47), mat(P.dark), 0, 0.58, 0),
      mesh(box(0.26, 0.08, 0.16), mat(P.dark), 0, 0.36, 0.25),
      mesh(box(0.36, 0.03, 0.22), mat(P.metal), 0, 0.02, 0.24),
      mesh(sph(0.03, 1), glow(P.red), 0.22, 0.45, 0.23, false),
      mesh(cyl(0.05, 0.04, 0.09, 10), mat(P.cup), 0, 0.08, 0.24),
    );
  },

  cup() {
    return group(
      mesh(cyl(0.05, 0.04, 0.09, 12), mat(P.cup), 0, 0.045, 0),
      mesh(cyl(0.045, 0.045, 0.005, 12), mat(P.coffee), 0, 0.092, 0, false),
    );
  },
};

export function makeDecor(d: Decor): THREE.Object3D {
  const o = builders[d.kind](d, rng(d.seed ?? d.x * 131 + d.z * 71));
  o.position.set(d.x, d.y ?? 0, d.z);
  o.rotation.y = d.rot ?? 0;
  return o;
}
```

- [ ] **Step 6: Create `client/src/world/sceneBuilder.ts`**

```ts
import * as THREE from 'three';
import { SCENES } from '../../../shared/scenes';
import type { Door, SceneDef } from '../../../shared/scenes/types';
import { makeDecor } from './decor';
import { mat, mesh } from './materials';
import { PALETTE as P } from './palette';
import { rng } from './rng';
import { textSprite } from './text';

function gradient([top, bottom]: [string, string]): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function floorTexture(def: SceneDef): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = rng(def.id.length * 97);
  const { floor, floorAccent, indoor } = def.theme;
  g.fillStyle = floor;
  g.fillRect(0, 0, 256, 256);
  if (indoor) {
    for (let y = 0; y < 256; y += 32) {
      g.globalAlpha = 0.55;
      g.fillStyle = r() < 0.5 ? floorAccent : floor;
      g.fillRect(0, y, 256, 31);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(0,0,0,.08)';
      g.fillRect(0, y + 31, 256, 1);
      g.fillRect(Math.floor(r() * 256), y, 1, 32);
    }
  } else {
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = r() < 0.5 ? floorAccent : 'rgba(255,255,255,.18)';
      g.fillRect(r() * 256, r() * 256, 2, 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function floor(def: SceneDef): THREE.Mesh {
  const indoor = def.theme.indoor;
  const k = indoor ? 1 : 3;
  const w = def.size.w * k;
  const d = def.size.d * k;
  const tex = floorTexture(def);
  const tile = indoor ? 2 : 4;
  tex.repeat.set(w / tile, d / tile);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

/** Back and side walls at full height; the front (camera side) is a low sill with gaps for doors. */
function walls(def: SceneDef): THREE.Group {
  const { w, d } = def.size;
  const wm = mat(def.theme.wall ?? '#f0dcc4');
  const tm = mat(def.theme.trim ?? P.woodDark);
  const g = new THREE.Group();
  g.add(
    mesh(new THREE.BoxGeometry(w + 0.4, 3, 0.2), wm, 0, 1.5, -d / 2 - 0.1),
    mesh(new THREE.BoxGeometry(0.2, 3, d + 0.2), wm, -w / 2 - 0.1, 1.5, 0),
    mesh(new THREE.BoxGeometry(0.2, 3, d + 0.2), wm, w / 2 + 0.1, 1.5, 0),
    mesh(new THREE.BoxGeometry(w, 0.18, 0.04), tm, 0, 0.09, -d / 2 + 0.02),
  );
  const gaps = def.doors.map((dr) => [dr.box.x - dr.box.w / 2, dr.box.x + dr.box.w / 2]).sort((a, b) => a[0] - b[0]);
  let x0 = -w / 2 - 0.2;
  for (const [a, b] of [...gaps, [w / 2 + 0.2, w / 2 + 0.2]]) {
    if (a > x0) g.add(mesh(new THREE.BoxGeometry(a - x0, 0.35, 0.2), tm, (a + x0) / 2, 0.175, d / 2 + 0.1));
    x0 = Math.max(x0, b);
  }
  return g;
}

function doorMat(door: Door): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(door.box.w, 0.02, door.box.d), mat('#d98f6a', 1), door.box.x, 0.012, door.box.z, false));
  const label = textSprite(`↓ ${SCENES[door.toScene]?.name ?? 'Out'}`, 0.26, { bg: '#ffffffcc', font: 36, pad: 12 });
  label.position.set(door.box.x, 0.9, door.box.z);
  g.add(label);
  return g;
}

/** Picket fence around the outdoor area so the invisible bounds feel intentional. */
function fence(def: SceneDef): THREE.Group {
  const { w, d } = def.size;
  const g = new THREE.Group();
  const m = mat('#fff6ea');
  const rails: [number, number, number, number][] = [
    [0, -d / 2, w, 0.06], [0, d / 2, w, 0.06], [-w / 2, 0, 0.06, d], [w / 2, 0, 0.06, d],
  ];
  for (const [x, z, rw, rd] of rails) for (const y of [0.3, 0.55]) g.add(mesh(new THREE.BoxGeometry(rw, 0.06, rd), m, x, y, z));
  const post = new THREE.BoxGeometry(0.08, 0.75, 0.08);
  for (let x = -w / 2; x <= w / 2; x += 2) for (const z of [-d / 2, d / 2]) g.add(mesh(post, m, x, 0.375, z));
  for (let z = -d / 2 + 2; z < d / 2; z += 2) for (const x of [-w / 2, w / 2]) g.add(mesh(post, m, x, 0.375, z));
  return g;
}

export function buildScene(def: SceneDef): THREE.Scene {
  const th = def.theme;
  const scene = new THREE.Scene();
  scene.background = Array.isArray(th.background) ? gradient(th.background) : new THREE.Color(th.background);
  if (th.fog) scene.fog = new THREE.Fog(th.fog.color, th.fog.near, th.fog.far);

  scene.add(new THREE.HemisphereLight(th.hemi.sky, th.hemi.ground, th.hemi.intensity));
  const sun = new THREE.DirectionalLight(th.sun.color, th.sun.intensity);
  sun.position.set(th.sun.x, th.sun.y, th.sun.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const ext = Math.max(def.size.w, def.size.d) / 2 + 3;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 80 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  scene.add(floor(def));
  if (th.indoor) {
    scene.add(walls(def));
    for (const door of def.doors) scene.add(doorMat(door));
  } else {
    scene.add(fence(def));
  }
  for (const d of def.decor) scene.add(makeDecor(d));

  const lamps = def.decor.filter((d) => d.kind === 'deskLamp' || d.kind === 'lampPost').slice(0, 8);
  for (const d of lamps) {
    const post = d.kind === 'lampPost';
    const light = new THREE.PointLight(P.lampGlow, post ? 6 : 1.6, post ? 7 : 3, 2);
    light.position.set(d.x, post ? 2.4 : 1.05, d.z);
    scene.add(light);
  }
  return scene;
}
```

- [ ] **Step 7: Create `client/src/world/overhead.ts`**

```ts
import * as THREE from 'three';
import type { EmoteKind, Session } from '../../../shared/types';
import { textSprite } from './text';

const EMOJI: Record<EmoteKind, string> = { wave: '👋', clap: '👏', flex: '💪', coffee: '☕' };
const EMOTE_MS = 1600;

/** Everything floating above a character: session ring, rain cloud, emotes. */
export class Overhead {
  readonly group = new THREE.Group();
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private ring: THREE.Sprite;
  private ringKey = '';
  private cloud = new THREE.Group();
  private drops: THREE.Mesh[] = [];
  private emotes: { s: THREE.Sprite; born: number }[] = [];

  constructor() {
    this.canvas.width = this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true }));
    this.ring.scale.set(0.62, 0.62, 1);
    this.ring.renderOrder = 11;
    this.ring.visible = false;
    this.group.add(this.ring);

    const cm = new THREE.MeshStandardMaterial({ color: '#9aa3b5', roughness: 1 });
    for (const [x, y, r] of [[0, 0, 0.22], [0.22, -0.03, 0.17], [-0.22, -0.03, 0.17], [0.08, 0.1, 0.16]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), cm);
      m.position.set(x, y, 0);
      this.cloud.add(m);
    }
    const dm = new THREE.MeshBasicMaterial({ color: '#7fb8ff' });
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.06, 2, 6), dm);
      d.position.set(-0.2 + i * 0.1, -0.25, 0);
      d.userData.off = i * 0.37;
      this.drops.push(d);
      this.cloud.add(d);
    }
    this.cloud.visible = false;
    this.group.add(this.cloud);
  }

  setSession(s: Session | null, now: number): void {
    if (!s) {
      this.ring.visible = false;
      this.ringKey = '';
      return;
    }
    const len = (s.phase === 'focus' ? s.focusMin : s.breakMin) * 60_000;
    const p = Math.min(1, Math.max(0, (now - s.phaseStartedAt) / len));
    this.ring.visible = true;
    const key = `${s.phase}:${Math.round(p * 200)}`;
    if (key === this.ringKey) return;
    this.ringKey = key;
    this.draw(s.phase, p);
  }

  private draw(phase: Session['phase'], p: number): void {
    const g = this.ctx;
    g.clearRect(0, 0, 128, 128);
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.fill();
    g.lineWidth = 10;
    g.lineCap = 'round';
    g.strokeStyle = '#ece4ef';
    g.beginPath();
    g.arc(64, 64, 47, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = phase === 'focus' ? '#f29e4c' : '#6cc785';
    g.beginPath();
    g.arc(64, 64, 47, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(p, 0.001));
    g.stroke();
    g.font = '46px "Apple Color Emoji", "Segoe UI Emoji", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(phase === 'focus' ? '📖' : '☕', 64, 68);
    this.tex.needsUpdate = true;
  }

  setRain(on: boolean): void {
    this.cloud.visible = on;
  }

  emote(kind: EmoteKind, now: number): void {
    const s = textSprite(EMOJI[kind], 0.5, { bg: null, font: 64, pad: 6 });
    s.position.y = -0.2;
    this.group.add(s);
    this.emotes.push({ s, born: now });
  }

  update(_dt: number, now: number): void {
    if (this.cloud.visible) {
      this.cloud.position.set(Math.sin(now * 0.002) * 0.05, this.ring.visible ? 0.55 : 0.1, 0);
      for (const d of this.drops) {
        const k = (now / 700 + (d.userData.off as number)) % 1;
        d.position.y = -0.2 - k * 0.45;
      }
    }
    this.emotes = this.emotes.filter(({ s, born }) => {
      const age = (now - born) / EMOTE_MS;
      if (age >= 1) {
        s.removeFromParent();
        s.material.map?.dispose();
        s.material.dispose();
        return false;
      }
      s.position.y = -0.2 + age * 0.9;
      s.material.opacity = 1 - age * age;
      return true;
    });
  }
}
```

- [ ] **Step 8: Create `client/src/world/character.ts`**

```ts
import * as THREE from 'three';
import type { Anim, Hat, Look } from '../../../shared/types';
import { Overhead } from './overhead';
import { textSprite } from './text';

const HAT_COLORS: Record<Exclude<Hat, 'none'>, string> = {
  beanie: '#ef7d7d',
  cap: '#6d9cf0',
  bucket: '#efd27a',
  flower: '#7cc47a',
};

function makeHat(h: Exclude<Hat, 'none'>): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.MeshStandardMaterial({ color: HAT_COLORS[h], roughness: 0.85 });
  const white = new THREE.MeshStandardMaterial({ color: '#fffaf2', roughness: 0.9 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  if (h === 'beanie') {
    add(new THREE.SphereGeometry(0.375, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), c, 0, 1.36, 0);
    add(new THREE.TorusGeometry(0.37, 0.05, 8, 28), white, 0, 1.42, 0).rotation.x = Math.PI / 2;
    add(new THREE.SphereGeometry(0.08, 10, 8), white, 0, 1.76, 0);
  } else if (h === 'cap') {
    add(new THREE.SphereGeometry(0.372, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), c, 0, 1.35, 0);
    add(new THREE.BoxGeometry(0.34, 0.025, 0.26), c, 0, 1.52, 0.38).rotation.x = 0.15;
  } else if (h === 'bucket') {
    add(new THREE.CylinderGeometry(0.27, 0.33, 0.24, 18), c, 0, 1.67, 0);
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 24), c, 0, 1.56, 0);
  } else {
    const colors = ['#f7a1c4', '#ffd36e', '#ffffff'];
    add(new THREE.TorusGeometry(0.29, 0.025, 6, 32), c, 0, 1.55, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.MeshStandardMaterial({ color: colors[i % 3], roughness: 0.8 });
      add(new THREE.SphereGeometry(0.07, 10, 8), m, Math.cos(a) * 0.29, 1.57, Math.sin(a) * 0.29);
    }
  }
  return g;
}

/** A chunky, big-headed, waddling little person. Faces +z when facing = 0. */
export class Character {
  readonly root = new THREE.Group();
  readonly overhead = new Overhead();
  anim: Anim = 'idle';
  facing = 0;

  private rig = new THREE.Group();
  private bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  private legMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  private skinMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  private darkMat = new THREE.MeshStandardMaterial({ color: '#3b3346', roughness: 0.6 });
  private blushMat = new THREE.MeshStandardMaterial({ color: '#ff9fb0', roughness: 1 });
  private hatGroup = new THREE.Group();
  private hatKey = '';
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private body: THREE.Mesh;
  private phase = 0;
  private dimmed = false;

  constructor(look: Look, name: string, isMe = false) {
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.rig) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    this.body = part(new THREE.CapsuleGeometry(0.26, 0.28, 6, 14), this.bodyMat, 0, 0.62, 0);
    part(new THREE.SphereGeometry(0.36, 24, 18), this.skinMat, 0, 1.32, 0);
    part(new THREE.BoxGeometry(0.07, 0.018, 0.02), this.darkMat, 0, 1.235, 0.352);
    for (const s of [-1, 1]) {
      part(new THREE.SphereGeometry(0.045, 10, 8), this.darkMat, s * 0.12, 1.36, 0.325);
      const blush = part(new THREE.SphereGeometry(0.06, 10, 8), this.blushMat, s * 0.21, 1.25, 0.29);
      blush.scale.set(1, 0.6, 0.4);
      blush.castShadow = false;

      const leg = new THREE.Group();
      leg.position.set(s * 0.11, 0.32, 0);
      part(new THREE.CapsuleGeometry(0.08, 0.16, 4, 10), this.legMat, 0, -0.16, 0, leg);
      this.rig.add(leg);
      this.legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(s * 0.3, 0.9, 0);
      arm.rotation.z = s * 0.25;
      part(new THREE.CapsuleGeometry(0.07, 0.2, 4, 10), this.bodyMat, 0, -0.16, 0, arm);
      this.rig.add(arm);
      this.arms.push(arm);
    }
    this.rig.add(this.hatGroup);
    this.root.add(this.rig);

    const tag = textSprite(name, 0.28, { bg: isMe ? '#fff4d6ee' : '#ffffffd9', font: 40, pad: 14 });
    tag.position.y = 2.0;
    this.root.add(tag);
    this.overhead.group.position.y = 2.5;
    this.root.add(this.overhead.group);
    this.setLook(look);
  }

  setLook(look: Look): void {
    this.bodyMat.color.set(look.body);
    this.legMat.color.set(look.body).offsetHSL(0, -0.05, -0.18);
    this.skinMat.color.set(look.skin);
    if (look.hat !== this.hatKey) {
      this.hatKey = look.hat;
      for (const c of [...this.hatGroup.children]) {
        c.removeFromParent();
        disposeTree(c);
      }
      if (look.hat !== 'none') this.hatGroup.add(makeHat(look.hat));
      if (this.dimmed) this.applyDim(true);
    }
  }

  /** Faded look while their connection is lost. */
  setDim(on: boolean): void {
    if (on === this.dimmed) return;
    this.dimmed = on;
    this.applyDim(on);
  }

  private applyDim(on: boolean): void {
    this.rig.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.transparent = on;
        m.opacity = on ? 0.4 : 1;
        m.depthWrite = !on;
      }
    });
  }

  update(dt: number, now: number): void {
    this.rig.rotation.y = this.facing;
    if (this.anim === 'walk') {
      this.phase += dt * 11;
      const s = Math.sin(this.phase);
      this.legs[0].rotation.x = s * 0.7;
      this.legs[1].rotation.x = -s * 0.7;
      this.arms[0].rotation.x = -s * 0.6;
      this.arms[1].rotation.x = s * 0.6;
      this.rig.position.y = Math.abs(s) * 0.06;
      this.rig.rotation.z = s * 0.09;
    } else if (this.anim === 'sit') {
      for (const l of this.legs) l.rotation.x = -Math.PI / 2;
      for (const a of this.arms) a.rotation.x = -0.9;
      this.rig.position.y = 0.16;
      this.rig.rotation.z = 0;
    } else {
      for (const l of this.legs) l.rotation.x = 0;
      const b = Math.sin(now * 0.003) * 0.05;
      this.arms[0].rotation.x = b;
      this.arms[1].rotation.x = -b;
      this.rig.position.y = 0;
      this.rig.rotation.z = 0;
    }
    this.body.scale.y = 1 + Math.sin(now * 0.0025) * 0.02;
    this.overhead.update(dt, now);
  }

  dispose(): void {
    this.root.removeFromParent();
    disposeTree(this.root);
  }
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((x) => {
    if (x instanceof THREE.Mesh || x instanceof THREE.Sprite) {
      x.geometry.dispose();
      const mats = Array.isArray(x.material) ? x.material : [x.material];
      for (const m of mats) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    }
  });
}
```

- [ ] **Step 9: Create the temporary preview `client/preview.html`**

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Preview</title>
<style>html,body{margin:0;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%}
#bar{position:fixed;top:10px;left:10px;display:flex;gap:6px}button{font:14px system-ui;padding:6px 10px}</style></head>
<body><canvas id="c"></canvas><div id="bar"></div><script type="module" src="/src/preview.ts"></script></body>
</html>
```

- [ ] **Step 10: Create the temporary preview `client/src/preview.ts`**

```ts
import * as THREE from 'three';
import { SCENES } from '../../shared/scenes';
import { HATS } from '../../shared/looks';
import { buildScene } from './world/sceneBuilder';
import { Character } from './world/character';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
let scene = buildScene(SCENES.town);
const chars: Character[] = [];
const colors = ['#f4a6a6', '#9cc9f0', '#a8d8a0', '#c9b2f2', '#f7c873'];

function populate(id: string) {
  scene = buildScene(SCENES[id]);
  chars.length = 0;
  HATS.forEach((hat, i) => {
    const c = new Character({ body: colors[i], skin: '#f3c9a5', hat }, hat, i === 0);
    c.root.position.set(-3 + i * 1.5, 0, 2);
    c.anim = i % 2 ? 'walk' : 'idle';
    if (i === 2) c.overhead.setSession({ phase: 'focus', focusMin: 25, breakMin: 5, phaseStartedAt: Date.now() - 9 * 60_000 }, Date.now());
    if (i === 3) c.overhead.setRain(true);
    scene.add(c.root);
    chars.push(c);
  });
  const seat = SCENES[id].seats[0];
  const sitter = new Character({ body: '#8fd3c7', skin: '#c68a5e', hat: 'bucket' }, 'sitting');
  sitter.root.position.set(seat.x, 0, seat.z);
  sitter.facing = seat.facing;
  sitter.anim = 'sit';
  scene.add(sitter.root);
  chars.push(sitter);
}

const bar = document.getElementById('bar')!;
for (const id of Object.keys(SCENES)) {
  const b = document.createElement('button');
  b.textContent = id;
  b.onclick = () => populate(id);
  bar.append(b);
}
populate('town');

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  const t = now * 0.0001;
  camera.position.set(Math.sin(t) * 2, 10, 8.5);
  camera.lookAt(0, 0.8, 0);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  for (const c of chars) c.update(dt, now);
  if (Math.floor(now / 2000) % 2 === 0 && chars[1]) chars[1].overhead.emote('clap', now);
  renderer.render(scene, camera);
});
```

- [ ] **Step 11: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. The production build is checked in Task 11, once `client/index.html` exists.

- [ ] **Step 12: Visual check in the browser**

Run: `npx vite --open /preview.html` (in the background), then click through `town`, `library`, and `cafe`.
Expected:
- each scene renders with soft shadows and pastel colours
- five characters show all five hats, and characters 2 and 4 waddle
- character 3 has an orange progress ring with 📖
- character 4 has a rain cloud with falling drops
- 👏 emotes rise and fade above character 2
- a character sits correctly at the first seat of each scene, facing the desk or table

Fix anything that looks broken (floating, sunk into the floor, facing the wrong way) before continuing. Stop the Vite server when done.

- [ ] **Step 13: Remove the preview and commit**

```bash
rm client/preview.html client/src/preview.ts
git add client/src/world
git commit -m "feat: add procedural 3D world: decor, scenes, goofy characters, overhead ring, rain and emotes"
```

---
### Task 10: HUD, join screen, chime, page shell and styles

These are DOM modules, and the logic they depend on (`format.ts`) is already tested. Verification is a typecheck plus the end-to-end run in Task 11.

**Files:**
- Create: `client/index.html`, `client/src/style.css`, `client/src/hud/dom.ts`, `client/src/hud/hud.ts`, `client/src/hud/joinScreen.ts`, `client/src/hud/chime.ts`

**Interfaces:**
- Consumes:
  - `formatClock`, `sessionLeftMs` (Task 8)
  - `ConnStatus` (Task 8)
  - `SCENES`, `SceneDef`, `PlayerView`, `FeedEvent`, `OnlineEntry`, `EmoteKind`, `Look`
  - `BODY_COLORS`, `SKIN_TONES`, `HATS`, `HAT_LABELS`, `NAME_MAX`
- Produces:
  - `class Hud`:
    - `onEditLook`
    - `show()`
    - `setConnection(s)`
    - `setStatus(me, def, serverNow)`
    - `setOnline(list)`
    - `resetFeed(events)`, `addFeed(e)`
    - `setPrompt(text|null)`
    - `toast(text, ms?)`
    - `modalOpen()`, `closeModals()`
    - `openSessionPicker(onPick(focusMin, breakMin))`
    - `confirmLeave(onLeave, onStay)`
    - `openPlayerCard(view, onEmote(kind))`, `updateCard(text)`, `cardTarget(): string|null`, `closeCard()`
  - `showJoin(opts: { mode: 'join'|'edit'; name?; look; error? }): Promise<{ inviteCode; name; look }>`
  - `chime(): void`
  - DOM ids: `c` (canvas), `fade`, `hud`, `status`, `online`, `feed`, `prompt`, `card`, `toasts`, `conn`, `join`, `gone`

- [ ] **Step 1: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>Virtual Study World</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📚</text></svg>" />
</head>
<body>
  <canvas id="c"></canvas>
  <div id="fade"></div>
  <div id="hud" hidden>
    <div id="status" class="glass panel"></div>
    <div id="online" class="glass panel"></div>
    <div id="feed" class="panel"></div>
    <div id="prompt" class="glass" hidden></div>
    <div id="card" class="glass" hidden></div>
    <div id="toasts"></div>
    <div id="conn" class="glass" hidden>🔌 Reconnecting…</div>
  </div>
  <div id="join" class="screen" hidden></div>
  <div id="gone" class="screen" hidden>
    <div class="glass join-card">
      <h1>👋 See you in the other tab</h1>
      <p>The town is open in another tab or device, so this one is paused.</p>
      <button class="primary" onclick="location.reload()">Use this tab instead</button>
    </div>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create `client/src/style.css`**

```css
:root {
  --glass: rgba(255, 250, 244, 0.8);
  --ink: #4a4058;
  --mut: #8a7f96;
  --acc: #f29e4c;
  --ok: #6cc785;
  --bad: #e76f6f;
  --gut: max(14px, env(safe-area-inset-left));
  font: 15px/1.35 ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif;
  color: var(--ink);
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: #3d2f3a; }
canvas#c { display: block; width: 100%; height: 100%; }
[hidden] { display: none !important; }

.glass {
  background: var(--glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid #ffffffaa;
  border-radius: 16px;
  box-shadow: 0 6px 24px #4a405822;
}
#fade { position: fixed; inset: 0; background: #fbeee0; opacity: 0; pointer-events: none; transition: opacity 0.35s ease; }

.panel { position: fixed; padding: 10px 14px; }
#status { top: 12px; left: var(--gut); min-width: 200px; }
#online { top: 12px; right: var(--gut); max-width: 280px; font-size: 13px; }
#feed { bottom: 14px; left: var(--gut); width: min(380px, 60vw); display: flex; flex-direction: column; gap: 6px; padding: 0; }
#feed .item {
  background: var(--glass); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  border-radius: 12px; padding: 7px 11px; font-size: 13px; transition: opacity 1s; box-shadow: 0 3px 12px #4a405818;
  border-left: 4px solid transparent;
}
#feed .item.old { opacity: 0; }
#feed:hover .item.old { opacity: 0.85; }
#feed .item.quit { border-left-color: var(--bad); }
#feed .item.finish { border-left-color: var(--ok); }
#feed .item.start { border-left-color: var(--acc); }

#prompt { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); padding: 9px 16px; font-weight: 650; white-space: nowrap; }
#card { position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%); padding: 12px 14px; min-width: 250px; }
#toasts { position: fixed; top: 74px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
.toast { padding: 10px 16px; animation: pop 0.25s ease-out; }
@keyframes pop { from { transform: scale(0.9); opacity: 0; } }
#conn { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); padding: 8px 14px; font-weight: 650; }

.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sub { color: var(--mut); font-size: 13px; }
.title { font-weight: 700; margin-bottom: 4px; }
.timer { font-size: 22px; font-weight: 800; margin: 2px 0; }
.timer.focus { color: #d9822b; }
.timer.break { color: #3fa860; }

button { font: inherit; color: var(--ink); background: #fff; border: 1px solid #e6dce8; border-radius: 12px; padding: 8px 12px; cursor: pointer; }
button:hover { background: #fff6ea; }
button.primary { background: var(--acc); color: #fff; border-color: transparent; }
button.mini { padding: 2px 7px; border-radius: 8px; font-size: 13px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }

.modal-back { position: fixed; inset: 0; background: #3d2f3a55; display: grid; place-items: center; }
.modal { padding: 20px 22px; width: min(460px, 92vw); }
.modal h2 { margin: 0 0 12px; font-size: 20px; }
.choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.choice { display: flex; flex-direction: column; gap: 2px; padding: 14px 8px; }
.choice b { font-size: 18px; }
.choice span { font-size: 12px; color: var(--mut); }
.custom { display: flex; gap: 10px; align-items: center; margin-top: 12px; flex-wrap: wrap; }

input { font: inherit; padding: 9px 11px; border-radius: 12px; border: 1px solid #e6dce8; background: #fff; color: var(--ink); width: 100%; }
.custom input { width: 72px; }

.screen { position: fixed; inset: 0; display: grid; place-items: center; background: linear-gradient(#9fd0f2, #fde9d6); }
.join-card { padding: 24px; width: min(440px, 92vw); display: flex; flex-direction: column; gap: 12px; }
.join-card h1 { margin: 0; font-size: 26px; }
label.field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--mut); }
.swatches, .hats { display: flex; gap: 7px; flex-wrap: wrap; }
.swatch { width: 30px; height: 30px; border-radius: 50%; padding: 0; border: 3px solid #fff; }
.swatch.on, .hats button.on { outline: 3px solid var(--acc); }
.err { color: var(--bad); min-height: 1.2em; font-size: 13px; }
```

- [ ] **Step 3: Create `client/src/hud/dom.ts`**

```ts
type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'style'>>;

/** Tiny element builder: h('button', { textContent: 'Hi', onclick }, child...). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...kids);
  return el;
}

export const byId = (id: string): HTMLElement => document.getElementById(id)!;
```

- [ ] **Step 4: Create `client/src/hud/hud.ts`**

```ts
import { SCENES } from '../../../shared/scenes';
import type { SceneDef } from '../../../shared/scenes/types';
import type { EmoteKind, FeedEvent, OnlineEntry, PlayerView } from '../../../shared/types';
import type { ConnStatus } from '../net/connection';
import { byId, h } from './dom';
import { formatClock, sessionLeftMs } from './format';

const FEED_SHOWN = 6;
const FEED_FADE_MS = 30_000;
const EMOTE_BUTTONS: [EmoteKind, string][] = [['wave', '👋 Wave'], ['clap', '👏'], ['flex', '💪'], ['coffee', '☕']];

export class Hud {
  onEditLook: () => void = () => {};
  private statusKey = '';
  private modal: HTMLElement | null = null;
  private modalClose: (() => void) | null = null;
  private cardId: string | null = null;

  constructor() {
    // After clicking a HUD button, give focus back to the page so Space/E keep driving the game.
    addEventListener('pointerup', () => {
      const a = document.activeElement;
      if (a instanceof HTMLButtonElement && !this.modal) a.blur();
    });
  }

  show(): void {
    byId('hud').hidden = false;
  }

  setConnection(s: ConnStatus): void {
    byId('conn').hidden = s !== 'reconnecting';
  }

  setStatus(me: PlayerView, def: SceneDef, now: number): void {
    const s = me.session;
    const line = s
      ? `${s.phase === 'focus' ? '📖 Focus' : '☕ Break'} · ${formatClock(sessionLeftMs(s, now))}`
      : me.seatId ? '🪑 Sitting' : `🚶 Wandering ${def.where}`;
    const key = `${me.name}|${line}|${def.id}`;
    if (key === this.statusKey) return;
    this.statusKey = key;
    byId('status').replaceChildren(
      h('div', { className: 'row' },
        h('b', { textContent: me.name }),
        h('button', { className: 'mini', title: 'Change your look', textContent: '✏️', onclick: () => this.onEditLook() })),
      h('div', { className: s ? `timer ${s.phase}` : 'sub', textContent: line }),
      h('div', { className: 'sub', textContent: `📍 ${def.name}` }),
    );
  }

  setOnline(list: OnlineEntry[]): void {
    const by = new Map<string, string[]>();
    for (const p of list) {
      const scene = SCENES[p.scene]?.name ?? p.scene;
      by.set(scene, [...(by.get(scene) ?? []), p.name]);
    }
    byId('online').replaceChildren(
      h('div', { className: 'title', textContent: `🏡 ${list.length} in town` }),
      ...[...by].map(([scene, names]) => h('div', {}, h('b', { textContent: scene }), ` · ${names.join(', ')}`)),
    );
  }

  resetFeed(events: FeedEvent[]): void {
    byId('feed').replaceChildren();
    for (const e of events.slice(-FEED_SHOWN)) this.addFeed(e);
  }

  addFeed(e: FeedEvent): void {
    const feed = byId('feed');
    const item = h('div', { className: `item ${e.kind}`, textContent: e.text });
    feed.append(item);
    while (feed.children.length > FEED_SHOWN) feed.firstElementChild!.remove();
    setTimeout(() => item.classList.add('old'), FEED_FADE_MS);
  }

  setPrompt(text: string | null): void {
    const el = byId('prompt');
    el.hidden = !text;
    if (text && el.textContent !== text) el.textContent = text;
  }

  toast(text: string, ms = 4000): void {
    const t = h('div', { className: 'glass toast', textContent: text });
    byId('toasts').append(t);
    setTimeout(() => t.remove(), ms);
  }

  modalOpen(): boolean {
    return this.modal !== null || !byId('join').hidden;
  }

  /** Closes the open modal and runs its "dismissed" callback, if any. */
  closeModals(): void {
    if (!this.modal) return;
    this.modal.remove();
    this.modal = null;
    const f = this.modalClose;
    this.modalClose = null;
    f?.();
  }

  private openModal(content: HTMLElement, onDismiss?: () => void): void {
    this.closeModals();
    const back = h('div', { className: 'modal-back' }, h('div', { className: 'glass modal' }, content));
    back.addEventListener('mousedown', (e) => {
      if (e.target === back) this.closeModals();
    });
    document.body.append(back);
    this.modal = back;
    this.modalClose = onDismiss ?? null;
  }

  /** Closes the modal without running its dismissed callback (the user chose an action). */
  private finishModal(): void {
    this.modalClose = null;
    this.closeModals();
  }

  openSessionPicker(onPick: (focusMin: number, breakMin: number) => void): void {
    const pick = (f: number, b: number) => {
      this.finishModal();
      onPick(f, b);
    };
    const focus = h('input', { type: 'number', min: '1', max: '120', value: '40' });
    const brk = h('input', { type: 'number', min: '1', max: '30', value: '8' });
    const custom = h('div', { className: 'custom', hidden: true },
      h('label', {}, 'Focus ', focus, ' min'),
      h('label', {}, 'Break ', brk, ' min'),
      h('button', {
        className: 'primary', textContent: 'Start',
        onclick: () => {
          const f = Math.round(Number(focus.value));
          const b = Math.round(Number(brk.value));
          if (f >= 1 && f <= 120 && b >= 1 && b <= 30) pick(f, b);
          else this.toast('Focus 1–120 min, break 1–30 min');
        },
      }));
    const choice = (title: string, sub: string, onclick: () => void) =>
      h('button', { className: 'choice', onclick }, h('b', { textContent: title }), h('span', { textContent: sub }));
    this.openModal(h('div', {},
      h('h2', { textContent: '📖 Start a study session' }),
      h('div', { className: 'choices' },
        choice('25 / 5', 'classic pomodoro', () => pick(25, 5)),
        choice('50 / 10', 'deep focus', () => pick(50, 10)),
        choice('Custom', 'your call', () => { custom.hidden = false; focus.focus(); })),
      custom,
      h('p', { className: 'sub', textContent: 'Everyone in town will see you studying. Leaving early shows up in the feed 🥀' }),
    ));
  }

  confirmLeave(onLeave: () => void, onStay: () => void): void {
    const stay = h('button', { className: 'primary', textContent: 'Keep studying', onclick: () => this.closeModals() });
    this.openModal(h('div', {},
      h('h2', { textContent: 'Leave your session early?' }),
      h('p', { textContent: 'Your friends will see that you left early 🥀' }),
      h('div', { className: 'actions' }, stay, h('button', { textContent: 'Leave anyway', onclick: () => { this.finishModal(); onLeave(); } })),
    ), onStay);
    stay.focus();
  }

  openPlayerCard(v: PlayerView, onEmote: (k: EmoteKind) => void): void {
    this.cardId = v.id;
    const el = byId('card');
    el.hidden = false;
    el.replaceChildren(
      h('div', { className: 'row' }, h('b', { textContent: v.name }), h('button', { className: 'mini', textContent: '✕', onclick: () => this.closeCard() })),
      h('div', { className: 'sub', id: 'card-status' }),
      h('div', { className: 'actions' }, ...EMOTE_BUTTONS.map(([k, label]) => h('button', { textContent: label, onclick: () => onEmote(k) }))),
    );
  }

  updateCard(text: string): void {
    const s = document.getElementById('card-status');
    if (s && s.textContent !== text) s.textContent = text;
  }

  cardTarget(): string | null {
    return this.cardId;
  }

  closeCard(): void {
    this.cardId = null;
    byId('card').hidden = true;
  }
}
```

- [ ] **Step 5: Create `client/src/hud/joinScreen.ts`**

```ts
import { NAME_MAX } from '../../../shared/constants';
import { BODY_COLORS, HAT_LABELS, HATS, SKIN_TONES } from '../../../shared/looks';
import type { Look } from '../../../shared/types';
import { byId, h } from './dom';

export interface JoinResult {
  inviteCode: string;
  name: string;
  look: Look;
}

export interface JoinOpts {
  mode: 'join' | 'edit';
  name?: string;
  look: Look;
  error?: string;
}

const NAME_KEY = 'vsw-name';

/** Full-screen card for first join (invite code + name + look) or editing your look later. */
export function showJoin(opts: JoinOpts): Promise<JoinResult> {
  const root = byId('join');
  const look: Look = { ...opts.look };
  return new Promise((resolve) => {
    const finish = (r: JoinResult) => {
      root.hidden = true;
      root.replaceChildren();
      resolve(r);
    };
    const code = h('input', { placeholder: 'Invite code', autocomplete: 'off' });
    const name = h('input', {
      placeholder: 'Your name', maxLength: NAME_MAX, autocomplete: 'nickname',
      value: opts.name ?? localStorage.getItem(NAME_KEY) ?? '', disabled: opts.mode === 'edit',
    });
    const err = h('div', { className: 'err', textContent: opts.error ?? '' });

    const swatches = (colors: readonly string[], key: 'body' | 'skin') => {
      const row = h('div', { className: 'swatches' });
      const render = () => row.replaceChildren(...colors.map((c) => {
        const b = h('button', { type: 'button', className: `swatch${look[key] === c ? ' on' : ''}`, title: c, onclick: () => { look[key] = c; render(); } });
        b.style.background = c;
        return b;
      }));
      render();
      return row;
    };
    const hats = h('div', { className: 'hats' });
    const renderHats = () => hats.replaceChildren(...HATS.map((hat) =>
      h('button', { type: 'button', className: look.hat === hat ? 'on' : '', textContent: HAT_LABELS[hat], onclick: () => { look.hat = hat; renderHats(); } })));
    renderHats();

    const form = h('form', {
      className: 'glass join-card',
      onsubmit: (e: SubmitEvent) => {
        e.preventDefault();
        const n = name.value.replace(/\s+/g, ' ').trim();
        if (opts.mode === 'join' && !code.value.trim()) {
          err.textContent = 'Enter the invite code your friend gave you.';
          return;
        }
        if (!n || [...n].length > NAME_MAX) {
          err.textContent = `Pick a name (1–${NAME_MAX} characters).`;
          return;
        }
        localStorage.setItem(NAME_KEY, n);
        finish({ inviteCode: code.value.trim(), name: n, look });
      },
    },
      h('h1', { textContent: opts.mode === 'join' ? '📚 Virtual Study World' : '✏️ Your look' }),
      opts.mode === 'join' ? h('div', { className: 'sub', textContent: 'A cozy little town for studying together.' }) : '',
      opts.mode === 'join' ? h('label', { className: 'field' }, 'Invite code', code) : '',
      h('label', { className: 'field' }, 'Name', name),
      h('label', { className: 'field' }, 'Outfit colour', swatches(BODY_COLORS, 'body')),
      h('label', { className: 'field' }, 'Skin tone', swatches(SKIN_TONES, 'skin')),
      h('label', { className: 'field' }, 'Hat', hats),
      err,
      h('div', { className: 'actions' },
        h('button', { className: 'primary', type: 'submit', textContent: opts.mode === 'join' ? 'Move in 🏡' : 'Save look' }),
        opts.mode === 'edit'
          ? h('button', { type: 'button', textContent: 'Cancel', onclick: () => finish({ inviteCode: '', name: opts.name ?? '', look: opts.look }) })
          : ''),
    );
    root.replaceChildren(form);
    root.hidden = false;
    (opts.mode === 'join' ? code : form.querySelector('button')!).focus();
  });
}
```

- [ ] **Step 6: Create `client/src/hud/chime.ts`**

```ts
let ctx: AudioContext | null = null;

/** Soft two-note chime for phase changes. Browsers allow it after the first keypress. */
export function chime(): void {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    for (const [freq, delay] of [[880, 0], [1318.5, 0.18]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(0.16, t + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 1.2);
      o.connect(g).connect(ctx.destination);
      o.start(t + delay);
      o.stop(t + delay + 1.3);
    }
  } catch {
    // audio is a nicety; never break the game over it
  }
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `h('input', { type: 'number', ... })` or the `hidden: true` prop gives a type error, it comes from `Partial<HTMLInputElement>` and readonly members. Fix it by setting the property after creating the element (for example `custom.hidden = true;`) rather than by loosening `Props`.

- [ ] **Step 8: Commit**

```bash
git add client/index.html client/src/style.css client/src/hud
git commit -m "feat: add HUD panels, feed, session picker, leave confirmation, player card and join screen"
```

---

### Task 11: Game loop, input, camera, transitions, boot, and end-to-end check

**Files:**
- Create: `client/src/game/input.ts`, `client/src/game/cameraRig.ts`, `client/src/game/transition.ts`, `client/src/game/game.ts`, `client/src/main.ts`, `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1, 2, 8, 9, 10
- Produces:
  - `class Input` with `on(key, fn)` and `axis(): {x, z}` (keys are lower-case `e.key` values: `'e'`, `' '`, `'escape'`)
  - `class CameraRig` with `camera`, `snap(x,z)`, `follow(x,z,dt)`, `zoomTo(k)`, `resize(w,h)`
  - `class Fade(el)` with `out()` and `in()`, each returning a Promise
  - `class Game(canvas, fadeEl, hud, send)` with `onMessage(m)` and `myView()`

- [ ] **Step 1: Create `client/src/game/input.ts`**

```ts
const GAME_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);

function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}

/** Keyboard state for WASD/arrows plus one-shot key handlers. Ignores keys typed into inputs. */
export class Input {
  private down = new Set<string>();
  private handlers = new Map<string, () => void>();

  constructor() {
    addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (GAME_KEYS.has(k) && e.target === document.body) e.preventDefault(); // no page scroll on Space/arrows
      this.down.add(k);
      if (!e.repeat) this.handlers.get(k)?.();
    });
    addEventListener('keyup', (e) => this.down.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.down.clear());
  }

  on(key: string, fn: () => void): void {
    this.handlers.set(key, fn);
  }

  /** Normalised movement direction on the ground plane (+z = down the screen). */
  axis(): { x: number; z: number } {
    const d = (a: string, b: string) => this.down.has(a) || this.down.has(b);
    let x = (d('d', 'arrowright') ? 1 : 0) - (d('a', 'arrowleft') ? 1 : 0);
    let z = (d('s', 'arrowdown') ? 1 : 0) - (d('w', 'arrowup') ? 1 : 0);
    const len = Math.hypot(x, z);
    if (len > 0) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }
}
```

- [ ] **Step 2: Create `client/src/game/cameraRig.ts`**

```ts
import * as THREE from 'three';

const OFFSET = new THREE.Vector3(0, 10, 8.5); // about 50° down from horizontal

/** Fixed-angle follow camera (no orbit), so W is always "up the screen". */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private target = new THREE.Vector3();
  private zoom = 1;
  private zoomTarget = 1;

  snap(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.apply();
  }

  zoomTo(k: number): void {
    this.zoomTarget = k;
  }

  follow(x: number, z: number, dt: number): void {
    const k = 1 - Math.exp(-dt * 6);
    this.target.x += (x - this.target.x) * k;
    this.target.z += (z - this.target.z) * k;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 4));
    this.apply();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private apply(): void {
    this.camera.position.copy(this.target).addScaledVector(OFFSET, this.zoom);
    this.camera.lookAt(this.target.x, 0.8, this.target.z);
  }
}
```

- [ ] **Step 3: Create `client/src/game/transition.ts`**

```ts
/** Warm full-screen fade used when walking through doors (CSS transition: 0.35 s). */
export class Fade {
  constructor(private el: HTMLElement) {}

  out(): Promise<void> {
    return this.to(1);
  }

  in(): Promise<void> {
    return this.to(0);
  }

  private to(opacity: number): Promise<void> {
    this.el.style.opacity = String(opacity);
    return new Promise((r) => setTimeout(r, 360));
  }
}
```

- [ ] **Step 4: Create `client/src/game/game.ts`**

```ts
import * as THREE from 'three';
import { INTERACT_RADIUS, MOVE_SPEED, PLAYER_RADIUS } from '../../../shared/constants';
import { inBox, moveWithCollision } from '../../../shared/geometry';
import type { ClientMsg, ErrorCode, ServerMsg } from '../../../shared/protocol';
import { getScene } from '../../../shared/scenes';
import type { SceneDef } from '../../../shared/scenes/types';
import type { EmoteKind, PlayerView } from '../../../shared/types';
import { chime } from '../hud/chime';
import { statusText } from '../hud/format';
import type { Hud } from '../hud/hud';
import { Interp } from '../net/interp';
import { Character } from '../world/character';
import { buildScene } from '../world/sceneBuilder';
import { CameraRig } from './cameraRig';
import { serverNow, syncClock } from './clock';
import { Input } from './input';
import { pickTarget, type Target } from './interaction';
import { Fade } from './transition';

interface Remote {
  view: PlayerView;
  char: Character;
  interp: Interp;
}

const SEND_EVERY_MS = 80;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private rig = new CameraRig();
  private input = new Input();
  private fade: Fade;
  private scenes = new Map<string, THREE.Scene>();
  private def: SceneDef | null = null;
  private scene: THREE.Scene | null = null;
  private me: PlayerView | null = null;
  private myChar: Character | null = null;
  private remotes = new Map<string, Remote>();
  private x = 0;
  private z = 0;
  private facing = 0;
  private moving = false;
  private lastSent = 0;
  private transitioning = false;
  private standPending = false;
  private waitForRelease = false;
  private target: Target | null = null;
  private last = performance.now();

  constructor(canvas: HTMLCanvasElement, fadeEl: HTMLElement, private hud: Hud, private send: (m: ClientMsg) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.fade = new Fade(fadeEl);
    addEventListener('resize', () => this.resize());
    this.resize();
    this.input.on('e', () => this.interact());
    this.input.on(' ', () => this.openSessionPicker());
    this.input.on('escape', () => {
      this.hud.closeModals();
      this.hud.closeCard();
    });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  myView(): PlayerView | null {
    return this.me;
  }

  onMessage(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome':
        syncClock(m.serverTime);
        this.enter(m.you, m.players);
        this.hud.setOnline(m.online);
        this.hud.resetFeed(m.feed);
        if (this.transitioning) this.endTransition();
        break;
      case 'sceneSnapshot':
        this.enter(m.you, m.players);
        this.endTransition();
        break;
      case 'playerJoined':
        this.addRemote(m.player);
        break;
      case 'playerLeft':
        this.removeRemote(m.id);
        break;
      case 'playerMoved': {
        const r = this.remotes.get(m.id);
        if (!r) break;
        r.view = { ...r.view, x: m.x, z: m.z, facing: m.facing, anim: m.anim };
        r.interp.push(m, performance.now());
        break;
      }
      case 'playerUpdated':
        if (m.player.id === this.me?.id) this.updateMe(m.player);
        else this.updateRemote(m.player);
        break;
      case 'emote': {
        const c = m.fromId === this.me?.id ? this.myChar : this.remotes.get(m.fromId)?.char;
        c?.overhead.emote(m.kind, performance.now());
        break;
      }
      case 'online':
        this.hud.setOnline(m.list);
        break;
      case 'feed':
        this.hud.addFeed(m.event);
        break;
      case 'error':
        this.onError(m.code, m.message);
        break;
    }
  }

  // ---------- scene & players ----------

  private enter(you: PlayerView, players: PlayerView[]): void {
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    this.def = getScene(you.scene)!;
    let scene = this.scenes.get(you.scene);
    if (!scene) {
      scene = buildScene(this.def);
      this.scenes.set(you.scene, scene);
    }
    this.scene = scene;
    this.myChar ??= new Character(you.look, you.name, true);
    this.myChar.setLook(you.look);
    scene.add(this.myChar.root); // add() detaches it from the previous scene
    this.me = you;
    this.x = you.x;
    this.z = you.z;
    this.facing = you.facing;
    this.moving = false;
    this.standPending = false;
    for (const p of players) this.addRemote(p);
    this.rig.snap(this.x, this.z);
    this.hud.closeCard();
  }

  private addRemote(v: PlayerView): void {
    if (!this.scene || v.id === this.me?.id || this.remotes.has(v.id)) return;
    const char = new Character(v.look, v.name);
    const interp = new Interp();
    interp.push(v, performance.now());
    this.scene.add(char.root);
    this.remotes.set(v.id, { view: v, char, interp });
  }

  private updateRemote(v: PlayerView): void {
    const r = this.remotes.get(v.id);
    if (!r) {
      if (v.scene === this.me?.scene) this.addRemote(v);
      return;
    }
    r.view = v;
    r.interp.push(v, performance.now());
    r.char.setLook(v.look);
  }

  private removeRemote(id: string): void {
    const r = this.remotes.get(id);
    if (!r) return;
    r.char.dispose();
    this.remotes.delete(id);
    if (this.hud.cardTarget() === id) this.hud.closeCard();
  }

  private updateMe(p: PlayerView): void {
    const prev = this.me!;
    this.me = p;
    if (p.seatId) {
      this.x = p.x;
      this.z = p.z;
      this.facing = p.facing;
    } else {
      this.standPending = false;
    }
    this.myChar!.setLook(p.look);
    if (prev.session?.phase === 'focus' && p.session?.phase === 'break') {
      chime();
      this.hud.toast('✨ Session done! Break time ☕ Stretch, wander, grab a coffee.', 6000);
    }
    if (prev.session?.phase === 'break' && !p.session) {
      chime();
      this.hud.toast(p.seatId ? "Break's over! Press Space to start another round 📖" : "Break's over! Find a seat to start another round 📖", 6000);
    }
  }

  private onError(code: ErrorCode, message: string): void {
    if (code === 'bad_door' && this.transitioning) {
      this.x -= Math.sin(this.facing) * 0.8; // step back out of the doorway
      this.z -= Math.cos(this.facing) * 0.8;
      this.endTransition();
      return;
    }
    this.hud.toast(code === 'seat_taken' ? '💺 That seat is taken!' : message);
  }

  // ---------- local player ----------

  private updateLocal(dt: number, nowP: number): void {
    const me = this.me!;
    const def = this.def!;
    const a = this.input.axis();
    const pressing = a.x !== 0 || a.z !== 0;
    if (!pressing) this.waitForRelease = false;
    if (this.transitioning || this.hud.modalOpen() || this.waitForRelease) {
      this.stopMoving(nowP);
      return;
    }
    if (me.seatId) {
      if (pressing && !this.standPending) this.requestStand();
      return;
    }
    if (!pressing) {
      this.stopMoving(nowP);
      return;
    }
    const r = moveWithCollision(this.x, this.z, a.x * MOVE_SPEED * dt, a.z * MOVE_SPEED * dt, PLAYER_RADIUS, def.colliders, def.size);
    this.x = r.x;
    this.z = r.z;
    this.facing = Math.atan2(a.x, a.z);
    this.moving = true;
    if (nowP - this.lastSent >= SEND_EVERY_MS) this.sendMove(nowP);
    const door = def.doors.find((d) => inBox(d.box, this.x, this.z));
    if (door) void this.goThrough(door.id);
  }

  private stopMoving(nowP: number): void {
    if (!this.moving) return;
    this.moving = false;
    this.sendMove(nowP);
  }

  private sendMove(nowP: number): void {
    this.lastSent = nowP;
    this.send({ t: 'move', x: this.x, z: this.z, facing: this.facing, anim: this.moving ? 'walk' : 'idle' });
  }

  private requestStand(): void {
    this.standPending = true;
    if (this.me?.session?.phase === 'focus') {
      this.hud.confirmLeave(
        () => this.send({ t: 'stand' }),
        () => {
          this.standPending = false;
          this.waitForRelease = true;
        },
      );
      return;
    }
    this.send({ t: 'stand' });
  }

  private interact(): void {
    if (!this.me || this.transitioning || this.hud.modalOpen()) return;
    if (this.me.seatId) {
      if (!this.standPending) this.requestStand();
      return;
    }
    const t = this.target;
    if (!t) return;
    if (t.kind === 'seat') {
      this.sendMove(performance.now()); // make sure the server has our exact spot
      this.send({ t: 'sit', seatId: t.seat.id });
      return;
    }
    const r = this.remotes.get(t.id);
    if (r) this.hud.openPlayerCard(r.view, (kind: EmoteKind) => this.send({ t: 'emote', kind, targetId: t.id }));
  }

  private openSessionPicker(): void {
    if (!this.me || this.transitioning || this.hud.modalOpen()) return;
    if (!this.me.seatId) {
      this.hud.toast('🪑 Find a seat first: walk up to a desk and press E');
      return;
    }
    if (this.me.session?.phase === 'focus') return;
    this.hud.openSessionPicker((focusMin, breakMin) => this.send({ t: 'startSession', focusMin, breakMin }));
  }

  private async goThrough(doorId: string): Promise<void> {
    this.transitioning = true;
    this.moving = false;
    this.sendMove(performance.now());
    this.hud.closeCard();
    this.rig.zoomTo(0.8);
    await this.fade.out();
    this.send({ t: 'enterScene', doorId });
  }

  private endTransition(): void {
    this.rig.zoomTo(1);
    void this.fade.in().then(() => {
      this.transitioning = false;
    });
  }

  private promptText(): string | null {
    const me = this.me!;
    if (this.transitioning) return null;
    if (me.seatId) {
      if (me.session?.phase === 'focus') return 'Focusing… [E] leave early';
      if (me.session?.phase === 'break') return '[Space] start another round · [E] stand up';
      return '[Space] start a study session · [E] stand up';
    }
    if (this.target?.kind === 'seat') return '[E] sit down';
    if (this.target?.kind === 'player') return `[E] say hi to ${this.remotes.get(this.target.id)?.view.name ?? 'them'}`;
    return null;
  }

  // ---------- frame ----------

  private resize(): void {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.rig.resize(innerWidth, innerHeight);
  }

  private frame(): void {
    const nowP = performance.now();
    const dt = Math.min((nowP - this.last) / 1000, 0.1);
    this.last = nowP;
    if (!this.me || !this.def || !this.scene || !this.myChar) return;
    const sNow = serverNow();
    this.updateLocal(dt, nowP);

    const taken = new Set<string>();
    if (this.me.seatId) taken.add(this.me.seatId);
    const others: { id: string; x: number; z: number }[] = [];
    for (const [id, r] of this.remotes) {
      const pose = r.interp.sample(nowP);
      r.char.root.position.set(pose.x, 0, pose.z);
      r.char.facing = pose.facing;
      r.char.anim = r.view.seatId ? 'sit' : r.view.anim;
      r.char.setDim(!r.view.connected);
      r.char.overhead.setSession(r.view.session, sNow);
      r.char.overhead.setRain(r.view.rainUntil > sNow);
      r.char.update(dt, nowP);
      if (r.view.seatId) taken.add(r.view.seatId);
      others.push({ id, x: pose.x, z: pose.z });
    }

    const c = this.myChar;
    c.root.position.set(this.x, 0, this.z);
    c.facing = this.facing;
    c.anim = this.me.seatId ? 'sit' : this.moving ? 'walk' : 'idle';
    c.overhead.setSession(this.me.session, sNow);
    c.overhead.setRain(this.me.rainUntil > sNow);
    c.update(dt, nowP);

    this.target = this.transitioning || this.me.seatId ? null : pickTarget(this.x, this.z, this.def.seats, taken, others);
    this.hud.setPrompt(this.promptText());
    this.hud.setStatus(this.me, this.def, sNow);

    const cardId = this.hud.cardTarget();
    if (cardId) {
      const r = this.remotes.get(cardId);
      const far = !r || Math.hypot(r.char.root.position.x - this.x, r.char.root.position.z - this.z) > INTERACT_RADIUS + 1;
      if (far) this.hud.closeCard();
      else this.hud.updateCard(statusText(r.view, sNow));
    }

    this.rig.follow(this.x, this.z, dt);
    this.renderer.render(this.scene, this.rig.camera);
  }
}
```

- [ ] **Step 5: Create `client/src/main.ts`**

```ts
import './style.css';
import { DEFAULT_LOOK } from '../../shared/looks';
import type { ClientMsg } from '../../shared/protocol';
import { Game } from './game/game';
import { byId } from './hud/dom';
import { Hud } from './hud/hud';
import { showJoin } from './hud/joinScreen';
import { Connection } from './net/connection';

const TOKEN_KEY = 'vsw-token';
const hud = new Hud();
const conn = new Connection(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
let game: Game | null = null;
let hello: ClientMsg | null = null;

async function askJoin(error?: string): Promise<void> {
  const r = await showJoin({ mode: 'join', look: DEFAULT_LOOK, error });
  hello = { t: 'hello', inviteCode: r.inviteCode, name: r.name, look: r.look };
  conn.send(hello); // if the socket isn't open yet, onOpen sends it
}

conn.onOpen = () => {
  if (hello) conn.send(hello);
};
conn.onStatus = (s) => hud.setConnection(s);
conn.onMessage = (m) => {
  if (m.t === 'welcome') {
    if (m.token) localStorage.setItem(TOKEN_KEY, m.token);
    hello = { t: 'hello', token: localStorage.getItem(TOKEN_KEY)! };
    hud.show();
    game ??= new Game(byId('c') as HTMLCanvasElement, byId('fade'), hud, (msg) => conn.send(msg));
  }
  if (m.t === 'error' && m.code === 'unknown_token') {
    localStorage.removeItem(TOKEN_KEY);
    hello = null;
    void askJoin();
    return;
  }
  if (m.t === 'error' && (m.code === 'bad_invite' || m.code === 'bad_profile')) {
    hello = null;
    void askJoin(m.message);
    return;
  }
  if (m.t === 'error' && m.code === 'connected_elsewhere') {
    conn.stop();
    byId('gone').hidden = false;
    return;
  }
  game?.onMessage(m);
};

hud.onEditLook = async () => {
  const me = game?.myView();
  if (!me) return;
  const r = await showJoin({ mode: 'edit', name: me.name, look: me.look });
  conn.send({ t: 'updateLook', look: r.look });
};

const token = localStorage.getItem(TOKEN_KEY);
if (token) hello = { t: 'hello', token };
conn.connect();
if (!token) void askJoin();
```

- [ ] **Step 6: Create `README.md`**

````markdown
# 📚 Virtual Study World

A cozy top-down 3D town where you and your friends study together. Walk around with WASD, sit at a desk in the Library, the Café or the park, and start a Pomodoro session. Everyone sees your progress ring, and everyone sees it if you bail early 🥀.

## Run it locally

Use two terminals:

```bash
npm install
INVITE_CODE=cozy npm run dev:server   # game server on :8787
npm run dev:client                    # Vite on :5173, proxies /ws to the server
```

Open http://localhost:5173 and enter the invite code `cozy`.

To see two players at once, use a normal window and a private window. Tabs in the same window share a device token, so the newer tab takes over from the older one.

## Production

```bash
npm run build                          # builds the client into dist/client
INVITE_CODE=<secret> PORT=8787 DB_PATH=data.db npm start
```

One process serves the page and the WebSocket (`/ws`). Profiles are stored in `data.db`. `GET /health` returns `ok`.

## Controls

| Key | Action |
|---|---|
| WASD / arrows | walk |
| E | sit / stand / say hi to someone nearby |
| Space | start a study session (while seated) |
| Esc | close dialogs |

## Tests

```bash
npm test          # vitest: shared, server and client logic
npm run typecheck
```
````

- [ ] **Step 7: Run the full automated check**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass, there are no type errors, and Vite writes `dist/client/index.html` plus assets. A chunk-size warning for Three.js is fine.

- [ ] **Step 8: End-to-end manual check**

Run (in the background): `INVITE_CODE=cozy PORT=8787 DB_PATH=:memory: npm start`
Open `http://localhost:8787` in a normal window and in a private window, and join as "Sam" and as "Alex".

Expected checklist:
1. The join screen shows, a wrong code gives an inline error, and the right code drops you into the Town.
2. WASD moves the character with a waddle, the camera follows, trees and buildings block you, and the fence edge stops you.
3. Each window sees the other player moving smoothly, the online panel lists both, and the feed shows "🌷 … arrived".
4. Walking into the Library door fades you into the Library. The other window sees you leave the Town, and its online panel says Library.
5. At a desk, "[E] sit down" appears. Pressing E sits you down, and the other window (in the same scene) sees you seated.
6. Space opens the picker. Choosing Custom 1/1 starts a session: a progress ring appears over your head in both windows, and the feed says "📚 Sam started a 1 min session in the Library".
7. After 1 minute, a chime plays, the "Break time" toast shows, and the ring turns green ☕.
8. Start another round, press W, and the "Leave your session early?" dialog appears. Keep studying keeps you seated. Leave anyway posts "🥀 Sam left 0 min into a 1 min session" and shows a rain cloud above you in both windows.
9. Walk up to the other player and press E: the card shows their status. 💪 floats an emote and the feed says "Sam cheered Alex 💪".
10. Close one window. Within 60 s the character appears dimmed. Reopen it and you're back as the same profile. Close it again for more than 60 s and the feed says "👋 … headed home".
11. Reloading a tab that has a token skips the join screen.

Fix any failures before committing, then stop the server.

- [ ] **Step 9: Commit**

```bash
git add client/src/game client/src/main.ts README.md
git commit -m "feat: wire game loop, movement, doors, sitting, sessions and HUD into a playable town"
```

---

## Spec coverage

| Spec section | Tasks |
|---|---|
| §2 Architecture (one process, node:sqlite, static + /ws) | 1, 4, 7 |
| §3.1–3.2 Scenes as data; Town / Library / Café | 2 |
| §3.3 Movement, collision, fixed camera | 1 (geometry), 11 (input, camera, game) |
| §3.4 Scene transitions with fade | 6 (server), 11 (Fade, goThrough) |
| §4 Identity: invite code, name, look, token, duplicate tabs | 3, 4, 6, 7, 10 (join screen), 11 (main) |
| §5 Protocol, server state, smoothing | 3, 6, 8 (interp) |
| §6 Sessions, visibility, early quit, disconnect grace, stand-confirm | 5, 6, 9 (ring, rain), 10 (picker, confirm), 11 |
| §7 Name tags, player card, emotes, feed | 6, 9, 10, 11 |
| §8 HUD and look | 9, 10 |
| §9 Error handling | 3, 6, 7, 8 (backoff), 10, 11 |
| §10 Testing | 1–8 automated, 9 and 11 manual |
