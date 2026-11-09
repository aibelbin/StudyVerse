import { FLOWERS } from '../../../shared/garden';
import { GIFTS, type BagItem } from '../../../shared/gifts';
import { h } from './dom';
import { FLOWER_EMOJI } from './garden';
import type { Hud } from './hud';

export interface Person {
  id: string;
  name: string;
  /** Metres away if in the same place, else null. */
  dist: number | null;
}

export const itemEmoji = (i: BagItem) => (i.kind === 'gift' ? GIFTS[i.gift].emoji : FLOWER_EMOJI[i.flower] ?? '💐');
export const itemName = (i: BagItem) => (i.kind === 'gift' ? GIFTS[i.gift].name : `bouquet of ${FLOWERS[i.flower].plural}`);

/** Nearby people first (closest first), then everyone else online, alphabetically. */
export function orderPeople(list: Person[]): Person[] {
  return [...list].sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9) || a.name.localeCompare(b.name));
}

/** Same kind of thing stacked: one tile per gift or flower, with a count. */
export function stackItems(items: BagItem[]): { key: string; first: BagItem; count: number }[] {
  const out = new Map<string, { key: string; first: BagItem; count: number }>();
  for (const i of items) {
    const key = i.kind === 'gift' ? `g:${i.gift}` : `f:${i.flower}`;
    const e = out.get(key);
    if (e) e.count++;
    else out.set(key, { key, first: i, count: 1 });
  }
  return [...out.values()];
}

/** Pick who gets an item: nearby people first. */
function pickPerson(hud: Hud, item: BagItem, people: Person[], onPick: (id: string, name: string) => void): void {
  const list = orderPeople(people);
  hud.openModal(h('div', {},
    h('h2', { textContent: `${itemEmoji(item)} Give the ${itemName(item)} to…` }),
    list.length
      ? h('div', { className: 'people' }, ...list.map((p) => h('button', {
        type: 'button', className: 'person',
        onclick: () => {
          hud.finishModal();
          onPick(p.id, p.name);
        },
      }, h('b', { textContent: p.name }), h('span', { textContent: p.dist === null ? 'elsewhere in town' : p.dist < 4 ? 'right here' : `${Math.round(p.dist)} m away` }))))
      : h('p', { className: 'sub', textContent: 'Nobody else is online right now.' }),
  ), undefined, true);
}

export interface BagOpts {
  items: BagItem[];
  people: Person[];
  give: (id: number, to: string) => void;
  /** Put a bouquet in your plot's vase (when standing at it). */
  vase?: (flower: string) => void;
}

/** 🎒 Your bag: gifts and bouquets; tap one to give it to someone. */
export function openBag(hud: Hud, o: BagOpts): void {
  const stacks = stackItems(o.items);
  hud.openModal(h('div', {},
    h('h2', { textContent: '🎒 Your bag' }),
    stacks.length
      ? h('div', { className: 'gift-grid' }, ...stacks.map((s) => h('button', {
        type: 'button', className: 'gift-tile',
        onclick: () => pickPerson(hud, s.first, o.people, (to, name) => {
          o.give(s.first.id, to);
          hud.toast(`${itemEmoji(s.first)} Sent to ${name}!`, 2500);
        }),
      }, h('span', { className: 'gift-emoji', textContent: itemEmoji(s.first) }), h('b', { textContent: itemName(s.first) }), h('span', { textContent: s.count > 1 ? `×${s.count} · tap to give` : 'tap to give' }))))
      : h('p', { className: 'sub', textContent: 'Empty for now. Buy gifts at the 🎁 stall in the square, or pick bouquets in your garden.' }),
  ), undefined, true);
}

/** The player card's 🎁: give something from your bag to this person. */
export function bagFor(items: BagItem[], onGive: (id: number) => void): HTMLElement | null {
  const stacks = stackItems(items);
  if (!stacks.length) return null;
  return h('div', {},
    h('h3', { textContent: 'From your bag' }),
    h('div', { className: 'gift-grid' }, ...stacks.map((s) => h('button', {
      type: 'button', className: 'gift-tile', onclick: () => onGive(s.first.id),
    }, h('span', { className: 'gift-emoji', textContent: itemEmoji(s.first) }), h('b', { textContent: itemName(s.first) }), h('span', { textContent: s.count > 1 ? `×${s.count} · Give` : 'Give' })))));
}
