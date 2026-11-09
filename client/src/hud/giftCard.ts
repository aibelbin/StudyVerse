import type { Flower } from '../../../shared/garden';
import { holdName, type HoldItem } from '../../../shared/types';
import { GIFT_TTL_MS } from '../../../shared/constants';
import { h } from './dom';

let open: (() => void) | null = null;

/** "Sam offers you a ★★★ latte. [Accept] [No thanks]" with Y/N shortcuts; closes itself after 15 s. */
export function showGiftOffer(name: string, drink: HoldItem, stars: number, onAnswer: (accept: boolean) => void, flower?: Flower): void {
  open?.();
  const card = h('div', { className: 'glass gift-card' });
  let done = false;
  const answer = (accept: boolean | null) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    removeEventListener('keydown', keys, true);
    card.remove();
    open = null;
    if (accept !== null) onAnswer(accept);
  };
  const keys = (e: KeyboardEvent) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    const k = e.key.toLowerCase();
    if (k !== 'y' && k !== 'n') return;
    e.preventDefault();
    e.stopPropagation();
    answer(k === 'y');
  };
  const timer = setTimeout(() => answer(null), GIFT_TTL_MS); // the server tells the giver it timed out
  card.append(
    h('div', { className: 'gift-text', textContent: `🎁 ${name} offers you a ${stars ? `${'★'.repeat(stars)} ` : ''}${holdName({ item: drink, flower })}` }),
    h('div', { className: 'actions' },
      h('button', { className: 'primary', type: 'button', textContent: 'Accept (Y)', onclick: () => answer(true) }),
      h('button', { type: 'button', textContent: 'No thanks (N)', onclick: () => answer(false) }),
    ),
  );
  document.body.append(card);
  addEventListener('keydown', keys, true);
  open = () => answer(null);
}
