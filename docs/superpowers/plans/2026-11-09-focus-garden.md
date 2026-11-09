# Focus Garden Implementation Plan

> Executed inline. One full review runs at the end (user preference: no per-step reviews).

**Goal:** implement `docs/superpowers/specs/2026-11-09-focus-garden-design.md`.

## Task 1: Shared garden model

- **New file `shared/garden.ts`:**
  - `Flower`, `FLOWERS` (grow minutes, price, harvest KP, colours), `stageOf`.
  - `grow(state, focusMin)`, a pure function returning `{ state, bloomed }`.
  - `emptyPlot()`.
- **`shared/toys.ts`:** the `plot` toy kind and the `plot` `ToyState`.
- **`shared/types.ts`:** `holding.item` can be `Drink | 'bouquet'`, with `flower?`.
- **`shared/protocol.ts`:** `garden`, `buySeed`, `bloomed` and `gardenNote` messages; `bad_garden` error; `coffeeOffer` gains `flower?`.
- **Constants.**
- **Tests:** `shared/garden.test.ts`.

## Task 2: Scene and server

- **Scene:** `shared/scenes/town/garden.ts` holds the 20 plot toys and bed decor inside `GARDEN_BOX`, merged in `south.ts`.
- **Server:**
  - Handler: `plot: none`, with an init that gives an empty plot.
  - `SAVED_KINDS` gains `plot`.
  - `world.garden()` and `world.buySeed()`.
  - Growth in `finishFocus`.
  - Bouquet handling in sip, brew and gifting.
- **Validation:** `garden` and `buySeed`.
- **Tests:** `world.garden.test.ts`, validation and scenes.

## Task 3: Client

- **Plot view:** `client/src/toys/garden.ts` draws beds, plants by stage, sign, vase and the boost sparkle.
- **Panel:** `client/src/hud/garden.ts` holds the garden panel and seed picker.
- **Bouquet in hand:** `Character.setHolding` handles bouquets.
- **game.ts:** plot prompts and E routing, the `bloomed` and `gardenNote` toasts, and the G prompt for bouquets.
- **Gift card:** bouquet wording.
- **Minimap:** beds and the 🌷 icon.

## Task 4: Final checks

- README.
- Headless checks with a bot.
- One review.
- Push.
- Ask before deploying.
