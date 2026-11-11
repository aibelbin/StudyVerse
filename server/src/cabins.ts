import { cabinOwner, cabinSceneId, type CabinEntry, type CabinItem, type CabinState, type SpotPick } from '../../shared/art';
import { isFlower } from '../../shared/garden';
import { isGift } from '../../shared/gifts';
import type { ClientMsg } from '../../shared/protocol';
import type { SceneBook } from '../../shared/scenes/book';
import { CABIN_SPOTS } from '../../shared/scenes/cabin';
import type { Store } from './db';
import type { Port } from './port';

type CabinMsg = Extract<ClientMsg, { t: 'cabin' }>;

/** Which kind of spot each pick goes on. */
const SPOT_KIND: Record<SpotPick['kind'], 'wall' | 'shelf'> = { painting: 'wall', keepsake: 'shelf', bouquet: 'shelf' };
/** A latch flip re-sends the roster to everyone, so one owner can flip it at most this often. */
const LOCK_GAP_MS = 2000;

/** Player cabins: one lot each on first join, a door latch, and fixed spots the owner decorates. */
export class Cabins {
  private list: CabinEntry[];
  /** Owner id -> when they last flipped the latch. */
  private lastLockAt = new Map<string, number>();

  constructor(private store: Store, private book: SceneBook, private port: Port) {
    this.list = store.cabins();
    book.setRoster(this.list);
  }

  /** Gives this profile a cabin on the next free lot if it has none; true if one was just built. */
  ensure(ownerId: string, at: number): boolean {
    if (this.store.cabinOf(ownerId)) return false;
    this.store.addCabin(ownerId, this.store.cabinCount(), at);
    this.refresh();
    return true;
  }

  roster(): CabinEntry[] {
    return this.list;
  }

  broadcast(): void {
    this.port.toAll({ t: 'village', cabins: this.list });
  }

  /** Anyone may walk into an unlatched cabin; the owner always may. */
  canEnter(playerId: string, sceneId: string): boolean {
    const owner = cabinOwner(sceneId);
    if (owner === null || owner === playerId) return true;
    return !this.store.cabinOf(owner)?.locked;
  }

  /** The cabin's latch and items, to one player or (no toId) to everyone inside. */
  sendState(owner: string, toId?: string): void {
    const msg = { t: 'cabinState' as const, state: this.state(owner) };
    if (toId) this.port.send(toId, msg);
    else this.port.toScene(cabinSceneId(owner), msg);
  }

  handle(p: string, msg: CabinMsg): void {
    if (this.port.sceneOf(p) !== cabinSceneId(p)) return this.port.error(p, 'bad_cabin', 'You can only do that in your own cabin.');
    switch (msg.action) {
      case 'lock': {
        if (msg.on === !!this.store.cabinOf(p)?.locked) return;
        const now = this.port.now();
        if (now - (this.lastLockAt.get(p) ?? -Infinity) < LOCK_GAP_MS) return this.port.error(p, 'bad_cabin', 'Give the latch a moment.');
        this.lastLockAt.set(p, now);
        this.store.setCabinLocked(p, msg.on);
        this.refresh();
        this.broadcast();
        return this.sendState(p);
      }
      case 'clear':
        if (!CABIN_SPOTS.some((s) => s.id === msg.spot)) return this.port.error(p, 'bad_cabin', "There's no such spot.");
        this.clearSpot(p, msg.spot);
        return this.sendState(p);
      case 'place':
        return this.place(p, msg.spot, msg.item);
    }
  }

  private place(p: string, spotId: string, item: SpotPick): void {
    const spot = CABIN_SPOTS.find((s) => s.id === spotId);
    if (!spot) return this.port.error(p, 'bad_cabin', "There's no such spot.");
    if (SPOT_KIND[item.kind] !== spot.kind) {
      return this.port.error(p, 'bad_cabin', spot.kind === 'wall' ? 'Only paintings hang on the wall.' : 'Paintings go on the wall, not the shelf.');
    }
    let ref: string;
    if (item.kind === 'painting') {
      if (!this.store.ownsPainting(p, item.id)) return this.port.error(p, 'bad_cabin', "That painting isn't yours.");
      ref = String(item.id);
    } else if (item.kind === 'keepsake') {
      if (!this.store.keepsake(p, item.id)) return this.port.error(p, 'bad_cabin', "That keepsake isn't yours.");
      ref = String(item.id);
    } else {
      const b = this.store.bag(p).find((x) => x.id === item.id);
      if (!b || b.kind !== 'bouquet' || !isFlower(b.value)) return this.port.error(p, 'bad_cabin', "That bouquet isn't in your bag.");
      ref = b.value;
    }
    this.clearSpot(p, spotId);
    if (item.kind === 'bouquet') {
      this.store.takeBagItem(p, item.id);
      this.port.bagChanged(p);
    } else {
      // a painting or keepsake shows in one place: placing it again moves it
      for (const r of this.store.cabinItems(p)) if (r.kind === item.kind && r.ref === ref) this.store.takeCabinItem(p, r.spot);
    }
    this.store.setCabinItem(p, spotId, item.kind, ref);
    this.sendState(p);
  }

  /** Empties a spot; a bouquet goes back into the bag. */
  private clearSpot(owner: string, spot: string): void {
    const old = this.store.takeCabinItem(owner, spot);
    if (old?.kind === 'bouquet' && isFlower(old.ref)) {
      this.store.addBagItem(owner, 'bouquet', old.ref, this.port.now());
      this.port.bagChanged(owner);
    }
  }

  /** Resolves the stored rows; rows whose painting or keepsake is gone (or whose spot no longer exists) are dropped. */
  private state(owner: string): CabinState {
    const items: CabinItem[] = [];
    for (const r of this.store.cabinItems(owner)) {
      const it = CABIN_SPOTS.some((s) => s.id === r.spot) ? this.resolve(owner, r.spot, r.kind, r.ref) : null;
      if (it) items.push(it);
      else this.store.takeCabinItem(owner, r.spot);
    }
    return { owner, locked: !!this.store.cabinOf(owner)?.locked, items };
  }

  private resolve(owner: string, spot: string, kind: string, ref: string): CabinItem | null {
    if (kind === 'bouquet') return isFlower(ref) ? { spot, kind, flower: ref } : null;
    const id = Number(ref);
    if (!Number.isInteger(id)) return null;
    if (kind === 'painting') {
      const painting = this.store.painting(id);
      return painting && this.store.ownsPainting(owner, id) ? { spot, kind, painting } : null;
    }
    if (kind === 'keepsake') {
      const k = this.store.keepsake(owner, id);
      if (!k || !isGift(k.gift)) return null;
      return { spot, kind, id, gift: k.gift, fromName: k.fromName, ...(isFlower(k.flower) ? { flower: k.flower } : {}) };
    }
    return null;
  }

  private refresh(): void {
    this.list = this.store.cabins();
    this.book.setRoster(this.list);
  }
}
