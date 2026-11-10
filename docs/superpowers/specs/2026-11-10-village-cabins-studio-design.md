# Village, cabins and the art studio (round 1 of 4)

Brainstormed 2026-11-10. Rounds 2–4 (photo booth + pottery; post office + observatory; fishing/bug journal + weather) get their own specs.

## What we're building

A **village** of tiny cabins grows off the east edge of town. Everyone who has ever joined owns one cabin, free, from their first visit. A cabin is a small shared room you can decorate with your paintings, bought prints, keepsakes and bouquets, with a Pomodoro desk; the owner can latch the door. At the head of the village lane stands the **art studio**: paint at an easel (pixel or freehand), hang the result for sale, and buy other people's paintings with Knowledge Points. The artist receives the KP.

Decisions made with the user:

| Topic | Decision |
|---|---|
| Getting a cabin | Free and automatic on first join; the village grows as people join |
| Cabin interior | One cosy room, fixed spots: 6 wall frames, 4 shelf spots, 1 Pomodoro desk; bed/rug/window/stove/string lights as flavour; exterior roof + door colour seeded from the owner's id |
| Painting | Pixel (32×32, snap to grid) **and** freehand, as two modes of one canvas tool |
| Selling | Artist sets the price (1–100 KP), unlimited prints, artist gets the full amount; the original stays in the gallery with a "sold ×N" tag |
| Gallery | Studio wall shows the 16 newest for-sale paintings as 3D frames; E on the wall opens a catalogue of everything for sale; max 3 for sale per artist at once |
| Village growth | Rows of 6 lots along a lane; always at least one spare row of empty grassy lots; the map edge moves on the next entry |
| Visiting | Anyone may enter a cabin unless the owner has latched the door (toggle) |

Out of scope this round (named so they aren't built by accident): photo booth, pottery, mailboxes, cabin paint/upgrades, deleting paintings, admin feature switch for the studio, trucks inside the village, free placement of items.

## Architecture

### The village is its own outdoor scene, not a widening of the town

Two ways to "extend the map" were weighed:

1. **Grow the town scene east.** Bounds are centred on the origin everywhere (`clampToBounds`, scene tests, hedges, minimap, painted ground), so growing one edge means re-shifting every zone, saved truck pose and golf ball each time a row is added. The town scene would also become dynamic, and it is already the heaviest scene to build.
2. **A separate outdoor `village` scene reached through a gate on the town's east street.** Only the village is dynamic; the town stays static. The fade that already covers door transitions hides the growth. Trucks can't drive in (acceptable: it's a footpath village).

We take **2**. The user's approved behaviour holds: cabins pop in live for people already in the village, and the lane gets longer the next time you walk through the gate.

### Scene kinds

| Scene id | Source | Dynamic? |
|---|---|---|
| `town` | static (one new gate door + a signpost) | no |
| `studio` | static indoor scene added to `SCENES` | no |
| `village` | `villageScene(roster)` | yes: depends on the cabin roster |
| `cabin:<ownerId>` | `cabinScene(entry)` (shell template + owner name + lot) | yes: per owner |

A **roster** is `CabinEntry[]` = `{ owner: string; name: string; lot: number; locked: boolean }`, ordered by lot. The server owns it (SQLite `cabins` table joined with `profiles` for the current name) and sends it to every client in `welcome` and in a `village` broadcast whenever it changes (new cabin, latch toggled, rename on reconnect).

A small shared `SceneBook` resolves ids on both sides: `get(id)` returns `SCENES[id]`, else builds and memoises `village` / `cabin:*` from the current roster; `setRoster()` drops the memo. The server's `World` keeps its injectable `scenes` record for tests and wraps it in a `SceneBook`; the client's `Game` replaces `getScene()` with its book. Every current `SCENES[x]?.name` lookup for display (online list, admin list, door labels) goes through the book too, so cabins read "Mia's cabin".

### Village layout (`shared/scenes/village.ts`)

- Lane along z through x = 0, 3 m wide. Gate at the south end (spawn `gate` just inside it; door `to-town` → town spawn `from-village`). The studio building stands beside the gate at the north-west of the gate plaza (door `to-studio` → studio spawn `entrance`; the studio's own exit door returns to village spawn `studio-door`), so the hub is the first thing you see. The town gains door `to-village` at the east end of the main street under a gate arch (`gate` decor) and spawn `from-village` just inside it, plus a signpost pointing to the village.
- `rows(n) = ceil(n / 6) + 1` for n cabins, so there are always 6–11 free lots. Row r's footpath crosses the lane at `z = z0 - 12 r`; its 6 lots sit at `x ∈ {-20, -13, -6, 6, 13, 20}`, cabins (5 × 4.5 m, door on the +z face) fronting the footpath. Lot k → row `floor(k/6)`, column `k % 6`.
- Size `{ w: 52, d: 12 · rows + 22 }`, centred; hedge + tree line reuse a generalised `edges(w, d)` (the town's `edges.ts` becomes a function of size and the town calls it with 150 × 130).
- An occupied lot is a `cabin` decor (new `DecorKind`: small plank house, seeded roof/door colours from `hash(owner)`, a name plaque, a doormat), a collider, and a door `cabin-<owner>` → `cabin:<owner>` spawn `entrance`. An empty lot is a flower patch and a tiny `signpost` reading "free lot".
- Decor: lamp posts along the lane, trees between rows, flowers, bushes; life zones: butterflies and birds. The village theme is the town's outdoor theme.
- Pure data, deterministic from the roster, so client and server agree exactly.

### Cabin shell (`shared/scenes/cabin.ts`)

Indoor 7 × 6 m, wall/trim colours from the owner's seed. Fixed content: `studyDesk('cabin:<owner>-desk', …)` (one north seat), bed, rug, window + sunbeam, stove, string lights, door `to-village` → village spawn `lot-<n>` in front of the owner's door. **Spots** are new scene data: `spots: Spot[]` with `{ id: 'w1'…'w6' | 's1'…'s4'; kind: 'wall' | 'shelf'; x; z; y; rot }`. Wall spots are frames on the back and side walls; shelf spots are on two wall shelves. Spots are not toys: the client shows the E prompt itself (owner only, within 1.2 m); the server validates against the template. Slot id is unique because it carries the owner id.

### Studio (`shared/scenes/studio.ts`)

Indoor 16 × 12 m, paint-splattered floor theme. Three easels (`easel-1..3`, toy kind `easel`, E opens the paint tool), one `gallery` toy at the long back wall (E opens the catalogue), the gallery wall itself (16 frame positions, a `galleryWall` decor row), a few stools and plants, a sign "✎ studio". Toy ids are static so the existing toy registry handles them.

### Paintings

- Stored once, served over HTTP: `GET /art/<id>.png` (`cache-control: public, max-age=31536000, immutable`; paintings never change). WebSocket carries only metadata (`PaintingMeta = { id; artist; artistName; title; price; mode: 'pixel' | 'free'; sold: number; forSale: boolean; at }`), so entering the studio costs a few KB plus browser-cached images.
- Uploading goes over the WebSocket as one `paint` message with a base64 PNG; `maxPayload` rises from 16 KB to 96 KB and the server caps the decoded PNG at 64 KB (`PAINTING_MAX_BYTES`), checks the PNG signature and that the IHDR size is 32 × 32 (pixel) or 256 × 256 (free). Oversized freehand work is re-encoded by the client at 192 px before it gives up with "too detailed".
- Limits: title ≤ 24 chars, price 1–100 KP (ignored when `forSale` is false), ≤ 3 for sale per artist, ≤ 40 paintings per artist in all, one `paint` per 30 s.
- Buying a print: `buyPrint { id }` → must be for sale, not your own, not already owned; one SQLite transaction debits the buyer (admins pay 0 via `priceFor`), credits the artist, inserts the print, increments `sold`. Feed: "Mia bought 'Sunset' from Aibel for 12 KP". Artist's wallet is pushed if online.
- Taking down / re-listing: `setSale { id; on }` by the artist (re-listing still respects the 3 cap).

### Cabin contents

`cabin_items (owner, spot, kind, ref)` with `kind ∈ 'painting' | 'keepsake' | 'bouquet'`:

- **Wall spot** ← a painting you made or own a print of (`ref` = painting id).
- **Shelf spot** ← a keepsake (`ref` = keepsake id; it stays in your keepsakes and still shows on your card) or a bouquet from your bag (`ref` = flower; the bag item is taken out, and put back when you clear the spot).

Messages: `cabin { action: 'place'; spot; item: { kind; id } } | { action: 'clear'; spot } | { action: 'lock'; on }`. The server resolves the owner from the scene the player is standing in (`cabin:<id>` must equal the player's own id). Everyone in the cabin receives `cabinState { owner; locked; items: CabinItem[] }` on entry and on change. A keepsake that was eaten/released since being shelved renders as an empty shelf and the row is dropped when next read.

Owner controls in the room: E at an empty spot opens a **picker** modal (wall → your paintings and owned prints as thumbnails; shelf → your keepsakes and bag bouquets); E at a filled spot offers "Take down". Visitors get no prompts at spots.

The latch: in your own cabin a HUD button "🔓 Door open / 🔒 Door latched" toggles `lock`. `enterScene` into a latched cabin by anyone else fails with error `locked` ("The door is latched."); the village shows 🔒 on that plaque.

### Client rendering

- `cabin` and `galleryWall` decor join `decor.ts` (the `building`/`frame` builders are the models to copy; the gallery wall is a long frame rail whose 16 pictures are filled at runtime).
- `GalleryView` (studio) and `CabinView` (cabins) are runtime views like `PropsView`: they take `PaintingMeta[]` / `CabinItem[]`, load textures from `/art/<id>.png` (`NearestFilter` for pixel mode), and place pictures into the frame positions, gift meshes and `bouquetMesh` onto shelves. Reuse the held-gift/bouquet meshes from `character.ts` (lift them into a shared `items.ts` rather than duplicating).
- The village runtime is rebuilt on entry when the roster version differs from the one it was built with. While you're in the village, a `village` broadcast adds the new cabin's decor group (and the def is swapped so colliders/doors update) without a rebuild.
- Minimap: `cabin` draws like `building`; the village is just another outdoor scene.

### Paint tool (`client/src/art/paint.ts`)

One modal, one `<canvas>`: a 256 × 256 (free) or 32 × 32 (pixel) backing canvas drawn at ~min(80vw, 480px) with `image-rendering: pixelated` in pixel mode. Tools: brush (3 sizes; in pixel mode a 1-cell pencil), eraser, fill (both modes, flood fill), 24-colour palette + the current colour, undo (20 steps, snapshot stack), clear. Pointer events, so touch works. Title field, price stepper, "Hang for sale" / "Keep for myself" / "Cancel". The pure parts (snap, flood fill, undo stack, PNG size check) live in `paintCore.ts` and are unit-tested; DOM glue is thin.

### Catalogue (`client/src/art/catalogue.ts`)

Modal with two tabs: **For sale** (grid of thumbnails: title, artist, price, sold ×N, Buy / "yours" / "owned") and **Mine** (your paintings with for-sale toggles, and prints you own). Opens from the gallery wall; the "Mine" tab is also reachable from the cabin picker when choosing a painting for a wall spot.

### Where the code goes (keeping big files from growing)

`server/src/world.ts` (1366 lines) and `client/src/game/game.ts` (1296 lines) only gain dispatch lines. New server logic lives in `server/src/studio.ts` (paint, buy, sale, gallery) and `server/src/cabins.ts` (roster, lots, items, latch), each a class taking the `Store` and a few callbacks (`send`, `toScene`, `error`, `pushFeed`, `priceFor`). `Store` gains the new tables and methods; `server.ts` gains the `/art/` route. Shared: `shared/art.ts` (types, limits, lot geometry, seed hash), `shared/scenes/{village,cabin,studio}.ts`, `shared/scenes/book.ts`.

## Protocol additions

Client → server: `paint`, `setSale`, `buyPrint`, `getGallery`, `getPortfolio`, `cabin`.
Server → client: `village` (roster), `gallery` (all for-sale metadata; the wall is the first 16), `portfolio` (mine + prints), `cabinState`. `welcome` carries the roster. New error codes: `bad_art`, `locked`, `bad_cabin`. New feed kind `art`.

## Data

```
cabins      (owner_id TEXT PK, lot INTEGER UNIQUE, locked INTEGER DEFAULT 0, created_at INTEGER)
cabin_items (owner_id TEXT, spot TEXT, kind TEXT, ref TEXT, PRIMARY KEY (owner_id, spot))
paintings   (id INTEGER PK AUTOINCREMENT, artist_id TEXT, title TEXT, price INTEGER, mode TEXT,
             png BLOB, for_sale INTEGER, sold INTEGER DEFAULT 0, created_at INTEGER)
prints      (painting_id INTEGER, owner_id TEXT, at INTEGER, PRIMARY KEY (painting_id, owner_id))
```

A cabin row is created in `join()` the first time a profile is seen without one (`lot = COUNT(*)`); the roster broadcast follows. Existing players get theirs on their next login, in login order.

## Error handling

Server-side validation for everything (spot ids, ownership, PNG size/signature, price range, caps, scene = own cabin); failures answer with the new error codes and a friendly message, like the other toys. Unknown or stale ids (a painting removed, a keepsake used) render as empty rather than crash. Texture load failures leave the frame blank. Clients with an older village than the server (someone stayed in the village while a 7th+ neighbour joined) still see the new cabin pop in; their bounds update on the next entry — the server's bounds are the larger ones, so no one is clamped wrongly. Known limit, acceptable.

## Testing

- shared: `rows()`/lot geometry, village + cabin scenes for a sample roster run through the existing per-scene invariants (slots in bounds, doors/spawns clear, unique ids), `SceneBook` memo/invalidation, paint core (snap, flood fill, undo, PNG header check).
- server: cabin created on first join and roster broadcast; latch blocks others but not the owner; `paint` limits (size, title, price, 3 for sale, 40 total, rate); `buyPrint` transfers KP atomically, refuses own/duplicate/unaffordable, admin pays 0; place/clear with ownership rules and bag bouquet round-trip; `/art/<id>.png` route with caching headers and 404.
- client: decor builders for `cabin`/`galleryWall` build without throwing (as `decor.test.ts` does for the others).

## Deployment

Same as every round: push to `main`, redeploy to gpu-sys with the usual `data.db` backup first (the schema migration adds tables only). Then the one final review with `/pstack:thermo-nuclear-code-quality-review`, per the user's new tooling.
