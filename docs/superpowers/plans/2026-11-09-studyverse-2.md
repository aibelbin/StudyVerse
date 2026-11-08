# StudyVerse 2 Implementation Plan

> Execute inline, phase by phase (superpowers:executing-plans). The user asked for **no per-step review loops**: run the tests after each phase, commit, and move on, then do one full review at the end.

**Goal:** Build `docs/superpowers/specs/2026-11-09-studyverse-2-design.md`.

**Tech:** TypeScript, Three.js, ws, node:sqlite, WebRTC, WebAudio, vitest. No new npm dependencies.

## Global Constraints

- No new dependencies; procedural art and synthesized sound only.
- The Mac is fanless. Pet training runs on gpu-sys only, using the portable Node at `C:\Users\aibel\StudyVerse\node-v24.22.2-win-x64`. Copy back `policy.json` only.
- Commits go to `main` with no AI attribution. Check `git log --format=%B origin/main..HEAD | grep -i co-authored` before pushing.
- `npm test`, `npm run typecheck` and `npm run build` must pass at every commit.

## Phase 1: Birds and minimap

- [ ] `client/src/life/air.ts` birds: body, head, beak, tail, and left and right wing instances; three plumages via instance colours. Wings flap while flying and flutter on each hop.
- [ ] `client/src/hud/minimap.ts`:
  - `worldToMap(x, z, size, w, h)` (pure, tested in `minimap.test.ts`).
  - `class Minimap { setScene(def); draw(me, others, vehicles) }`, with a static offscreen layer.
  - **M** toggles the big view. Mounted in `#hud` with CSS.
- [ ] Wire it in `game.ts`; the frame hook passes players. Commit.

## Phase 2: Round-blob characters and Look v2

- [ ] `shared/types.ts`: `Look = { body, eyes, hat, top, face, back, neck }` (strings), `Eyes = 'dot'|'happy'|'sleepy'`.
- [ ] `shared/wardrobe.ts`: `ITEMS`, `SLOTS`, `FREE_ITEMS`, `itemById`, `normalizeLook(raw): Look` (handles the old `{body, skin, hat}`), `DEFAULT_LOOK`, `BODY_COLORS`.
- [ ] `server/src/validate.ts`: `isLook` uses the catalog (every slot's item must exist in that slot, or be `none`). `parseClientMsg` normalises.
- [ ] `server/src/db.ts`: `findByToken` normalises the look.
- [ ] `client/src/world/character.ts`: rewritten as the blob, with the attachment groups and a `buildItem(itemId)` factory in `client/src/world/outfits.ts`.
- [ ] `client/src/hud/joinScreen.ts`: colour, eyes and free hat.
- [ ] Tests for the normalisation and `isLook`. Commit.

## Phase 3: Knowledge Points and wardrobe

- [ ] `server/src/db.ts` migrations:
  - `kp`, `streak`, `last_study_day` and `pet_json` columns.
  - `owned`, `notes` and `daily` tables.
  - Methods: `wallet(id)`, `award(id, kp, streak, day)`, `buy(id, itemId, price)`, `owned(id)`, `setPet`, `notes`, `addNote`, `deleteNote`, `addDailyMinutes(day, m)`, `dailyMinutes(day)`.
- [ ] `server/src/rewards.ts`: `awardFor({ lastDay, streak }, today, focusMin) → { kp, streak, bonus }` (pure, tested); `dayOf(ms)` returns the local `YYYY-MM-DD`.
- [ ] World takes `store?: Store` (an interface; a `ProfileStore` in tests with `:memory:`):
  - On `focusDone`: award KP and send the wallet, update daily minutes and send the tree, and post the feed line.
  - `buy`, and validated `updateLook` (moved from server.ts).
  - `welcome` gets `wallet`, `tree`, `ice`.
- [ ] Protocol: `buy`, `wallet`, `tree`, error `bad_look` / `no_kp`.
- [ ] Client:
  - The status panel shows KP.
  - `client/src/hud/wardrobe.ts`: modal with tabs and a live preview canvas.
  - Boutique stall toy (`shop`, client-local) in the square.
- [ ] Tests: rewards, buy flow, look validation against owned items, and the database migration from the old schema. Commit.

## Phase 4: Study objects

- [ ] Scene: notice board toy (`board`) by the Library, quote shelf (`quotes`) in the Library, knowledge tree decor (`knowledgeTree`) in the square.
- [ ] Server:
  - `getNotes`, `postNote` (≤140 characters, 30 s cooldown, at most 5 per author), `deleteNote` (own notes only), sending `notes` to the scene.
  - `setDnd`, with `PlayerView.dnd`.
- [ ] Client:
  - Notes modal, quote bubble, and the tree growing by stage (`treeStage(minutes)`, pure and tested).
  - DND toggle (button and N), the overhead 🔕 badge, read-only player cards, and a red desk lamp.
- [ ] Tests. Commit.

## Phase 5: Coffee

- [ ] Café coffee toy (`coffee`).
- [ ] `brew {drink, stars}`: within range, 20 s cooldown, stars clamped. Sets `PlayerView.holding`; posts a feed line.
- [ ] Client: brewing modal (drink choice and 3 timing bars, with `scoreStep(pos)` pure and tested), held cup with steam, and sipping on the ☕ emote.
- [ ] Tests. Commit.

## Phase 6: Truck

- [ ] `shared/vehicles.ts`: `VEHICLES` config, `vehicleOk(kind, scene, x, z)`.
- [ ] World: the boat code is generalised to vehicles (controller poses `row`/`drive`), truck exit spots, and `honk` (driver-only, like piano notes).
- [ ] Scene: two trucks with a drive seat and three bed seats.
- [ ] Client: truck view (wheels, steering, dust, headlights), driving physics, H honk, camera pull-back, minimap icons.
- [ ] Tests: truck on land, off water, speed, collider rejection, exit spots, honk. Commit.

## Phase 7: Voice chat

- [ ] Server:
  - `rtc {to, data}` relay within the same scene (data is a string ≤ 6 KB).
  - `setVoice {on}` → `PlayerView.voice`.
  - `ICE_SERVERS` environment variable.
  - `TLS_CERT` / `TLS_KEY` → `https.createServer`.
- [ ] Client `client/src/voice/voice.ts`: a mic button, V to mute, a peer per eligible pair, perfect negotiation, a distance gain on each stream, a speaking indicator, and DND muting.
- [ ] Tests: relay scoping, setVoice validation, ICE parsing. Commit.

## Phase 8: Pets

- [ ] `shared/pets/`:
  - `brain.ts`: `observe()`, `mlpForward(weights, obs)`, `fallbackBrain()`.
  - `sim.ts`: an episode runner with reward.
  - `kinds.ts`: prices and names.
- [ ] `pets/train.ts`: an ES trainer that writes `shared/pets/policy.json`. Also `npm run train:pets`.
- [ ] Server: `adoptPet`, `pet` pose relay (speed checked) → `petMoved`, and `PlayerView.pet`.
- [ ] Client: pet views (4 kinds), owner-side simulation, P to toggle, and a wardrobe Pets tab.
- [ ] Train on gpu-sys, copy back `policy.json`, and add a test that the policy beats random play in the sim. Commit.

## Phase 9: Ship

- [ ] Headless screenshot pass, fixes, one full review with fixes, README update, push, then deploy to gpu-sys (redeploy recipe in memory).
