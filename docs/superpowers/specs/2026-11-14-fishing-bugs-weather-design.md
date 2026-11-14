# Fishing, bug journal and weather (round 4 of 4)

Brainstormed 2026-11-14. Decisions with the user: fishing = bobber timing; bugs = net the existing ambient critters; weather = shared and server-run; journal = +3 KP for each species' first catch only.

## Weather

- Server state `Weather = { kind: 'clear' | 'cloudy' | 'rain' | 'rainbow'; since: number; until: number }` in a small `server/src/weather.ts` (`Weather(store, port, rand)`), advanced from `World.tick()`: when `now >= until` pick the next: after `rain` → `rainbow` for 4 min; otherwise weighted clear 50 / cloudy 30 / rain 20, lasting 20–40 min (uniform). Saved in `kv` (`weather`) so a restart keeps it. Broadcast `{ t: 'weather', weather }` to all on change; `welcome.weather`.
- Client (`client/src/world/weather.ts`, driven from the existing frame hook like the sky):
  - **cloudy:** sun intensity × 0.6, sky/fog tinted grey.
  - **rain:** ~600 drop particles in a box around the camera, a darker ground tint, ripple rings on the lake surface, an umbrella over every outdoor character (`Character.setUmbrella(on)`), a soft looped rain sound from the existing audio engine (synthesised noise, like the other ambience).
  - **rainbow:** a translucent arc over the lake for its 4 minutes.
  - Transitions fade over ~5 s. Indoors: only a quiet rain-on-roof loop when it rains.

## Fishing

- LOCAL toy kind `fishing` at three spots: the dock end and two lake-shore points (final town coordinates on the shore, verified by a scene test: on land, within 2 m of the water outline).
- Client (`client/src/fun/fishing.ts`): E → `[E] cast your line 🎣` → rod in hand, bobber placed 3 m out on the water → bite after 3–12 s (dip + splash sound + ❗ pop) → E within 0.8 s sends `catch { kind: 'fish', species, hour }` (species picked client-side from what's possible now, weighted by rarity); late/early E → "It got away…". Moving or pressing E while waiting reels in.
- Server validates (see Catch rules).

## Bugs

- The ambient critters (`client/src/life/`) gain a catchable flag for: butterflies, dragonflies, bees, fireflies, ladybugs, snails. When one is within 1.2 m of you and visible, the prompt shows `[E] catch the butterfly 🦋` (name per kind). E swings a net (short arm animation), hides that critter for 60 s, rolls the species (base or its rarer variant) and sends `catch { kind: 'bug', species, hour }`.

## Catch rules (shared `shared/catches.ts`)

`SPECIES: Record<SpeciesId, { kind: 'fish' | 'bug'; name; emoji; rarity: 1 | 2 | 3; when?: 'night' | 'rain'; base?: LifeKind (bugs) ; size?: [min, max] cm (fish) }>`:
- Fish (12): carp, minnow, perch, trout, bass, goldfish, catfish (night), eel (night), koi (rarity 2), rainbow trout (rain), moonfish (night, rarity 3), golden carp (rarity 3).
- Bugs (10): butterfly, blue butterfly (rain, base butterflies), dragonfly, bee, ladybug, snail (rain), firefly (night, base fireflies), moth (night, base butterflies), beetle (base ladybugs), glow beetle (night, rarity 3, base fireflies).
- `possible(species, { night, raining })`. Night = client hour sent with the catch, clamped 0–23, night when ≥ 20 or < 6 (each player's local clock, like the sky). Raining = server weather `rain`.

Server `catch` handler (`server/src/catches.ts`, `Catches(store, port, rand)`): species known; `possible`; fish → the player stands within 2.5 m of a `fishing` toy in their scene and 5 s cooldown; bug → the species' `base` life kind exists in the player's scene life zones and 3 s cooldown; size rolled for fish. Store `catches (profile_id, species, count, best, first_at)` upsert. First of a species → +3 KP (`addKp`, wallet pushed), feed `🎣 Aibel caught their first moonfish!` / `🦋 … first glow beetle!`. Reply `{ t: 'caught', species, size?, first: boolean }` to the catcher; others in the scene get `act`-style pop via `{ t: 'catchPop', id, species }`. `welcome.journal` and `{ t: 'journal', entries }` on `getJournal`.

## Journal

`client/src/fun/journal.ts`: J key and a 📖 HUD button → modal with two tabs (Fish, Bugs): a sticker grid; caught = emoji + name + count (+ best size), uncaught = grey silhouette + hint ("only at night", "only in the rain", "rare"). Counter "14 / 22 found".

## Out of scope

Selling catches, aquariums/bug displays in cabins, forecasts, storms/snow, real-world weather.

## Testing

- shared: `possible` rules; species table shape (12 fish, 10 bugs, unique ids).
- server: weather cycle (rain → rainbow, durations in range, persisted and restored), catch validation (unknown species, not possible now, not at a fishing spot, base life kind absent, cooldowns), first-catch KP once, best size kept, journal in welcome.
- client: bite timing helper (pure: cast → bite window → result), species picker respects `possible`.

## Deployment

As before; the walk-through on wolf covers: weather message applied (force rain via a debug-only server env `WEATHER=rain` honoured at start), cast + catch a fish, catch a bug near a butterfly zone, journal shows both.
