# Living World Implementation Plan

> **For agentic workers:** Execute inline, task by task (superpowers:executing-plans). The user asked for **no per-task review loops**: run the tests in each task, commit, and move on. Run **one** full review (superpowers:requesting-code-review) after the last task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build spec `docs/superpowers/specs/2026-11-09-living-world-design.md`: a 120×90 town with zones, shared toys, rowboats, ambient life, a real-clock day/night cycle and synthesized audio.

**Architecture:**
- Scene data in `shared/` declares slots, toys, water and life zones.
- The server owns slot occupancy, toy state and boat poses, using pure handlers in `server/src/toys.ts`. Motion math shared by both sides lives in `shared/toys.ts`.
- The client turns the data into instanced scenery, toy behaviours, life systems, the sky and audio.

**Tech Stack:** TypeScript, Three.js 0.187, ws, vitest, Vite. No new dependencies.

## Global Constraints

- No new npm dependencies and no asset files. All art is procedural and all audio is synthesized.
- Town size `{ w: 120, d: 90 }`, x −60..60, z −45..45, with −z north (away from the camera).
- `BOAT_SPEED = 2.4` m/s; boats return to their mooring at 1.5 m/s with smoothstep easing.
- `LIFE_RADIUS = 35`; pixel ratio capped at 1.5; at most 4 point lights in the town; shadow area about 40×40 following the player.
- Cooldowns (ms): note 100, ring 1500, coin 1500, feed 3000, skip 2000, push 500, slide 2000, toggle 1000, next 1000.
- Merry-go-round: decay `k = 0.4`, push +1.2 rad/s, cap 3 rad/s.
- Distance gain: 1 at ≤4 units, 0 at ≥25. Sound plays only in `town`. Mute is saved in `localStorage['sv-muted']`.
- Day/night follows the local `Date`; `?time=HH:MM` overrides it; `?fps` shows an FPS counter.
- Tests: `npm test`, typecheck: `npm run typecheck`. Both must pass at every commit.
- Git: commit to `main`, never add AI attribution, and run `git log --format=%B origin/main..HEAD | grep -i co-authored` before pushing.
- The Mac is fanless: no long or heavy runs. The browser check at the end is one short session.

## File map

```
shared/
  scenes/types.ts        Slot, Pose, Toy, LifeZone, Water, SceneDef (slots/toys/life/water)
  scenes/kit.ts          Parts gains slots/toys/life; prefabs emit slots; new toy prefabs
  scenes/town/*.ts       square, lake, woods, park, playground, edges, scatter helper
  scenes/town.ts         merges the zone files
  geometry.ts            + pointInPolygon, polygonToBoxes
  toys.ts                ToyKind, ToyAction, ToyState, spinAt, boatPoseAt, slotWorld, swingAngle, seesawAngle
  protocol.ts / types.ts slot rename, use/toyEvent/toyState, toys in welcome/sceneSnapshot
server/src/
  toys.ts                pure handler table (actions, cooldowns, init, apply)
  world.ts               slots, use, boats, toy state
  validate.ts            use, sit{slotId}
client/src/
  world/instanced.ts     instanced batches + wind sway material
  world/decor.ts         new decor kinds
  world/sky.ts           skyAt() pure + SkyRig (applies it, stars, moon, lamp pool)
  toys/*.ts              per-kind client behaviours + registry
  life/*.ts              ambient systems + registry
  audio/engine.ts, voices.ts, jukebox.ts, ambience.ts
  game/game.ts           wires everything
```

---

### Task 1: Seats become slots

**Files:** `shared/scenes/types.ts`, `shared/scenes/kit.ts`, `shared/scenes/index.ts`, `shared/scenes/{town,library,cafe}.ts`, `shared/types.ts`, `shared/protocol.ts`, `server/src/world.ts`, `server/src/validate.ts`, `client/src/game/{game,interaction}.ts`, `client/src/hud/{hud,format}.ts`, and every existing test that uses seats.

**Produces:**
```ts
export type Pose = 'sit' | 'swing' | 'ride' | 'row';
export interface Slot { id: string; x: number; z: number; facing: number; pose: Pose; deskId?: string; toyId?: string }
// SceneDef.seats -> SceneDef.slots ; PlayerView.seatId -> slotId ; findSeat -> findSlot
// ClientMsg sit { slotId } ; ErrorCode: 'slot_taken' | 'bad_slot' replace seat_taken/bad_seat
// interaction Target { kind: 'slot'; slot: Slot; dist }
```

- [ ] **Step 1:** Mechanical rename across all files listed above. Prefabs (`studyDesk`, `cafeTable`, `bench`) emit `pose: 'sit'` and keep `deskId`. `Parts.seats` becomes `Parts.slots`. Server error text stays the same; the client toast for `slot_taken` stays '💺 That seat is taken!'.
- [ ] **Step 2:** Run `npm test && npm run typecheck`. Expected: all pass with the same test count as before.
- [ ] **Step 3:** Commit `refactor: seats become slots with a pose`.

### Task 2: Shared toy model and pure motion

**Files:** create `shared/toys.ts` and `shared/toys.test.ts`; modify `shared/scenes/types.ts`, `shared/geometry.ts` and `shared/geometry.test.ts`.

**Produces:**
```ts
// shared/toys.ts
export type ToyKind = 'swing'|'seesaw'|'merryGoRound'|'slide'|'piano'|'jukebox'|'ducks'|'fountain'|'bell'|'chimes'|'stones'|'campfire'|'telescope'|'rowboat';
export type ToyAction = 'push'|'slide'|'note'|'next'|'feed'|'coin'|'ring'|'skip'|'toggle';
export const TOY_ACTIONS: ToyAction[];
export interface BoatPose { x: number; z: number; heading: number }
export type ToyState =
  | { kind: 'merryGoRound'; angle0: number; speed0: number; t0: number }
  | { kind: 'jukebox'; track: number; startedAt: number }      // 0 = off, 1..3
  | { kind: 'campfire'; lit: boolean }
  | { kind: 'rowboat'; x: number; z: number; heading: number; returnFrom: (BoatPose & { at: number }) | null };
export const BOAT_SPEED = 2.4, BOAT_RETURN_SPEED = 1.5, SPIN_DECAY = 0.4, SPIN_PUSH = 1.2, SPIN_MAX = 3;
export function spinAt(s: { angle0; speed0; t0 }, now: number): { angle: number; speed: number };
export function boatPoseAt(s: Extract<ToyState,{kind:'rowboat'}>, mooring: BoatPose, now: number): BoatPose;
export function swingAngle(now: number, phase: number): number;   // 0.6*sin(2π now/2200 + phase)
export function seesawAngle(now: number): number;                 // 0.25*sin(2π now/2600)
/** World position of a slot given its toy's current pose (boats: toy pose; merry-go-round: rotation angle). */
export function slotWorld(slot: Slot, toy: Toy, pose: { x: number; z: number; heading: number }): { x: number; z: number; facing: number };
// shared/scenes/types.ts
export interface Toy { id: string; kind: ToyKind; x: number; z: number; rot?: number; radius: number; slotIds?: string[] }
export type LifeKind = 'butterflies'|'bees'|'birds'|'dragonflies'|'fireflies'|'ladybugs'|'snails'|'leaves'|'frogs'|'fish'|'ducks';
export interface LifeZone { kind: LifeKind; x: number; z: number; r: number; count: number; seed: number }
export interface SailPath { points: [number, number][]; period: number; offset: number; color: string }
export interface Water { outline: [number, number][]; landings: { x: number; z: number }[]; sailPaths: SailPath[] }
// SceneDef gains: toys: Toy[]; life: LifeZone[]; water?: Water
// geometry.ts
export function pointInPolygon(poly: [number, number][], x: number, z: number): boolean;
export function polygonToBoxes(poly: [number, number][], cell: number, keepClear: Box[]): Box[]; // row runs of cells whose centre is inside
```

`slotWorld` treats the slot's scene `x,z,facing` as its position when the toy is at its rest pose (`toy.x, toy.z, toy.rot ?? 0`). It rotates the offset by `pose.heading − rest heading` and translates it to `pose.x, pose.z`.

- [ ] **Step 1: Failing tests.**
  - `spinAt`: at `t0` it returns `angle0` and `speed0`. After 10 s the speed is `speed0·e^−4`. The angle grows monotonically and approaches `angle0 + speed0/0.4`.
  - `boatPoseAt`: with `returnFrom` null it returns the stored x, z and heading. Halfway through the return it lands between the start and the mooring. At or after the full duration (`dist/1.5` s) it equals the mooring. The heading takes the short way across ±π.
  - `slotWorld`: rest pose gives the slot itself. Moving the toy +3 in x moves the slot +3. Rotating the toy by π/2 about its centre moves an offset of (0, 1) to (1, 0) and adds π/2 to `facing`.
  - `pointInPolygon` on a unit square.
  - `polygonToBoxes`: a 4×4 square with cell 1 gives 4 row boxes covering 16 cells. A keepClear box removes its cells.
- [ ] **Step 2:** Run `npx vitest run shared` → FAIL.
- [ ] **Step 3:** Implement. Add `toys: [], life: []` to library and cafe.
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(shared): toy, life and water model with shared motion math`.

### Task 3: Server toy handlers

**Files:** create `server/src/toys.ts` and `server/src/toys.test.ts`.

**Produces:**
```ts
export interface ToyHandler {
  actions: ToyAction[];
  init?: (toy: Toy, now: number) => ToyState;
  apply(state: ToyState | undefined, action: ToyAction, arg: number | undefined, now: number, rand: () => number):
    { state?: ToyState; arg?: number };   // arg = what the event carries (e.g. stone skip count)
}
export const COOLDOWN_MS: Record<ToyAction, number>;
export const HANDLERS: Record<ToyKind, ToyHandler>;
```

| Kind | Actions | Effect |
|---|---|---|
| merryGoRound | push | `spinAt` the current values, then speed + 1.2 capped at 3, `t0 = now` |
| slide | slide | – |
| piano | note | arg 0..7 is required, otherwise the action is rejected (handled in world via `arg === undefined`) |
| jukebox | next | `track = (track + 1) % 4`, `startedAt = now` |
| ducks | feed | – |
| fountain | coin | – |
| bell, chimes | ring | – |
| stones | skip | event arg = `1 + floor(rand()·7)` |
| campfire | toggle | `lit = !lit` |
| swing, seesaw, telescope, rowboat | none | – |

`init`: merryGoRound `{angle0: 0, speed0: 0, t0: now}`, jukebox `{track: 0, startedAt: now}`, campfire `{lit: false}`, rowboat `{x: toy.x, z: toy.z, heading: toy.rot ?? 0, returnFrom: null}`.

- [ ] **Step 1: Failing table tests.**
  - Each kind accepts only its listed actions.
  - Push changes speed 0 → 1.2, and pushes cap at 3.
  - The jukebox cycles 0 → 1 → 2 → 3 → 0.
  - The campfire toggles.
  - Skip with rand 0 gives 1 and with rand 0.999 gives 7.
  - Every `ToyAction` has a cooldown.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(server): pure toy handlers`.

### Task 4: World — use, toy state, boats

**Files:** modify `shared/protocol.ts`, `shared/constants.ts`, `server/src/world.ts`, `server/src/validate.ts`, `server/src/validate.test.ts` and `server/src/world.test.ts`. The tests use a small fixture scene registered through a test-only hook, `World` constructor option `scenes?: Record<string, SceneDef>` (default `SCENES`), so world tests don't depend on town coordinates.

**Produces:**
```ts
ClientMsg | { t: 'use'; toyId: string; action: ToyAction; arg?: number }
ServerMsg | { t: 'toyEvent'; toyId: string; by: string; action: ToyAction; arg?: number; at: number }
          | { t: 'toyState'; toyId: string; state: ToyState }
welcome / sceneSnapshot gain toys: Record<string, ToyState>
ErrorCode += 'bad_toy'
new World(now?, rand?, scenes?)
```

**Rules:**
- **`use`:** the toy must be in the player's scene, otherwise `bad_toy`, and the action must be in its handler. For `note`, the player must sit in one of the toy's slots (otherwise `not_seated`) and arg must be present. For everything else, the player must be unseated and within `radius + 0.3` (otherwise `bad_toy`). The per-player cooldown key is `toyId|action`; presses inside it are dropped quietly. Apply the handler, store the state, then broadcast `toyState` if the state changed and `toyEvent` to the whole scene, sender included.
- **`sit`:** distance is measured to `slotWorld` of the slot at its toy's current pose: boat pose, or merry-go-round angle via `spinAt`. On success the player's x/z is the slot's world position.
- **Boarding:** sitting in a boat's `row` slot while `returnFrom` is set freezes the boat at `boatPoseAt(now)` and clears `returnFrom`, then broadcasts `toyState`.
- **`move` while in a `row` slot steers the boat:**
  - The new pose is accepted only if the speed is ≤ `BOAT_SPEED·max(dt, 50ms) + 0.5` and the centre plus 4 points at 0.7 around it are inside `water.outline`.
  - When accepted, store it and broadcast `toyState`.
  - When rejected, send `toyState` to the rower only so they snap back.
  - `move` in any other slot is ignored, as before.
- **`stand` from a toy slot:**
  - Boat slot: the player goes to the nearest `water.landings` point, measured from the slot's world position.
  - Merry-go-round: the slot's world position pushed out to radius 2.2 from the toy centre.
  - Otherwise: the slot position.
  - If the freed slot was a boat's `row` slot, set `returnFrom = {...current pose, at: now}` and broadcast.
- **`remove`** (grace expired) frees slots with the same boat-return rule.
- **Toy state** is created lazily from `init` the first time it's needed. It's sent in `welcome` and `sceneSnapshot` for every stateful toy in that scene.
- **`validate.ts`:** `use` requires `toyId` to be a string of ≤40 characters, `action` in `TOY_ACTIONS`, and `arg` (when present) a whole number from 0 to 7. `sit` reads `slotId`.

- [ ] **Step 1: Failing tests.** The fixture scene has a bell, a piano with a bench slot, a campfire, a stones toy, a merry-go-round with one slot, a desk slot, and a rowboat with row and back slots on a square lake with two landings.
  - Bell ring is broadcast to the scene, the sender included, and not to another scene.
  - A second ring inside 1.5 s is dropped; after 1.5 s it goes through.
  - Ringing from far away gives `bad_toy`; an unknown toy gives `bad_toy`.
  - A piano note without sitting gives `not_seated`; seated it is broadcast with its arg.
  - The campfire toggle broadcasts `toyState` and a late joiner's `welcome.toys` shows `lit: true`.
  - Skip uses the injected rand.
  - `startSession` on the merry-go-round slot gives `not_seated` (it isn't a desk), and on the desk slot it works.
  - Rowing: a valid move updates the boat; too fast is rejected; off the water is rejected with a `toyState` to the rower; standing up puts you at the nearest landing and starts `returnFrom`; reboarding mid-return freezes the pose; grace expiry frees the slot and starts the return.
  - Validate: good and bad `use` messages, and `sit` with `slotId`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(server): shared toys, toy state and rowboats`.

### Task 5: The big town data

**Files:** create `shared/scenes/town/{scatter,square,lake,woods,park,playground,edges}.ts`; rewrite `shared/scenes/town.ts`; extend `shared/scenes/kit.ts`, `shared/scenes/types.ts` (new `DecorKind`s) and `shared/scenes/scenes.test.ts`; update the coordinates `server/src/server.test.ts` relies on.

**New DecorKinds:** `lake`, `dock`, `lilyPad`, `rock`, `grass`, `hedge`, `bandstand`, `piano`, `fountain`, `bellPost`, `jukebox`, `swingSet`, `swingSeat`, `seesaw`, `merryGoRound`, `slide`, `campfire`, `log`, `telescope`, `chimes`, `leafPile`, `rowboat`, `mound`.
- Toy visuals are drawn by the client toy behaviours (Task 7). These kinds exist so static props and scatter have a stable type.
- `swingSeat`, `seesaw`, `merryGoRound`, `rowboat` and `campfire` are built only through their toy behaviour (not as plain decor), so they can animate.

**Layout** (centres, with the door on each building's south face):

| Zone | Contents |
|---|---|
| Square | Library `building(-12,-6, 9,7,4.4)`, door box `(-12,-2.1, 1.4,0.8)`, spawn `from-library (-12,-0.4, 0)`; Café `building(12,-6, 8,6.5,3.8)`, door `(12,-2.35,1.4,0.8)`, spawn `from-cafe (12,-0.6,0)`; bandstand `(0,-9)` r 3.2 (8 pillar colliders 0.25), piano toy `(0,-10)` collider 1.4×0.6 with bench slot `piano-bench (0,-9.2, facing π)`; fountain toy `(0,6)` radius 2.6 with collider 3.2×3.2; bell toy `(-6,7)` r 1.4 (post collider 0.3); jukebox toy `(17.6,-3.5)` r 1.4 (collider 0.8×0.6); `start` spawn `(0,1.5,0)`; main path z = 1.5 (w 120, d 2.4); north–south path x = 0; benches `sq-b1 (-6,-1)`, `sq-b2 (6,-1)`, `park-b1 (-6,11.5,π)`, `park-b2 (6,11.5,π)`; lamp posts every 10 units along the main path (z = 0) and around the square. |
| Lake | Outline: 24 points, ellipse centre (28,−24), rx 22, rz 13, seeded wobble ±0.8. Colliders: `polygonToBoxes(outline, 1.5, [dockClear])` where the dock is the box `(24,-13.5, 2, 9)`. Moorings: `boat-1 (22.3,-15.6, rot π)` and `boat-2 (25.7,-15.6, rot π)`, each with slots `-row` (local forward +0.3) and `-back` (local −0.55). Stones toy at the dock tip `(24,-17.2)` r 1.4. Ducks toy on the south shore at the outline point nearest (36,−10), pushed 1.6 outward, r 1.8. Landings: dock `(24,-10.5)` plus every 3rd outline vertex pushed 2.2 outward, keeping only those inside the map and clear of colliders. 3 sail paths (6 control points each, inset 4 from the outline, periods 120/150/180 s). About 40 lily pads. Life: ducks ×8, fish ×6, frogs ×5, dragonflies ×8. |
| Woods | About 140 pines and 30 trees scattered over x −58..−8, z −43..−14, avoiding the clearing at (−30,−28) r 6 and the paths. Campfire toy `(-30,-28)` r 2.4 (collider 1×1), 4 logs at radius 2.3 with slots `fire-log-n/e/s/w` facing the centre. 6 leaf piles. Life: fireflies ×30, snails ×4, leaves ×40, birds ×5. |
| Park | x −58..−6, z 6..43. Benches `park-b3..b6`, 10 flower beds, the telescope toy on a mound at `(-40,32)` r 1.4, a chimes toy hanging from a tree at `(-22,20)` r 1.6. Life: butterflies ×14, bees ×10, birds ×8, ladybugs ×6, fireflies ×20. |
| Playground | Swing set at `(20,22)`: swing toys `swing-1 (19,22)` and `swing-2 (21,22)`, each with one slot (pose swing, facing 0, at the toy position + (0,0.3)); frame post colliders at x 17.6 and 22.4. Seesaw toy `(30,22)` with slots `seesaw-w (28.2,22, facing π/2)` and `seesaw-e (31.8,22, −π/2)` (pose ride); pivot collider 0.4. Merry-go-round toy `(40,22)` r 2.2, slots `mgr-0..3` at radius 1.1 facing outward (pose ride); pole collider 0.3. Slide toy at the ladder `(30,30.4)` r 1.3, collider 0.8×2.6 at `(30,31.8)`; foot `(30,34.6)` (stored as `Toy.rot = 0` with the foot derived as `toy + (0, 4.2)`). Sandbox and flower decor. Life: butterflies ×8, birds ×6. |
| Edges | A hedge ring 1.5 inside the bounds (decor plus colliders as 4 long boxes), a double tree line, about 600 grass tufts and about 60 rocks scattered map-wide, avoiding paths, water and buildings. |

**`scatter(seed, n, area: Box, ok: (x, z) => boolean): [number, number][]`** is a deterministic rejection sampler with at most 20·n tries.

- [ ] **Step 1: Failing scene tests (new invariants):**
  - Every `slot.toyId` names a toy in the same scene, and every `toy.slotIds` entry names a slot pointing back to it.
  - Slot and toy ids are unique across scenes.
  - Non-moving slots, toys, spawns, doors and landings are inside the bounds and not inside colliders (slots of `rowboat`/`merryGoRound` toys are skipped).
  - Moorings (rowboat toys) and sail path points are inside `water.outline`; landings are outside it.
  - Life zones are inside the bounds.
  - Town size is 120×90.
  - `park-b1-a` exists.
  - The town has at least one toy of each of the 14 `ToyKind`s.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Write the zone files. **Step 4:** Run → PASS; fix the server test coordinates that read `park-b1-a` (they look it up, so only the scenes test's hard-coded `5.55` changes).
- [ ] **Step 5:** Commit `feat(shared): 120x90 living town layout`.

### Task 6: Rendering — instancing, shadows, new decor

**Files:** create `client/src/world/instanced.ts`; modify `client/src/world/decor.ts`, `client/src/world/sceneBuilder.ts`, `client/src/world/materials.ts` and `client/src/game/game.ts` (pixel ratio, FPS counter, shadow follow).

**Produces:**
```ts
export const INSTANCED_KINDS: Set<DecorKind>; // tree, pine, bush, flowers, grass, rock, lilyPad, hedge, leafPile
export function buildInstanced(decor: Decor[]): { group: THREE.Group; sway: { value: number } };
export function swayMaterial(base: THREE.MeshStandardMaterial, sway: { value: number }): THREE.MeshStandardMaterial;
// sceneBuilder: buildScene returns { scene, sun, sway, lamps: {x,z}[] }  (BuiltScene)
// materials.glow(color, intensity, tag = '') — tag splits cache entries (street lamps, windows)
```

- **Instancing:** decor is grouped by kind × variant (`seed mod 4`). For each mesh of the template (the existing builder called with x=z=0, h=1), make an `InstancedMesh` with matrix `T(x, y, z)·R_y(rot)·S(h ?? 1)·meshLocal`.
- **Sway:** a vertex-shader patch through `onBeforeCompile` adds `sin(time·1.6 + instancePos.x·0.35 + instancePos.z·0.25) · 0.035 · max(position.y − 0.4, 0)` to x and z. The template's foliage meshes (any mesh whose local y > 0.5) get the sway material.
- **New decor builders:** lake (filled `ShapeGeometry` from the outline + a rim ring), dock (planks + posts), lilyPad, rock, grass (3 thin cones), hedge (a long rounded box), bandstand (octagon platform, pillars, roof), piano (static body; the toy adds the lid), fountain (basin + spout), bellPost, jukebox (glowing panel), swingSet frame, slide, log, telescope, chimes, leafPile, mound.
- **Town lights:** the lamp post bulb uses `glow(P.lampGlow, 1.6, 'street')` and building windows use `glow(P.windowGlow, 0.5, 'window')`, so day/night can tune them without touching indoor lamps.
- **Shadows:** the sun's shadow area is ±22 around the player and moved each frame (`sun.position = target + sunOffset`, `sun.target = player`).
- **`?fps`:** a fixed `div` updated twice a second.
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npm run typecheck && npm test` → PASS.
- [ ] **Step 3:** `npm run build` → succeeds.
- [ ] **Step 4:** Commit `feat(client): instanced scenery, wind sway, new decor, follow shadows`.

### Task 7: Client toys, slots and poses

**Files:** create `client/src/toys/{registry,swing,seesaw,merryGoRound,slide,piano,jukebox,ducks,fountain,bell,stones,campfire,telescope,rowboat}.ts` and `client/src/toys/prompts.test.ts`; modify `client/src/game/interaction.ts`, `client/src/game/interaction.test.ts`, `client/src/game/game.ts`, `client/src/game/cameraRig.ts`, `client/src/world/character.ts` and `client/src/game/input.ts` (digits).

**Produces:**
```ts
export interface ToyCtx { now: number; state?: ToyState; occupied: Set<string>; night: number }
export interface ToyView {
  root: THREE.Object3D;
  update(dt: number, ctx: ToyCtx): void;
  /** Current pose used to place riders (boats, merry-go-round). Default = rest pose. */
  pose?(ctx: ToyCtx): { x: number; z: number; heading: number };
  /** Rider offset for swing/seesaw (y lift and sway), applied after slotWorld. */
  riderOffset?(slot: Slot, ctx: ToyCtx): { dx: number; dy: number; dz: number };
  onEvent?(e: { action: ToyAction; arg?: number; by: string }, ctx: ToyCtx): void;
}
export function makeToyView(toy: Toy, def: SceneDef, fx: ToyFx): ToyView;   // registry
export interface ToyFx { sound(kind: SoundKind, x: number, z: number, arg?: number): void; bubble(byId: string, text: string): void; ducksFeed(x: number, z: number): void }
export function toyPrompt(toy: Toy, state?: ToyState): string | null;     // '[E] ring the bell', '[E] light the fire' / '[E] put out the fire', telescope '[E] look at the sky', jukebox '[E] next song' / '[E] turn on the jukebox', etc.; null for slot-only toys
// interaction.ts
export type Target = { kind: 'slot'; slot: Slot; dist: number } | { kind: 'toy'; toy: Toy; dist: number } | { kind: 'player'; id: string; dist: number };
export function pickTarget(x, z, slots: { slot: Slot; x: number; z: number }[], taken: Set<string>, toys: Toy[], others: {id,x,z}[]): Target | null; // toys only if toyPrompt(toy) !== null
// character.ts: pose: Pose property; when anim==='sit': 'swing' & 'ride' = sit legs, arms up holding; 'row' = sit + arms rowing cycle
```

**Game wiring:**
- `enter()` builds a ToyView for each toy, kept per scene.
- Each frame: compute rider positions (local and remote) from `slotWorld(slot, toy, view.pose(ctx))` plus `riderOffset`, and set `char.root.position` including y. Stateful toys read their `ToyState` from the `toys` map filled by `welcome`/`sceneSnapshot`/`toyState`. `toyEvent` → `view.onEvent`. Toy-slot occupancy comes from the players' `slotId`s.
- **E on a toy target:**
  - Telescope (local): `rig.lookUp(true)` tilts the camera up to the sky and zooms out. E or any movement key exits.
  - Otherwise: `send({ t: 'use', toyId, action })`, with the action from `TOY_DEFAULT_ACTION[kind]`.
- **Piano:** while seated in the piano slot, digits 1–8 send `use note arg = digit − 1`. The prompt reads `[1–8] play · [E] stand up`.
- **Rowing:**
  - While seated in a `row` slot, WASD moves the local boat pose. The heading turns toward the input direction at 2.5 rad/s, and the boat moves at `BOAT_SPEED`, kept inside the water outline (`pointInPolygon` on the 5 points).
  - The pose is sent as `move {x, z, facing: heading, anim: 'sit'}` every 100 ms.
  - E stands up. Movement keys don't stand you up in a row slot.
  - The prompt reads `[WASD] row · [E] get out`.
  - Remote boats ease toward the last `toyState` pose (`k = 1 − e^{−10dt}`). The local rower's boat uses the local pose.
- **Slide:** on a `toyEvent slide` for player P, every client plays a 1.5 s animation: ladder climb (y 0 → 1.6) then a slide down to the foot. If P is me, input is locked during it, then `x, z = foot` and a move is sent.
- **Stand from a toy slot:** `updateMe` copies x/z/facing when `slotId` goes from set to null.

**Visuals:**
- **Swing:** the seat hangs from the frame. Angle = `swingAngle(now, i·1.3)` when occupied, else a gentle idle 0.05.
- **Seesaw:** the board tilts by `seesawAngle(now)` when both ends are taken, otherwise it rests on the heavier side.
- **Merry-go-round:** rotation = `spinAt(state).angle`.
- **Jukebox:** the panel glows by track (off = dim).
- **Campfire:** flames are 3 flickering emissive cones plus an ember glow when lit.
- **Bubbles:** the stones event shows a "N skips!" bubble over the thrower (reusing `overhead.emote`-style text) and N splash rings along the throw direction. The fountain coin shows sparkle particles; bell and chimes swing.

- [ ] **Step 1: Failing tests.**
  - `pickTarget`: nearest free slot; skips taken slots; a toy within its radius beats a farther slot; toys with a null prompt are ignored; a player is closer than a toy.
  - `toyPrompt` texts for the campfire (lit and unlit), the jukebox (off and on), the bell, and the swing (null).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npm test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 5:** Commit `feat(client): interactive toys, ride poses and rowing`.

### Task 8: Day/night

**Files:** create `client/src/world/sky.ts` and `client/src/world/sky.test.ts`; modify `client/src/world/sceneBuilder.ts` and `client/src/game/game.ts`.

**Produces:**
```ts
export interface SkyState { top: string; bottom: string; sunColor: string; sunIntensity: number; sunDir: [number, number, number]; hemiSky: string; hemiGround: string; hemiIntensity: number; fog: string; night: number }
export function skyAt(hours: number): SkyState;   // keyframes 0:00 night, 5:00 night, 6:00 dawn, 8:00 day, 17:00 day, 18:00 golden, 19:30 dusk, 21:00 night, 24:00 night; colours lerped in linear RGB, numbers linearly
export function clockHours(date: Date, override: string | null): number; // '?time=21:30' → 21.5
export class SkyRig { constructor(built: BuiltScene, def: SceneDef); update(hours: number, focusX: number, focusZ: number): void } // town only
```

- **Day keyframe:** the current town theme values. Golden: warm orange sun, peach sky bottom. Dusk: purple/pink. Night: navy top `#1b2445`, `#3a3a6a` bottom, moonlight `#9fb4ff` at intensity 0.6, hemi 0.55, `night = 1`.
- **`SkyRig`:**
  - Redraws the 2×256 gradient canvas when the colours change.
  - Sets the fog colour and the sun's colour, intensity and direction.
  - Stars: 600 `THREE.Points` with `fog: false` on radius 150, opacity = night.
  - Moon: an emissive sphere, shown when night > 0.3.
  - Street-lamp and window glow intensity = `0.3 + night·1.6`.
  - A pool of 4 `PointLight`s goes to the nearest lamp posts / lit campfire each 0.5 s, intensity × night (the campfire is always at full strength when lit).
- **Indoor scenes:** window glow is tinted by `night` only.
- [ ] **Step 1: Failing tests.**
  - `skyAt(12).night === 0` and `skyAt(23).night === 1`.
  - `skyAt(18.75)` lies between golden and dusk.
  - `skyAt(0)` deep-equals `skyAt(24)`.
  - `clockHours` parses `21:30` → 21.5, and an invalid override falls back to the date.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS, typecheck and build.
- [ ] **Step 5:** Commit `feat(client): real-clock day/night with stars, moon and lamp pool`.

### Task 9: Ambient life

**Files:** create `client/src/life/{registry,ducks,fish,frogs,dragonflies,birds,flyers,crawlers,fireflies,leaves,sailboats,clouds}.ts` and `client/src/life/math.test.ts` (pure helpers in `client/src/life/math.ts`).

**Produces:**
```ts
export interface LifeCtx { t: number; dt: number; focus: { x: number; z: number }; me: { x: number; z: number }; night: number }
export interface LifeSystem { root: THREE.Object3D; update(ctx: LifeCtx): void; feed?(x: number, z: number): void }
export function buildLife(def: SceneDef): { root: THREE.Group; update(ctx: LifeCtx): void; feed(x: number, z: number): void };
// math.ts
export function catmullLoop(points: [number, number][], u: number): { x: number; z: number; heading: number };
export function noise1(seed: number, t: number): number;      // smooth value noise in [-1, 1]
export function within(a: { x: number; z: number }, b: { x: number; z: number }, r: number): boolean;
export const LIFE_RADIUS = 35;
```

- **Culling:** each system skips its update when its zone centre is more than `LIFE_RADIUS + zone.r` from `focus`.
- **Rendering:** critters are `InstancedMesh`es (one per part).
- **Behaviour** (from the spec table):
  - **Sailboats:** `catmullLoop(path, ((t/1000)/period + offset) % 1)`.
  - **Ducks:** drift with `noise1` while staying inside the outline. `feed(x, z)`: ducks within 10 steer to the point for 8 s.
  - **Fish:** a jump arc every 6–14 s at seeded spots (`t`-derived, so the same on every client), with a ripple.
  - **Frogs:** hop into the water when `me` is within 2, and return after 6 s.
  - **Birds:** flee when `me` is within 3, and return after 20–40 s.
  - **Flyers** (butterflies, bees, dragonflies): Lissajous orbits plus noise.
  - **Crawlers** (ladybugs, snails): slow paths along a loop.
  - **Fireflies:** additive Points, opacity × night.
  - **Leaves:** falling quads that respawn.
  - **Leaf piles:** handled here too. When `me` walks through, the leaves burst and settle back after 10 s (the pile decor is hidden meanwhile via a per-pile mesh, not the instanced batch).
  - **Clouds:** 8 clouds drifting over the town at y 22.
- [ ] **Step 1: Failing tests.**
  - `catmullLoop` passes through its control points at u = i/n, and u = 0 equals u = 1.
  - `noise1` stays within [−1, 1] and is continuous (small Δt gives a small Δ).
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS, typecheck and build.
- [ ] **Step 5:** Commit `feat(client): ambient life — boats, ducks, critters, fireflies, clouds`.

### Task 10: Audio

**Files:** create `client/src/audio/{engine,voices,jukebox,ambience}.ts` and `client/src/audio/audio.test.ts`; modify `client/src/hud/chime.ts` (reuse the engine context), `client/src/hud/hud.ts`, `client/index.html` and `client/src/style.css` (mute button), and `client/src/game/game.ts`.

**Produces:**
```ts
export function gainForDistance(d: number): number;  // 1 at ≤4, 0 at ≥25, smooth (1-u)^2 between
export function panFor(dx: number): number;          // clamp(dx/12, -1, 1)
export class AudioEngine { ctx(): AudioContext | null; muted: boolean; setMuted(m: boolean): void; setScene(id: string): void; setListener(x: number, z: number): void; playAt(kind: SoundKind, x: number, z: number, arg?: number): void; emitter(x: number, z: number): Emitter }
export type SoundKind = 'note' | 'bell' | 'chime' | 'splash' | 'coin' | 'plop' | 'quack' | 'whoosh' | 'skip';
// jukebox.ts
export const BPM = 80, STEPS_PER_BAR = 8, BARS = 4;
export function stepsBetween(fromMs: number, toMs: number): { index: number; atMs: number }[]; // step indices (mod loop) whose start lies in [from, to)
export class JukeboxPlayer { constructor(engine: AudioEngine, x: number, z: number); set(state: ToyState & { kind: 'jukebox' }): void; tick(serverNowMs: number): void }
// ambience.ts
export class Ambience { constructor(engine: AudioEngine, def: SceneDef); update(night: number, fireLit: boolean, me: {x,z}): void }
```

- **Voices:** each is a short graph built per play.
  - Piano: two triangles detuned ±4 cents, attack 5 ms, decay 1.2 s; notes C4 D4 E4 F4 G4 A4 B4 C5.
  - Bell: sine partials ×1, 2.76, 5.4 with a 2.5 s decay. Chime: random pentatonic partials.
  - Splash, coin, plop, whoosh, skip: band-passed noise bursts.
  - Quack: a sawtooth pitch drop.
- **Jukebox:** the scheduler runs every 100 ms with a 250 ms look-ahead. It schedules the steps from `stepsBetween(elapsed, elapsed + 250)` (where elapsed = `serverNow − startedAt`) at `ctx.currentTime + (atMs − elapsed)/1000`. Three patterns (chord voicings + bass + noise hat) live in data arrays. Gain comes from its emitter.
- **Ambience:**
  - Birds: chirp bursts every 1.5–5 s by day, scaled by (1 − night).
  - Crickets: a pulsing 4.5 kHz sine scaled by night.
  - Water: a noise emitter at the nearest outline point to `me`.
  - Fire: a crackle emitter at the campfire when it's lit.
- **Mute:** a HUD button (🔊/🔇) top-right next to the existing buttons, saved in `localStorage['sv-muted']`. Indoors, `setScene` silences the positional bus.
- [ ] **Step 1: Failing tests.**
  - `gainForDistance(0) = 1`, `(4) = 1`, `(25) = 0`, `(30) = 0`, and it falls monotonically between 4 and 25.
  - `panFor` clamps to ±1.
  - At 80 BPM with 8 steps per bar (one step = 375 ms), `stepsBetween(0, 1000)` gives indices 0, 1, 2 at 0, 375, 750, and the indices wrap after 32 steps.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS, typecheck and build.
- [ ] **Step 5:** Commit `feat(client): synthesized toy sounds, jukebox loops, ambience and mute`.

### Task 11: Manual check, final review, ship

- [ ] **Step 1:** `npm test && npm run typecheck && npm run build` → all green.
- [ ] **Step 2:** One short local run (`npm run dev:server` + `npm run dev:client`). Open `http://localhost:5173/?fps` and `?time=22:00&fps`, walk each zone, try every toy, row a boat, stop. Fix anything broken.
- [ ] **Step 3:** Run one full review (superpowers:requesting-code-review) over `origin/main..HEAD`, fix the findings, then re-run the tests.
- [ ] **Step 4:** Update the README (toys, controls 1–8 / rowing, `?time`, `?fps`, mute).
- [ ] **Step 5:** Check `git log --format=%B origin/main..HEAD | grep -i co-authored` (must be empty), then `git push origin main`.
