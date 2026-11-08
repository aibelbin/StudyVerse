# 📚 Virtual Study World

A cozy top-down 3D town where you and your friends study together. Walk around with WASD, sit at a desk in the Library, the Café or the park, and start a Pomodoro session. Everyone sees your progress ring, and everyone sees it if you bail early 🥀.

## Run it locally

Requires Node 24 or newer (the server uses the built-in `node:sqlite`). Use two terminals:

```bash
npm install
INVITE_CODE=cozy npm run dev:server   # game server on :8787
npm run dev:client                    # Vite on :5173, proxies /ws to the server
```

Open http://localhost:5173 and enter the invite code `cozy`.

To see two players at once, use a normal window and a private window. Tabs in the same window share a device token, so the newer tab takes over from the older one.

## Production

Run `npm install` (including dev dependencies) before building. When exposing the server, use a long random `INVITE_CODE`.

```bash
npm run build                          # builds the client into dist/client
INVITE_CODE=<secret> PORT=8787 DB_PATH=data.db npm start
```

One process serves the page and the WebSocket (`/ws`). Profiles are stored in `data.db`. `GET /health` returns `ok`.

## Controls

| Key | Action |
|---|---|
| WASD / arrows | walk (or row, while in a rowboat) |
| E | sit / stand / use a toy / say hi to someone nearby |
| Space | start a study session (at a desk, café table or bench) |
| 1–8 | play notes while sitting at the piano |
| Esc | close dialogs and the player card, stop stargazing |

## The town

A 120×90 town with a square (Library, Café, bandstand piano, fountain, bell, jukebox), a lake with a dock and
two rowboats, woods with a campfire, a park with wind chimes and a telescope, and a playground (swings, seesaw,
merry-go-round, slide). Toys are shared: friends see and hear them. Ducks, fish, frogs, birds, insects, sailboats
and clouds wander around on their own, and the sky follows your local clock (stars and fireflies at night).
All art is procedural and all sound is synthesized in the browser; 🔊 in the status panel mutes it.

URL helpers: `?time=21:30` pretends it is that time of day, `?fps` shows a frame counter, `?debug` exposes `window.game`.

## Tests

```bash
npm test          # vitest: shared, server and client logic
npm run typecheck
```
