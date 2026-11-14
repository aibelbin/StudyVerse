import { BUG_REACH } from '../../../shared/catches';
import type { SceneDef } from '../../../shared/scenes/types';
import type { Constellation } from '../../../shared/stars';
import { Ambience } from '../audio/ambience';
import { AudioEngine } from '../audio/engine';
import { JukeboxPlayer } from '../audio/jukebox';
import type { SoundKind } from '../audio/kinds';
import { buildLife } from '../life/registry';
import type { BuiltScene } from '../world/sceneBuilder';
import { clockHours, skyAt, SkyRig, tintIndoorWindows } from '../world/sky';
import type { FrameInfo, GameHooks } from './game';

/** Time-of-day, ambient life and sound, layered on top of the game. One instance per page. */
export class Extras implements GameHooks {
  private skies = new Map<string, SkyRig>();
  private sky: SkyRig | null = null;
  private lives = new Map<string, ReturnType<typeof buildLife>>();
  private life: ReturnType<typeof buildLife> | null = null;
  private lastNow = 0;
  readonly audio = new AudioEngine();
  private jukeboxes = new Map<string, JukeboxPlayer>();
  private ambience = new Map<string, Ambience>();
  private def: SceneDef | null = null;
  private timeOverride = new URLSearchParams(location.search).get('time');
  private constellations: Constellation[] = [];

  enterScene(def: SceneDef, built: BuiltScene): void {
    // a rebuilt scene (village after a roster change, a revisited cabin) needs its own sky and life
    let life = this.lives.get(def.id);
    if (life?.root.parent !== built.scene) {
      life = buildLife(def);
      built.scene.add(life.root);
      this.lives.set(def.id, life);
    }
    this.life = life;
    this.def = def;
    this.audio.setScene(def.id);
    for (const t of def.toys) if (t.kind === 'jukebox' && !this.jukeboxes.has(t.id)) this.jukeboxes.set(t.id, new JukeboxPlayer(this.audio, t.x, t.z));
    if (!def.theme.indoor && !this.ambience.has(def.id)) this.ambience.set(def.id, new Ambience(this.audio, def));
    if (built.outdoor) {
      let s = this.skies.get(def.id);
      if (s?.built !== built) {
        this.skies.set(def.id, (s = new SkyRig(built, def)));
        s.setConstellations(this.constellations);
      }
      this.sky = s;
    } else {
      this.sky = null;
    }
  }

  setConstellations(cs: Constellation[]): void {
    this.constellations = cs;
    for (const s of this.skies.values()) s.setConstellations(cs);
  }

  frame(f: FrameInfo): void {
    const hours = clockHours(new Date(), this.timeOverride);
    if (this.sky) this.sky.update(hours, f.me, performance.now(), f.toyStates);
    else tintIndoorWindows(skyAt(hours).night);
    this.lastNow = f.now;
    const night = this.sky?.night ?? 0;
    this.life?.update({ t: f.now, dt: f.dt, focus: f.me, me: f.me, night });
    this.audio.setListener(f.me.x, f.me.z);
    for (const [id, j] of this.jukeboxes) {
      j.set(f.toyStates[id]);
      if (f.def.toys.some((t) => t.id === id)) j.tick(f.now);
    }
    const fire = f.def.toys.find((t) => t.kind === 'campfire');
    const fireState = fire ? f.toyStates[fire.id] : undefined;
    this.ambience.get(f.def.id)?.update(night, fireState?.kind === 'campfire' && fireState.lit, f.me);
    this.audio.update();
  }

  sound(kind: SoundKind, x: number, z: number, arg?: number): void {
    this.audio.playAt(kind, x, z, arg);
  }

  feedDucks(x: number, z: number): void {
    this.life?.feed(x, z, this.lastNow);
  }

  nearestCritter(x: number, z: number) {
    return this.life?.nearest(x, z, BUG_REACH) ?? null;
  }

  hideCritter(id: number, ms: number): void {
    this.life?.hide(id, this.lastNow + ms);
  }
}
