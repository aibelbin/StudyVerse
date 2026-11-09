# StudyVerse 3: Real Truck Physics, Parking, Barista Coffee, Gifting

Date: 2026-11-09
Status: approved in chat. The user's choices:
- Rapier physics.
- Truck extras: knock-over props, and walkers block the truck. No boost and no jump.
- Abandoned trucks self-park after 10 minutes.
- Four trucks, two per lot.
- Full barista steps, including latte art.
- Gifts are offered and the other player accepts.

## 1. Scope

The work ships in phases, and each phase ends with tests passing and a commit:

1. **Parking bug:** a truck stays where its driver leaves it.
2. **Bigger town** with two parking lots and four trucks.
3. **Rapier truck physics**, matching folio-2025's vehicle model.
4. **Self-parking** for abandoned trucks.
5. **Barista coffee making.**
6. **Drinking and gifting** cups.

**Out of scope:** boost, jumping, flips, physics for anything except the truck, and synced prop physics.

## 2. Parking bug

**Cause:**
- `World.setToyState(toyId, state, exceptId)` skips the driver when it broadcasts the truck's pose, so the driver's client never learns where its own truck is.
- When the driver gets out, `VehicleView.setLocal(null)` hands rendering back to `ctx.state`. That is the stale state from when the driver first saw the truck, so the truck glides back to where it started.

**Fix:**
- When the client stops driving, it writes its last local pose into `toyStates[toyId]` before calling `setLocal(null)`.
- `World.stand` sends the leaving driver one `toyState` with the truck's final pose.
- A unit test covers the server part.

## 3. A bigger town with parking

**Size:** the town grows from 120×90 to **150×100**. The hedge moves to ±73.5 by ±48.5, and the treeline outside the hedge is extended to match.

**Zone moves:** the central square stays where it is. Each other zone moves as a block:

| Zone | dx | dz |
|---|---|---|
| woods + campfire | −15 | −5 |
| lake + dock + boats + stones | +15 | −5 |
| park | −15 | +5 |
| playground | +15 | +5 |

`PATHS` is redrawn in the new coordinates:
- The main street becomes 144 m long.
- The north and south paths reach the new hedge.
- The spurs to the dock, campfire, park and playground move with their zones.

**Parking lots:**
- **West lot** (by the Library): centre (−31, −7). **East lot** (by the Café): centre (31, −7).
- Each lot is 19.2 × 13.4 m. The south edge meets the main street, so the street is the lot's road.
- **Bays:**
  - Each lot has six bays, 3.2 m wide and 5.5 m deep, in one row along the lot's north side.
  - Bay centres are at `z = −10.5` and `x = cx + (i − 2.5) × 3.2`.
  - Trucks park nose-out (`rot = 0`, facing +z, towards the street).
- **Ground:** a new `parking` decor kind draws dark asphalt with white bay lines, wheel stops and a lamp post at each north corner.
- **Props:** four cones and two crates per lot, as scene data (see §4.4).
- **Trucks:** four in total. `truck-1` and `truck-2` sit in west bays 1 and 4; `truck-3` and `truck-4` sit in east bays 1 and 4.
- **Bay data:** bays are stored as `SceneDef.parking?: Bay[]`, where `Bay = { id, x, z, rot }`.

**The Boutique** moves to (−18.8, −4.6), out of the west lot.

**Minimap:** the static layer draws the lots as asphalt rectangles with bay ticks. Trucks keep their icons.

**Tests:** existing tests with hard-coded town coordinates are updated. New tests check that:
- bays don't overlap colliders
- every truck starts in a bay
- every lot touches the main street

## 4. Rapier truck physics

### 4.1 Engine and loading

- **Dependency:** `@dimforge/rapier3d-compat`, which embeds its WASM and needs no Vite plugin. It is the only new dependency.
- **Lazy loading:** it is loaded with a dynamic `import()` the first time the local player sits in a `drive` slot. A toast reads "Warming up the engine…" until it's ready, and until then the truck idles.
- **Who runs it:** only the driver's browser simulates. Passengers and onlookers render the poses the driver broadcasts.

### 4.2 Vehicle model (folio-2025 numbers)

The vehicle uses `world.createVehicleController(chassis)`, Rapier's `DynamicRayCastVehicleController`. Gravity is −9.81 and there is a fixed 60 Hz step with an accumulator, capped at 4 substeps per frame.

**Chassis:**
- A dynamic body with `canSleep: false`, linear and angular damping 0.1, and friction 0.4.
- Main cuboid: half extents (0.75, 0.4, 1.3), a mass of 2.5 and a centre of mass at (0, −0.5, 0). Our forward is +z, where folio's is +x, so x and z are swapped relative to folio.
- A massless cuboid for the top.

**Wheels:**
- Four wheels at (±0.75, 0, ±0.9) in chassis space, radius 0.4, direction (0, −1, 0) and axle (−1, 0, 0).
- Suspension:
  - rest length 0.88
  - stiffness 20
  - compression 10
  - relaxation 2.7
  - max travel 2
  - max force 150
- Grip: friction slip 0.9 and side friction stiffness 3.

**Driving:**
- Steering amplitude is 0.5 rad on the front wheels.
- Engine force on all four wheels:

  ```
  accelerating × 300 / (1 + max(0, speed − topSpeed)) × dt
  ```

  with `topSpeed = 5`.
- Brakes: 35 × dt when braking. With no throttle, an idle brake of 0.06 × 35 × dt. Pressing against the direction of travel above 0.5 m/s gives a reverse brake of 0.4 × 35 × dt with no engine force.

**Righting itself:** if the truck is upside down (folio's `upsideDown` ratio, over 0.3) for 1.5 s, or stuck, it is reset upright at its current x, z and heading with zero velocity. Stuck means moving less than 0.5 m in 3 s while throttle is held.

**Controls (tank-style, as in folio):**
- **W/↑** throttle and **S/↓** brake, then reverse.
- **A/D** (←/→) steer.
- **H** honks.
- **E** gets out. The truck brakes until its speed is under 1 m/s, then the stand request is sent.

The camera still follows the player and zooms out ×1.35 while driving.

### 4.3 What the truck hits

The physics world is built once per scene entry:
- **Ground:** a fixed cuboid as the floor at y = 0.
- **Scene colliders:** every box in the scene's `colliders` becomes a fixed cuboid 3 m tall. That covers buildings, trees, lamp posts, hedges, the dock rails and the lake-edge boxes.
- **Other trucks:** kinematic position-based cuboids (1.5 × 1.2 × 3.0), moved every frame to their rendered poses.
- **Walkers** *(chosen: walkers block it)*: every other player in the scene is a kinematic capsule (radius `PLAYER_RADIUS`, half-height 0.4) moved every frame. The truck stops against walkers and never moves them. Restitution is 0, so stopping feels soft.
- **Props:** see §4.4.

### 4.4 Knock-over props *(chosen)*

- **Data:** `SceneDef.props?: Prop[]`, where `Prop = { id, kind: 'cone' | 'crate', x, z, rot }`.
- **Rendering:** `client/src/world/props.ts` renders them, one `Group` each.
- **Driver:**
  - Props are dynamic Rapier bodies: a cone is a cylinder of radius 0.22 and height 0.6 with mass 0.15; a crate is a 0.7 m cube with mass 0.6.
  - Their transforms are copied to the meshes every frame.
  - A prop more than 0.3 m from home, or tilted more than 0.5 rad, resets home 20 s after it was last disturbed. A short scale-pop plays when it does.
- **Everyone else:** a cheap scripted tumble. When any truck view passes within 1.1 m of a prop at over 2 m/s, the prop is flung along the truck's direction with a spin and settles. It resets home after 20 s.
- **Local only:** prop positions are never sent over the network.

### 4.5 Network

- `move` gains an optional `tilt?: { y: number; pitch: number; roll: number }`.
  - Validation: each value must be finite; `y` in [−1, 3]; `pitch` and `roll` in [−π, π].
  - It is only meaningful from a `drive` slot.
- The truck `ToyState` gains an optional `tilt`. `driveVehicle` stores it and broadcasts it.
- The client sends truck moves every `ROW_SEND_MS`.
- **Server checks:**
  - The speed check stays.
  - `VEHICLES.truck.speed` becomes 9, which covers the physics overshoot above topSpeed 5.
  - `vehicleOk` stays.
- **Rendering:** `truckView` lerps position and heading as now, and also lerps `body.position.y`, pitch and roll from the tilt. The driver's own view uses the exact local physics pose.
- **Wheels:**
  - Driver: wheel meshes take their suspension length from the controller.
  - Others: wheel meshes sit at rest height.
  - Both: wheels spin by distance travelled, as now.

## 5. Self-parking *(chosen: after 10 minutes)*

- **Tracking:** the server keeps `lastDrivenAt` per truck, set on every accepted `driveVehicle` and when a driver leaves. Trucks at their starting bays start at 0.
- **Rule:** in `tick`, a truck self-parks when all of these are true:
  - it has no `drive` sitter
  - its passenger slots are empty
  - `now − lastDrivenAt ≥ 10 min`
  - it isn't in a bay (centre within 1.2 m, and heading within 0.5 rad of the bay's `rot` or `rot + π`)
- **Where it goes:** the nearest bay with no truck within 2 m of its centre. The truck's state becomes that bay's pose (no tilt), and `lastDrivenAt` resets.
- **How it looks:** the client sees a jump of more than 6 m. Instead of lerping, it snaps the truck and plays a dust "poof" at both the old and new spots.
- **Why a poof, not a glide like the boats:** a straight-line glide would drive through trees and buildings.

## 6. Barista coffee making *(chosen: full barista with latte art)*

### 6.1 Inspiration

Barista games such as *Good Coffee, Great Coffee* (TapBlaze) break a drink into hands-on steps: dose, tamp, pull the shot to time, steam the milk, pour, then latte art. We reproduce those mechanics with our own procedural art and steps. Nothing is copied from those games.

### 6.2 Recipes

| Drink | Steps |
|---|---|
| ☕ Espresso | grind → tamp → shot |
| 🥛 Latte | grind → tamp → shot → steam → pour → art |
| 🍵 Matcha | sift → whisk → steam → pour → art |
| 🍫 Hot cocoa | melt → steam → pour → art |

Art can be skipped with a "Skip" button. A skipped art step doesn't count toward the average.

### 6.3 Step types

All steps take mouse, touch or Space input. The models are pure and live in `client/src/coffee/steps.ts`, where they're unit-tested. A canvas panel renders them.

| Type | Used by | Input | Model | Score (0–1) |
|---|---|---|---|---|
| `crank` | grind, sift, melt, whisk | Drag in circles around the centre | Fill rises with accumulated angle; `turns` needed per step: grind 3, sift 2, melt 2.5, whisk 4. Finishes on **Done**, or 0.8 s after you stop turning | `1 − min(1, abs(fill − 1) / 0.35)` |
| `hold` (tamp) | tamp | Hold | Pressure rises 0→1 over 1.6 s and falls back when you let go | Pressure must stay in [0.55, 0.8] for 1 s cumulative; score = time in zone / 1 s, minus 0.5 if pressure ever goes above 0.95 |
| `fill` (shot) | shot | Hold | Espresso drips in at 0.9 units/s while held; cup marks at 0.8 and 1.0 | Release between the marks scores 1, falling linearly to 0 at 0.35 beyond either mark |
| `heat` (steam) | steam | Hold | Temperature rises from 20° at 14°/s with ±1.5° wobble; it slowly falls when you let go; the target zone is 60–65° | 1 inside the zone, falling to 0 at 12° outside; above 75° scores 0 ("scalded") |
| `pour` | pour | Hold | Jug tilt rises toward 1 while held (`tilt += (1 − tilt) × 2.5 dt`) and falls when you let go (`tilt −= 3 dt`). Flow is 0 below tilt 0.25, then `(tilt − 0.25) / 0.75 × 0.8` per second. The level also rises with liquid still falling about 0.15 s after you let go. Fill line at 0.85; spills above 1.0 | 1 within ±0.04 of the line, falling to 0 at ±0.25; a spill scores 0 |
| `art` | art | Drag over a guide shape (heart, tulip or swirl, chosen by hash of the moment) | The guide is 40 points and the stroke is sampled | `coverage × (1 − strayRatio)`: coverage is the share of guide points within 14 px of the stroke; strayRatio is the share of stroke samples more than 22 px from the guide, counted against 50% |

**Stars:**
- The mean of the step scores sets the stars: 3 at or above 0.8, 2 at or above 0.5, otherwise 1.
- The result screen shows each step's score as a small bar and the cup with its art.
- `brew {drink, stars}` is unchanged.

## 7. Drinking and gifting *(chosen: offer, then accept)*

### 7.1 Holding and drinking

- **Holding:** `holding` changes from `{item, stars, until}` to `{item, stars, sips}`. A new cup has `sips = 4`. `HOLD_MS` and the expiry in `tick` are removed.
- **Sipping:**
  - The ☕ emote, or **C**, sends `{t: 'sip'}`.
  - The server decrements `sips` and plays the existing sip animation through a `coffee` emote broadcast.
  - At 0 sips, `holding` becomes null and a toast reads "All gone ☕".
- **No cup:** with no cup, the ☕ emote stays a plain emote and **C** does nothing.

### 7.2 Gifting

1. **Offer:** **G** near someone sends `{t: 'offerCoffee', to}`.
   - The target is the nearest other player within 3 m, the one `pickTarget` would pick.
   - The giver must hold a cup.
   - The server rejects the offer if the target is in another scene, is over 3.5 m away, is on do-not-disturb, already holds a cup, or already has an offer pending.
   - It replies `error 'bad_gift'` with a friendly message.
2. **Prompt:** the server records `pending[targetId] = {fromId, at}` and sends the target `{t: 'coffeeOffer', fromId, name, drink, stars}`.
   - The target sees a small card: "Aibel offers you a ★★★ latte. [Accept] [No thanks]", with **Y**/**N** as shortcuts.
   - The card closes on its own after 15 s.
3. **Answer:** `{t: 'answerCoffee', fromId, accept}`.
   - The server checks the offer is still pending, under 15 s old, the giver still holds the cup, and the target still has no cup.
   - **On accept:** the holding (with its sips) moves to the target, both players are updated, and the feed says "🎁 Aibel gave Sam a ★★★ latte".
   - **On decline or expiry:** the giver gets `{t: 'coffeeAnswer', name, accepted: false}`, shown as the toast "Sam said no thanks". On accept, they get "Sam took your latte ☕".
4. **Cleanup:** offers expire in `tick` after 15 s and are cleared when either player leaves.

**Additions:** `FeedKind` adds `gift`, and `ErrorCode` adds `bad_gift`.

## 8. Testing

- **Unit:** each step model's scoring and dynamics; parking-bay lookup; bay geometry; and `vehicleOk` for the new map.
- **World:** the driver's final pose is sent on stand; self-parking after 10 minutes; no self-parking while someone is in the truck; sips counting down to empty; gifts accepted, declined and expired, and rejected for DND, a full hand or too far away; tilt validation.
- **Headless Chrome:** drive the Rapier truck with held keys and check that it moves, tilts in turns and stops against a wall and a walker. Also check the props, walk each coffee recipe end to end, and take screenshots of the bigger town and the lots.
- **Mac safety:** no long-running jobs on the Mac. Each headless check is a short single run.
