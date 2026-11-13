# Photo Booth and Pottery Wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A photo booth in the studio that saves 256×256 JPEG keepsakes (hangable in cabins, pinned on a cork board) and a pottery wheel that sells a personal mug (4 shapes, glaze + accent) everyone sees when you hold a drink.

**Architecture:** Photos ride the round-1 painting pipeline (`paint` message, `paintings` table, `/art/<id>.png`, `Pictures` frames) with a new `mode: 'photo'`. Mugs are a small `Mug` record on the profile, carried in `PlayerView`, drawn by `mugMesh` in `Character.setHolding`. New client UI lives in `client/src/art/`; server logic in `server/src/studio.ts`; `world.ts`/`game.ts` only gain wiring lines.

**Tech Stack:** TypeScript, Three.js, Node 24 `node:sqlite`, `ws`, Vite, Vitest. Spec: `docs/superpowers/specs/2026-11-12-photo-booth-pottery-design.md`.

## Global Constraints

- Ponytail rules; terse tasks (names, numbers, tests). Follow round-1 patterns: `server/src/studio.ts` + `Port`, `client/src/art/rooms.ts` (`ArtRooms`), `client/src/art/views.ts` (`Pictures`), `client/src/art/catalogue.ts`, `client/src/art/paint.ts`, `shared/scenes/studio.ts`, `client/src/toys/local.ts`.
- Exact values: photo = 256×256 JPEG quality 0.8, `mode: 'photo'`, `forSale` forced false, JPEG magic `FF D8 FF`, same `PAINTING_MAX_BYTES` (65536) and `PAINTINGS_MAX` (40); cork board `GALLERY_PHOTOS = 8` newest; booth reuse guard 10 s client-side; countdown 3-2-1 at 1 s steps; `MUG_SHAPES = ['classic','tall','round','tiny']`, `MUG_PRICE = 10` (admins 0), `DEFAULT_MUG = { shape: 'classic', glaze: '#fffaf2', accent: '#c98a5a' }`; mug colours must be in `PALETTE`.
- No browser, headless Chrome, Vite dev server or watch process on the Mac. Verify with `npm run typecheck`, `npx vitest run <file>`, one `npm test`, one `npm run build`.
- No AI attribution in commits. Commit messages like the history (`feat: …`, `fix: …`).

---

### Task 1: Shared types, palette move, protocol, validation

**Files:** modify `shared/art.ts` (add `PALETTE` moved verbatim from `client/src/art/paintCore.ts`, `PaintMode` += `'photo'`, `PAINT_MODES`, `GALLERY_PHOTOS = 8`, `isJpeg(b: Uint8Array)`), `client/src/art/paintCore.ts` (re-export/import `PALETTE` from shared; move its palette test), create `shared/mug.ts` (`MUG_SHAPES`, `MugShape`, `Mug`, `MUG_PRICE`, `DEFAULT_MUG`, `isMug(x: unknown): x is Mug`) + `shared/mug.test.ts`, modify `shared/types.ts` (`PlayerView.mug: Mug | null`), `shared/protocol.ts` (`{ t: 'throwMug'; mug: Mug }`; `gallery` gains `photos: PaintingMeta[]`; `ErrorCode` += `'bad_mug'`), `server/src/validate.ts` (+ tests: `throwMug` accepted/rejected; `paint` with `mode: 'photo'` accepted).
**Also:** every place that builds a `PlayerView` or a `gallery` message must compile — add `mug: null` / `photos: []` placeholders in `server/src/world.ts` `toView` and `server/src/studio.ts` `sendGallery` (Task 3 fills them).
Commit `feat: photo mode, mug type and messages`.

### Task 2: Studio scene additions and decor/toy views

**Files:** modify `shared/scenes/types.ts` (`DecorKind` += `'curtain' | 'corkBoard' | 'potteryWheel'`), `shared/toys.ts` (`ToyKind` += `'photoBooth' | 'wheel'`, both in `LOCAL_TOYS`), `server/src/toys.ts` (`none` handlers), `shared/scenes/studio.ts` (west side: `curtain {x -7.9, z -1, rot π/2, w 2.6}` on the west wall, `simpleToy('booth', 'photoBooth', -6.6, -1, 2.4)`, export `BOOTH_BOX: Box = { x: -6.6, z: -1, w: 2.6, d: 2 }` and `BOOTH_CAM = { x: -3.2, y: 1.6, z: -1, lookAt: { x: -7.5, y: 1.0, z: -1 } }`; east side: `corkBoard {x 7.93, z -1.2, y 1.8, rot -π/2, w 2.4, h 1.6}` with export `CORK_PINS: Spot[]` = 8 wall spots `c0..c7` in two rows of 4 (x 7.9, z ∈ [-2.1, -1.5, -0.9, -0.3], y 2.2 / 1.4, rot -π/2, kind `'wall'`), `potteryWheel {x 6.6, z 2.2}` + `simpleToy('wheel', 'wheel', 6.6, 2.2, 1.6, { x: 6.6, z: 2.2, w: 0.9, d: 0.9 })`), `client/src/world/decor.ts` (builders: `curtain` = rod + pleated cloth in `d.color ?? '#b56a5a'`; `corkBoard` = cork panel w×h with a wooden frame; `potteryWheel` = low stool, flywheel disc, clay lump), `client/src/toys/local.ts` + `registry.ts` (`photoBoothView` = camera-on-tripod + sign `📸 Photo booth`; `wheelView` = sign `🏺 Pottery`; prompts `[E] take a photo 📸`, `[E] throw a mug 🏺`), `client/src/hud/minimap.ts` (nothing new needed). Tests: `shared/scenes/scenes.test.ts` already covers toys/spots; add `curtain`/`corkBoard`/`potteryWheel` to `decor.test.ts` if Node-safe.
Commit `feat: studio photo booth, cork board and pottery wheel props`.

### Task 3: Server — photos, cork board, mugs

**Files:** modify `server/src/db.ts` (`ALTER TABLE profiles ADD COLUMN mug_json TEXT` via `addCol`; `mug(id): Mug | null`; `setMug(id, mug, price): boolean` atomic like `spend` but `UPDATE profiles SET kp = kp - ?, mug_json = ? WHERE id = ? AND kp >= ?`; `photos(limit): PaintingMeta[]` newest first where `mode = 'photo'`; `paintingPng(id)` → `{ png: Buffer; mode: PaintMode } | null`), `server/src/studio.ts` (`paint`: for `mode === 'photo'` check `isJpeg` + cap only and force `forSale = false`; `setSale` refuses photos with `bad_art`; `sendGallery` sends `{ forSale, photos: store.photos(GALLERY_PHOTOS) }` and is also broadcast when a photo is saved; new `throwMug(p, mug)`: `isMug` else `bad_mug`, `store.setMug(id, mug, priceFor(MUG_PRICE))` else `no_kp`, then `walletChanged`, `playerUpdated` via a new `Port.mugChanged(id, mug)` or by having World reload `p.mug` — pick the smaller), `server/src/world.ts` (`Player.mug` loaded from `store.mug` at join, `toView` carries it, dispatch `throwMug`), `server/src/server.ts` (`/art/` content-type `image/jpeg` when mode is `photo`), `server/src/feed.ts` (`mug: (name) => \`🏺 ${name} fired a new mug\``). Tests in `server/src/world.studio.test.ts` + `db.test.ts`: photo saved (JPEG fixture = `Buffer.from([0xff,0xd8,0xff,0xe0, …padding])`) with `forSale false`, appears in `gallery.photos` and not `forSale`, served as `image/jpeg` (server.test.ts), PNG bytes with `mode: 'photo'` refused, `setSale` on a photo refused; `throwMug` charges 10, admin 0, bad colour refused, poor refused, `playerUpdated.mug` set.
Commit `feat: photos on the cork board, mugs fired for 10 KP`.

### Task 4: Mug mesh and characters

**Files:** modify `client/src/world/items.ts` (`mugMesh(mug: Mug, fill?: string): THREE.Group` — body per shape: classic `Cylinder(0.07, 0.055, 0.13)`, tall `(0.06, 0.05, 0.17)`, round `Sphere(0.08) scaled (1, 0.9, 1)` on a small base, tiny `(0.05, 0.045, 0.09)`; glaze body, accent handle (`TorusGeometry(0.035, 0.012)` at +x) and rim ring, fill disc at the top when `fill` given), `client/src/world/character.ts` (`setHolding(drink, flower, gift, mug = DEFAULT_MUG)` uses `mugMesh(mug, fill)` for drinks; key includes the mug JSON so a new mug re-renders), `client/src/game/game.ts` (pass `view.mug ?? DEFAULT_MUG` at both `setHolding` call sites). Test: `client/src/world/items.test.ts` builds all 4 shapes with ≥ 3 meshes each.
Commit `feat: personal mugs in hand`.

### Task 5: Photo booth client

**Files:** create `client/src/art/booth.ts` (`BoothTimer` pure helper: `start(now)`, `tick(now) → 3|2|1|'shoot'|null`, `canUse(now)` 10 s guard — tested in `booth.test.ts`; `capturePhoto(renderer, scene, cam: BOOTH_CAM) → string` (base64 JPEG via a 256×256 `WebGLRenderTarget`, `readRenderTargetPixels`, canvas flipped vertically, `toDataURL('image/jpeg', 0.8)`); `openPhotoPreview(hud, dataUrl, onKeep(title), onDiscard)`), modify `client/src/game/game.ts` (public `takePhoto()` : countdown pops via `myChar.overhead.pop('3'|'2'|'1'|'📸')`, flash = a full-screen white `div.flash` faded by CSS, then `capturePhoto` with `this.renderer`/`this.scene`, then `openPhotoPreview` → `send({ t: 'paint', title, price: 1, forSale: false, mode: 'photo', png })`), `client/src/main.ts` (`onLocalToy` `photoBooth` → `game.takePhoto()`), `client/src/art/rooms.ts` + `views.ts` (`Pictures` option `polaroid: true` draws a white border; `ArtRooms` keeps `photos`, pins them on `CORK_PINS` via a second `Pictures`), `client/src/art/catalogue.ts` (Mine tab: paintings, then a "Photos" group without sale toggles), `client/src/style.css` (`.flash`, `.photo-preview img`).
Commit `feat: photo booth — countdown, flash, keep or discard, cork board`.

### Task 6: Pottery client and wiring

**Files:** create `client/src/art/pottery.ts` (`openPottery(hud, wallet, current: Mug | null, onFire(mug))`: shape buttons, glaze/accent swatches from `PALETTE`, a 160×160 spinning preview using a tiny renderer like `client/src/hud/wardrobe.ts`'s preview (reuse its approach, not its code, unless a helper is exported), footer "Fire it · 10 ✨" / "free" for admins, disabled when `kp < 10`), modify `client/src/main.ts` (`onLocalToy` `wheel` → `openPottery(hud, wallet, game.myView()?.mug ?? null, (mug) => conn.send({ t: 'throwMug', mug }))`), `README.md` (one line). Then full verification: `npm run typecheck`, `npm test`, `npm run build`.
Commit `feat: pottery wheel — pick a shape, glaze it, fire it for 10 KP`.

### Task 7 (controller): review, deploy, walk-through

Ponytail + thermonuclear review by one reviewer subagent, one fix subagent, merge to `main`, push, deploy to wolf (`deploy.ps1`), run the round-1 walk harness extended with: booth capture (`game.takePhoto()` then keep via the modal's Keep button), cork board shows the photo, `throwMug` then `game.myView().mug` set and the held cup re-rendered.
