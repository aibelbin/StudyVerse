# South Park, Round 2: Focus Garden

Date: 2026-11-09
Status: approved in chat.

The user's choices:
- Each player has their own plot.
- Plants grow from finished focus minutes.
- Watering is a bonus, and plants never wilt.
- A harvest gives a bouquet plus a little KP.
- Basic seeds are free and rare ones are unlocked with KP.

## 1. Layout

The garden sits in `GARDEN_BOX`, the reserve from round 1 (x −70..−54, z 4..16), inside the bush ring with its opening on the east.

- **Plots:** 20 plots in a 5 × 4 grid. Each plot is a 2.0 × 1.8 m soil bed with 0.8 m paths between them.
- **Per plot:** 4 planting spots (2 × 2), a small name sign and a vase on the bed's south edge.
- **Toys:** each plot is a toy, `kind: 'plot'`, with ids `garden-plot-0` to `garden-plot-19` and radius 1.6.
- **Colliders:** the beds have no colliders. They're low, and you can step over them.

## 2. Flowers

```ts
type Flower = 'tulip' | 'daisy' | 'sunflower' | 'poppy' | 'lavender' | 'rose' | 'lotus' | 'glowLily';
```

`FLOWERS` in `shared/garden.ts`:

| Flower | Focus min to grow | Unlock (KP) | Harvest KP |
|---|---|---|---|
| tulip | 25 | free | 5 |
| daisy | 30 | free | 5 |
| sunflower | 40 | free | 5 |
| poppy | 45 | free | 5 |
| lavender | 60 | 15 | 10 |
| rose | 75 | 25 | 10 |
| lotus | 90 | 30 | 10 |
| glowLily | 120 | 40 | 10 |

- **Unlocks:** buying a rare flower adds `seed-<flower>` to the wallet's `owned` list, using the existing `store.buy`. It's yours forever.
- **Stages** are by progress fraction: seed (< 0.25), sprout (< 0.6), bud (< 1), bloom (≥ 1). The pure helper is `stageOf(progress, growMin)`.
- **Glow-lily** blooms glow at night.

## 3. Plot state (a `ToyState`, saved like the cairn)

```ts
{
  kind: 'plot';
  owner: string | null;                                            // profile id
  ownerName: string | null;
  spots: ({ flower: Flower; progress: number } | null)[];          // length 4, progress in focus minutes
  boostMin: number;                                                // watered bonus left, in focus minutes
  vase: Flower | null;
  lastActive: number;                                              // owner's last focus finish or garden action
}
```

- `plot` is added to `SAVED_KINDS`, so each plot's state is kept in `kv` under its toy id.
- A new client message carries all garden actions:

  ```ts
  { t: 'garden'; toyId; action: 'claim' | 'plant' | 'water' | 'harvest' | 'vase'; spot?: number; flower?: Flower }
  ```

### Rules (`world.garden`)

You must be within the plot's radius and not seated.

- **claim:**
  - The plot must be free and you must not own another plot.
  - If no plot is free, the plot whose owner has been inactive longest is freed first, but only if that's more than 30 days (`PLOT_IDLE_MS`). Its plants are lost.
  - Otherwise the error is "The garden is full".
- **plant:**
  - Owner only. The spot must be 0..3 and empty.
  - The flower must be free, or `seed-<flower>` must be owned.
- **water:**
  - Anyone, including the owner. The plot must be claimed.
  - Once per waterer per plot per day. This is kept in memory: `wateredBy` maps `plotId|profileId` to a day.
  - Sets `boostMin = 60` (`WATER_BOOST_MIN`); it doesn't stack.
  - The owner, if online and not the waterer, gets a toast: "💧 Sam watered your garden".
- **harvest:**
  - Owner only. The spot must be in bloom, and your hands must be empty.
  - Clears the spot and adds the harvest KP.
  - `holding` becomes `{ item: 'bouquet', flower, stars: 0, sips: 0 }`.
  - A feed line goes out: "🌷 Sam picked a bouquet of roses".
- **vase:**
  - Owner only, while holding a bouquet.
  - Sets `vase = flower` and empties your hands.

### Buying seeds and growth

**Buying seeds:** `{ t: 'buySeed', flower }` spends the KP through `store.buy(id, 'seed-' + flower, price)`. It's refused for free flowers and flowers you already own.

**Growth** happens in `finishFocus(p, focusMin)`. For each spot on p's plot that holds a flower and isn't yet in bloom:

```
boosted = min(focusMin, boostMin)
progress += focusMin + 0.5 × boosted
```

- After all spots are updated, `boostMin -= boosted`.
- `lastActive` becomes now.
- The new state is saved and broadcast.
- Every spot that reached bloom on this finish sends the owner a `bloomed { flower }` message, and the client toasts "🌷 Your tulip bloomed!"

## 4. Holding a bouquet

- `holding.item` becomes `Drink | 'bouquet'`, with an optional `flower?: Flower`.
- **sip:** ignored for bouquets.
- **brew:** refused while you hold a bouquet ("Put your bouquet in your vase or give it away first").
- **Gifting** uses the existing coffee offer flow:
  - `coffeeOffer` carries `drink: Drink | 'bouquet'` and `flower?`.
  - The gift card and the feed say "a bouquet of roses" for bouquets.
- **Character:** `setHolding('bouquet', flower)` draws a small bouquet in the hand: a stem bundle, three blooms in the flower's colour, and a paper wrap.

## 5. Client

### Plot view

- A soil bed that's darker and twinkles while `boostMin > 0`.
- 4 plants drawn by stage and flower: low-poly stems, leaves and blooms in each flower's colours. Lavender is a spike, sunflower is tall, lotus is a flat pad and bloom, glow-lily has an emissive bloom.
- The sign shows the owner's name, or "Free plot" when unclaimed.
- A vase with the flower in it.

### E prompts

| Plot | Prompt and action |
|---|---|
| Unclaimed | "[E] claim this plot" |
| Your own | "[E] tend your garden": opens the garden panel |
| Someone else's | "[E] water Sam's garden 💧", or "Watered today ✓" if you already watered it today (tracked locally) |

### Garden panel (`client/src/hud/garden.ts`)

- The four spots, each with:
  - its flower and stage
  - a progress bar ("12 / 40 min")
  - **Plant**, which opens a seed picker of 8 cards: free ones say "Plant", locked ones say "Unlock 25 ✨"
  - **Pick**, when the spot is in bloom
- Also: a "Water 💧" button, the boost ("+50% for the next 42 min"), and "Put bouquet in vase" while you hold one.

### Other client pieces

- **Prompt:** holding a bouquet shows "[G] give the bouquet".
- **Minimap:** soil-coloured rectangles for the beds, and a 🌷 icon.

## 6. Constants

| Constant | Value |
|---|---|
| `PLOT_SPOTS` | 4 |
| `WATER_BOOST_MIN` | 60 |
| `WATER_BOOST` | 0.5 |
| `PLOT_IDLE_MS` | 30 days |

New error code: `bad_garden`.

## 7. Tests

- **Shared:**
  - `stageOf` boundaries.
  - The `FLOWERS` table.
  - Growth maths with and without a boost, as a pure `grow(state, focusMin)` that returns the new state and which flowers bloomed.
- **World:**
  - Claim: only one plot each, the garden is full, and an idle owner is reclaimed.
  - Plant: owner only, locked flowers refused, and allowed after `buySeed`.
  - Growth on a finished focus session, the `bloomed` message, and early quits not growing anything.
  - Water: once a day per waterer, the boost is used up, and the owner gets the toast.
  - Harvest gives the KP and the bouquet, and is refused when your hands are full.
  - Vase.
  - Gifting a bouquet.
  - State is saved and reloaded after a restart.
  - Sip and brew handle bouquets correctly.
- **Validation:** `garden` and `buySeed`.
- **Scenes:** 20 plots inside `GARDEN_BOX`, off paths and colliders.
- **Headless:** claim, plant, finish a short focus session to see it grow, water from a second player, harvest, the vase, and gift the bouquet.
