# Virtual Study World: Core Slice Design

Date: 2026-11-08
Status: Approved

## 1. Goal and scope

A cozy, goofy, top-down 3D multiplayer town in the browser where a small group of friends walk around, sit at desks, and run Pomodoro study sessions that everyone else can see. Early quits are announced to the town as mild social pressure.

This is the **first of several specs**. The full concept splits into these sub-projects:

1. **Core slice (this spec):** town plus interiors, movement, multiplayer presence, desks, individual Pomodoro timers, an event feed, early-quit visibility.
2. Coffee shop interactions (an interactive coffee-making mechanic).
3. Break-time mini-games, points, and the coffee economy.
4. Later work: lasting accountability stats, chat, real login, more locations.

**Audience:** the user and their friends (5 to 20 people) for now. The design should allow more users later, but it does not need moderation, scaling, or real accounts.

**Out of scope here:** interactive coffee-making, mini-games, points and economy, persistent stats or streaks, text chat, real login, mobile or touch controls.

## 2. Architecture

The project is TypeScript throughout and runs as one Node process that holds everyone's live state in memory and saves profiles to one SQLite file.

```
shared/   protocol.ts (message types), scenes/*.ts (scene layout data)
server/   Node + ws + better-sqlite3; also serves the built client as static files
client/   Vite + TypeScript + Three.js
```

- One port, one process, one `data.db` file.
- **Hosting:** the `fox` SSH host, reached by friends through a tunnel (Tailscale Funnel or Cloudflare Tunnel, decided at deploy time). Because the server is plain Node plus SQLite, it can move to a cloud host unchanged. The user confirms before anything is copied to or run on `fox`.
- **Visual reference:** the user's `DetectionAndAvoidance/drone_follow/static/viewer.js`. That viewer uses plain Three.js, builds all meshes procedurally from primitives, uses soft shadows and flat shading, and overlays frosted-glass HUD panels. This project reuses those techniques with a warmer, cuter palette. It loads no external art assets.

## 3. World and scenes

### 3.1 Scenes as data

Each scene is a plain object in `shared/scenes/`, so both the client and the server can use it:

| Field | Contents |
|---|---|
| `id`, `name` | e.g. `library`, "Library" |
| `size` | floor width and depth |
| `theme` | palette colors, lighting preset, fog |
| `colliders` | axis-aligned boxes `{x, z, w, d}` (walls, shelves, tables) |
| `seats` | `{id, x, z, facing, deskId}` |
| `doors` | `{id, trigger box, toScene, toSpawn}` |
| `spawns` | named spawn points `{id, x, z, facing}` |
| `decor` | `{kind, x, z, rot, ...params}`; the client maps each `kind` to a procedural mesh builder |

The server uses this data to check seat IDs, check that a seat is free, and resolve doors. It never touches meshes.

### 3.2 Scenes in this slice

1. **Town:** an outdoor hub with paths, trees, lamp posts, a small park with benches (benches are study seats), and the exteriors of the Library and the Café with doors. New players spawn here.
2. **Library:** desks with lamps, bookshelves, rugs and plants, in a quiet, warm mood.
3. **Café:** small tables (study seats), a counter, and a coffee machine. The machine is decoration only in this slice; spec 2 makes it interactive.

### 3.3 Movement and camera

- WASD moves on the ground plane relative to the screen. The camera is fixed (no orbit), so W always means up the screen.
- The client handles collision itself, sliding along collider boxes. Characters do not collide with each other.
- The camera follows the player from a fixed angle (about 50° down from horizontal), easing to catch up.
- Movement speed is constant. The walk animation is a waddle cycle (legs swing, slight body bob).

### 3.4 Scene transitions

1. The player walks into a door trigger.
2. The camera eases toward the door while a warm cream overlay fades in (about 350 ms).
3. The client sends `enterScene {doorId}`. The server moves the player to the target scene and replies with that scene's snapshot.
4. The client shows the target scene (each scene is built once and cached), places the player at the door's `toSpawn`, and fades the overlay out.

Entering a door while seated is impossible, because a seated player cannot move.

## 4. Identity

- **First visit:** a join screen asks for the town's **invite code**, a **name** (1 to 16 characters), and a **look**: body color, skin tone, and one hat from five options. The server creates a profile and returns a random 32-byte token. The client stores the token in `localStorage`.
- **Later visits:** the client sends its token and is recognized automatically. The join screen also offers "edit look".
- **Storage:** SQLite table `profiles(id, token_hash, name, look_json, created_at, last_seen_at)`. Only a hash of each token is stored.
- **Invite code:** read from the `INVITE_CODE` environment variable.
- **Duplicate tabs:** if a second connection arrives with the same token, the newer one replaces the older one, and the older connection is closed with a "connected elsewhere" message.

## 5. Networking protocol

The transport is WebSocket carrying JSON messages, each shaped `{t: <type>, ...}`. All message types are defined once in `shared/protocol.ts`.

### 5.1 Client to server

| Message | Purpose |
|---|---|
| `hello {token?, inviteCode?, name?, look?}` | authenticate or create a profile |
| `move {x, z, facing, anim}` | sent about 12 times per second while moving, plus once on stop |
| `enterScene {doorId}` | go through a door |
| `sit {seatId}` / `stand` | take or leave a seat |
| `startSession {focusMin, breakMin}` | start a Pomodoro (focus 1 to 120 min, break 1 to 30 min) |
| `cancelSession` | end the current session |
| `emote {kind, targetId?}` | wave, or a 👏 / 💪 / ☕ cheer |
| `updateLook {look}` | change appearance |

### 5.2 Server to client

| Message | Purpose |
|---|---|
| `welcome {you, token?, scene, players[], online[]}` | after `hello`; includes a token only when a profile was just created |
| `error {code, message}` | e.g. `bad_invite`, `unknown_token`, `seat_taken` |
| `sceneSnapshot {scene, players[]}` | after entering a scene |
| `playerJoined / playerLeft {player}` | sent to players in the same scene |
| `playerMoved {id, x, z, facing, anim}` | sent to players in the same scene |
| `playerUpdated {player}` | seat, session, look, connection, or rain-cloud changes |
| `emote {fromId, kind, targetId?}` | sent to players in the same scene |
| `online {list}` | everyone online and which scene they are in; sent to all players on change |
| `feed {kind, text, at}` | sent to all players in all scenes |

### 5.3 Server state

- **Kept in memory:** `players` (id, profile, socket, scene, position, seatId, session, connected flag, rainCloudUntil) and `seats` (seatId mapped to playerId).
- **Lost on restart:** if the server restarts, clients reconnect and land in the Town, and any running sessions are gone. This is acceptable at this scale.
- **Movement trust:** the server trusts client positions. It only clamps positions to the scene bounds and drops positions that change unreasonably fast.

### 5.4 Remote player smoothing

The client buffers recent `playerMoved` updates for each remote player and draws them interpolated about 100 ms behind real time. If an update is more than 2 m from the drawn position, the character snaps to it.

## 6. Study sessions and accountability

### 6.1 Sitting

Press **[E]** near a free seat to sit. The character snaps to the seat's position, faces the desk, and switches to a seated pose. Press **[E]** again, or any movement key, to stand.

### 6.2 Timer state machine (server-authoritative)

```
idle --startSession (seated)--> focus --(focusMin elapsed)--> break --(breakMin elapsed)--> idle
focus --stand / cancel / leave scene / disconnect timeout--> idle   [EARLY QUIT]
break --cancel--> idle                                              [no penalty]
```

Standing up, walking, or changing scene during a break does **not** end the break. The ring and timer keep running until the break ends or the player cancels.

- The session is stored as `{phase, focusMin, breakMin, phaseStartedAt}`. Clients compute countdowns from `phaseStartedAt`, with a clock-offset correction measured from the `welcome` message, so everyone sees the same time.
- Presets are 25/5 and 50/10, plus a custom option. A session is one focus period and one break. When the break ends, the HUD offers "Start another?" The next round never starts automatically.
- During a break the player may stand up and walk around without penalty. Their session simply ends when the break ends. "Start another?" requires being seated.

### 6.3 Visibility

- A floating **progress ring** hangs above each player in a session: a book icon and a warm ring during focus, a coffee cup and a green ring during a break.
- Feed messages:
  - "📚 Sam started a 50 min session in the Library"
  - "✨ Sam finished a 50 min session!" when focus ends
  - "☕ Sam is on a break" is **not** posted, to keep the feed quiet
- Your own HUD plays a soft chime and shows "Break time ☕" when focus ends.

### 6.4 Early quit

When a focus phase ends early:
- A feed message goes out: "🥀 Sam left 12 min into a 25 min session".
- A small **rain cloud** follows the player's character for 3 minutes. Everyone in the same scene can see it.
- Nothing is saved permanently.

### 6.5 Disconnect grace

- When the socket closes during focus, the player's character stays seated and dims, and the timer keeps running.
- **Reconnect within 60 s:** the session continues as if nothing happened.
- **No reconnect within 60 s:** the early quit is triggered with the text "🥀 Sam disconnected and didn't come back, 12 min into a 25 min session". Their seat is freed and the character is removed.
- When the socket closes outside of focus, the character is removed after the same 60 s grace with "👋 Sam headed home".

## 7. Social interaction and feed

- **Name tags** float above every character.
- **Player card:** walk within about 1.5 m of another player and press **[E]**. A small card shows their name, scene, status (wandering, studying with time remaining, or on break), and buttons to **Wave** or **Cheer** (👏 / 💪 / ☕). The emote floats above the sender, aimed at the target. When a player card and a seat are both in range, the closer one gets the **[E]** prompt.
- **Feed events:** "🌷 Sam arrived" (connected), "👋 Sam headed home", the session start, finish, and early-quit messages, and "Sam cheered Alex 💪". The server keeps the last 50 events in memory and sends the most recent 10 on `welcome`.

## 8. HUD and visual direction

### 8.1 HUD

The HUD uses frosted-glass panels in the same style as the drone viewer.
- **Top-left:** your name and status, and the timer with its phase when you're in a session.
- **Top-right:** who's online, grouped by scene (the Library: Sam, Alex · the Café: Jo).
- **Bottom-left:** the feed, showing the last 6 events, which fade after 30 s and reappear when you hover over the panel.
- **Bottom-center:** context prompts ("[E] Sit", "[E] Enter Library", "[E] Say hi to Sam", "[Space] Start session").
- **Session picker:** a small glass modal for choosing 25/5, 50/10, or custom.
- **Status chip:** "Reconnecting…" while the socket is down.

### 8.2 Look

- **Palette and lighting:** warm pastels; a hemisphere light plus one warm sun casting soft shadows; light warm fog outdoors; warm lamp glow indoors.
- **Characters:** oversized round head, capsule body, stubby limbs, dot eyes, a waddle walk cycle, and a seated pose. They are customized through body color, skin tone, and a hat (none, beanie, cap, bucket hat, or flower crown).
- **Scenery:** built procedurally from primitives with flat shading (trees, benches, bookshelves with colored book boxes, desks, desk lamps, plants, cups, rugs, counter, coffee machine). Random variation uses a seeded generator, so every client sees the same scenery.

## 9. Error handling

| Situation | Behavior |
|---|---|
| Wrong invite code | An inline error appears on the join screen. |
| Unknown or invalid token | The client clears the token and shows the join screen. |
| Seat already taken (race) | The server rejects with `seat_taken`, and the client shows a "taken!" bubble. |
| `startSession` while not seated, or with out-of-range minutes | The server rejects with an error, and the client shows a toast. |
| WebSocket drops | The client reconnects automatically with backoff (1, 2, 4, 8 s, then every 10 s) and shows the "Reconnecting…" chip. The server applies the grace rules in 6.5. |
| Malformed or unknown message | The server ignores and logs it. Repeated garbage from one socket closes that socket. |
| Name taken by another profile | Allowed. Names are display-only, and profiles are told apart by id. |

## 10. Testing

All tests are light and run quickly on a laptop with Vitest.

- **shared:** scene data checks (every seat and spawn lies inside the bounds and outside colliders, every door's target scene and spawn exist, seat IDs are unique across scenes).
- **server, unit:** the session state machine using fake timers (normal flow, early quit by stand, cancel, or leaving the scene, disconnect with reconnect at 59 s versus timeout at 61 s, break exit without penalty) and seat locking (a double sit and a sit race).
- **server, integration:** start the real server on a random port with a temporary database, connect two `ws` clients, and check join → see each other → sit → start session → feed broadcast → early quit → rain-cloud update. Also check the invite code and the token re-login.
- **client, unit:** collision sliding against boxes, and remote-player interpolation and snapping.
- **Manual:** two browser tabs side by side to check visuals, transitions, the HUD, and emotes.
