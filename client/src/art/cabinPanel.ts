import { art } from '../net/server';
import { type PaintingMeta, type SpotPick } from '../../../shared/art';
import { FLOWERS } from '../../../shared/garden';
import { GIFTS, type BagItem, type Keepsake } from '../../../shared/gifts';
import type { Spot } from '../../../shared/scenes/types';
import { h } from '../hud/dom';
import { FLOWER_EMOJI } from '../hud/garden';
import type { Hud } from '../hud/hud';

export interface SpotPickerOpts {
  /** Your own paintings and the prints you bought. */
  paintings: PaintingMeta[];
  keepsakes: Keepsake[];
  bouquets: BagItem[];
  pick: (item: SpotPick) => void;
}

function tile(hud: Hud, face: HTMLElement, name: string, sub: string, item: SpotPick, pick: (item: SpotPick) => void): HTMLElement {
  return h('button', {
    type: 'button', className: 'gift-tile',
    onclick: () => {
      hud.finishModal();
      pick(item);
    },
  }, face, h('b', { textContent: name }), h('span', { textContent: sub }));
}

const emoji = (text: string) => h('span', { className: 'gift-emoji', textContent: text });

/** E at an empty spot in your cabin: a painting for a wall, a keepsake or a bouquet for a shelf. */
export function openSpotPicker(hud: Hud, spot: Spot, o: SpotPickerOpts): void {
  const tiles: HTMLElement[] = [];
  if (spot.kind === 'wall') {
    for (const p of o.paintings) {
      const img = h('img', { className: `spot-thumb${p.mode === 'pixel' ? ' pixel' : ''}`, src: art(p.id), alt: p.title, loading: 'lazy' });
      tiles.push(tile(hud, img, p.title, `by ${p.artistName}`, { kind: 'painting', id: p.id }, o.pick));
    }
  } else {
    for (const k of o.keepsakes) {
      const name = k.flower ? `bouquet of ${FLOWERS[k.flower].plural}` : GIFTS[k.gift].name;
      tiles.push(tile(hud, emoji(k.flower ? FLOWER_EMOJI[k.flower] : GIFTS[k.gift].emoji), name, `from ${k.fromName}`, { kind: 'keepsake', id: k.id }, o.pick));
    }
    for (const b of o.bouquets) {
      if (b.kind !== 'bouquet') continue;
      tiles.push(tile(hud, emoji(FLOWER_EMOJI[b.flower] ?? '💐'), `bouquet of ${FLOWERS[b.flower].plural}`, 'from your bag', { kind: 'bouquet', id: b.id }, o.pick));
    }
  }
  const empty = spot.kind === 'wall'
    ? 'No paintings yet. Paint one at an easel in the Studio, or buy a print from its gallery wall.'
    : 'Nothing to put here yet. Keepsakes people give you and bouquets from your garden show up here.';
  hud.openModal(h('div', {},
    h('h2', { textContent: spot.kind === 'wall' ? '🖼 Hang a painting' : '🎁 Put something on the shelf' }),
    tiles.length ? h('div', { className: 'gift-grid' }, ...tiles) : h('p', { className: 'sub', textContent: empty }),
  ), undefined, true);
}
