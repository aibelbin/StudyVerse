# Post office and observatory (round 3 of 4)

Brainstormed 2026-11-13. Builds on rounds 1–2 (village scene from the cabin roster, `SceneBook`, `Port` modules, LOCAL toys, the sky in `client/src/world/sky.ts`).

Decisions with the user: letters only (no parcels/postcards), free with a rate limit; observatory = draw your own constellation, shown in everyone's sky; no wishes/KP.

## Post office

- **Where:** a `building(14, hd - 11, 8, 6, 3.6, '#f3e3d0', '#5a7a9c', 'Post office')` in the village, mirroring the studio across the lane, with a `postBox` LOCAL toy (`simpleToy('post', 'postBox', 14, hd - 7.4, 1.6)`) at its door (a red post box). No interior scene.
- **Sending:** E at the post box (`[E] write a letter ✉️`) → modal: recipient picker (everyone in the cabin roster except you, alphabetical), textarea ≤ `LETTER_MAX = 280`, Send. Server `sendLetter { to, text }`: recipient must have a cabin, text trimmed/non-empty/≤ 280 (control chars → space), rate `LETTER_GAP_MS = 30_000` and `LETTERS_PER_DAY = 20` per sender (server day via `dayOf`), stored in table `letters (id, from_id, from_name, to_id, text, at, read INTEGER DEFAULT 0)`. Recipient online → `{ t: 'letter', letter }` + toast "📬 You've got mail from X". Sender → toast "✉️ Sent to X".
- **Mailboxes:** every occupied lot in the village gets a `mailbox` decor by the path in front of the cabin (x + 1.9, z + 2.9) and a LOCAL toy `mailbox-<owner>` (kind `mailbox`, radius 1.2). The roster entry gains `mail: boolean` (has unread letters), so everyone sees the red flag up (decor `mailbox` with `accent` = flag up/down; the village rebuilds already on roster changes — a flag flip must NOT trigger a full rebuild: the client toggles the flag mesh by owner without rebuilding, reusing round 1's "rebuild only for a new cabin" logic).
- **Reading:** E at your own mailbox (`[E] check your mail 📬`; others' mailboxes say `🔒 {name}'s mailbox` with no action), or a ✉️ HUD button anywhere → modal of your letters newest first (from, time, text) with Reply (opens the writer prefilled with the sender) and Delete. Opening the inbox sends `readMail` → server marks all read, clears `mail` on the roster entry and broadcasts the roster. Server sends `{ t: 'mail', letters }` (newest 50) on `getMail`; `welcome` carries `unread: number` for the login toast.
- **Privacy:** letters are only ever sent to their recipient (and listed back to them); never in feed/broadcasts. Admins: `deleteLetter` admin action deletes any letter by id (exposed only through the existing admin panel later — not built this round; server action + test only).

## Observatory

- **Where:** the village grows 10 m deeper at the north end (`villageSize` d = 26 + 12·rows); a `mound` hill decor at (0, -hd + 6) with an `observatory` decor (domed hut, slit, small telescope) and a LOCAL toy `stargaze` (kind `observatory`, radius 2.2) in front of it. The lane path extends to it.
- **Night only:** the client knows night via `skyAt(clockHours(...)).night` (already computed in `Game.frame` as `this.night`). E when `night < 0.5` → toast "Come back after dark ✨"; prompt text stays `[E] look at the stars 🔭`.
- **Editor (`client/src/art/stars.ts`):** a full-screen dark modal with `STAR_COUNT = 120` stars from `starField(seed = 4242)` (shared, deterministic: `{ x, y, mag }` in a unit square), tap a star then another to add a line (max `CONSTELLATION_EDGES = 8`), tap a line to remove it, a name field ≤ `TITLE_MAX`, Save / Clear / Cancel. Your saved one and everyone else's are drawn faintly with names.
- **Server:** `saveConstellation { name, edges: [number, number][] }` — 1–8 edges, each a pair of distinct integer star indices < 120, no duplicate edges, name trimmed non-empty ≤ 24; one per player (upsert in table `constellations (owner_id PK, name, edges_json, at)`); broadcast `{ t: 'sky', constellations: Constellation[] }` to all; `welcome` carries `constellations`. `Constellation = { owner, ownerName, name, edges }`.
- **Sky:** `client/src/world/sky.ts` maps `starField` onto the existing night sky dome (same projection for the editor and the dome: x → azimuth over a 120° band facing the camera's view direction, y → elevation 25°–70°) and draws each constellation as `LineSegments` whose opacity follows `night`; names only in the editor. Shooting stars: client-only, every ~40–90 s (seeded by `Math.floor(serverNow() / 30_000)` so everyone sees the same ones), a short bright streak over 0.6 s, only when `night > 0.6`.

## Out of scope

Parcels, postcards, letters to people without a cabin, wishes/KP, editing others' constellations, the admin panel UI for letters.

## Testing

- shared: `starField` deterministic and in range; `isConstellation` accepts/rejects; `villageSize` new depths (update round-1 tests).
- server: letter send/receive privacy (a third player gets nothing), rate limit + daily cap, recipient without cabin refused, unread flag on roster set and cleared by `readMail`, delete own letter only, admin delete; constellation validation, upsert, broadcast, welcome carries both.
- client: letter modal and mailbox flag toggle are thin; one test for the flag-toggle helper (roster diff → which owners changed `mail`).

## Deployment

As before: branch, subagent tasks, one final ponytail + thermonuclear review + fix, merge, push, deploy to wolf, walk-through on wolf (never a browser on the Mac).
