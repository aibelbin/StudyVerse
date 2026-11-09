# Chat and Emotes Implementation Plan

> Executed inline. One full review runs at the end (user preference: no per-step reviews).

**Goal:** implement `docs/superpowers/specs/2026-11-09-chat-emotes-design.md`.

## Task 1: Shared types, protocol, validation

- **Shared:**
  - `shared/types.ts`: `ChatMsg`, `REACTIONS`, `Act`, `ACTS`.
  - `shared/constants.ts`: the chat constants.
  - `shared/protocol.ts`: `chat`, `react` and `act` messages; `chatReact`; `welcome.chat`; errors `chat_slow` and `bad_chat`.
- **Validation:** `server/src/validate.ts` checks chat text, `to`, `react id/emoji` and `act kind`, with tests in `validate.test.ts`.

## Task 2: Store and World

- **Store:** `server/src/db.ts` adds the `chat` table and the methods `addChat`, `chatFor`, `chatById`, `setReactions` and `profileName`, with tests in `db.test.ts`.
- **World:** `server/src/world.ts` adds `chat()`, `react()` and `act()`, the rate limits, and history in `welcome`. Tests go in a new `server/src/world.chat.test.ts`.

## Task 3: Client chat panel

- **New files:**
  - `client/src/hud/chat.ts`: the panel, tabs, unread counts (pure `unreadCount` helper, tested), reactions, input.
  - `client/src/hud/chat.test.ts`.
- **Edits:**
  - `index.html`: add `#chat`.
  - `style.css`.
  - `hud.ts`: Message button on the card, clickable online names.
  - `main.ts` / `game.ts`: Enter key, bubbles via `Overhead.bubble()`, DM toasts.

## Task 4: Emotes

- **New files:**
  - `client/src/hud/emoteWheel.ts`: the wheel, with pure `segmentAt(dx, dy, n)` (tested).
  - `client/src/hud/emoteWheel.test.ts`.
- **Edits:**
  - `client/src/game/input.ts`: `onUp`.
  - `client/src/world/character.ts`: `act()` and its animations.
  - `client/src/game/game.ts`: T handling and the `act` message.

## Task 5: Final checks

README, headless checks, one review, push. Ask before deploying.
