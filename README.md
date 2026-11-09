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
| WASD / arrows | walk (or row a boat) |
| W/S, A/D | in a truck: throttle and brake/reverse, steer |
| E | sit / stand / use a toy / say hi to someone nearby |
| Space | start a study session (at a desk, café table or bench) |
| 1–8 | play the piano, or the stage drums, guitar and keyboard, from their seats |
| H | honk (in a truck) |
| C | sip your drink (four sips per cup) |
| G | offer your drink or bouquet to someone nearby (they get Accept / No thanks, or Y / N) |
| Enter | open chat / send; Esc closes it |
| T | emote wheel (hold, point, let go; or click) |
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

## Chat and emotes

The chat panel (bottom left) has an **Everyone** tab, which reaches all online players in any building and pops a
speech bubble over the sender's head, and a tab per private conversation. Start one with 💬 Message on someone's
player card, or by clicking their name in the online list. DMs to people who are offline wait for them. The last 100
messages per channel are kept. React to any message with 👍 ❤️ 😂 😮 🎉. There's a gentle rate limit (one message a
second, five per ten seconds). Hold **T** for the emote wheel: wave, cheer, dance, laugh, love, think, sleepy, clap.

## Voice chat

🎙️ in the status panel joins proximity voice: people nearby hear you, quieter with distance. Browsers only allow
microphones on secure pages, so for friends on other machines serve the town over HTTPS:
`TLS_CERT=/path/cert.pem TLS_KEY=/path/key.pem`. Optional `ICE_SERVERS` (JSON) adds STUN/TURN servers, e.g. a
TURN server for friends behind strict networks.

## The town

A 150×130 town with a square (Library, Café, bandstand piano, fountain, bell, jukebox, Boutique, notice board,
knowledge tree), car parks by the Library and the Café with four trucks, cones and crates to knock over, a lake with a dock and two rowboats, woods with a campfire, a park with wind chimes, a telescope, a zen corner and a garden, an open-air stage in the south, and a playground (swings, seesaw,
merry-go-round, slide). Toys are shared: friends see and hear them. Ducks, fish, frogs, birds, insects, sailboats
and clouds wander around on their own, and the sky follows your local clock (stars and fireflies at night).
All art is procedural and all sound is synthesized in the browser; 🔊 in the status panel mutes it.

Trucks drive on real physics: [Rapier](https://rapier.rs)'s ray-cast vehicle with the tuning from Bruno Simon's
[folio-2025](https://github.com/brunosimon/folio-2025) (springy suspension, grip and drift, idle and reverse
braking). Only the driver's browser simulates; the engine loads the first time you take the wheel. A truck stays
where you leave it, and one left outside a bay for 10 minutes parks itself.

The **zen corner** has a koi pond with a red bridge (E at the edge tosses food and the koi race over), cherry
trees, lanterns and picnic blankets. Sit on one of the five cushions for a five-minute breather: everyone on the
ring breathes to the same circle, and finishing earns 3 ✨ KP plus 1 per companion (up to 3 more), once an hour.
The shared cairn takes one stone per person every five seconds, wobbles as it grows and topples more often the
taller it is. Its record and who placed the top stone are saved.

The **focus garden** has 20 plots: press E on a free one to claim it. Plant tulips, daisies, sunflowers and
poppies for free, or unlock lavender, roses, lotuses and glow-lilies with KP. Every finished focus minute,
anywhere in town, grows what you've planted (25 to 120 minutes to bloom). Friends can water your plot once a
day, which makes your next 60 focus minutes count 50% extra. Pick a bloom for a little KP and a bouquet: give
it away with G, or put it in your plot's vase for everyone to see. Plots and plants are saved.

The **open-air stage** carries the voice of anyone standing on it to everyone in its 18 seats at full volume.
Sit at the drums, guitar (chords) or keyboard and play with 1–8. Spotlights come on when someone's on stage,
claps and cheers from the seats sound like applause, and E at the board behind the stage puts up a line for
everyone (it stays two hours).

The Café's coffee machine is a little barista game: grind, tamp, pull the shot, steam the milk, pour to the line
and trace latte art. Your score sets the stars on the cup you carry.

URL helpers: `?time=21:30` pretends it is that time of day, `?fps` shows a frame counter, `?debug` exposes `window.game`.

## Tests

```bash
npm test          # vitest: shared, server and client logic
npm run typecheck
```
