import { BUG_GAP_MS, FIRST_CATCH_KP, FISH_GAP_MS, FISH_REACH, isNight, possible, SPECIES, type CatchKind, type SpeciesId } from '../../shared/catches';
import { dist } from '../../shared/geometry';
import type { SceneBook } from '../../shared/scenes/book';
import type { Store } from './db';
import type { Port } from './port';

/** Fishing and bug netting: the client plays the catch, the server checks it could have happened and keeps the journal. */
export class Catches {
  /** `playerId|kind` -> last accepted catch. */
  private lastAt = new Map<string, number>();

  constructor(private store: Store, private book: SceneBook, private port: Port, private raining: () => boolean, private rand: () => number) {}

  catch(p: string, kind: CatchKind, species: SpeciesId, hour: number): void {
    const err = (message: string) => this.port.error(p, 'bad_catch', message);
    const sp = SPECIES[species];
    const sceneId = this.port.sceneOf(p);
    const pos = this.port.posOf(p);
    const scene = sceneId ? this.book.get(sceneId) : undefined;
    if (sp?.kind !== kind || !scene || !pos) return err("That isn't something you can catch.");
    if (!possible(species, { night: isNight(hour), raining: this.raining() })) return err(`No ${sp.name} about right now.`);
    if (kind === 'fish' && !scene.toys.some((t) => t.kind === 'fishing' && dist(t.x, t.z, pos.x, pos.z) <= FISH_REACH)) return err('Find a fishing spot first 🎣');
    if (kind === 'bug' && !scene.life.some((z) => z.kind === sp.base)) return err('Nothing like that lives here.');
    const now = this.port.now();
    const key = `${p}|${kind}`;
    if (now - (this.lastAt.get(key) ?? -Infinity) < (kind === 'fish' ? FISH_GAP_MS : BUG_GAP_MS)) return err('Give it a moment.');
    this.lastAt.set(key, now);
    const size = sp.size ? Math.round(sp.size[0] + this.rand() * (sp.size[1] - sp.size[0])) : null;
    const { first } = this.store.addCatch(p, species, size, now);
    if (first) {
      this.store.addKp(p, FIRST_CATCH_KP);
      this.port.walletChanged(p);
      this.port.feed('catch', `${kind === 'fish' ? '🎣' : '🦋'} ${this.port.nameOf(p) ?? 'Someone'} caught their first ${sp.name}!`);
    }
    this.port.send(p, { t: 'caught', species, ...(size !== null ? { size } : {}), first });
    this.port.toScene(scene.id, { t: 'catchPop', id: p, species }, p);
  }

  journal(p: string): void {
    this.port.send(p, { t: 'journal', entries: this.store.journal(p) });
  }
}
