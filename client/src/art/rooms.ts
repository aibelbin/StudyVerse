import type * as THREE from 'three';
import { cabinOwner, itemLabel, type CabinState, type PaintingMeta } from '../../../shared/art';
import type { ClientMsg, ServerMsg } from '../../../shared/protocol';
import type { SceneDef, Spot } from '../../../shared/scenes/types';
import { Pictures, Shelves } from './views';

/** A scene's picture frames and shelves (null where it has none). */
export interface RoomViews {
  pictures: Pictures | null;
  shelves: Shelves | null;
}

/** Builds the frames and shelves for a scene's spots into its root. */
export function roomViews(def: SceneDef, root: THREE.Object3D): RoomViews {
  const walls = (def.spots ?? []).filter((sp) => sp.kind === 'wall');
  const shelves = (def.spots ?? []).filter((sp) => sp.kind === 'shelf');
  const v = { pictures: walls.length ? new Pictures(walls) : null, shelves: shelves.length ? new Shelves(shelves) : null };
  if (v.pictures) root.add(v.pictures.root);
  if (v.shelves) root.add(v.shelves.root);
  return v;
}

/** The studio's gallery and the cabin you're in: what the server last said, shown on the scene's frames and shelves. */
export class ArtRooms {
  private gallery: PaintingMeta[] = [];
  private cabin: CabinState | null = null;
  private def: SceneDef | null = null;
  private views: RoomViews = { pictures: null, shelves: null };

  constructor(private send: (m: ClientMsg) => void) {}

  /** You arrived in a scene; a cabin's items follow from the server. */
  enter(def: SceneDef, views: RoomViews): void {
    this.def = def;
    this.views = views;
    this.cabin = null;
    this.applyGallery();
  }

  onMessage(m: ServerMsg): void {
    if (m.t === 'gallery') {
      this.gallery = m.forSale;
      this.applyGallery();
    } else if (m.t === 'cabinState' && this.def && m.state.owner === cabinOwner(this.def.id)) {
      this.cabin = m.state;
      this.applyCabin();
    }
  }

  /** Your own cabin's spots and what [E] would do at each. */
  targets(meId: string): { spot: Spot; prompt: string }[] {
    if (!this.def || cabinOwner(this.def.id) !== meId) return [];
    return (this.def.spots ?? []).map((spot) => ({ spot, prompt: this.prompt(spot) }));
  }

  /** [E] at a spot: take down what's there, or pick something to put there. */
  use(spot: Spot, pick: (spot: Spot) => void): void {
    if (this.cabin?.items.some((i) => i.spot === spot.id)) this.send({ t: 'cabin', action: 'clear', spot: spot.id });
    else pick(spot);
  }

  /** In your own cabin, whether its door is latched; null elsewhere (no latch button). */
  latch(meId: string): boolean | null {
    return this.def && cabinOwner(this.def.id) === meId && this.cabin ? this.cabin.locked : null;
  }

  toggleLatch(): void {
    if (this.cabin) this.send({ t: 'cabin', action: 'lock', on: !this.cabin.locked });
  }

  private prompt(spot: Spot): string {
    const it = this.cabin?.items.find((i) => i.spot === spot.id);
    if (it) return `[E] take down the ${itemLabel(it)}`;
    return spot.kind === 'wall' ? '[E] hang a painting here' : '[E] put something on the shelf';
  }

  /** The first paintings for sale, onto the studio's frames. */
  private applyGallery(): void {
    if (this.def?.id !== 'studio') return;
    this.views.pictures?.set((this.def.spots ?? []).map((f, i) => ({ id: f.id, painting: this.gallery[i] ?? null })));
  }

  /** The cabin's paintings onto its wall frames and its keepsakes and bouquets onto its shelves. */
  private applyCabin(): void {
    const items = this.cabin?.items ?? [];
    this.views.pictures?.set((this.def?.spots ?? []).filter((sp) => sp.kind === 'wall').map((sp) => {
      const it = items.find((i) => i.spot === sp.id);
      return { id: sp.id, painting: it?.kind === 'painting' ? it.painting : null };
    }));
    this.views.shelves?.set(items);
  }
}
