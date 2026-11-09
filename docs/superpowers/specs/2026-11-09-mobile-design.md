# Phone and Tablet Support

Date: 2026-11-09
Status: approved in chat.

The user chose:
- a floating virtual joystick
- landscape only
- a minimal HUD where the extra panels open when tapped

## Detection (`client/src/touch/detect.ts`)

`isTouchDevice(search, matchMedia)` is true when any of these hold:
- the URL has `?touch`
- `(pointer: coarse)` matches and `(hover: hover)` doesn't
- the URL has `?touch=0` (this forces it off)

When it's true, `body.touch` is set and the touch UI is built. Desktop is unchanged.

## Input (`client/src/game/input.ts`)

- **`stick`:** a vector `{x, z}` with length 0 to 1, set by the joystick.
- **`axis()`:** keeps the existing magnitude-1 keyboard direction; when no keys are down, it returns the stick instead. `game.ts` already multiplies the axis by speed, so a partly pushed stick walks slower.
- **`driveAxis()`:** throttle = −stick.z and steer = −stick.x, each with a 0.15 dead zone and rescaled. The keyboard wins whenever any drive key is down.
- **`press(key)` / `release(key)`:** run the same handlers as a key going down and up.

## Joystick (`client/src/touch/stick.ts`)

- **Area:** the left 45% of the screen. Pointer events with `pointerType` touch or pen only.
- **How it works:**
  - The first touch sets the joystick's centre and shows the base and knob.
  - Moving gives a vector of (offset / 60 px), clamped to length 1.
  - Lifting or cancelling hides it and zeroes the vector.
- **One finger:** it follows a single pointer id, so a second finger on the buttons doesn't interfere.
- **Off during golf:** disabled while a mini-golf hole is active.
- **Maths:** a pure function, `stickVector(dx, dy, radius, deadZone)`.

## Action buttons (`client/src/touch/actions.ts`)

`promptActions(text)` parses the current prompt into buttons:

| In the prompt | Becomes |
|---|---|
| `[E] sit down` | `{ key: 'e', label: 'Sit down', primary: true }` |
| `[Space] start a study session` | `{ key: ' ', label: 'Study' }` |
| `[C] sip…` | Sip |
| `[G] give…` | Give |
| `[H] honk` | Honk |
| `[Q] leave the hole` | Leave hole |
| `[1–8] play` | `{ piano: true }` |

- **Ignored:** movement hints (`[W/S]`, `[A/D]`, `[WASD]`, `drag`).
- **Labels:** a short readable label made from the hint text after the key, cut at " · ", capitalised, and trimmed to about 18 characters.
- **Layout:** the primary button is a large circle bottom-right. Secondary buttons are pills stacked above it. A piano row of 8 keys runs along the bottom middle.
- **Updates:** they're refreshed when the prompt text changes (`hud.setPrompt` already gets every change; it also notifies the touch UI). The text prompt pill itself is hidden on touch.
- **Pressing:** `press(key)` on pointerdown and `release(key)` on pointerup, so "hold" actions behave.

## HUD on touch (`client/src/touch/ui.ts`, CSS under `body.touch`)

**Hidden:** `#online`, `#feed`, the minimap canvas and the chat panel, until they're opened.

**`#status`** becomes a compact chip in the top left: name, session timer or KP, and DND.

**Top-right round buttons:**

| Button | Opens |
|---|---|
| 💬 | The chat panel as a sheet (`body.chat-open`), with a red dot for unread messages. While the input has focus, the sheet's bottom follows `visualViewport` so it stays above the keyboard. |
| 😊 | The emote wheel; tapping a segment plays it. |
| ☰ | A menu sheet with the online list (moved in while open), recent feed items, and buttons for the big map, do-not-disturb, voice, sound, graphics quality and Edit look. These reuse the existing HUD callbacks. |

**Other changes:**
- **Feed:** new feed items show as toasts.
- **Modals:** wider tap targets (min-height 44 px), scrollable content, max-height 92vh.
- **Portrait:** shows a "Turn your phone sideways 🔄" overlay (CSS `@media (orientation: portrait)` under `body.touch`).
- **No zooming or scrolling:** the viewport meta is `maximum-scale=1, user-scalable=no`, with `touch-action: none` on the canvas and HUD controls and `overscroll-behavior: none` on body. A `gesturestart` handler prevents pinch-zoom on iOS.

## Rendering

- **Quality:** on touch devices it defaults to `lite` when nothing is saved yet.
- **Pixel ratio:** capped at 1.25 on touch, instead of 1.5.

## Home screen

- **Manifest:** `client/public/manifest.webmanifest` with name, `display: fullscreen`, `orientation: landscape`, the theme colour and an icon (an SVG data icon plus a 192 px PNG drawn at build time; keep it simple with the SVG).
- **Meta tags:** `apple-mobile-web-app-capable` and the status bar style.

## Tests

- **Parser:** `promptActions` handles every prompt format in `game.ts` (drive, row, piano, study, cup, golf, garden), and ignores movement keys.
- **Joystick:** `stickVector` covers the dead zone, clamping and direction. The drive axis comes from the stick, and the keyboard wins.
- **Detection:** `isTouchDevice` handles the overrides and the media queries.
- **Headless, at 844 × 390 with touch emulation and `?touch`:** joystick walking (real touch events through CDP), sit plus study button, piano keys, chat sheet, menu, golf putt by touch-drag, and the portrait overlay at 390 × 844.
