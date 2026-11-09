# StudyVerse 3 Implementation Plan

> Executed inline (superpowers:executing-plans). There are no per-task reviews; one full review runs at the end (user preference).

**Goal:** implement `docs/superpowers/specs/2026-11-09-studyverse-3-design.md`.

**Architecture:**
- Scene data gains `parking` and `props`.
- The server gains truck tilt, self-parking, sips and gift offers.
- The client gets a lazily loaded Rapier driving module (`client/src/drive/`) and a canvas barista panel (`client/src/coffee/`).

**Tech:** TypeScript, Three.js, Vite, ws, node:sqlite, vitest. `@dimforge/rapier3d-compat` is the only new dependency.

## Global constraints

- Only light, short runs on the Mac: tests, typecheck, build, and single headless screenshots.
- No AI attribution in commits. Push to `main`.
- Each task ends with `npm run typecheck && npm test` passing, followed by a commit.

## Task 1: Parking bug

- **Server:** `server/src/world.ts` `stand()` sends the leaving driver `toyState` for the vehicle. Test this in `server/src/world.kp.test.ts`, in the trucks block: the driver drives, stands, and receives a `toyState` with the final x and z.
- **Client:** `client/src/game/game.ts` `syncRowing()` sets `this.toyStates[toyId] = {kind, ...pose, returnFrom: null}` for trucks before calling `setLocal(null)`.

## Task 2: Bigger town, lots, bays, props data

- **Types:** `shared/scenes/types.ts` adds `Bay`, `Prop`, `SceneDef.parking?`, `SceneDef.props?`, and the decor kind `'parking'`.
- **Kit:** `shared/scenes/kit.ts` adds `parking` and `props` to `Parts` and `merge`.
- **Lots:** create `shared/scenes/town/parking.ts`. `lot(prefix, cx, cz)` returns the decor, bays, props, lamps and trucks.
- **Moved zones:**
  - woods (−15, −5), lake (+15, −5), park (−15, +5), playground (+15, +5)
  - edges: HX 73.5, HZ 48.5
  - `scatter.ts`: PATHS redrawn
  - `town.ts`: size 150×100 and a new scatter MAP
  - `square.ts`: trucks removed and the Boutique moved
- **Helpers:** `shared/parking.ts` adds `inBay(bay, x, z, heading)` and `freeBay(bays, trucks, x, z)`, with tests in `shared/parking.test.ts`.
- **Client:** `client/src/world/decor.ts` gets a `parking` builder (asphalt, lines, wheel stops); `client/src/hud/minimap.ts` draws lots.
- **Tests:** fix the hard-coded coordinate tests, and add the scene tests from spec §3.

## Task 3: Rapier truck

- **Dependency:** `npm i @dimforge/rapier3d-compat`.
- **Network:**
  - `shared/protocol.ts`: `move.tilt?`.
  - `shared/toys.ts`: truck `ToyState.tilt?`.
  - `server/src/validate.ts`: tilt validation.
  - `server/src/world.ts`: `driveVehicle` stores the tilt.
  - `shared/vehicles.ts`: truck speed 9.
- **New `client/src/drive/physics.ts`:** `loadRapier()` memoised; a `DriveWorld` class with `constructor(R, def, start)`, `setInput({throttle, steer})`, `step(dt, others, trucks)`, `pose() → {x, z, heading, y, pitch, roll, speed}`, `wheels() → number[]` (suspension lengths), `propPoses()`, `dispose()`. The folio numbers live in `TUNING`.
- **Tank-style input:** `client/src/game/input.ts` gets `drive()`, returning `{throttle, steer}`.
- **Game loop:** `client/src/game/game.ts` replaces `drive()` with the `DriveWorld` path and adds braking-before-exit on E.
- **Views:** `client/src/toys/truck.ts` renders tilt, wheel suspension and a poof on >6 m jumps. `client/src/world/props.ts` renders props, does the scripted tumble for non-drivers, and resets them.

## Task 4: Self-parking

- **Server:** `server/src/world.ts` keeps a `lastDrivenAt` map, and `tick` runs `selfPark()` using `freeBay`. Constant `SELF_PARK_MS = 10 min` lives in `shared/constants.ts`.
- **Tests:** a truck parks itself after 10 min; there's no move while someone sits in it; a truck already in a bay stays put.

## Task 5: Barista coffee

- **New `client/src/coffee/steps.ts`:** pure models `crankModel`, `tampModel`, `fillModel`, `heatModel`, `pourModel`, `artScore`, `RECIPES`, `starsFor(scores)`, with tests in `steps.test.ts`.
- **New `client/src/coffee/barista.ts`:** a canvas panel driving the models, which replaces `hud/coffee.ts` in `openCoffee`. `main.ts` uses it.
- **Styles:** `client/src/style.css`.

## Task 6: Sips and gifting

- **Shared types:**
  - `shared/types.ts`: `holding: {item, stars, sips}`.
  - `shared/protocol.ts`: `sip`, `offerCoffee`, `answerCoffee`, `coffeeOffer`, `coffeeAnswer`, `bad_gift`; `FeedKind` adds `gift`.
- **Server:** `server/src/validate.ts` gets the new messages. `server/src/world.ts` gets sip, offer, answer, expiry and cleanup on leave; `HOLD_MS` is removed. `server/src/feed.ts` gets `gift`.
- **Client:**
  - `client/src/game/game.ts` binds C (sip) and G (offer to the nearest player).
  - `client/src/hud/giftCard.ts` holds the offer card, with Y/N shortcuts and a 15 s timeout.
  - `main.ts` wiring.
- **Tests:** in `world.kp.test.ts`, as listed in spec §8.

## Task 7: Final checks

README controls, a headless drive test, screenshots, one full review, then push and deploy to gpu-sys (with a DB backup).
