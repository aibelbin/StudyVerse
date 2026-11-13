# Post Office and Observatory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Letters between players via a village post box and per-cabin mailboxes with a visible unread flag; an observatory where players draw one constellation each that appears in everyone's night sky, plus shared shooting stars.

**Architecture:** Server logic in new `server/src/mail.ts` and `server/src/sky.ts` (same `Port` pattern as `cabins.ts`/`studio.ts`); shared types in `shared/mail.ts` and `shared/stars.ts`; village layout additions in `shared/scenes/village.ts`; client UI in `client/src/art/mail.ts` and `client/src/art/stars.ts`; sky drawing in `client/src/world/sky.ts`. `world.ts`, `game.ts`, `main.ts` only gain wiring.

**Tech Stack:** TypeScript, Three.js, Node 24 `node:sqlite`, `ws`, Vite, Vitest. Spec: `docs/superpowers/specs/2026-11-13-post-office-observatory-design.md`.

## Global Constraints

- Exact values: `LETTER_MAX = 280`, `LETTER_GAP_MS = 30_000`, `LETTERS_PER_DAY = 20`, inbox `MAIL_SHOWN = 50`; `STAR_COUNT = 120`, star seed `4242`, `CONSTELLATION_EDGES = 8`, name ≤ `TITLE_MAX` (24); village depth `26 + 12·rows`; night gate `night >= 0.5`; shooting stars only when `night > 0.6`, seeded by `Math.floor(serverNow() / 30_000)`.
- Letters are private: never broadcast, never in the feed.
- A mailbox flag change must not rebuild the village.
- Ponytail rules; follow the round-1/2 patterns (`Port`, `Cabins`, `Studio`, `ArtRooms`, `NotesBoard`-style modals, LOCAL toys).
- Never start a browser, headless Chrome, Vite dev server or watch process on the Mac. Verify with typecheck, focused vitest, one `npm test`, one `npm run build`.
- No AI attribution in commits.

### Task 1: Shared types, protocol, validation, store

`shared/mail.ts` (`Letter { id, from, fromName, to, text, at, read }`, limits), `shared/stars.ts` (`starField(seed, n) → { x, y, mag }[]` with `rng`, `Constellation { owner, ownerName, name, edges }`, `isConstellationInput(name, edges)`), `CabinEntry.mail: boolean`, `ToyKind` += `'postBox' | 'mailbox' | 'observatory'` (LOCAL; `server/src/toys.ts` `none`), `DecorKind` += `'mailbox' | 'observatory'` (placeholder builders `() => group()` until Task 2), protocol: client `sendLetter {to,text}`, `getMail`, `readMail`, `deleteLetter {id}`, `saveConstellation {name, edges}`, admin action `deleteLetter {id}`; server `letter {letter}`, `mail {letters}`, `sky {constellations}`; `welcome` += `unread: number`, `constellations: Constellation[]`; errors `bad_letter`, `bad_star`. `validate.ts` + tests. `db.ts`: tables `letters`, `constellations`; methods `addLetter`, `letters(to, limit)`, `unreadCount(to)`, `markRead(to)`, `deleteLetter(id, to)`, `deleteLetterAny(id)`, `lettersSentSince(from, since)`, `setConstellation(owner, name, edges, at)`, `constellations()` (JOIN profiles for names); `cabins()` returns `mail` (EXISTS unread letter). Placeholders in world.ts for new welcome fields. Commit `feat: letters and constellations — types, messages, store`.

### Task 2: Village layout

`shared/art.ts` `villageSize` d → `26 + 12·rows` (update tests); `shared/scenes/village.ts`: post office building at (14, hd−11), `postBox` toy at (14, hd−7.4), path spur to it; per occupied lot `mailbox` decor (accent `'up'|'down'` from `mail`) + LOCAL toy `mailbox-<owner>` at (x+1.9, z+2.9); north hill: `mound` decor + `observatory` decor at (0, −hd+6) and toy `stargaze` (kind `observatory`) at (0, −hd+8.5); lane extends to it. `client/src/world/decor.ts` builders `mailbox` (post, box, red flag raised when `accent === 'up'`, flag mesh named `'flag'`) and `observatory` (round hut, dome with slit, telescope tube); minimap draws `observatory` like a building. Client prompts/views for the 3 toys in `client/src/toys/registry.ts`/`local.ts` (`[E] write a letter ✉️`, `[E] look at the stars 🔭`; mailbox prompt decided in Task 3 — register a plain view here). Scene invariant tests for rosters 0/1/7 must pass. Commit `feat: post office, mailboxes and the observatory hill in the village`.

### Task 3: Server mail + sky modules

`server/src/mail.ts` `Mail(store, port)`: `send`, `list` (`mail` msg), `read` (mark read → cabins roster refresh + broadcast via a `Port.rosterChanged()` or the existing Cabins broadcast), `remove`, `adminRemove`; welcome `unread`. `server/src/sky.ts` `Sky(store, port)`: `save` (validate, upsert, broadcast `sky` to all), welcome `constellations`. Wire in world.ts. Tests `server/src/world.mail.test.ts`, `world.sky.test.ts` per the spec's Testing list. Commit `feat: send and read letters; save constellations`.

### Task 4: Client mail

`client/src/art/mail.ts`: `openWriter(hud, people, to?, onSend)`, `openInbox(hud, letters, onReply, onDelete)`, `mailFlags(prev, next) → owners whose mail changed` (+ test). Game: a mailbox prompt (`[E] check your mail 📬` on your own, `{name}'s mailbox` text-only for others — no E), flag toggle on `village` messages without rebuild (find the `flag` mesh in the cabin's mailbox decor group by owner; if the runtime layout makes that hard, keep a `Map<owner, Object3D>` built in `enter()`), HUD ✉️ button with an unread dot. main.ts: `postBox` → writer, own mailbox / HUD → `getMail` then inbox; `readMail` when the inbox opens; toasts for `letter` and the login `unread`. Commit `feat: write, receive and read letters; mailbox flags`.

### Task 5: Client stars

`client/src/art/stars.ts` editor per spec; `client/src/world/sky.ts`: constellation `LineSegments` on the night dome from `starField` (same projection helper used by the editor's preview), opacity × night; shooting stars. Game/main: `observatory` local toy → night gate → editor → `saveConstellation`; `sky`/welcome constellations → sky. One pure test for the projection helper or shooting-star schedule. Commit `feat: draw your constellation; everyone's are in the night sky; shooting stars`.

### Task 6 (controller): review + fix, merge, deploy, walk on wolf.
