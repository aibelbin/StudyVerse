import { GIFT_KINDS, GIFTS, STATUS_MINUTES, STATUS_PRESETS, STATUS_TEXT_MAX, type Gift, type Keepsake, type Status } from '../../../shared/gifts';
import type { PlayerView, Wallet } from '../../../shared/types';
import type { BagItem } from '../../../shared/gifts';
import { bagFor } from './bag';
import { h } from './dom';
import { FLOWER_EMOJI } from './garden';
import type { Hud } from './hud';

const price = (g: Gift, w: Wallet | null) => (w?.admin ? 'free' : `${GIFTS[g].price} ✨`);
const afford = (g: Gift, w: Wallet | null) => !!w && (w.admin || w.kp >= GIFTS[g].price);

function giftGrid(w: Wallet | null, label: string, onPick: (g: Gift) => void): HTMLElement {
  return h('div', { className: 'gift-grid' }, ...GIFT_KINDS.map((g) => h('button', {
    type: 'button', className: 'gift-tile', disabled: !afford(g, w), onclick: () => onPick(g),
  }, h('span', { className: 'gift-emoji', textContent: GIFTS[g].emoji }), h('b', { textContent: GIFTS[g].name }), h('span', { textContent: `${label} · ${price(g, w)}` }))));
}

/** The gift stall: gifts go into your bag (🎒, or I) to give whenever you like. */
export function openGiftShop(hud: Hud, wallet: Wallet | null, onBuy: (g: Gift) => void): void {
  hud.openModal(h('div', {},
    h('h2', { textContent: '🎁 Gift stall' }),
    h('p', { className: 'sub', textContent: 'Gifts go into your 🎒 bag (I). Give them to anyone from there, or from their player card.' }),
    giftGrid(wallet, 'Add to bag', (g) => {
      onBuy(g);
      hud.toast(`${GIFTS[g].emoji} ${GIFTS[g].name} added to your bag 🎒`, 2500);
    }),
  ), undefined, true);
}

/** From a player card: give them something from your bag, or buy one and send it right away. */
export function openGiftPicker(hud: Hud, name: string, wallet: Wallet | null, bag: BagItem[], onGive: (id: number) => void, onBuySend: (g: Gift) => void): void {
  const fromBag = bagFor(bag, (id) => {
    hud.finishModal();
    onGive(id);
  });
  hud.openModal(h('div', {},
    h('h2', { textContent: `🎁 A gift for ${name}` }),
    h('p', { className: 'sub', textContent: 'It lands on their keepsakes shelf right away, even if they are somewhere else in town.' }),
    ...(fromBag ? [fromBag] : []),
    h('h3', { textContent: fromBag ? 'Or buy one and send it now' : 'Buy one and send it now' }),
    giftGrid(wallet, 'Send', (g) => {
      hud.finishModal();
      onBuySend(g);
    }),
  ), undefined, true);
}

/** A row of keepsakes (newest first); on your own, eatable and releasable ones get a button. */
export function keepsakeShelf(list: Keepsake[], count: number, onUse?: (k: Keepsake) => void): HTMLElement {
  if (!count) return h('div', { className: 'sub', textContent: 'No keepsakes yet 🎁' });
  return h('div', { className: 'keepsakes' },
    h('div', { className: 'sub', textContent: `🎁 Keepsakes · ${count}` }),
    h('div', { className: 'keepsake-row' }, ...list.map((k) => {
      const use = GIFTS[k.gift].use;
      const emoji = k.flower ? FLOWER_EMOJI[k.flower] : GIFTS[k.gift].emoji;
      return h('div', { className: 'keepsake', title: `${k.flower ? `bouquet of ${k.flower}s` : GIFTS[k.gift].name} from ${k.fromName}` },
        h('span', { className: 'gift-emoji', textContent: emoji }),
        h('span', { className: 'from', textContent: k.fromName }),
        ...(onUse && use ? [h('button', { type: 'button', className: 'mini', textContent: use === 'eat' ? 'Eat' : 'Let go', onclick: () => onUse(k) })] : []));
    })));
}

export const moodText = (s: Status | null | undefined) => (s ? `${s.emoji} ${s.text}`.trim() : '');

/** "You": set your status (presets or your own) and see your keepsakes. */
export function openMe(hud: Hud, me: PlayerView, onStatus: (emoji: string, text: string, minutes: number | null) => void, onUse: (k: Keepsake) => void): void {
  let minutes: number | null = 60;
  const emoji = h('input', { type: 'text', maxLength: 8, value: me.status?.emoji ?? '💭', className: 'status-emoji' });
  const text = h('input', { type: 'text', maxLength: STATUS_TEXT_MAX, value: me.status?.text ?? '', placeholder: 'What are you up to?' });
  const durs = h('div', { className: 'status-durs' });
  const renderDurs = () => durs.replaceChildren(...([...STATUS_MINUTES, null] as (number | null)[]).map((m) => h('button', {
    type: 'button', className: `mini${m === minutes ? ' on' : ''}`, textContent: m === null ? 'Until I clear it' : m >= 60 ? `${m / 60} h` : `${m} min`,
    onclick: () => {
      minutes = m;
      renderDurs();
    },
  })));
  renderDurs();
  const set = (e: string, t: string) => {
    hud.finishModal();
    onStatus(e, t, minutes);
  };
  for (const el of [emoji, text]) el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') set(emoji.value, text.value);
  });
  hud.openModal(h('div', { className: 'me-modal' },
    h('h2', { textContent: `🙂 ${me.name}` }),
    h('div', { className: 'sub', textContent: me.status ? `Now: ${moodText(me.status)}` : 'No status set' }),
    h('div', { className: 'status-presets' }, ...STATUS_PRESETS.map((p) => h('button', { type: 'button', textContent: `${p.emoji} ${p.text}`, onclick: () => set(p.emoji, p.text) }))),
    h('div', { className: 'status-custom' }, emoji, text),
    durs,
    h('div', { className: 'actions' },
      h('button', { type: 'button', className: 'primary', textContent: 'Set status', onclick: () => set(emoji.value, text.value) }),
      ...(me.status ? [h('button', { type: 'button', textContent: 'Clear', onclick: () => set('', '') })] : [])),
    h('hr'),
    keepsakeShelf(me.keepsakes, me.keepsakeCount, (k) => {
      hud.finishModal();
      onUse(k);
    }),
  ), undefined, true);
}
