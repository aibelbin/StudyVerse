import * as THREE from 'three';
import type { Look, OutfitSlot, Wallet } from '../../../shared/types';
import { BODY_COLORS, EYE_LABELS, EYES, isFree, ITEMS, SLOT_LABELS, SLOTS, type Item } from '../../../shared/wardrobe';
import { Character } from '../world/character';
import { h } from './dom';
import type { Hud } from './hud';

export interface WardrobeDeps {
  hud: Hud;
  name(): string;
  look(): Look;
  wallet(): Wallet | null;
  buy(itemId: string): void;
  save(look: Look): void;
  /** Extra tabs (e.g. pets) rendered by their owners. */
  extraTabs?: { id: string; label: string; render(refresh: () => void): HTMLElement }[];
}

type Tab = OutfitSlot | 'style' | string;

/** The Boutique / closet: try things on in a live preview, buy with Knowledge Points, wear what you own. */
export class Wardrobe {
  private draft: Look | null = null;
  private original: Look | null = null;
  private tab: Tab = 'hat';
  private grid = h('div', { className: 'wardrobe-grid' });
  private tabs = h('div', { className: 'wardrobe-tabs' });
  private footer = h('div', { className: 'wardrobe-footer' });
  private preview: { renderer: THREE.WebGLRenderer; char: Character; raf: number } | null = null;

  constructor(private d: WardrobeDeps) {}

  isOpen(): boolean {
    return this.preview !== null;
  }

  open(tab: Tab = 'hat'): void {
    this.original = { ...this.d.look() };
    this.draft = { ...this.original };
    this.tab = tab;
    const canvas = h('canvas', { className: 'wardrobe-preview' });
    const el = h('div', { className: 'wardrobe' },
      h('h2', { textContent: '👕 Wardrobe' }),
      h('div', { className: 'wardrobe-body' }, canvas, h('div', { className: 'wardrobe-side' }, this.tabs, this.grid)),
      this.footer);
    this.d.hud.openModal(el, () => this.dispose(), true);
    this.startPreview(canvas);
    this.refresh();
  }

  /** Re-render after the wallet changes (a purchase went through). */
  refresh(): void {
    if (!this.draft) return;
    const w = this.d.wallet();
    const tabs: [Tab, string][] = [['style', '🎨 Colour'], ...SLOTS.map((s) => [s, SLOT_LABELS[s]] as [Tab, string]),
      ...(this.d.extraTabs ?? []).map((t) => [t.id, t.label] as [Tab, string])];
    this.tabs.replaceChildren(...tabs.map(([id, label]) =>
      h('button', { type: 'button', className: this.tab === id ? 'on' : '', textContent: label, onclick: () => { this.tab = id; this.refresh(); } })));
    const extra = this.d.extraTabs?.find((t) => t.id === this.tab);
    if (extra) this.grid.replaceChildren(extra.render(() => this.refresh()));
    else if (this.tab === 'style') this.grid.replaceChildren(this.styleTab());
    else this.grid.replaceChildren(...this.itemCells(this.tab as OutfitSlot, w));
    const unowned = this.unowned(w);
    this.footer.replaceChildren(
      h('span', { className: 'kp', textContent: `✨ ${w?.admin ? '∞' : w?.kp ?? 0} KP` }),
      h('span', { className: 'hint', textContent: unowned.length ? `Trying on: buy ${unowned.map((i) => i.name).join(', ')} to keep` : '' }),
      h('button', { type: 'button', textContent: 'Close', onclick: () => this.d.hud.closeModals() }),
      h('button', {
        type: 'button', className: 'primary', textContent: 'Wear this', disabled: unowned.length > 0,
        onclick: () => {
          if (JSON.stringify(this.draft) !== JSON.stringify(this.original)) this.d.save({ ...this.draft! });
          this.d.hud.finishModal();
          this.dispose();
        },
      }),
    );
    this.preview?.char.setLook(this.draft);
  }

  private owns(id: string, w: Wallet | null): boolean {
    return isFree(id) || !!w?.owned.includes(id) || SLOTS.some((s) => this.original![s] === id);
  }

  private unowned(w: Wallet | null): Item[] {
    return SLOTS.map((s) => this.draft![s]).filter((id) => !this.owns(id, w)).map((id) => ITEMS.find((i) => i.id === id)!);
  }

  private styleTab(): HTMLElement {
    const sw = h('div', { className: 'swatches' }, ...BODY_COLORS.map((c) => {
      const b = h('button', { type: 'button', className: `swatch${this.draft!.body === c ? ' on' : ''}`, onclick: () => { this.draft!.body = c; this.refresh(); } });
      b.style.background = c;
      return b;
    }));
    const eyes = h('div', { className: 'hats' }, ...EYES.map((e) =>
      h('button', { type: 'button', className: this.draft!.eyes === e ? 'on' : '', textContent: EYE_LABELS[e], onclick: () => { this.draft!.eyes = e; this.refresh(); } })));
    return h('div', {}, h('label', { className: 'field' }, 'Colour', sw), h('label', { className: 'field' }, 'Eyes', eyes));
  }

  private itemCells(slot: OutfitSlot, w: Wallet | null): HTMLElement[] {
    const cell = (id: string, name: string, item?: Item) => {
      const owned = this.owns(id, w);
      const worn = this.draft![slot] === id;
      const tag = owned ? (worn ? 'Wearing' : item && item.price > 0 ? 'Owned' : 'Free') : `✨ ${item!.price}`;
      const swatch = h('span', { className: 'dot' });
      swatch.style.background = item?.color ?? 'transparent';
      const kids: (HTMLElement | string)[] = [swatch, h('b', { textContent: name }), h('small', { textContent: tag })];
      if (!owned && item) {
        const afford = !!w?.admin || (w?.kp ?? 0) >= item.price;
        kids.push(h('button', {
          type: 'button', className: 'mini buy', textContent: afford ? 'Buy' : 'Need KP', disabled: !afford,
          onclick: (e: MouseEvent) => { e.stopPropagation(); this.d.buy(id); },
        }));
      }
      return h('div', {
        className: `item${worn ? ' on' : ''}${owned ? '' : ' locked'}`,
        onclick: () => { this.draft![slot] = id; this.refresh(); },
      }, ...kids);
    };
    return [cell('none', 'Nothing'), ...ITEMS.filter((i) => i.slot === slot).map((i) => cell(i.id, i.name, i))];
  }

  private startPreview(canvas: HTMLCanvasElement): void {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(220, 260, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff3e0', '#b0a0c0', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(2, 3, 3);
    scene.add(sun);
    const char = new Character(this.draft!, this.d.name());
    char.root.children.filter((c) => c instanceof THREE.Sprite).forEach((s) => (s.visible = false));
    scene.add(char.root);
    const cam = new THREE.PerspectiveCamera(32, 220 / 260, 0.1, 20);
    cam.position.set(0, 1.0, 3.1);
    cam.lookAt(0, 0.62, 0);
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      char.facing += ((now - last) / 1000) * 0.7;
      char.update((now - last) / 1000, now);
      last = now;
      renderer.render(scene, cam);
      if (this.preview) this.preview.raf = requestAnimationFrame(loop);
    };
    this.preview = { renderer, char, raf: requestAnimationFrame(loop) };
  }

  private dispose(): void {
    if (!this.preview) return;
    cancelAnimationFrame(this.preview.raf);
    this.preview.char.dispose();
    this.preview.renderer.dispose();
    this.preview = null;
    this.draft = null;
  }
}
