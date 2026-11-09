import { FLOWER_KINDS, FLOWERS, seedItem, stageOf, type Flower, type PlotState } from '../../../shared/garden';
import type { ClientMsg } from '../../../shared/protocol';
import type { Holding, Wallet } from '../../../shared/types';
import { h } from './dom';
import type { Hud } from './hud';

export const FLOWER_EMOJI: Record<Flower, string> = {
  tulip: '🌷', daisy: '🌼', sunflower: '🌻', poppy: '🌺', lavender: '💜', rose: '🌹', lotus: '🪷', glowLily: '💠',
};
const STAGE_NAME = { seed: 'Seed', sprout: 'Sprout', bud: 'Bud', bloom: 'In bloom!' } as const;

export interface GardenDeps {
  plot(toyId: string): PlotState | null;
  wallet(): Wallet | null;
  holding(): Holding | null;
  /** Bouquets in your bag (for the vase). */
  bouquets(): Flower[];
  send(m: ClientMsg): void;
}

/** "Your garden": the four spots with progress, planting from the seed picker, picking, watering, the vase. */
export class GardenPanel {
  private toyId: string | null = null;
  private picking: number | null = null;
  private root = h('div', { className: 'garden-panel' });

  constructor(private hud: Hud, private deps: GardenDeps) {}

  open(toyId: string): void {
    this.toyId = toyId;
    this.picking = null;
    this.render();
    this.hud.openModal(this.root, () => (this.toyId = null), true);
  }

  /** Call when the plot, the wallet or what you're holding may have changed. */
  refresh(): void {
    if (this.toyId && this.hud.modalOpen()) this.render();
  }

  private act(action: 'plant' | 'water' | 'harvest' | 'vase', spot?: number, flower?: Flower): void {
    if (!this.toyId) return;
    this.deps.send({ t: 'garden', toyId: this.toyId, action, ...(spot !== undefined ? { spot } : {}), ...(flower ? { flower } : {}) });
  }

  private render(): void {
    const s = this.toyId ? this.deps.plot(this.toyId) : null;
    if (!s) return;
    const wallet = this.deps.wallet();
    const btn = (text: string, onclick: () => void, primary = false, disabled = false) =>
      h('button', { type: 'button', className: primary ? 'primary' : '', textContent: text, onclick, disabled });

    const spots = s.spots.map((sp, i) => {
      if (!sp) {
        return h('div', { className: `garden-spot empty${this.picking === i ? ' on' : ''}` },
          h('div', { className: 'garden-emoji', textContent: '🟫' }),
          h('div', { textContent: 'Empty spot' }),
          btn('Plant', () => {
            this.picking = this.picking === i ? null : i;
            this.render();
          }, true));
      }
      const info = FLOWERS[sp.flower];
      const stage = stageOf(sp.progress, info.growMin);
      const fill = h('span');
      fill.style.width = `${Math.min(100, Math.round((sp.progress / info.growMin) * 100))}%`;
      return h('div', { className: `garden-spot${stage === 'bloom' ? ' bloom' : ''}` },
        h('div', { className: 'garden-emoji', textContent: stage === 'bloom' ? FLOWER_EMOJI[sp.flower] : stage === 'seed' ? '🌰' : '🌱' }),
        h('div', { textContent: `${info.name[0].toUpperCase()}${info.name.slice(1)} · ${STAGE_NAME[stage]}` }),
        h('div', { className: 'garden-bar' }, fill),
        h('div', { className: 'garden-min', textContent: `${Math.floor(sp.progress)} / ${info.growMin} focus min` }),
        ...(stage === 'bloom'
          ? [btn(`Pick 💐 +${info.harvestKp} ✨`, () => this.act('harvest', i), true)]
          : []));
    });

    const picker = this.picking === null ? [] : [
      h('h3', { textContent: 'Choose a seed' }),
      h('div', { className: 'seed-grid' }, ...FLOWER_KINDS.map((f) => {
        const info = FLOWERS[f];
        const owned = !info.price || !!wallet?.owned.includes(seedItem(f));
        const card = h('div', { className: `seed${owned ? '' : ' locked'}` },
          h('div', { className: 'garden-emoji', textContent: FLOWER_EMOJI[f] }),
          h('b', { textContent: info.name }),
          h('span', { textContent: `${info.growMin} min · +${info.harvestKp} ✨` }));
        card.append(owned
          ? btn('Plant', () => {
            const spot = this.picking!;
            this.picking = null;
            this.act('plant', spot, f);
          }, true)
          : btn(wallet?.admin ? 'Unlock (free)' : `Unlock ${info.price} ✨`, () => this.deps.send({ t: 'buySeed', flower: f }), false, !wallet?.admin && (wallet?.kp ?? 0) < info.price));
        return card;
      })),
    ];

    const water = s.boostMin > 0
      ? h('div', { className: 'garden-note', textContent: `💧 Watered: +50% growth for your next ${Math.ceil(s.boostMin)} focus minutes` })
      : h('div', { className: 'garden-note' }, 'Not watered right now. ', btn('Water 💧', () => this.act('water')));
    const flowers = [...new Set(this.deps.bouquets())];
    const vase = flowers.length
      ? [h('div', { className: 'garden-note' }, 'Put a bouquet from your bag in the vase: ', ...flowers.map((f) => btn(`${FLOWER_EMOJI[f]} ${FLOWERS[f].name}`, () => this.act('vase', undefined, f))))]
      : [];

    this.root.replaceChildren(
      h('h2', { textContent: '🌷 Your garden' }),
      water,
      h('div', { className: 'garden-spots' }, ...spots),
      ...picker,
      ...vase,
      h('p', { className: 'garden-hint', textContent: 'Plants grow from finished focus sessions anywhere in town. Friends can water your plot once a day.' }),
    );
  }
}
