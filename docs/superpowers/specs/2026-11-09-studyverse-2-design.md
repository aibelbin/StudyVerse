# StudyVerse 2: Identity, Rewards, Voice, Truck, Pets, Study Objects, Coffee

Date: 2026-11-09
Status: Approved in chat. The user asked to "build everything we brainstormed". The decisions marked *(chosen)* below are defaults the user delegated.

## 1. Scope

This spec builds on the living world (`2026-11-09-living-world-design.md`). It ships in phases, and each phase ends with tests passing and a commit:

1. **Polish:** birds with flapping wings and a nicer look, plus a minimap.
2. **Round-blob characters**, which replace the capsule people.
3. **Knowledge Points (KP)** and the **wardrobe**: only basics at join, everything else bought with KP.
4. **Study objects:** a notice board, a quote bookshelf, a town "knowledge tree", and do-not-disturb.
5. **Coffee making** in the Café, with a held cup.
6. **Truck:** drivable, with folio-2025-style touches (dust, a horn, headlights at night).
7. **Proximity voice chat:** WebRTC mesh, optional built-in HTTPS, no Tailscale dependency.
8. **Pets** driven by a tiny reinforcement-learning policy, trained on `gpu-sys`.

**Out of scope:** mini-games, trading KP between players, moderation tools.

## 2. Polish

- **Birds:** each bird has a body, a head, a beak, a tail and **two wings**. The wings are separate instanced meshes that roll around the shoulder.
  - Wings flap fast while flying and give a little flutter on each hop. Otherwise they stay folded.
  - Three plumages, chosen per bird by hash: sparrow (brown), bluebird, and robin (red breast). Per-instance colours.
- **Minimap:**
  - A 200×150 canvas at the top right, under the online panel. **M** toggles a large centred view.
  - **Static layer**, drawn once per scene onto an offscreen canvas: grass, paths, water, buildings, hedges, trees as dots, and toy icons for the bench, boat, piano and so on.
  - **Each frame:** other players as dots in their body colour, and the player as an arrow.
  - Indoor scenes show the room outline and doors.
  - Pure helper: `worldToMap(x, z, size, w, h) → {u, v}`, which is unit-tested.

## 3. Round-blob characters *(chosen: round blobs)*

- **Shape:** a single egg-shaped body (about 0.95 m) whose upper half is the face: dot eyes, blush and a small mouth. Stubby sphere hands and bean feet.
- **Animations:** walking is a waddle (body roll plus feet), sitting tucks the feet forward, and each pose (`sit`, `swing`, `ride`, `row`, `drive`) has its own arm placement.
- **Attachment points** for clothes: `head` (hats), `body` (tops are a slightly larger shell over the lower half, recoloured), `face` (glasses), `back` (backpacks, capes), `neck` (scarves).
- **Look v2:** `{ body: '#rrggbb', eyes: 'dot' | 'happy' | 'sleepy', hat, top, face, back, neck }`, where each slot holds an item id or `'none'`.
  - Old profiles (`{body, skin, hat}`) are normalised on load: the body colour is kept, unknown hats map to a free hat or `'none'`, and the other slots become `'none'`.
- **Join screen:** pick a name, a body colour, an eye style and one free hat (none, beanie or cap). Everything else is in the wardrobe.

## 4. Knowledge Points and wardrobe

### 4.1 Earning *(chosen: 1 KP per completed focus minute)*

- When a focus phase completes, the player earns `focusMin` KP. Leaving early or disconnecting earns nothing.
- **Daily streak:**
  - The study day is the server's local date.
  - Completing a session on the day after `last_study_day` gives `streak + 1`. The same day leaves the streak unchanged. Anything else resets it to 1.
  - The first completion of each day adds a bonus of `5 × min(streak, 7)` KP.
- **Feed line:** "✨ Sam finished 25 min (+25 KP, 🔥3-day streak)".

### 4.2 Storage (SQLite, migrations run with `ALTER TABLE ... ADD COLUMN` guarded by `PRAGMA table_info`)

- `profiles` gains `kp INTEGER DEFAULT 0`, `streak INTEGER DEFAULT 0`, `last_study_day TEXT`, and `pet_json TEXT`.
- New tables:
  - `owned(profile_id, item_id, PRIMARY KEY(profile_id, item_id))`
  - `notes(id, profile_id, name, text, created_at)`
  - `daily(day TEXT PRIMARY KEY, minutes INTEGER)` for the knowledge tree.

### 4.3 Catalog

- The catalog lives in `shared/wardrobe.ts`: `{ id, slot, name, price, color?, model }`.
- **Free:** hats `none`, `beanie` and `cap`, and top `none`. Everything else costs 20–400 KP.
- **Items:**

| Slot | Items |
|---|---|
| Hats | bucket, flower crown, wizard, crown, frog hood, headphones, chef |
| Tops | tee, hoodie, overalls, sweater vest, raincoat |
| Face | round glasses, sunglasses, monocle |
| Back | backpack, cape, angel wings, guitar |
| Neck | scarf, bow tie, flower lei |

- **Pets** are in the same shop under their own tab (section 9).

### 4.4 Protocol

- `welcome` gains a private `wallet: { kp, streak, owned: string[], pet }`. `{t:'wallet', ...}` is sent to the player whenever it changes.
- **Client messages:**
  - `buy {itemId}`: the server checks the item exists, isn't already owned, and that `kp ≥ price`, then deducts the KP and adds ownership.
  - `adoptPet {kind, name}`: covered in section 9.
  - `updateLook {look}`: now validated by the World, so every equipped item must be free or owned, otherwise `bad_look`. The World persists it through the store.
- **Store:** the World receives an injected store (`ProfileStore`, or `:memory:` in tests).

### 4.5 Wardrobe UI

- Opened by ✏️, or by pressing E at the **Boutique** stall in the square (a client-local toy, kind `shop`).
- A modal with tabs (Hats, Tops, Face, Back, Neck, Colour and eyes, Pets), a grid of items showing price / Owned / Equipped, and a **live preview**: a small Three.js canvas rendering a turning blob with the outfit.
- **Buy** and **Wear** buttons. KP is shown in the status panel ("✨ 120 KP").

## 5. Study objects

- **Notice board** (square, beside the Library door):
  - E opens a modal listing the latest 30 notes. Each note is up to 140 characters, with its author and time.
  - Anyone can post: a 30 s cooldown and at most 5 notes per person on the board. Authors can delete their own notes.
  - Notes are persisted. Messages: `postNote {text}` and `deleteNote {id}`; the server sends `notes {list}` to the scene when they change and on request (`getNotes`).
- **Quote bookshelf** (Library, one shelf becomes a toy of kind `quotes`): E shows a random study quote from a client-side list of about 40, as a bubble over you. Local only.
- **Knowledge tree** (square): a tree whose size and blossoms grow with the **town's total focus minutes today**: 0, 60, 180, 360 and 600 minutes are stages 0 to 4. The server keeps `daily.minutes` and sends `tree {minutes}` in `welcome` and whenever it changes.
- **Do-not-disturb:**
  - A 🔕 HUD toggle (or key **N**) sets `PlayerView.dnd`.
  - While on: a 🔕 badge shows overhead, other players' "say hi" cards open read-only (no emotes sent), voice is muted both ways, and the desk lamp of a DND sitter glows red.
  - Message: `setDnd {on}`.

## 6. Coffee making

- **Coffee machine toy** (`coffee`, Café, in front of the counter): E opens the brewing modal.
  1. Pick a drink: espresso, latte, matcha, or cocoa.
  2. **Three timing steps** (grind, brew, pour): a marker sweeps across a bar, and Space stops it. Landing in the green zone earns a star.
  3. Result: 1–3 ★ (minimum 1).
- **Server:** `brew {drink, stars}` with a 20 s cooldown. You must be within the toy's radius. Stars are clamped to 1–3 (cosmetic, so trusted).
  - Effects: `PlayerView.holding = { item: drink, until: now + 10 min }`, plus a feed line "☕ Sam made a ★★★ latte".
- **Rendering:** a held cup in your hand (colour by drink) with a little steam. The existing ☕ emote makes you sip.

## 7. Truck *(folio-2025-inspired)*

- **Toy `truck`:** two trucks, one parked east of the square and one by the park.
  - Slots: a `drive` seat and three `sit` seats in the bed.
  - Visual: a cute rounded pickup with wheels that spin with speed and turn with steering.
- **Vehicles are generalised** in `shared/vehicles.ts`:

```
{ rowboat: { speed: 2.4, medium: 'water', home: true }, truck: { speed: 7, medium: 'land', home: false, radius: 1.1 } }
```

  - The rowboat code becomes vehicle code, and the slot poses `row` and `drive` are "controller" slots.
- **Driving (client):** controlled by direction, like the boat. Hold a direction and the truck turns toward it at 2.2 rad/s while accelerating to 7 m/s (acceleration 6, braking 10). Collisions use `moveWithCollision` with radius 1.1 against the colliders, and lake cells block it.
- **Server:** rejects poses faster than speed plus slack, inside the water, or inside a collider. Trucks stay where they're left (no return home).
- **Getting out:** you're placed 1.6 m to the left of the truck, or the right, or behind it: the first spot clear of colliders.
- **folio-2025 touches:**
  - Dust puffs behind the wheels when fast.
  - **H** honks (`use honk`, from any seat in the truck, cooldown 800 ms, shared sound).
  - Headlights glow and cast one pool light at night.
  - The camera pulls back while driving.
- **Minimap:** trucks appear as icons.

## 8. Proximity voice chat

- **Opting in:** a 🎙️ HUD button turns voice on and off (default off). Turning it on asks for the microphone and sets `PlayerView.voice = true`. While voice is on, **V** toggles mute.
- **Mesh:** every pair of players in the same scene with `voice` on (and neither in DND) opens an `RTCPeerConnection`.
  - Signalling is relayed by the server: `rtc {to, data}` → `rtc {from, data}`, only within the same scene, payload ≤ 8 KB.
  - Uses perfect negotiation, with "polite" set by comparing ids.
- **Audio:**
  - Each remote stream goes `MediaStreamSource → gain(distance) → StereoPanner → destination`, using the same distance curve as the toys: full volume within 4 m, silent beyond 25 m. It plays in every scene.
  - A muted `<audio>` element keeps Chrome pulling the stream.
  - A speaking indicator (an AnalyserNode with an RMS threshold) shows a pulsing 🔊 over the speaker.
- **Server configuration:**
  - `ICE_SERVERS` (JSON) is passed to clients in `welcome`. The default is `[{urls: 'stun:stun.l.google.com:19302'}]`, and a TURN server can be added later.
  - `TLS_CERT` / `TLS_KEY` (file paths) make the server serve **HTTPS + WSS** itself, because microphones need a secure context. Without them, voice works only on `localhost`, and the HUD explains why when you click the button on plain http.

## 9. Pets

- **Adopting:**
  - In the wardrobe's Pets tab: duckling 150 KP, kitten 200, bunny 200, frog 120.
  - `adoptPet {kind, name}`: your first pet costs KP, and switching to another owned kind is free. Saved in `pet_json`.
  - Toggle the pet out or away with the **P** key.
- **Brain:**
  - A tiny MLP policy, 10 → 32 → 32 → 2 with tanh, in `shared/pets/policy.json`.
  - **Inputs:** the owner's offset (dx, dz, scaled), distance, the owner's velocity, the pet's velocity, whether the owner is sitting, and 2 obstacle feelers.
  - **Output:** the pet's desired velocity (scaled to 3.6 m/s).
  - A **hand-written fallback brain** (follow, keep a distance of 1.2–2.5 m, wander when the owner is idle) runs if the policy file is missing.
- **Training:**
  - `pets/train.ts` runs **OpenAI-style Evolution Strategies** (a gradient-free RL method; pure TypeScript, no Python) on `shared/pets/sim.ts`. The sim is a 2D world with random obstacles and a scripted owner that walks, stops and sits.
  - **Reward:** staying 1.2–2.5 m from the owner, smooth motion, no collisions, and a little wandering when the owner is idle.
  - Training runs on **gpu-sys** with its portable Node. Only `policy.json` (a few KB) comes back. The sim is also used in a vitest test checking that the shipped policy beats random play.
- **Runtime:**
  - The owner's client simulates its own pet (policy plus collision) and sends `pet {x, z, facing, anim}` about 8 times a second.
  - The server checks speed and the same scene, then relays `petMoved`. `PlayerView.pet = {kind, name, x, z, facing}` or null.
  - Pets follow you through doors (they respawn next to you).
- **Visuals:** blob-style animals (duckling, kitten, bunny, frog) with a hop, a bob and a sit pose, plus a name tag on hover (shown when within 3 m).

## 10. Testing

- **Unit tests** (vitest):
  - KP awards and streak maths (pure function `awardFor(prevDay, streak, today, focusMin)`)
  - buying, look validation and old-look normalisation
  - notes (posting, cooldown, limits, deletion)
  - knowledge-tree stages
  - brew validation
  - vehicle rules (truck on land, boat on water, speed)
  - getting out of the truck
  - pet relay and validation
  - rtc relay scoping
  - `worldToMap`, policy forward pass and sim reward
- **Database migration test:** an old-schema database opens and upgrades.
- **Manual check:** one short headless-Chrome screenshot pass per phase, and a final run before deploy.
- **Review:** one final full review (per the user's preference), then push and deploy to gpu-sys.
