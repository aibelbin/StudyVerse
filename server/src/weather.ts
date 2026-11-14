import { isWeather, nextWeather, spell, type Weather, type WeatherKind } from '../../shared/weather';
import type { Store } from './db';
import type { Port } from './port';

/** The town's shared weather: saved in kv so a restart keeps it, told to everyone when it changes. */
export class WeatherCycle {
  private w: Weather;

  constructor(private store: Store, private port: Port, private rand: () => number) {
    let saved: unknown = null;
    try { saved = JSON.parse(store.getKv('weather') ?? 'null'); } catch { /* a damaged row starts fresh */ }
    this.w = isWeather(saved) ? saved : this.save(nextWeather(null, port.now(), rand));
  }

  now(): Weather {
    return { ...this.w };
  }

  raining(): boolean {
    return this.w.kind === 'rain';
  }

  /** Debug (env WEATHER): start a fresh spell of this kind. */
  force(kind: WeatherKind): void {
    this.set(spell(kind, this.port.now(), this.rand));
  }

  tick(): void {
    const t = this.port.now();
    if (t >= this.w.until) this.set(nextWeather(this.w, t, this.rand));
  }

  private set(w: Weather): void {
    this.save(w);
    this.port.toAll({ t: 'weather', weather: this.now() });
  }

  private save(w: Weather): Weather {
    this.w = w;
    this.store.setKv('weather', JSON.stringify(w));
    return w;
  }
}
