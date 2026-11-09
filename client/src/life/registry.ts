import * as THREE from 'three';
import type { SceneDef } from '../../../shared/scenes/types';
import { birds, chimneySmoke, clouds, fireflies, flyers, leaves } from './air';
import { crawlers, leafPiles } from './ground';
import type { LifeCtx, LifeSystem } from './kit';
import { dragonflies, ducks, fish, frogs, sailboats } from './water';

export type { LifeCtx } from './kit';

/** Every ambient critter system for a scene, driven by one update call. */
export function buildLife(def: SceneDef): { root: THREE.Group; update(ctx: LifeCtx): void; feed(x: number, z: number, t: number): void } {
  const systems: LifeSystem[] = [];
  const w = def.water;
  if (w) systems.push(sailboats(w));
  if (!def.theme.indoor) systems.push(clouds());
  const buildings = def.decor.filter((d) => d.kind === 'building');
  if (buildings.length) systems.push(chimneySmoke(buildings));
  const piles = def.decor.filter((d) => d.kind === 'leafPile');
  if (piles.length) systems.push(leafPiles(piles));
  for (const z of def.life) {
    switch (z.kind) {
      case 'ducks': if (w) systems.push(ducks(z, w)); break;
      case 'fish': if (w) systems.push(fish(z, w)); break;
      case 'dragonflies': if (w) systems.push(dragonflies(z, w)); break;
      case 'frogs': systems.push(frogs(z, def)); break;
      case 'butterflies': case 'bees': systems.push(flyers(z, def, z.kind)); break;
      case 'birds': systems.push(birds(z, def)); break;
      case 'fireflies': systems.push(fireflies(z)); break;
      case 'leaves': systems.push(leaves(z)); break;
      case 'petals': systems.push(leaves(z, ['#f7b7c8', '#fde0e8', '#f2a2b8', '#ffffff'])); break;
      case 'ladybugs': case 'snails': systems.push(crawlers(z, z.kind)); break;
    }
  }
  const root = new THREE.Group();
  for (const s of systems) root.add(s.root);
  return {
    root,
    update: (ctx) => systems.forEach((s) => s.update(ctx)),
    feed: (x, z, t) => systems.forEach((s) => s.feed?.(x, z, t)),
  };
}
