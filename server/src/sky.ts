import { isConstellationInput, type Constellation } from '../../shared/stars';
import type { Store } from './db';
import type { Port } from './port';

/** The night sky: one constellation per player, shown to everyone. */
export class Sky {
  constructor(private store: Store, private port: Port) {}

  save(p: string, name: string, edges: [number, number][]): void {
    if (!isConstellationInput(name, edges)) return this.port.error(p, 'bad_star', "Those stars don't make a constellation.");
    this.store.setConstellation(p, name, edges, this.port.now());
    this.port.toAll({ t: 'sky', constellations: this.all() });
  }

  all(): Constellation[] {
    return this.store.constellations();
  }
}
