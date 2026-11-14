import * as THREE from 'three';
import { isNight, possible, SPECIES, SPECIES_IDS, type SpeciesId } from '../../../shared/catches';
import type { ClientMsg } from '../../../shared/protocol';
import type { LifeKind } from '../../../shared/scenes/types';
import type { SoundKind } from '../audio/kinds';
import { disposeTree, mat, mesh } from '../world/materials';
import { PALETTE as P } from '../world/palette';

export const BITE_MIN_MS = 3000;
export const BITE_MAX_MS = 12000;
export const BITE_WINDOW_MS = 800;
const CAST_M = 3;

/** One cast: wait 3–12 s for a bite, then 0.8 s to strike. Pure; times in ms. */
export class FishingRound {
  readonly biteAt: number;
  constructor(castAt: number, rand: () => number = Math.random) {
    this.biteAt = castAt + BITE_MIN_MS + rand() * (BITE_MAX_MS - BITE_MIN_MS);
  }

  phase(now: number): 'waiting' | 'bite' | 'gone' {
    return now < this.biteAt ? 'waiting' : now < this.biteAt + BITE_WINDOW_MS ? 'bite' : 'gone';
  }

  /** E pressed: in the window it's a catch; before it you just reel in; after it, it got away. */
  strike(now: number): 'caught' | 'early' | 'missed' {
    const p = this.phase(now);
    return p === 'bite' ? 'caught' : p === 'waiting' ? 'early' : 'missed';
  }
}

const WEIGHT = { 1: 10, 2: 3, 3: 1 } as const;

/** A species from ids that can be caught now, commoner ones more often; null if none can. */
export function pickSpecies(ids: SpeciesId[], now: { night: boolean; raining: boolean }, rand: () => number = Math.random): SpeciesId | null {
  const ok = ids.filter((id) => possible(id, now));
  let r = rand() * ok.reduce((s, id) => s + WEIGHT[SPECIES[id].rarity], 0);
  return ok.find((id) => (r -= WEIGHT[SPECIES[id].rarity]) < 0) ?? ok.at(-1) ?? null;
}

const FISH = SPECIES_IDS.filter((id) => SPECIES[id].kind === 'fish');

/** The bugs netted from a critter kind; the first is its everyday one. */
export const bugsOf = (kind: LifeKind): SpeciesId[] => SPECIES_IDS.filter((id) => SPECIES[id].base === kind);

/** The toast for something you caught (fish or bug). */
export function caughtText(species: SpeciesId, size: number | undefined, first: boolean): string {
  const s = SPECIES[species];
  return `${s.emoji} You caught ${/^[aeiou]/.test(s.name) ? 'an' : 'a'} ${s.name}${size ? ` (${size} cm)` : ''}!${first ? ' New! 📖' : ''}`;
}

export interface FishingDeps {
  scene(): THREE.Scene | null;
  sound(kind: SoundKind, x: number, z: number): void;
  /** An emoji over your own head. */
  pop(text: string): void;
  toast(text: string): void;
  send(m: ClientMsg): void;
  /** Your local clock hour, 0–23. */
  hour(): number;
  raining(): boolean;
}

/** Your rod, line and bobber while a round is on. Only you see them; others see the catch pop. */
export class Fishing {
  private round: FishingRound | null = null;
  private bit = false;
  private gear: { rod: THREE.Group; tip: THREE.Object3D; bobber: THREE.Group; line: THREE.Line } | null = null;

  constructor(private deps: FishingDeps) {}

  get active(): boolean {
    return this.round !== null;
  }

  /** Cast from (x, z) towards dir (a unit vector); the rod goes on your character. */
  start(char: THREE.Object3D, x: number, z: number, dir: { x: number; z: number }, now: number): void {
    this.stop();
    const scene = this.deps.scene();
    if (!scene) return;
    const rod = new THREE.Group();
    rod.rotation.y = Math.atan2(dir.x, dir.z);
    const pole = new THREE.Group();
    pole.position.set(0.38, 0.45, 0.1); // the right hand
    pole.rotation.x = 0.9; // tipped out over the water
    pole.add(mesh(new THREE.CylinderGeometry(0.012, 0.022, 1.4, 6), mat(P.woodDark), 0, 0.7, 0, false));
    const tip = new THREE.Object3D();
    tip.position.y = 1.4;
    pole.add(tip);
    rod.add(pole);
    char.add(rod);
    const bobber = new THREE.Group();
    bobber.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), mat('#e85a6a'), 0, 0, 0, false));
    bobber.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), mat('#fffaf0'), 0, 0.06, 0, false));
    bobber.position.set(x + dir.x * CAST_M, 0.05, z + dir.z * CAST_M);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#f4f4f4' }));
    line.frustumCulled = false;
    scene.add(bobber, line);
    this.gear = { rod, tip, bobber, line };
    this.round = new FishingRound(now);
    this.bit = false;
    this.deps.sound('plop', bobber.position.x, bobber.position.z);
  }

  update(now: number): void {
    if (!this.round || !this.gear) return;
    const { tip, bobber, line } = this.gear;
    const phase = this.round.phase(now);
    if (phase === 'gone') {
      this.deps.toast('It got away…');
      return this.stop();
    }
    if (phase === 'bite' && !this.bit) {
      this.bit = true;
      this.deps.sound('splash', bobber.position.x, bobber.position.z);
      this.deps.pop('❗');
    }
    bobber.position.y = phase === 'bite' ? -0.06 : 0.04 + Math.sin(now / 400) * 0.02;
    tip.updateWorldMatrix(true, false);
    const a = tip.getWorldPosition(new THREE.Vector3());
    const pos = line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, bobber.position.x, bobber.position.y + 0.06, bobber.position.z);
    pos.needsUpdate = true;
  }

  /** E while fishing: strike in the bite window, otherwise reel in. */
  strike(now: number): void {
    if (!this.round) return;
    const r = this.round.strike(now);
    if (r === 'caught') {
      const hour = this.deps.hour();
      const species = pickSpecies(FISH, { night: isNight(hour), raining: this.deps.raining() });
      if (species) this.deps.send({ t: 'catch', kind: 'fish', species, hour });
    }
    if (r === 'missed') this.deps.toast('It got away…');
    this.stop();
  }

  prompt(now: number): string | null {
    if (!this.round) return null;
    return this.round.phase(now) === 'bite' ? '❗ [E] strike!' : '🎣 Waiting for a bite… [E] or move to reel in';
  }

  /** Reel in: the rod, line and bobber go away. */
  stop(): void {
    this.round = null;
    if (!this.gear) return;
    const { rod, bobber, line } = this.gear;
    for (const o of [rod, bobber, line]) {
      o.removeFromParent();
      disposeTree(o);
    }
    this.gear = null;
  }
}
