# South Park, Round 3: Mini-Golf

Date: 2026-11-09
Status: approved in chat.

The user's choices:
- Everyone plays at once.
- Drag back and release to putt.
- Six themed holes.
- A daily board plus a little KP.
- A maximum of 6 strokes per hole.

## 1. Course (east half of the south strip, final town coordinates)

**`GOLF_BOX`** is `{ x: 39, z: 48.5, w: 64, d: 25 }`, covering x 7..71 and z 36..61.
- The two east strip meadow gaps are removed.
- Grass and rocks are kept out of it, like the stage and the zen corner.
- A few trees ring the course edge.

**Paths:**
- The strip path extends east from x 1.2 to x 8: `{ x: -26, z: 40, w: 68, d: 2 }`, replacing the old strip path.
- A course walkway runs between the two rows: `{ x: 39, z: 48, w: 62, d: 1.6 }`.
- A short spur joins the two: `{ x: 8, z: 44, w: 1.6, d: 8 }`.

**Scoreboard:** a toy `golfBoard` at (9.5, 37.5). It shows "Today's best" and a collider.

**Holes** are defined in `shared/golf.ts`. Each hole is:

```ts
{ n, par, name, tee: {x, z}, cup: {x, y, z}, bounds: Box, pieces: Piece[] }
```

- **Pieces** are `floor` (box, y, optional slope), `wall` (box, height), `water` (box), `windmill`, `loop` and `volcano`.
- They're plain data, used by the client for both the visuals and the physics colliders.
- The server only uses `tee`, `cup`, `par` and `bounds`.

| # | Name | Par | Lane | Feature |
|---|---|---|---|---|
| 1 | Warm-up | 2 | north row, x 10→26, z 41 | straight 4 m lane |
| 2 | Windmill | 3 | x 30→46, z 41 | a tunnel box with a bottom opening. Blades turn on a horizontal axis, with angle `(serverNow / 1000) × 1.2` rad, and block the opening part of the time |
| 3 | Ramp jump | 3 | x 50→66, z 41 | a ramp up to 0.4 m, a 1.6 m gap over a sunken pond, then a landing that slopes back down |
| 4 | Zigzag | 3 | south row, x 66→52, z 55 | an 8 m wide box with two baffles from alternating sides, for banking |
| 5 | Loop | 3 | x 46→32, z 55 | a vertical corkscrew loop (radius 0.9 m, 0.6 m sideways offset) built as a trimesh ribbon. It needs about 6.5 m/s at the entry |
| 6 | Volcano | 4 | x 26→12, z 55 | a frustum mound (bottom radius 2.2, top 0.7, height 0.55) with the cup in the flat top |

- **Lanes:** 4 m wide (except the zigzag), with green felt floors 0.05 m high and wooden rails 0.25 m high.
- **Each hole also has:** a tee mat, a cup with a flag showing the hole number, and a sign ("2 · Windmill · par 3").
- **Walkers** can step across lanes. Only the windmill tower, the loop frame and the scoreboard block walking.

## 2. Ball physics (the player's own browser only)

`client/src/golf/sim.ts` reuses Rapier, through the existing lazy `loadRapier`.

- **The ball:** radius 0.12, mass 0.05, restitution 0.5, friction 0.6, linear damping 0.55, angular damping 1.5, CCD on.
- **Colliders:**
  - floors and walls are cuboids
  - the ramp is a rotated cuboid
  - the loop is a trimesh
  - the volcano is a convex hull
  - the windmill blades are kinematic, and set every step from server time
- **Steps:** a fixed 1/120 s step (the ball is small and fast), with the same blending between steps as the truck.
- **A putt** is `velocity = dir × power × 9 m/s`, with power from 0 to 1.
- **The ball is at rest** when its speed stays below 0.06 m/s for 0.3 s.
- **Penalty:** if the ball's y drops below −0.15 (the water and the jump gap), or it leaves `bounds`, it's a penalty. The ball goes back to its last resting spot, +1 stroke.
- **Holed:** the ball is within 0.2 m of the cup (horizontally, and within 0.15 m of the cup's height) while moving slower than 1.4 m/s. It drops into the cup and the hole counts as holed.

## 3. Protocol and server

New client messages:

| Message | Meaning |
|---|---|
| `{ t: 'golfTee', hole }` | Start a hole. You must be within 3 m of the tee and not seated. This resets the hole's attempt. |
| `{ t: 'golfShot', hole, penalty? }` | A putt or a penalty: one stroke. Refused at 6 strokes, unless it's a penalty that takes you to 7. |
| `{ t: 'golfBall', x, y, z }` | Your ball's position while it rolls, at most every 80 ms. It's relayed to the scene. |
| `{ t: 'golfHoled', hole }` | Accepted only if the last ball position is within 0.45 m of the cup. |
| `{ t: 'golfPickUp', hole }` | Allowed at 6 or more strokes. Scores 7. |
| `{ t: 'golfQuit' }` | Leave the hole. |

New server messages:

| Message | Meaning |
|---|---|
| `{ t: 'golfBall', id, hole, x, y, z }` | Someone's ball position. |
| `{ t: 'golfDone', id, hole, strokes, holeInOne }` | Someone finished a hole (7 means picked up). |
| `{ t: 'golfGone', id }` | Someone's ball is removed (quit, left the scene, or disconnected). |
| `{ t: 'golfCard', card }` | Your scorecard, after every change. |

**Scorecard:** `card: (number | null)[6]`. It's kept in memory per player, for the visit.

**Server state per player:** `golf: { hole, strokes, ball: { x, y, z } | null, card }`.

**Finishing a round:** when all 6 holes on the card are filled:
- The total is `sum(card)`.
- The board updates and the card resets.
- If the profile isn't in today's `paid` list, they get `GOLF_KP` (3), or `GOLF_PAR_KP` (6) for a total of 18 or less, and are added to `paid`.
- A feed line goes out: "⛳ Sam went round the mini-golf in 17".
- A hole-in-one gets its own feed line: "🎉 Sam got a hole-in-one on the Windmill!"

**Board state** (`ToyState`, saved in kv like the cairn):

```ts
{ kind: 'golfBoard'; day: string; top: { name: string; strokes: number }[]; paid: string[] }
```

- `top` is the best 5 for the day, one entry per name.
- A new day resets `top` and `paid` when the next score arrives.
- The client shows nothing if `day` isn't today on the server.

**Cleanup:** leaving the town scene, disconnecting, or sitting down clears your active hole and sends `golfGone`.

**Errors:** a new `ErrorCode`, `bad_golf`.

## 4. Client

### `client/src/golf/course.ts`

- Builds the course visuals from `HOLES`.
- Turns the windmill blades from server time (the same formula as the physics).
- Adds the cup flags and the scoreboard view, which draws the board from the toy state on a canvas texture.

### `client/src/golf/play.ts`: your own hole

- **Starting:** E on a tee starts it. The prompt is "[E] play hole 2 · Windmill (par 3)".
- **Putting:**
  - Press the mouse on the canvas and drag. The ball doesn't need to be under the pointer: the drag direction and length count.
  - A dotted line from the ball shows the aim, the opposite direction to the drag.
  - A power bar fills, maxing out at 160 px of drag. Letting go putts. Esc or a right-click cancels the putt.
  - You can only putt while the ball is at rest.
- **Camera and character:**
  - While a hole is active, the camera follows the ball.
  - After each stop, your character walks to stand next to the ball. The server is sent the move, which is within speed limits.
- **HUD:**
  - "Hole 2 · Windmill · par 3 · strokes 1"
  - "[drag] putt · [Q] leave the hole"
  - The 6-hole card with your card values
- **When you hole it:**
  - The ball drops.
  - A toast, by score: "Hole-in-one! 🎉", "Birdie!", "Par", "Bogey", "+2".
  - The next hole's tee is suggested in the prompt.
- **Pick up:** after the 6th stroke comes to rest without holing, the game sends `golfPickUp` with the toast "Picked up (7)".
- **Other players' balls:** the same mesh in their body colour, glided with a 3D version of the buffered smoothing.
- **On `golfDone` with a hole-in-one:** 🎉 confetti pops at that cup for everyone in town.

### Minimap

The course area in felt green, and a ⛳ icon.

## 5. Constants

| Constant | Value |
|---|---|
| `GOLF_MAX_STROKES` | 6 |
| `GOLF_PICKUP_SCORE` | 7 |
| `GOLF_KP` | 3 |
| `GOLF_PAR_KP` | 6 |
| `GOLF_TEE_RANGE` | 3 |
| `GOLF_CUP_CHECK` | 0.45 |
| `GOLF_BALL_GAP_MS` | 80 |
| `GOLF_MAX_SPEED` | 9 |

## 6. Tests

- **Shared:**
  - `HOLES` are inside `GOLF_BOX`, and each tee and cup is inside its hole's bounds.
  - The pars add up to 18.
  - The windmill angle function.
  - Hole score names.
- **World:**
  - Tee range.
  - The stroke count and the 6-stroke cap, plus penalties.
  - Holed accepted near the cup and refused far away.
  - Pick up scores 7.
  - The full round's total, the board (best 5 and one entry per name), and KP once a day (6 at or under par).
  - Day rollover.
  - A hole-in-one feed line.
  - Ball relay and rate limit.
  - Cleanup on disconnect and scene change.
  - The board survives a restart.
- **Client (pure):**
  - `aimFromDrag` (direction and power, clamped).
  - `restDetector`.
  - `cupCheck`.
- **Physics (Node, a short run):**
  - A full-power putt down hole 1's lane reaches the cup area.
  - A ball in the jump gap triggers a penalty.
  - Hole 5: a full-power putt goes round the loop and comes out the far side.
- **Headless:** walk to hole 1, putt with real mouse drags, hole out, check the card. A second player's ball shows for others.
