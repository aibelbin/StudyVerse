# Chat and Emotes

Date: 2026-11-09
Status: approved in chat. The user's choices:
- Global chat as a panel, plus speech bubbles.
- Direct messages (DMs) in tabs.
- Recent history kept.
- An emote wheel with animations, plus reactions on messages.
- A rate limit as the only safety control.
- All emotes free.

## 1. Chat

### 1.1 Data

```ts
// shared/types.ts
interface ChatMsg {
  id: number;
  from: string;      // profile id
  fromName: string;
  to: string | null; // null = Everyone
  text: string;
  at: number;
  reactions: Record<string, string[]>; // emoji -> profile ids
}
const REACTIONS = ['👍', '❤️', '😂', '😮', '🎉'];
```

Constants: `CHAT_MAX = 200`, `CHAT_KEEP = 100`, `CHAT_GAP_MS = 1000`, `CHAT_BURST = 5` per `CHAT_WINDOW_MS = 10000`.

### 1.2 Protocol

| Direction | Message | Notes |
|---|---|---|
| Client | `{ t: 'chat', text, to? }` | Text is trimmed, 1 to 200 characters, no control characters. `to` is a profile id. |
| Client | `{ t: 'react', id, emoji }` | Toggles that player's reaction. `emoji` must be one of `REACTIONS`. |
| Server | `{ t: 'chat', msg }` | A new message. |
| Server | `{ t: 'chatReact', id, reactions }` | Updated reactions for one message. |
| Server | `welcome.chat: ChatMsg[]` | History (see §1.3). |

New `ErrorCode` values:
- `chat_slow`: shown as the toast "Slow down a little 🐢".
- `bad_chat`: the recipient is unknown or the player messaged themselves.

### 1.3 Server

**Storage** is a SQLite table:

```sql
chat(id PK, pair, from_id, from_name, to_id, text, at, reactions_json)
```

- `pair` is `'global'`, or for DMs the two profile ids sorted and joined with `|`.
- Each insert deletes rows in that pair beyond the newest `CHAT_KEEP`.

**Rate limit:** each player's recent send times are kept in memory. A message is refused if it comes less than `CHAT_GAP_MS` after the last one, or if there were already `CHAT_BURST` in the last `CHAT_WINDOW_MS`.

**Delivery:**
- **Everyone** messages go to every connected player in any scene.
- **DMs** go to the sender and, if connected, the recipient.
  - The recipient must be a known profile, found with `store.profileName`.
  - Players can't DM themselves.

**History** is sent in `welcome`:
- the last 100 Everyone messages
- the latest 300 DMs involving the player
- in id order

**Reactions:**
- The message must exist and the reacting player must be able to see it: either it's an Everyone message, or they're its sender or recipient.
- A reaction toggles that player's id in the emoji's list.
- The update is broadcast to the message's audience.
- There's a 300 ms gap between reactions.

### 1.4 Client

**Panel** (`client/src/hud/chat.ts`), bottom left, with the activity feed sitting just above it:
- **Collapsed:** a tab bar, plus the latest Everyone messages peeking for 8 seconds.
- **Expanded:** the message list, about 220 px tall, and the input.
- **Keys:** **Enter** expands and focuses the input. Enter sends, and Enter on an empty box collapses the panel. **Esc** blurs and collapses.

**Tabs:**
- **Everyone**, plus one per DM partner, named by their last-known name.
- **Unread badges:** each tab's last-read message id is stored in `localStorage['sv-chat-read']`. Unread means messages from others with a higher id. Viewing a tab while expanded marks it read.

**Messages:**
- Each line shows the bold name, the text, and the time on hover.
- Reaction chips show the emoji and a count, highlighted if one is yours. Clicking a chip toggles it, and a "＋" opens the five-reaction picker.

**Bubbles:** an Everyone message from someone in your scene shows a speech bubble over their head for 6 seconds (60-character preview). A newer message replaces the bubble.

**Starting a DM:**
- a 💬 **Message** button on the player card
- clicking a name in the online list (not your own)

**Pings:** a DM arriving while its tab isn't open shows a toast ("💬 Sam: hey…") unless you're on do-not-disturb.

## 2. Emotes

**The set:** `Act = 'wave' | 'cheer' | 'dance' | 'laugh' | 'love' | 'think' | 'sleepy' | 'clap'`, all free.

**Protocol:**
- `{ t: 'act', kind }` from the client, with a 1.5 s gap per player.
- `{ t: 'act', fromId, kind }` broadcast to the scene, including the sender.

**Wheel** (`client/src/hud/emoteWheel.ts`):
- Hold **T** to show a radial wheel of the eight emotes in the middle of the screen.
- Moving the pointer highlights a segment. Releasing T on a highlighted segment plays it.
- Clicking a segment also plays it.
- Releasing T without a highlight leaves the wheel open. Esc or T closes it.

**Animation** (`Character.act(kind, now)`):

| Emote | Animation | Length |
|---|---|---|
| 👋 wave | right arm up and waving | 2.5 s |
| 🙌 cheer | hops, arms up | 2.5 s |
| 💃 dance | sways, hops, swings its arms | 4 s |
| 😂 laugh | shakes and leans back | 2.5 s |
| 💖 love | squishes, three hearts float up | 2.5 s |
| 🤔 think | hand to chin, head tilt, "…" | 2.5 s |
| 😴 sleepy | droops, eyes half-closed, Zzz | 2.5 s |
| 👏 clap | hands meet in front | 2.5 s |

- Each emote also pops its emoji above the head.
- Seated players move only their arms and head tilt; legs and hops are skipped.
- Walking cancels an emote.

The existing targeted emotes on the player card (👋 👏 💪 ☕) are unchanged.

## 3. Tests

- **Store:** messages trimmed to 100 per pair; history for a profile; reactions saved.
- **World:**
  - Everyone messages reach players in other scenes.
  - DMs reach only the pair, and offline DMs arrive in history.
  - DMs to unknown people or to yourself are refused.
  - Rate limit, both the gap and the burst.
  - Reaction toggling, visibility and broadcast.
  - The `act` broadcast and its rate limit.
- **Validation:** chat, react and act.
- **Client:** unread counting and the emote-wheel segment maths.
- **Headless:** send a message, check the bubble, open a DM tab, react, and play an emote.
