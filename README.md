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
| WASD / arrows | walk (or row a boat / drive a truck) |
| E | sit / stand / use a toy / say hi to someone nearby |
| Space | start a study session (at a desk, café table or bench) |
| 1–8 | play notes while sitting at the piano |
| H | honk (in a truck) |
| M | big map |
| N | do not disturb |
| V | mute / unmute your mic (when on voice) |
| P | bring out / put away your pet |
| Esc | close dialogs and the player card, stop stargazing |

## Knowledge Points, wardrobe and pets

Finishing a focus session earns ✨ Knowledge Points: 1 per focus minute, plus a daily-streak bonus. Leaving early
earns nothing. Spend them in the Boutique (✏️ or the stall in the square) on hats, tops, glasses, backpacks and
more, or adopt a pet. Pets are driven by a tiny neural network trained with evolution strategies
(`pets/train.ts`, run it on a remote machine: `npm run train:pets -- 300 shared/pets/policy.json`).

## Voice chat

🎙️ in the status panel joins proximity voice: people nearby hear you, quieter with distance. Browsers only allow
microphones on secure pages, so for friends on other machines serve the town over HTTPS:
`TLS_CERT=/path/cert.pem TLS_KEY=/path/key.pem`. Optional `ICE_SERVERS` (JSON) adds STUN/TURN servers, e.g. a
TURN server for friends behind strict networks.

## The town

A 120×90 town with a square (Library, Café, bandstand piano, fountain, bell, jukebox, Boutique, notice board,
knowledge tree), two trucks to drive around, a lake with a dock and two rowboats, woods with a campfire, a park with wind chimes and a telescope, and a playground (swings, seesaw,
merry-go-round, slide). Toys are shared: friends see and hear them. Ducks, fish, frogs, birds, insects, sailboats
and clouds wander around on their own, and the sky follows your local clock (stars and fireflies at night).
All art is procedural and all sound is synthesized in the browser; 🔊 in the status panel mutes it.

URL helpers: `?time=21:30` pretends it is that time of day, `?fps` shows a frame counter, `?debug` exposes `window.game`.

## Tests

```bash
npm test          # vitest: shared, server and client logic
npm run typecheck
```
