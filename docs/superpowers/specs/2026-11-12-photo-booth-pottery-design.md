# Photo booth and pottery wheel (round 2 of 4)

Brainstormed 2026-11-12. Builds on round 1 (`2026-11-10-village-cabins-studio-design.md`): the studio scene, the `paint` message and `paintings` table, the `/art/<id>.png` route, portfolio + catalogue, cabin wall spots, `Pictures` frames.

Decisions with the user: photos are personal keepsakes (no selling, no gifting); mugs are pick-and-glaze (4 shapes, glaze + accent colours), 10 KP each (admins free), remaking charges again.

## Photo booth

**Where:** the studio's west side: a `curtain` decor (backdrop, 2.6 m wide) against the west wall and a `photoBooth` toy (`simpleToy('booth', 'photoBooth', …)`, radius 2.4, local toy). The booth box `BOOTH_BOX` (2.6 × 2 m in front of the curtain) and the fixed camera pose `BOOTH_CAM` (position + look-at) live in `shared/scenes/studio.ts`.

**Flow (client):** E → `[E] take a photo 📸` → a 3-2-1 countdown (overhead pops on your character each second, via the existing `overhead.pop`) → flash (a white quad fading over 300 ms) → capture → preview modal: the image, a caption input (≤ `TITLE_MAX`), **Keep** / **Discard**. One booth use per 10 s per player (client-side guard; the server's `PAINT_GAP_MS` still applies).

**Capture:** `client/src/art/booth.ts` renders the current Three.js scene with a second `PerspectiveCamera` at `BOOTH_CAM` into a 256 × 256 `WebGLRenderTarget`, reads it back, draws it onto a canvas, and exports `toDataURL('image/jpeg', 0.8)`. The HUD/overlay DOM is not part of the render, so photos show only the world. Everyone standing in the box is simply in the frame.

**Save:** the existing `paint` message with `mode: 'photo'`, `forSale: false`, `price: 1` (ignored), `png` = base64 JPEG. Server: `PaintMode` gains `'photo'`; validation accepts a JPEG by its magic bytes (`FF D8 FF`) and the `PAINTING_MAX_BYTES` cap only — no dimension parsing for photos, the client always renders 256 × 256 — and forces `forSale = false`; `setSale` refuses photos. Photos count toward `PAINTINGS_MAX` (40) like paintings. The `/art/<id>.png` route serves photos with `content-type: image/jpeg` (browsers go by content-type; the URL keeps its shape). `PaintingMeta.mode === 'photo'` tells clients to draw a polaroid frame.

**Where photos show:**
- The catalogue's **Mine** tab groups them under "Photos" (no sale toggle).
- Cabin wall spots accept them like any owned painting (already true: the picker lists `owned()`).
- A **cork board** (`corkBoard` decor, east wall of the studio) pins the newest 8 photos by anyone: `GALLERY_PHOTOS = 8`, a second list `photos` on the `gallery` message (`{ t: 'gallery', forSale, photos }`), rendered by a `Pictures` instance over `CORK_PINS: Spot[]` with a white polaroid border.

## Pottery wheel

**Where:** a `wheel` toy (`simpleToy('wheel', 'wheel', …)`, radius 1.6, local toy, prompt `[E] throw a mug 🏺`) with a `potteryWheel` decor (a low stool with a clay disc) beside the cork board.

**Mug:** `shared/mug.ts` — `MUG_SHAPES = ['classic', 'tall', 'round', 'tiny']`, `Mug = { shape; glaze; accent }`, `MUG_PRICE = 10`, `isMug(x)` (shape in list; colours must be in `PALETTE`, which moves from `client/src/art/paintCore.ts` to `shared/art.ts` so the server can check it). `DEFAULT_MUG` = classic, `#fffaf2` glaze, `#c98a5a` accent (today's cup colours).

**Modal (`client/src/art/pottery.ts`):** shape buttons, glaze swatches, accent swatches, a spinning 3D preview (a small renderer like the wardrobe preview showing `mugMesh(mug)`), footer "Fire it · 10 ✨" (admins: free; disabled when unaffordable) and Cancel.

**Server:** `throwMug { shape, glaze, accent }` → `isMug`, `priceFor(p, MUG_PRICE)` charged via a new `Store.setMug(id, mug, price): boolean` (same atomic pattern as `spend`, but no `owned` row: `UPDATE profiles SET kp = kp - ?, mug_json = ? WHERE id = ? AND kp >= ?`); on success push `wallet` and `playerUpdated` (`PlayerView.mug: Mug | null`, loaded with the wallet at join); feed line `🏺 Aibel fired a new mug`. Error `no_kp` / `bad_mug`.

**Client:** `client/src/world/items.ts` gains `mugMesh(mug: Mug, fill?: string)`: body by shape (cylinder/tall cylinder/sphere-ish/short), handle torus in the accent colour, rim ring in the accent, drink fill disc when `fill` is given. `Character.setHolding` takes the holder's mug (`PlayerView.mug ?? DEFAULT_MUG`) and uses `mugMesh` instead of the hard-coded cup for drinks; steam puffs unchanged. The café counter cups and the coffee-making steps stay as they are.

## Out of scope

Selling or gifting photos, deleting photos/mugs, doodles on mugs, choosing the photo framing, photos in the feed, a mug shown on the player card.

## Testing

- shared: `isMug` accepts/rejects; `PALETTE` has 24 unique entries (test moves with it).
- server: photo saved with `forSale` forced false and served as `image/jpeg`; non-JPEG with `mode: 'photo'` refused; `setSale` on a photo refused; cork board list = newest 8 photos, oldest first excluded; `throwMug` charges 10 KP, admin pays 0, refuses bad shape/colour and insufficient KP; `playerUpdated` carries the mug.
- client: `mugMesh` builds for every shape (Node-safe, like `decor.test.ts`); booth countdown/capture state helper is pure and tested (ticks 3→2→1→shoot, 10 s re-use guard).

## Deployment

As round 1: push to `main`, deploy to wolf (deploy.ps1 backs up `data.db`; `mug_json` is an `ALTER TABLE ADD COLUMN`), walk-through on wolf with the round-1 harness (`memory: village-studio-round1`), never a browser on the Mac. Final review: ponytail + thermonuclear, one fix pass.
