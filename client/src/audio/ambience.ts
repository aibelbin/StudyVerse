import type { SceneDef } from '../../../shared/scenes/types';
import type { AudioEngine, Emitter } from './engine';
import { burst, chirp, tone } from './voices';

/** Birdsong by day, crickets at night, water near the lake and crackle by a lit fire. */
export class Ambience {
  private water: Emitter | null = null;
  private fire: Emitter | null = null;
  private nextBird = 0;
  private nextCricket = 0;
  private nextCrackle = 0;
  private nextLap = 0;
  private fireSpot: { x: number; z: number } | null;
  private pond: Emitter | null = null;
  private pondSpot: { x: number; z: number } | null;
  private nextTrickle = 0;
  private nextChime = 0;

  constructor(private engine: AudioEngine, private def: SceneDef) {
    const f = def.toys.find((t) => t.kind === 'campfire');
    this.fireSpot = f ? { x: f.x, z: f.z } : null;
    const k = def.toys.find((t) => t.kind === 'koi');
    this.pondSpot = k ? { x: k.x, z: k.z } : null;
  }

  update(night: number, fireLit: boolean, me: { x: number; z: number }): void {
    const c = this.engine.ctx();
    const bus = this.engine.ambient();
    if (!c || !bus || this.engine.muted) return;
    const now = c.currentTime;

    if (now > this.nextBird) {
      this.nextBird = now + 1.5 + Math.random() * 3.5;
      const g = (1 - night) * 0.035;
      if (g > 0.003) {
        const base = 2200 + Math.random() * 1800;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) chirp(c, bus, base, base * (1.2 + Math.random() * 0.4), now + i * 0.11, g, 0.08);
      }
    }
    if (now > this.nextCricket) {
      this.nextCricket = now + 0.9 + Math.random() * 0.6;
      const g = night * 0.012;
      if (g > 0.002) for (let i = 0; i < 3; i++) chirp(c, bus, 4500, 4400, now + i * 0.07, g, 0.045, 'square');
    }

    const w = this.def.water;
    if (w) {
      this.water ??= this.engine.emitter(me.x, me.z);
      if (this.water) {
        let best = w.outline[0];
        for (const p of w.outline) if (Math.hypot(p[0] - me.x, p[1] - me.z) < Math.hypot(best[0] - me.x, best[1] - me.z)) best = p;
        [this.water.x, this.water.z] = best;
        if (now > this.nextLap) {
          this.nextLap = now + 0.7 + Math.random() * 0.8;
          burst(c, this.water.input, now, 500 + Math.random() * 300, 0.6, 0.05, 0.9);
        }
      }
    }

    if (this.pondSpot) {
      // The koi pond: a soft trickle and, now and then, a few quiet chime notes.
      this.pond ??= this.engine.emitter(this.pondSpot.x, this.pondSpot.z);
      if (this.pond) {
        if (now > this.nextTrickle) {
          this.nextTrickle = now + 0.12 + Math.random() * 0.2;
          burst(c, this.pond.input, now, 2400 + Math.random() * 2400, 3, 0.025, 0.12);
        }
        if (now > this.nextChime) {
          this.nextChime = now + 6 + Math.random() * 8;
          const penta = [1046.5, 1174.7, 1318.5, 1568, 1760];
          for (let i = 0; i < 3; i++) tone(c, this.pond.input, 'sine', penta[Math.floor(Math.random() * penta.length)], now + i * 0.25, 0.03, 2.2);
        }
      }
    }

    if (this.fireSpot) {
      this.fire ??= this.engine.emitter(this.fireSpot.x, this.fireSpot.z);
      if (this.fire) {
        this.fire.level = fireLit ? 1 : 0;
        if (fireLit && now > this.nextCrackle) {
          this.nextCrackle = now + 0.05 + Math.random() * 0.2;
          burst(c, this.fire.input, now, 2000 + Math.random() * 3000, 2, 0.08 + Math.random() * 0.08, 0.03);
        }
      }
    }
  }
}
