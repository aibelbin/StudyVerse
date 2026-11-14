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
| G | offer your drink to someone nearby (they get Accept / No thanks, or Y / N); with empty hands, opens your bag |
| I | your bag (gifts and bouquets) |
| Enter | open chat / send; Esc closes it |
| T | emote wheel (hold, point, let go; or click) |
| drag (mouse) | mini-golf: drag back from anywhere and let go to putt |
| Q | leave the mini-golf hole you're on |
| F | full screen |
| M | big map |
| N | do not disturb |
| V | mute / unmute your mic (when on voice) |
| P | bring out / put away your pet |
| Esc | close dialogs and the player card, stop stargazing |

On phones and tablets (held sideways) the town switches to touch controls: put a thumb on the left of the screen
for a joystick (it drives the truck and rows the boat too), tap the big button on the right for whatever the hint
says (sit, feed, drive, hop out…), small buttons appear for study, sip, give and honk, and instruments get 8 note
keys. 💬 opens chat, 😊 the emotes, ☰ the map, settings and who's online. Phones start on Lite graphics. On Android and iPads the game goes full screen (no
address bar) on your first tap; on iPhone, add the page to your home screen for that. `?touch` forces touch mode on a computer (`?touch=0` turns it off).

## Knowledge Points, wardrobe and pets

Finishing a focus session earns ✨ Knowledge Points: 1 per focus minute, plus a daily-streak bonus. Leaving early
earns nothing. Spend them in the Boutique (✏️ or the stall in the square) on hats, tops, glasses, backpacks and
more, or adopt a pet. Pets have little minds of their own: they keep up when you walk (that part is a tiny neural
network trained with evolution strategies, `pets/train.ts`, run on a remote machine), and when you stop they wander
up to about 8 m, sniff flowers, toys and benches, greet people, chase other pets and nap while you study. Kittens
pounce and get the zoomies, bunnies hop, binky and flop, ducklings stay close, quack and swim, frogs sit, leap,
catch flies and croak.

## Chat and emotes

The chat panel (bottom left) has an **Everyone** tab, which reaches all online players in any building and pops a
speech bubble over the sender's head, and a tab per private conversation. Start one with 💬 Message on someone's
player card, or by clicking their name in the online list. DMs to people who are offline wait for them. The last 100
messages per channel are kept. React to any message with 👍 ❤️ 😂 😮 🎉. There's a gentle rate limit (one message a
second, five per ten seconds). Hold **T** for the emote wheel: wave, cheer, dance, laugh, love, think, sleepy, clap.

## Gifts, keepsakes and status

The 🎁 gift stall in the square sells cute gifts for KP (love letters, cookies, balloons, cupcakes, a mini cactus,
bouquets, rubber duckies, surprise boxes, plushie bears, star jars). They go into your 🎒 bag (I), along with the
bouquets you pick in your garden. Open the bag, tap something and choose who gets it (people nearby are listed
first), or use 🎁 on someone's player card or next to their name in the online list. Gifts
land on the receiver's keepsakes shelf (shown on their card); eat a cupcake or cookie, or let a balloon float away.
Click your own name to set a status (🍜 Eating, 😴 Napping, ☕ Coffee break… or your own words) that shows over your
head and in the online list, for 30 min, 1 h, 4 h or until you clear it. Newcomers only see chat from after they
joined.

## Admins

Put profile ids in `ADMIN_IDS` (comma-separated). Admins get ✨ ∞ KP (everything is free) and a 🛡️ side panel: see
who's online and where, go to someone or send them home, kick, mute chat (10 min to 24 h), ban (1 h, 24 h, 7 days or
for good), switch features off for everyone (Everyone chat, DMs, voice, gifts, stage screen, notice board, trucks,
mini-golf), post an announcement banner, and delete chat messages, notes or the stage screen text. Every admin
action is checked on the server.

## Voice chat

🎙️ in the status panel joins proximity voice: people nearby hear you, quieter with distance. Browsers only allow
microphones on secure pages, so for friends on other machines serve the town over HTTPS:
`TLS_CERT=/path/cert.pem TLS_KEY=/path/key.pem`. Optional `ICE_SERVERS` (JSON) adds STUN/TURN servers, e.g. a
TURN server for friends behind strict networks.

## The town

A 150×130 town with a square (Library, Café, bandstand piano, fountain, bell, jukebox, Boutique, notice board,
knowledge tree), car parks by the Library and the Café with four trucks, cones and crates to knock over, a lake with a dock and two rowboats, woods with a campfire, a park with wind chimes, a telescope, a zen corner and a garden, an open-air stage and a mini-golf course in the south, and a playground (swings, seesaw,
merry-go-round, slide). Toys are shared: friends see and hear them. Ducks, fish, frogs, birds, insects, sailboats
and clouds wander around on their own, and the sky follows your local clock (stars and fireflies at night).
All art is procedural and all sound is synthesized in the browser; 🔊 in the status panel mutes it. The look is a
storybook one: toon shading, detailed trees, flowers, shopfronts and cosy interiors, a hand-painted ground with drifting cloud shadows, a sky that follows the
clock, and a gentle glow on lights at night. ✨ in the status panel switches to Lite graphics (no night glow or cloud
shadows) on slower machines; `?lite` forces it.

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

**Mini-golf** has six holes (par 18): a warm-up, a windmill, a ramp jump over a pond, a zigzag, a loop and a
volcano. Press E on a tee, then drag back and let go to putt (the dotted line and the bar show aim and power).
Everyone can play at once and sees each other's balls; six putts and you pick up (scored as 7). Your own browser
simulates your ball with Rapier and streams it to everyone else. A full round goes on "Today's best" by the
entrance and pays 3 ✨ KP (6 at or under par) once a day; a hole-in-one makes the feed.

The **open-air stage** carries the voice of anyone standing on it to everyone in its 18 seats at full volume.
Sit at the drums, guitar (chords) or keyboard and play with 1–8. Spotlights come on when someone's on stage,
claps and cheers from the seats sound like applause, and E at the board behind the stage puts up a line for
everyone (it stays two hours).

East along the main street, a gate leads to the **village**: everyone gets a cabin of their own on a lot (empty
lots wear a "free lot" sign, and a new row opens as it fills). Inside, E at a wall spot hangs one of your paintings
and E at a shelf shows off a keepsake or a bouquet; 🔓/🔒 latches the door so visitors stay outside. The village
**Studio** has easels for pixel or freehand painting. Put up to three of yours up for sale and they hang on its
gallery wall; E there opens the catalogue, where prints cost KP and the artist earns it.
J (or the 📖 button) opens the field journal: every fish and bug you have caught, with silhouettes and hints for the rest.
The pottery wheel lets you pick a mug shape and glaze and fire it for 10 KP; everyone sees it when you hold a drink.

The Café's coffee machine is a little barista game: grind, tamp, pull the shot, steam the milk, pour to the line
and trace latte art. Your score sets the stars on the cup you carry.

URL helpers: `?time=21:30` pretends it is that time of day, `?fps` shows a frame counter, `?debug` exposes `window.game`.

## Tests

```bash
npm test          # vitest: shared, server and client logic
npm run typecheck
```
