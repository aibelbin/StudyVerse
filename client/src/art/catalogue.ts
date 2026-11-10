import { FOR_SALE_MAX, artUrl, type PaintingMeta } from '../../../shared/art';
import type { ClientMsg } from '../../../shared/protocol';
import type { Wallet } from '../../../shared/types';
import { h } from '../hud/dom';
import type { Hud } from '../hud/hud';

type Tab = 'sale' | 'mine';

/** The gallery catalogue: browse and buy prints, and manage your own paintings. */
export class Catalogue {
  private body = h('div', { className: 'art-body' });
  private open = false;
  private tab: Tab = 'sale';
  private gallery: PaintingMeta[] = [];
  private mine: PaintingMeta[] = [];
  private prints: PaintingMeta[] = [];

  constructor(private hud: Hud, private wallet: () => Wallet | null, private meId: () => string, private send: (m: ClientMsg) => void) {}

  setGallery(list: PaintingMeta[]): void {
    this.gallery = list;
    if (this.open) this.render();
  }

  setPortfolio(mine: PaintingMeta[], prints: PaintingMeta[]): void {
    this.mine = mine;
    this.prints = prints;
    if (this.open) this.render();
  }

  owned(): PaintingMeta[] {
    return [...this.mine, ...this.prints];
  }

  show(tab: Tab = 'sale'): void {
    this.tab = tab;
    this.open = true;
    this.hud.openModal(h('div', { className: 'art-catalogue' },
      h('h2', { textContent: '🖼 Gallery' }),
      this.body,
    ), () => (this.open = false), true);
    this.render();
    this.send({ t: 'getGallery' });
    this.send({ t: 'getPortfolio' });
  }

  private buyLabel(p: PaintingMeta): { text: string; ok: boolean } {
    const w = this.wallet();
    if (p.artist === this.meId()) return { text: 'yours', ok: false };
    if (this.prints.some((x) => x.id === p.id)) return { text: 'owned', ok: false };
    if (w?.admin) return { text: 'free', ok: true };
    return { text: `${p.price} ✨`, ok: !!w && w.kp >= p.price };
  }

  private thumb(p: PaintingMeta): HTMLElement {
    return h('img', { className: p.mode === 'pixel' ? 'pixel' : '', src: artUrl(p.id), alt: p.title, loading: 'lazy' });
  }

  private tile(p: PaintingMeta, action?: HTMLElement): HTMLElement {
    return h('div', { className: 'art-tile' },
      this.thumb(p),
      h('b', { textContent: p.title }),
      h('small', { textContent: `by ${p.artistName} · sold ×${p.sold}` }),
      ...(action ? [action] : []));
  }

  private render(): void {
    const tabBtn = (t: Tab, label: string) => h('button', {
      type: 'button', className: this.tab === t ? 'on' : '', textContent: label,
      onclick: () => {
        this.tab = t;
        this.render();
      },
    });
    const tabs = h('div', { className: 'wardrobe-tabs' }, tabBtn('sale', 'For sale'), tabBtn('mine', 'Mine'));
    this.body.replaceChildren(tabs, this.tab === 'sale' ? this.saleView() : this.mineView());
  }

  private saleView(): HTMLElement {
    if (!this.gallery.length) return h('p', { className: 'sub', textContent: 'Nothing for sale yet.' });
    return h('div', { className: 'art-grid' }, ...this.gallery.map((p) => {
      const b = this.buyLabel(p);
      return this.tile(p, h('button', {
        type: 'button', className: 'primary', textContent: b.text, disabled: !b.ok,
        onclick: () => {
          this.send({ t: 'buyPrint', id: p.id });
          this.hud.toast(`Buying “${p.title}”…`, 2500);
        },
      }));
    }));
  }

  private mineView(): HTMLElement {
    const n = this.mine.filter((p) => p.forSale).length;
    return h('div', {},
      h('p', { className: 'sub', textContent: `${n}/${FOR_SALE_MAX} for sale` }),
      this.mine.length
        ? h('div', { className: 'art-grid' }, ...this.mine.map((p) => this.tile(p, h('button', {
          type: 'button', className: p.forSale ? 'primary' : '', textContent: p.forSale ? 'For sale ✓' : 'For sale',
          disabled: !p.forSale && n >= FOR_SALE_MAX,
          onclick: () => this.send({ t: 'setSale', id: p.id, on: !p.forSale }),
        }))))
        : h('p', { className: 'sub', textContent: 'You have not painted anything yet.' }),
      h('h3', { textContent: 'Prints you own' }),
      this.prints.length
        ? h('div', { className: 'art-grid' }, ...this.prints.map((p) => this.tile(p)))
        : h('p', { className: 'sub', textContent: 'No prints yet.' }));
  }
}
