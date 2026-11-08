# StudyVerse: Living World Design

Date: 2026-11-09
Status: Draft, awaiting user review

## 1. Goal and scope

The core slice works, but the town feels small and still. This spec makes the outdoor world about three times wider and deeper and fills it with life: a lake with boats, insects and birds, a day/night cycle that follows the real clock, and lots of shared "press E" toys.

This is the **first of three world-expansion specs**:

1. **Living world (this spec):** a bigger map, decor, ambient life, day/night, synthesized audio, all the toys, and the general interactable system the next two specs reuse.
2. **Study objects:** a shared whiteboard or notice board, a quote bookshelf, a streak plant, a do-not-disturb lamp.
3. **Coffee making:** the real coffee-making interaction in the Café.

**Out of scope here:**
- Pets and animal petting. These come later as their own system driven by a lightweight RL model; any training runs on `fox` or `gpu-sys`, never on the Mac.
- Mini-games and points.
- Study objects (spec 2) and coffee making (spec 3).
- New interiors, weather and seasons.
- Saving toy state to disk.

**Success criteria:**
- Walking from one corner of the town to the other takes about 40 seconds at `MOVE_SPEED`.
- Every zone has something moving and something to press E on.
- Friends see and hear each other's toys.
- The client holds about 60 fps in a browser on the user's MacBook Air.

## 2. Map and zones

The town grows from 40×30 to **120×90**, with x from −60 to 60 and z from −45 to 45. As before, north (−z) is away from the camera.

```
 z=-45 ┌──────────────────────────────────────────────────────────┐
       │ WOODS (pines, campfire  │        LAKE  (~44×26)          │
       │ + log seats, fireflies, │   sailboats · ducks · lilies   │
       │ leaf piles, snails)     │   frogs · fish  ┌─dock─┐ boats │
       │                         │                 └──────┘       │
       │        ┌─Library─┐   TOWN SQUARE   ┌─Café─┐  jukebox      │
       │        └────┬────┘  fountain·bell  └──┬───┘               │
       │ ═══════════╪══════ bandstand+piano ══╪════════ main path │
       │            │      lamp posts, benches │                   │
       │  PARK (benches, flowers, bees,        PLAYGROUND (swings, │
       │  butterflies, wind chimes,            seesaw, slide,      │
       │  telescope hill)                      merry-go-round)     │
 z=+45 └──────────────────────────────────────────────────────────┘
```

- **Town square (centre):**
  - The Library and Café move here, and their doors and the `from-library` and `from-cafe` spawns move with them.
  - Also here: a bandstand with the piano, the wishing fountain, a bell, the jukebox outside the Café, benches and lamp posts.
  - The `start` spawn is in the square.
- **Lake (north-east):** about 44×26, shaped by a seeded wobbly outline (the same idea as today's pond, which it replaces). It has lily pads, a dock with two rowboat moorings, a stone-skipping spot at the dock's end, and a duck-feeding spot on the south shore.
- **Woods (north-west):** dense pines, the campfire ringed by four log seats, leaf piles, fireflies and snails.
- **Park (south-west):** benches, flower beds, wind chimes hanging from a tree, and a small hill with the telescope.
- **Playground (south-east):** two swings, a two-seat seesaw, a slide and a four-seat merry-go-round.
- **Edges:** hedges, a low fence and tree lines backed by fog, so the end of the world never shows.
- **Code layout:**
  - The town data is split into zone files under `shared/scenes/town/`: `square.ts`, `lake.ts`, `woods.ts`, `park.ts`, `playground.ts` and `edges.ts`.
  - `shared/scenes/town.ts` merges them with the existing `merge()` kit helper.
  - New prefab helpers go in `shared/scenes/kit.ts` (or a sibling `kit-toys.ts` if it gets long).
- **Colliders:** the lake (as a few boxes approximating its outline), building footprints, the fountain, the bandstand base, tree trunks of big trees and the playground frames. The server uses the same colliders.

## 3. Rendering performance

The target is about 60 fps on a fanless MacBook Air.

- **Instancing:** decor kinds that repeat (tree, pine, bush, flowers, grass tufts, rocks, lily pads, fence posts, critters) are drawn with **one `THREE.InstancedMesh` per kind and part**. `client/src/world/decor.ts` keeps one-off builders for unique props (buildings, bandstand, toys). A new `client/src/world/instanced.ts` batches the repeated kinds.
- **Shadows:** the directional light's shadow area is about 40×40 and follows the player each frame, instead of covering the whole map.
- **Update radius:** ambient life and toy animations only update within `LIFE_RADIUS = 35` of the camera target. Anything outside freezes, hidden by the fog.
- **Pixel ratio:** `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`.
- **FPS readout:** `?fps` in the URL shows a small counter, for development only.
- **Point lights:** at most 4 real point lights at night (the lamps nearest the player and the campfire). Everything else glows by its own (emissive) colour.

## 4. Slots

Today's `Seat` becomes a general **slot**:

```ts
type Pose = 'sit' | 'swing' | 'ride' | 'row';

interface Slot {
  id: string;
  x: number; z: number;
  facing: number;
  pose: Pose;
  deskId?: string;   // desks and café tables: allows Pomodoro
  toyId?: string;    // toy seats: swings, seesaw, merry-go-round, piano bench, logs, boats
}
```

- `SceneDef.seats` is renamed to `SceneDef.slots`, and `PlayerView.seatId` to `PlayerView.slotId`.
- The existing desk and café-table prefabs emit slots with `pose: 'sit'` and a `deskId`.
- `startSession` still requires a slot with a `deskId`. Sitting on a swing doesn't start Pomodoro.
- The server keeps one map, `slots: Map<slotId, playerId>`, with the same "one person per slot" rule.
- Clients work out the pose from the slot. `Anim` stays `'idle' | 'walk' | 'sit'`, and the character rig maps a seated player to the slot's pose animation.
- **Moving slots:** slots on the merry-go-round and the boats move with their toy. The client places the seated character from the toy's current pose plus the slot's offset, and the server does the same when it needs a position (for example when you stand up).
- **Message rename:** `sit { seatId }` becomes `sit { slotId }`.

## 5. Toys

```ts
type ToyKind =
  | 'swing' | 'seesaw' | 'merryGoRound' | 'slide' | 'piano' | 'jukebox' | 'ducks'
  | 'fountain' | 'bell' | 'chimes' | 'stones' | 'campfire' | 'telescope' | 'rowboat';

interface Toy {
  id: string;
  kind: ToyKind;
  x: number; z: number;
  rot?: number;
  radius: number;        // how close you must be to use it
  slotIds?: string[];
}
```

`SceneDef` gains `toys: Toy[]`. Leaf piles are not toys: they are decor that reacts to the player walking through them (section 7).

**E targeting:** `pickTarget` in `client/src/game/interaction.ts` returns the closest of:
- a free slot within `SEAT_RADIUS`,
- a slot-less toy action within the toy's `radius`,
- a player within `INTERACT_RADIUS`.

The HUD prompt names the action: "E: swing", "E: feed the ducks", "E: light the fire".

| Toy | How it works | Action(s) | Server state |
|---|---|---|---|
| swing ×2 | sit in its slot; the swing arc is a function of `now − sittingSince`, so it looks the same everywhere | – | – |
| seesaw | 2 slots; rocks only while both are taken, phase from the later sit time | – | – |
| merryGoRound | 4 slots; E while standing next to it pushes it. Spin speed decays as `speed·e^(−0.4·Δt)`. A push works out the current angle and speed, then adds 1.2 rad/s (max 3 rad/s). Everyone computes the angle from the state | `push` | `angle0`, `speed0`, `t0` |
| slide | E at the ladder: everyone plays a 1.5 s climb-and-slide animation for that player, who ends at the slide's foot | `slide` | – |
| piano | sit on the bench slot; keys 1–8 play notes C4 to C5 | `note` (arg 0–7) | – |
| jukebox | E cycles track 1 → 2 → 3 → off | `next` | `track` (0 = off, 1–3), `startedAt` |
| ducks | E at the feeding spot throws bread; nearby ducks paddle to it | `feed` | – |
| fountain | E tosses a coin: splash and sparkle | `coin` | – |
| bell, chimes | E rings them | `ring` | – |
| stones | E at the dock end; the server rolls 1–7 skips and everyone sees the same skips and a "4 skips!" bubble | `skip` | – (the event carries the roll) |
| campfire | E toggles it; 4 log slots (`sit`) around it | `toggle` | `lit` |
| telescope | E zooms the camera up at the sky; E or moving exits; local only, no network | – | – |
| rowboat ×2 | 2 slots: `row` at the front, `sit` at the back | (see 5.1) | `x`, `z`, `heading`, `mooredAt`, `returnFrom` |

### 5.1 Rowboats

- **Boarding:** each boat starts at a mooring by the dock. Boarding means sitting in one of its slots, which only works while the boat is within `SEAT_RADIUS` of you, so in practice at the dock or a shore landing.
- **Rowing:**
  - While you hold a `row` slot, your normal `move` messages steer the boat. The server reads them as the boat's new `x`, `z` and `heading`.
  - The server rejects a pose more than `BOAT_SPEED × dt + slack` away (`BOAT_SPEED = 2.4` m/s) and any pose outside the lake's water polygon, and sends the authoritative `toyState` back so the client snaps.
- **Passenger:** whoever sits in the `sit` slot rides along. Their position is derived from the boat.
- **Getting out:** `stand` works anywhere. You're placed at the nearest **landing point**, a list in the lake zone data.
- **Return trip:**
  - Once a boat has no rower, it records `returnFrom = { x, z, heading, at }`.
  - Clients and the server both compute its position as a smoothstep from `returnFrom` to its mooring over `distance / 1.5` seconds. No traffic is needed while it moves.
  - A passenger left in the back seat rides back to the dock.
  - If someone takes the row slot during the return, the return is cancelled at the boat's current position.

### 5.2 Sailboats

Sailboats are **scenery**, not toys. Each follows a closed path, a Catmull-Rom loop over control points in the lake zone data, at `pos = path(((serverNow / 1000) / period + offset) mod 1)`. They need no network messages and are not colliders for the rowboats; rowboats just pass through them.

## 6. Protocol and server

### 6.1 Messages

```ts
// client → server
| { t: 'use'; toyId: string; action: ToyAction; arg?: number }
| { t: 'sit'; slotId: string }          // renamed from seatId

// server → client
| { t: 'toyEvent'; toyId: string; by: string; action: ToyAction; arg?: number; at: number }
| { t: 'toyState'; toyId: string; state: ToyState }

type ToyAction = 'push' | 'slide' | 'note' | 'next' | 'feed' | 'coin' | 'ring' | 'skip' | 'toggle';
```

- `welcome` and `sceneSnapshot` gain `toys: Record<toyId, ToyState>` for the current scene, so late joiners see the fire burning and the boats where they are.
- Both `toyEvent` and `toyState` go to every player in the scene, the sender included.
- Rowboat pose updates go out as `toyState`, at most 10 per second per boat.

### 6.2 Server code

- **`server/src/toys.ts`:** a new module holding a **pure** handler table. For each `ToyKind` it lists the accepted actions, a per-player cooldown, the initial state, and `apply(state, action, arg, now, rand) → { state?, event? }`.
  - **Cooldowns:** piano note 100 ms, bell, chimes and coin 1.5 s, feed 3 s, skip 2 s, push 0.5 s, slide 2 s, toggle and next 1 s.
  - `rand` is passed in so tests can fix it.
- **`server/src/world.ts`:**
  - Handles `use`: it checks the toy exists in the player's scene and that the player is within `radius + 0.3` (or seated in its slot, for piano notes).
  - It applies the cooldown, calls the handler, then broadcasts the result.
  - It owns the boat rules in 5.1 and the grace-expiry cleanup in 6.3.
- **Rate limits:** the existing per-socket rate limiter still applies on top of the per-toy cooldowns.

### 6.3 Errors and edge cases

- **Input checks:** `validate.ts` gains a `use` check: `toyId` must be a string of 40 characters or fewer, `action` must be in `ToyAction`, and `arg` must be a whole number from 0 to 7 if present.
- **Error codes:**
  - `bad_toy`: the toy doesn't exist, isn't in this scene, or you're too far away. Shown as the usual toast.
  - `bad_seat` and `seat_taken` are renamed to `bad_slot` and `slot_taken`.
  - `not_seated` also covers piano notes and rowing when you're not in the right slot.
- **Cooldowns:** a press during the cooldown is dropped quietly, with no error.
- **Disconnects:**
  - Slots behave like desks today: a disconnected player keeps their slot through `GRACE_MS`.
  - A disconnected rower's boat stays still. When the grace period runs out, the slot frees and the boat starts its return trip.
- **Server restarts:** toy state is in memory only. After a restart the campfire is out, the jukebox is off and the boats are moored.

## 7. Ambient life (client only)

- **Layout:** each system lives in `client/src/life/` and exports `create(scene, zones, rng) → { update(t, dt, focus) }`. `t` is `serverNow()` and `focus` is the camera target, used for `LIFE_RADIUS` culling.
- **Placement:** `SceneDef` gains `life: LifeZone[]`, for example `{ kind: 'butterflies', x, z, r, count, seed }`, so placement is data and can be tested.
- **Shared timing:** all motion comes from seeded randomness plus server time, so things that are shared (boats, duck drift, fish jumps) line up across clients.
- **Local reactions:** reactions to *your* character (frogs, birds, leaf piles) are local only.

| System | Behaviour |
|---|---|
| sailboats | the path loops in 5.2 |
| ducks | drift on the lake using seeded noise; on a `feed` event, the ducks within 10 units steer to the bread for 8 s, then drift again |
| fish | jump arcs at seeded times, with a ripple ring |
| frogs | sit on lily pads; plop into the water when you're within 2 units; climb back after 6 s |
| dragonflies | dart between points over the lake |
| birds | hop on the grass in small groups; flutter off when you're within 3 units; come back after 20–40 s |
| butterflies, bees | loop around the flower-bed life zones |
| ladybugs, snails | crawl slowly along path edges and rocks |
| fireflies | additive glowing sprites (`THREE.Points`) in the woods and park; opacity scales with the night factor |
| falling leaves | a small particle system under the woods' trees |
| leaf piles | scatter into leaf particles when you walk through them, and settle back after 10 s |
| clouds | a few soft, chunky low-poly clouds drifting slowly across the sky |
| wind | the vertex shaders of tree, bush and grass materials get a sine sway scaled by height (via `onBeforeCompile`) |

## 8. Day/night (client only)

- **Clock:** `client/src/world/sky.ts` exports a pure function, `skyAt(hours: number) → SkyState`. It blends keyframes for the sky gradient, sun colour and intensity, hemisphere light, fog colour and a `night` factor from 0 to 1.
- **Keyframes:** night 21:00–5:00, dawn 6:00, day 8:00–17:00, golden hour 18:00, dusk 19:30. The sun's angle follows the hour.
- **Input:** each player's local `Date`. A `?time=21:30` URL override is there for testing.
- **At night:**
  - Stars (points on a dome) and a moon appear.
  - Lamp posts and building windows glow; up to 4 point lights per section 3.
  - The campfire's light flickers (when lit) and the fireflies come out.
- **Indoors:** scenes keep their own lighting and only tint their window decor by the time of day.

## 9. Audio (client only, synthesized)

- **Engine:** `client/src/audio/engine.ts` is a WebAudio wrapper that reuses the existing audio-unlock path. It has a master gain and a HUD mute toggle, saved in `localStorage` under `sv-muted`.
- **Positional sound:** `playAt(x, z, sound)` sets gain from distance, at 1 within 4 units, falling to 0 at 25, and pans left or right by the sound's x relative to the camera. Sounds only play in the `town` scene; the Library and Café stay quiet.
- **Voices** (`client/src/audio/voices.ts`):
  - **Piano:** two detuned triangle oscillators with a fast attack and a 1.2 s decay.
  - **Bell and chimes:** sine partials at inharmonic ratios.
  - **Splash, coin, plop, fire crackle:** filtered noise bursts.
- **Jukebox** (`client/src/audio/jukebox.ts`):
  - Three short procedural lo-fi loops (chords, bass, soft noise drums) from a tiny step sequencer at 80 BPM.
  - Playback position is `(serverNow − startedAt) mod loopLength`, so everyone hears the same bar.
  - It's positional, centred on the jukebox.
- **Ambience:**
  - Birdsong chirps by day and crickets by night, both weighted by the `night` factor.
  - Gentle water near the lake and crackle near a lit campfire.
  - All synthesized and positional.

## 10. Testing

The tests use vitest and follow the existing patterns.

- **Scenes (`shared/scenes/scenes.test.ts`):**
  - Every slot and toy reference resolves, and every toy slot's `toyId` points back to its toy.
  - Slot ids are unique across scenes.
  - Toys, spawns, doors, slots and landing points are inside the map and not inside colliders (moving slots are exempt).
  - Moorings, sailboat paths and life zones sit inside the water polygon or the map, as appropriate.
- **`server/src/toys.test.ts`:** table-driven per toy kind: accepted and rejected actions, state changes, cooldown timing, and stone skips with a fixed `rand`.
- **`server/src/world.test.ts`:**
  - Sitting in toy slots, and `startSession` refused on non-desk slots.
  - `use` range checks and `bad_toy`.
  - Events broadcast to the whole scene only.
  - Rowing (valid, too fast, off-water), standing up to the nearest landing, the return trip and cancelling it.
  - Rower grace expiry.
  - Late joiners get toy state in `welcome` and `sceneSnapshot`.
- **Client pure functions:**
  - `pickTarget` with toys.
  - `skyAt` keyframe blending and wrap-around at midnight.
  - Swing and seesaw angle over time, and the boat return path.
  - Jukebox bar position.
  - The distance-gain curve.
- **Manual check:** one short browser run on the Mac. Walk each zone, try every toy, check night with `?time=22:00` and read the `?fps` counter. No long or heavy runs on the Mac.

## 11. Migration notes

- The rename `seat` → `slot` touches `shared/scenes/types.ts`, `shared/types.ts` (`PlayerView`), `shared/protocol.ts`, `server/src/world.ts` and `validate.ts`, the client game, HUD and interaction code, and the existing tests.
- The old town pond decor and its collider go. The `pond` decor kind is reused for the lake outline at a larger size.
- No database change. Profiles are untouched.
