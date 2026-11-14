# Fishing, Bugs and Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Shared server-run weather (clear/cloudy/rain/rainbow), bobber-timing fishing at the lake, netting the ambient critters, and a journal that pays +3 KP per species' first catch.

**Architecture:** `server/src/weather.ts` and `server/src/catches.ts` (Port pattern like `cabins.ts`/`mail.ts`); shared `shared/catches.ts`, `shared/weather.ts`; client `client/src/world/weather.ts`, `client/src/fun/fishing.ts`, `client/src/fun/journal.ts`, catchable hooks in `client/src/life/`. `world.ts`/`game.ts`/`main.ts` only gain wiring.

**Spec:** `docs/superpowers/specs/2026-11-14-fishing-bugs-weather-design.md`.

## Global Constraints

- Exact values: weather weights clear 50 / cloudy 30 / rain 20; durations 20–40 min; rainbow 4 min after rain; fade ~5 s; ~600 drops; bite after 3–12 s, window 0.8 s; fish cooldown 5 s, bug 3 s; fishing reach 2.5 m; bug reach 1.2 m; caught critter hidden 60 s; first catch +3 KP; night = hour ≥ 20 or < 6 (client hour, clamped 0–23); 12 fish + 10 bugs exactly as the spec lists.
- Debug env `WEATHER=<kind>` forces the starting weather (for the walk-through).
- Ponytail rules; follow round 1–3 patterns. Never run a browser, headless Chrome, Vite dev server or watch process on the Mac; verify with typecheck, focused vitest, one `npm test`, one `npm run build`. No AI attribution.

### Task 1: Shared + protocol + store + server modules

`shared/weather.ts` (`WeatherKind`, `Weather`, `nextWeather(prev, now, rand)` pure), `shared/catches.ts` (species table, `possible`, `isNight(hour)`), protocol (`catch {kind, species, hour}`, `getJournal`; server `weather`, `caught`, `catchPop`, `journal`; welcome `weather`, `journal`; errors `bad_catch`), validate + tests, `ToyKind` += `fishing` (LOCAL, `none` handler; temporary client view so the switch compiles), store table `catches` + methods (`addCatch(id, species, size, at) → { first: boolean }`, `journal(id)`), `server/src/weather.ts` (tick, kv persistence, env override, broadcast), `server/src/catches.ts` (rules per spec), wiring in `world.ts` (tick call, welcome fields, dispatch), `server/src/index.ts` passes `WEATHER`. Tests: `shared/catches.test.ts`, `shared/weather.test.ts`, `server/src/world.catches.test.ts`, `world.weather.test.ts`. Fishing toys are placed in Task 2, so the "every toy kind somewhere" scene test may need the temporary skip pattern used in round 3 Task 1 (remove it in Task 2). Commit `feat: weather cycle, catch rules and the journal on the server`.

### Task 2: Fishing spots + fishing client

Three `fishing` toys in the town (dock end + two shore points, final coordinates; scene test: on land within 2 m of the water outline, reachable), toy view (a little wooden sign `🎣 Fishing`), prompt `[E] cast your line 🎣`. `client/src/fun/fishing.ts`: pure `FishingRound` state (cast → waiting → bite window → caught/missed; + test), rod + bobber meshes, bite splash via existing sound kinds, ❗ pop, species picker using `possible` (night from the local clock hour, rain from the latest weather) weighted by rarity; Game wiring (E while fishing = strike/reel in, moving reels in). `caught` → pop emoji + toast (`New! 📖` on first), `catchPop` → pop over others. Commit `feat: cast a line at the lake and catch fish`.

### Task 3: Bug netting

`client/src/life/` catchable critters (butterflies, dragonflies, bees, fireflies, ladybugs, snails): expose nearest catchable within 1.2 m and `hide(id, 60 s)`; Game target + prompt `[E] catch the <name> <emoji>`; net swing (reuse an arm animation from `Character.act` if possible, else a short tween); roll base vs variant species by `possible` + rarity; send `catch`. One pure test for the nearest-critter pick. Commit `feat: net the butterflies, bees, fireflies and friends`.

### Task 4: Weather client

`client/src/world/weather.ts`: apply `weather` with ~5 s fades — cloudy dims sun/greys sky (hook into `client/src/world/sky.ts` values), rain drops (Points in a box following the camera), darker ground tint, lake ripples, umbrellas (`Character.setUmbrella`), rain loop (audio engine), rainbow arc over the lake; indoors only a quiet roof loop. Dispose on scene change. One pure test (fade/mix helper). Commit `feat: shared weather — clouds, rain with umbrellas and ripples, rainbows`.

### Task 5: Journal UI + wiring

`client/src/fun/journal.ts` modal (Fish/Bugs tabs, stickers, silhouettes + hints, "n / 22 found"), J key + 📖 HUD button, `journal` / `caught` messages keep it fresh; README line. Full verification. Commit `feat: the field journal`.

### Task 6 (controller): review + fix, merge, deploy, walk on wolf (with `WEATHER=rain`).
