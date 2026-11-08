import type { SceneDef } from '../../../shared/scenes/types';
import type { SoundKind } from '../audio/kinds';
import type { BuiltScene } from '../world/sceneBuilder';
import { clockHours, skyAt, SkyRig, tintIndoorWindows } from '../world/sky';
import type { FrameInfo, GameHooks } from './game';

/** Time-of-day, ambient life and sound, layered on top of the game. One instance per page. */
export class Extras implements GameHooks {
  private skies = new Map<string, SkyRig>();
  private sky: SkyRig | null = null;
  private timeOverride = new URLSearchParams(location.search).get('time');

  enterScene(def: SceneDef, built: BuiltScene): void {
    if (built.outdoor) {
      let s = this.skies.get(def.id);
      if (!s) this.skies.set(def.id, (s = new SkyRig(built, def)));
      this.sky = s;
    } else {
      this.sky = null;
    }
  }

  frame(f: FrameInfo): void {
    const hours = clockHours(new Date(), this.timeOverride);
    if (this.sky) this.sky.update(hours, f.me, performance.now(), f.toyStates);
    else tintIndoorWindows(skyAt(hours).night);
  }

  sound(_kind: SoundKind, _x: number, _z: number, _arg?: number): void {}

  feedDucks(_x: number, _z: number): void {}
}
