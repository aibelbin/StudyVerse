# Gifts, Keepsakes, Status, Fresh Chat and Admin

Date: 2026-11-09
Status: approved in chat. Gifts can be given both ways (in person and from the player card); received gifts go to a keepsakes shelf; status has presets plus custom text and a timer.

## Gifts (`shared/gifts.ts`)

| Gift | Price (KP) | Note |
|---|---|---|
| letter 💌 | 5 | |
| cookie 🍪 | 6 | eatable |
| balloon 🎈 | 8 | can be released |
| cupcake 🧁 | 10 | eatable |
| cactus 🌵 | 12 | |
| bouquet 💐 | 15 | |
| duck 🦆 | 18 | |
| box 🎁 | 20 | |
| bear 🧸 | 25 | |
| starJar ✨ | 30 | |

### Gift stall

- **Toy:** `giftShop` in the square, at (5.5, −28): east of the plaza and off the paths.
- **Opening it:** a local toy; E opens the shop modal.
- **In the shop:**
  - Each gift shows its price.
  - **Carry** costs the KP and puts the gift in your hands: `holding: { item: 'gift', gift }`. It's refused if your hands are full.
- **Message:** `buyGift { gift }`.

### Giving in person

- **How:** the existing offer flow (`offerCoffee` / `answerCoffee`) now accepts a held gift too.
- **When accepted:** the gift moves into the receiver's keepsakes (it doesn't stay in their hands) and the giver's hands empty.

### Sending from anywhere

- **Message:** `sendGift { to, gift }`.
  - **Who can receive it:** any known profile, online or not, but not yourself.
  - **Cost:** the price in KP, charged to the sender.
  - **Rate limit:** one every 10 s (`GIFT_SEND_GAP_MS`).
- **The receiver**, if online, gets the server message `giftReceived { from, gift, fromId }`: a toast plus a heart burst over them. Players in the same scene also see the burst.

### Feed

`🧸 Sam gave Jo a plushie bear`.

## Keepsakes

**Storage:**

```sql
keepsakes(id, to_id, from_id, from_name, gift, at)
```

**Player data:** `PlayerView.keepsakes` holds the newest 12 as `{ id, gift, fromName }`, plus `keepsakeCount`. It updates through the existing `playerUpdated` message.

**Using a keepsake:** the message `useKeepsake { id }` works on your own keepsakes:
- **Cupcake or cookie:** eating it deletes it and plays the `love` act.
- **Balloon:** letting it go deletes it and broadcasts `balloonUp { id, x, z, color }` to the scene. Clients show a balloon rising for 8 s.

**Card:** the player card shows a Keepsakes shelf. On your own card, keepsakes that can be used get **Eat** or **Let go** buttons. The online list gets a 🎁 button.

## Status

**`PlayerView.status`:** `{ emoji, text, until: number | null } | null`.

**Message:** `setStatus { emoji, text, minutes: 30 | 60 | 240 | null }`.
- Text is up to 40 characters, with control characters stripped.
- Emoji is up to 8 characters.
- An empty text with no emoji clears the status.

**Expiry:** `tick` clears statuses whose time has passed.

**Presets:**
- 🍜 Eating
- 😴 Napping
- 📚 Studying
- ☕ Coffee break
- 🚶 Be right back
- 🎧 In the zone

**Where it's set:** clicking your name in the status panel (on touch, the status chip) opens the picker.

**Where it shows:**
- a pill over the head (Overhead)
- the online list
- the player card

**Storage:** in memory (it survives reconnects within the grace period).

## Fresh chat for newcomers

`chatFor` only returns Everyone messages with `at ≥` the profile's `created_at`. DMs are unchanged.

## Admin

- **Setting:** `ADMIN_IDS` is a comma-separated list of profile IDs in the environment.
- **Wallet:** admins get `Wallet.admin = true`.
- **Buying:** costs nothing for admins, covering wardrobe, pets, seeds and gifts (`store.buy` with price 0 still records ownership).
- **Display:** the HUD shows `✨ ∞ KP`.
- **Deploy:** the ID is looked up on gpu-sys at deploy time (Aibel's profile) and added to `deploy.ps1`.

## Tests

- **World:**
  - Buying a gift to carry, then giving it in person, which adds it to keepsakes.
  - Sending a gift from the card, with the rate limit, the KP charge and refusal when you're short.
  - Eating and releasing keepsakes.
  - Setting a status, its expiry and clearing it.
  - Admin purchases cost 0.
  - Newcomers don't see older Everyone chat.
- **Store:** keepsakes.
- **Validation:** all new messages.
- **Client:** the status picker and keepsake shelf render without errors (pure helpers where possible).
- **Headless:** check all of this end to end.
