import { SPECIES, SPECIES_IDS, type CatchKind, type JournalEntry } from '../../../shared/catches';
import type { ClientMsg } from '../../../shared/protocol';
import { h } from '../hud/dom';
import type { Hud } from '../hud/hud';

const hint = (id: keyof typeof SPECIES): string => {
  const s = SPECIES[id];
  return s.when === 'night' ? 'only at night' : s.when === 'rain' ? 'only in the rain' : s.rarity === 3 ? 'rare' : '???';
};

/** The field journal: a sticker per species caught, silhouettes for the rest. */
export class Journal {
  private body = h('div', { className: 'journal-body' });
  private open = false;
  private tab: CatchKind = 'fish';
  private entries = new Map<string, JournalEntry>();

  constructor(private hud: Hud, private send: (m: ClientMsg) => void) {}

  set(entries: JournalEntry[]): void {
    this.entries = new Map(entries.map((e) => [e.species, e]));
    if (this.open) this.render();
  }

  show(): void {
    this.open = true;
    this.hud.openModal(h('div', { className: 'journal' }, h('h2', { textContent: '📖 Field journal' }), this.body), () => (this.open = false), true);
    this.render();
    this.send({ t: 'getJournal' });
  }

  private render(): void {
    const found = SPECIES_IDS.filter((id) => this.entries.has(id)).length;
    const tabBtn = (t: CatchKind, label: string) => h('button', {
      type: 'button', className: this.tab === t ? 'on' : '', textContent: label,
      onclick: () => {
        this.tab = t;
        this.render();
      },
    });
    const tiles = SPECIES_IDS.filter((id) => SPECIES[id].kind === this.tab).map((id) => {
      const e = this.entries.get(id);
      const s = SPECIES[id];
      return h('div', { className: 'art-tile' },
        h('span', { className: e ? 'journal-emoji' : 'journal-emoji unknown', textContent: s.emoji }),
        h('b', { textContent: e ? s.name : hint(id) }),
        ...(e ? [h('small', { textContent: `×${e.count}${e.best !== null ? ` · best ${e.best} cm` : ''}` })] : []));
    });
    this.body.replaceChildren(
      h('div', { className: 'wardrobe-tabs' }, tabBtn('fish', '🐟 Fish'), tabBtn('bug', '🦋 Bugs')),
      h('p', { className: 'sub', textContent: `${found} / ${SPECIES_IDS.length} found` }),
      h('div', { className: 'journal-grid' }, ...tiles));
  }
}
