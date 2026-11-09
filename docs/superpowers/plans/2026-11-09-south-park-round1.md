# South Park Round 1 Implementation Plan

> Executed inline. One full review runs at the end (user preference: no per-step reviews).

**Goal:** implement `docs/superpowers/specs/2026-11-09-south-park-round1-design.md`.

## Task 1: Map growth (shift north 15 m, add the south strip)

- **Scene data:**
  - `shared/scenes/town.ts`: wrap the placed parts in `shift(..., 0, -15)`; set the size to 150 × 130; scale the grass and rock counts up.
  - Water, parking, props and the meadows also move by −15. The meadow gaps are computed before the shift and moved with it.
  - `edges.ts`: `HZ` becomes 63.5 and the tree line follows. Because the shift moves the existing tree line north, edges are built in the final coordinates, outside the shift.
- **Paths:** `PATHS` holds the final coordinates. The south and park paths extend south, and a new strip path joins them.
- **Fixes:** update tests with hard-coded coordinates (scenes, kp `study` helper, vehicles) and any client constants that use town coordinates.
- **Tests:**
  - The size is 150 × 130.
  - The shifted samples moved.
  - No collider overlaps a path.

## Task 2: Shared and server pieces

- **Types:** new toy kinds, the `stack` action, the `meditate` / `cairn` / `stageScreen` `ToyState` variants, and the constants.
- **Scene data:** `SceneDef.stage`; new decor kinds `pond`, `bridge`, `gravel`, `blanket`, `lantern`, `spotlight`, `stage`, `stageSeats`; tree kind `cherry`; life kind `petals`.
- **Handlers:** `server/src/toys.ts` adds `koi` (feed), `cairn` (stack, pure, with `toppleChance`), `drums` / `guitar` / `keys` (note), `cushions` (none), `stageScreen` (none). Tests in `toys.test.ts` (or a new test file).
- **Store:** `kv` table with `getKv` / `setKv`, plus `addKp`.
- **World:**
  - The meditate ring state on sit and stand.
  - The award in `tick`, with the hourly limit per profile.
  - The cairn record (`recordBy`) and `kv` save/load.
  - The `stageText` message with its range, gap and expiry.
  - The `meditated` message and the `meditate` feed line.
- **Protocol and validation:** `stageText`, `meditated`, `bad_stage`.
- **Tests:**
  - `world.park.test.ts`.
  - `validate.test.ts`.
  - `db.test.ts`.

## Task 3: Zen corner scene and client

- **Scene:** `shared/scenes/town/zen.ts` holds the pond, bridge, cherries, lanterns, gravel, blankets, cushions toy and slots, cairn toy, koi toy, and petal life.
- **Client:**
  - Decor builders.
  - The `petals` life kind.
  - Views for `koi` / `cairn` / `cushions`.
  - The breathing overlay (pure `breathAt`, tested) and the koi landing helper (tested).
  - The pond ambience and the `clatter` sound.
  - The minimap pond.

## Task 4: Stage scene and client

- **Scene:** `shared/scenes/town/stage.ts` holds the stage, seats, instrument toys and stools, screen toy, spotlights and `SceneDef.stage`.
- **Client:**
  - Instrument views and the `drum` / `strum` / `pad` / `applause` sounds.
  - Spotlights driven by stage occupancy.
  - The applause hook on `act`.
  - The stage screen view and text box.
  - The voice rule `stageGain` (tested).

## Task 5: Final checks

- README.
- Headless checks (zen corner and stage).
- One review.
- Push.
- Ask before deploying.
