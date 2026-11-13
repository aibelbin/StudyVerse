import { isConstellationInput, type Constellation } from '../../shared/stars';
import type { Store } from './db';
import type { Port } from './port';

/** A save re-sends every constellation to everyone, so one player can save at most this often. */
const SAVE_GAP_MS = 2000;

/** The night sky: one constellation per player, shown to everyone. */
export class Sky {
  /** Player id -> when they last saved. */
  private lastSaveAt = new Map<string, number>();

  constructor(private store: Store, private port: Port) {}

  save(p: string, name: string, edges: [number, number][]): void {
    if (!isConstellationInput(name, edges)) return this.port.error(p, 'bad_star', "Those stars don't make a constellation.");
    const now = this.port.now();
    if (now - (this.lastSaveAt.get(p) ?? -Infinity) < SAVE_GAP_MS) return this.port.error(p, 'bad_star', 'Let the stars settle a moment.');
    this.lastSaveAt.set(p, now);
    this.store.setConstellation(p, name, edges, now);
    this.port.toAll({ t: 'sky', constellations: this.all() });
  }

  all(): Constellation[] {
    return this.store.constellations();
  }
}
