import { cabinOwner, type CabinEntry } from '../art';
import { cabinScene } from './cabin';
import { SCENES } from './index';
import type { SceneDef } from './types';
import { villageScene } from './village';

/** Every scene by id: the fixed ones, plus the village and cabins built from the current roster. */
export class SceneBook {
  /** Bumps whenever the roster changes, so callers can tell their cached scene is stale. */
  version = 0;
  private roster: CabinEntry[] = [];
  private memo = new Map<string, SceneDef>();

  constructor(private readonly fixed: Record<string, SceneDef> = SCENES) {}

  setRoster(r: CabinEntry[]): void {
    this.roster = r;
    this.memo.clear();
    this.version++;
  }

  get(id: string): SceneDef | undefined {
    const fixed = this.fixed[id];
    if (fixed) return fixed;
    const hit = this.memo.get(id);
    if (hit) return hit;
    let built: SceneDef | undefined;
    if (id === 'village') built = villageScene(this.roster);
    else {
      const owner = cabinOwner(id);
      const e = owner === null ? undefined : this.roster.find((c) => c.owner === owner);
      if (e) built = cabinScene(e);
    }
    if (built) this.memo.set(id, built);
    return built;
  }

  name(id: string): string {
    return this.get(id)?.name ?? id;
  }
}
