# South Park, Round 1: Map Growth, Zen Corner and Open-Air Stage

Date: 2026-11-09
Status: approved in chat.

The user asked for more in the bottom-left of the town and chose four features: a focus garden, an open-air stage, mini-golf and a zen corner. They are built in three rounds:

1. **This round:** the map grows south, plus the zen corner and the stage.
2. The focus garden.
3. Mini-golf.

Each round has its own spec, build and deploy.

## 1. Map growth

The town grows from 150 × 100 to **150 × 130**: 30 m added along the south edge.

The scene code assumes the map is centred on (0, 0), so the whole existing town moves 15 m north (`dz = −15`) using `shift()`, the helper from the last map growth. The existing town then fills z −65..35, and the new strip fills z 35..65.

- `edges.ts`: `HZ` goes from 48.5 to 63.5, and the south tree line moves to the new edge.
- `PATHS`, `ZONE_PATHS` and the zone offsets all move by −15 in z.
- The south path (x 0) and the park path (x −45) extend south into the strip.
- A new path runs along the strip and joins them.
- The strip's south-east half (x > 0) is filled with meadow and reserved for mini-golf in round 3.
- Grass and rock counts scale up by about 30%.
- Anything with hard-coded town coordinates moves by −15 in z: tests, the `study` test helper, the truck bays and the minimap. Lots, trucks and props move with the shift.

The park keeps its benches, telescope and chimes:
- The **zen corner** goes in the park's southern half, keeping 3 m clear of the telescope mound and the chimes tree.
- Room in the park's northern half, about 16 × 12 m, is left open for the round 2 garden plots. A bush ring marks its edge, and nothing is planted inside it.
- Exact placement is decided in the plan, but zones must not overlap paths, colliders or each other. The scene tests check this.

## 2. Zen corner (about 14 × 12 m)

### 2.1 Scenery

- **Pond:** an oval koi pond, 8 × 5.5 m. It reuses the existing `pond` decor (water with a stone rim), drawn on the minimap as water. It's solid for walkers, except where the bridge crosses. Food never lands under the bridge, so the koi stay visible.
- **Bridge:** an arched red stone bridge over the pond, with a walkable deck.
- **Trees and stones:** three cherry trees (a new tree kind, `cherry`, with pink canopies) and four stone lanterns that glow at night, like the existing lamps. Also rocks and two raked-gravel patches (a flat decor kind with a striped canvas texture).
- **Picnic blankets:** two blankets with two seats each (`pose: 'sit'`).

### 2.2 Koi

- **New toy:** `koi`, at the pond centre. Its action is `feed`, an event toy like `ducks`, with a 3 s cooldown.
- **Swimming:** six koi swim deterministic loops worked out from server time and a seed, so everyone sees the same swimming.
- **Feeding:**
  - Press E near the pond edge to toss food.
  - The food lands 1.5 m into the pond from where the thrower stands, towards the centre. Each client works this out from the thrower's position.
  - For 4 s the koi steer to the landing point, splash and leave ripples, and pellets float briefly.
  - It gives no KP and nothing is saved.

### 2.3 Meditation ring

- **New toy:** `cushions`, with five seat slots in a ring, facing in.
- **Ring state** (`ToyState`):

  ```ts
  { kind: 'meditate'; startedAt: number | null }
  ```

  - When someone sits on an empty ring, the server sets `startedAt` to now.
  - When the last person stands, it goes back to `null`.
  - Everyone gets the state through the usual `toyState` broadcast.
- **Breathing:**
  - One cycle is 12 s: breathe in 4 s, hold 2 s, breathe out 6 s.
  - The phase is `(serverNow − startedAt) mod 12000`, so every seated player's circle pulses together.
  - A pure function `breathAt(ms)` returns the circle scale and the label: "Breathe in", "Hold" or "Breathe out".
- **Session (client):**
  - Sitting on a cushion shows a centred breathing circle with a 5:00 countdown.
  - Standing up or leaving ends the session.
- **Award (server):**
  - Each sitter's sit time is tracked as `meditateFrom`. In `tick`, a sitter who has stayed seated for `MEDITATE_MS` (5 min) gets:

    `MEDITATE_KP (3) + min(3, number of other sitters who sat down before or at the same moment and are still seated)`.

  - At most one award per profile per hour (`MEDITATE_EVERY_MS`). The last award time is kept in memory per profile, so it survives reconnects but not restarts.
  - The KP is added with `store.addKp(id, n)`, which is created if it doesn't exist. It doesn't touch the streak.
  - The server sends the player a `meditated { kp, companions }` message. The client shows the toast "Breather done 🧘 +N KP".
  - A feed line goes out: "Sam finished a breather with 2 friends 🧘". This adds the `FeedKind` value `meditate`.
  - After an award, the player can stay seated. The circle stops and no new session starts until they stand and sit again.

### 2.4 Shared cairn

- **New toy:** `cairn`, on a pebble pile. Its action is `stack`, with a 5 s cooldown per player.
- **Cairn state** (`ToyState`), saved in a new `kv` table under the key `cairn`:

  ```ts
  { kind: 'cairn'; height: number; seed: number; record: number; recordBy: string | null }
  ```

  The new table:

  ```sql
  kv(key TEXT PRIMARY KEY, value TEXT)
  ```

- **Stacking:**
  - The topple chance for the new stone at height `h` is `toppleChance(h) = h <= 4 ? 0 : min(0.35, (h − 4) × 0.032)`. That's 0% up to 4 stones, rising to 35% at 15.
  - On a topple, `height` becomes 0, the `seed` changes, and the event `arg` is 1.
  - Otherwise `height` goes up by 1 and `arg` is 0.
  - When `height` beats `record`, world.ts sets `recordBy` to the stacker's name. The handler stays pure.
- **Client:**
  - Stone offsets and sizes come from `seed` and the stone index, so every client draws the same cairn.
  - The cairn wobbles more as it gets taller.
  - A topple scatters the stones with a `clatter` sound, then they fade.
  - A small sign shows "Record: 12 stones · top stone by Sam".

### 2.5 Ambience

- **Petals:** a new life kind, `petals`, in `client/src/life/air.ts`. Pink petals drift down around each cherry tree all the time.
- **Sound:** a positional ambience source at the pond, playing a soft water trickle and an occasional soft chime. It uses the existing ambience system and fades with distance.
- **Night:** the lanterns, and a faint glow on the pond.

## 3. Open-air stage (south-west of the new strip)

### 3.1 Scenery

- **Stage:** a raised wooden stage, 8 × 5 m and 0.33 m high, with steps at the front. Performers face south, towards the audience and the fixed camera. This changed during the build: with the stage south of the seats, you'd only have seen performers' backs. People standing on the stage are drawn at its floor height.
- **Seats:** three curved rows of seats south of the stage, 18 in a semicircle (`pose: 'sit'`).
- **Scene data:** `SceneDef.stage?` is added:

  ```ts
  { stage: Box; audience: Box; screen: { x: number; z: number } }
  ```

### 3.2 Voice

In `Voice.update`:
- If a peer is inside `stage.stage` (the instrument stools are on the stage, so players count too) and the listener is inside `stage.audience`, the peer's gain is 1 and the pan is centred.
- Otherwise the normal `gainForDistance` applies.

A pure helper `stageGain(def.stage, peer, me, normal)` holds the rule. It's client-only and needs no server change.

### 3.3 Instruments

There are three new toys, each with one stool slot. They work like `piano`: the action is `note`, the `arg` is 0..7, keys 1–8 play from the stool, and the cooldown is 100 ms.

| Toy | Keys 1–8 | New `SoundKind` |
|---|---|---|
| `drums` | kick, snare, closed hat, open hat, high tom, low tom, crash, clap | `drum` |
| `guitar` | strummed chords C G Am F Dm Em D E | `strum` |
| `keys` | eight soft synth-pad notes (C major scale) | `pad` |

- The sounds are synthesised in `client/src/audio/engine.ts`, like `note`.
- Pressing a key also animates the instrument (pads bounce, strings shake, keys press) and floats a ♪.

### 3.4 Spotlights

- Two warm cone lights on poles (a new decor kind, `spotlight`).
- They fade on over 0.5 s when anyone, you or a remote player, is inside `stage.stage` (which includes the instrument stools), and fade off when nobody is.
- They only light the stage floor. Each is a soft additive cone plus a floor glow disc, not a real shadow-casting light, to keep the GPU cool.

### 3.5 Applause

If a `clap` or `cheer` emote comes from a player seated in `stage.audience`, every client also:
- pops 👏 above that seat
- plays a short `applause` sound (a new `SoundKind`: noise bursts shaped like clapping), with distance fade

Several at once sound like a crowd. There's no new message: it's driven by the existing `act` broadcast.

### 3.6 Stage screen

- **New toy:** `stageScreen`, a board behind the stage. It's a local toy: E opens a small text box.
- **Screen state** (`ToyState`), saved in `kv` under the key `stageScreen`:

  ```ts
  { kind: 'stageScreen'; text: string | null; by: string | null; until: number }
  ```

- **Client message:** `{ t: 'stageText', text }`.
- **Validation:** the same control-character stripping and trimming as chat, 0–60 characters (empty clears the screen). The player must be inside `stage.stage`, and there's a 30 s gap per player (`STAGE_TEXT_GAP_MS`).
- **Errors:** a new `ErrorCode`, `bad_stage`, for "not on stage", "too long" and "too soon".
- **Expiry:** `until = now + 2 h`. In `tick`, expired text is cleared and broadcast.
- **Client:** the board draws the text on a canvas texture. When the text is null it shows "Open mic 🎤".

## 4. Constants (`shared/constants.ts`)

| Constant | Value |
|---|---|
| `MEDITATE_MS` | 5 × 60_000 |
| `MEDITATE_KP` | 3 |
| `MEDITATE_COMPANION_MAX` | 3 |
| `MEDITATE_EVERY_MS` | 60 × 60_000 |
| `BREATH_IN_MS` | 4000 |
| `BREATH_HOLD_MS` | 2000 |
| `BREATH_OUT_MS` | 6000 |
| `CAIRN_GAP_MS` | 5000 (also the `stack` entry in `COOLDOWN_MS`) |
| `STAGE_TEXT_MAX` | 60 |
| `STAGE_TEXT_GAP_MS` | 30_000 |
| `STAGE_TEXT_TTL_MS` | 2 × 60 × 60_000 |

New `ToyKind` values: `koi`, `cushions`, `cairn`, `drums`, `guitar`, `keys`, `stageScreen`.

New `ToyAction` value: `stack`.

`SEATED_ACTIONS` already includes `note`.

## 5. Tests

- **Scenes:**
  - The size is 150 × 130.
  - Sample features moved exactly −15 in z: a park bench, the dock and a truck bay.
  - The new zones exist and don't overlap paths, colliders or each other.
  - The garden reserve is empty.
  - Every new seat is reachable (not inside a collider).
- **Handlers:**
  - `toppleChance` values.
  - Cairn stack and topple with a seeded `rand`.
  - Instrument `note` args pass through.
- **World:**
  - Ring state: set on the first sit, cleared on the last stand.
  - The meditation award after 5 minutes, with the companion count and its cap.
  - No award if the player stood up early.
  - The hourly limit, including across a reconnect.
  - The cairn record and `recordBy`, saved to the store and reloaded after a world restart.
  - Stage text: refused off stage, refused within 30 s or when too long, and cleared after 2 h.
- **Store:** `kv` get and set, and `addKp`.
- **Validation:** `stageText`.
- **Client (pure):**
  - `breathAt` phases.
  - `stageGain`: in the audience gives 1, outside gives the normal gain.
  - Koi landing point.
- **Headless:**
  - Walk to the zen corner, feed the koi, stack the cairn, sit on a cushion (the breathing circle shows), and check that the petals appear.
  - On the stage: the spotlights turn on, play drums with keys 1–8, set the screen text, and an emote from the seats shows 👏.
  - Check the minimap shows the new strip.
