export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'rainbow';
export const WEATHER_KINDS: WeatherKind[] = ['clear', 'cloudy', 'rain', 'rainbow'];

/** The town's shared weather: what it is, since when, and until when (ms). */
export interface Weather {
  kind: WeatherKind;
  since: number;
  until: number;
}

const MIN = 60_000;
export const RAINBOW_MS = 4 * MIN;
const SPELL_MIN_MS = 20 * MIN;
const SPELL_MAX_MS = 40 * MIN;
const WEIGHTS: [WeatherKind, number][] = [['clear', 50], ['cloudy', 30], ['rain', 20]];

/** A spell of this kind starting now: a rainbow lasts 4 min, anything else 20–40 min. */
export function spell(kind: WeatherKind, now: number, rand: () => number): Weather {
  const ms = kind === 'rainbow' ? RAINBOW_MS : SPELL_MIN_MS + rand() * (SPELL_MAX_MS - SPELL_MIN_MS);
  return { kind, since: now, until: now + Math.round(ms) };
}

/** What comes next: a rainbow after rain, otherwise clear 50 / cloudy 30 / rain 20. */
export function nextWeather(prev: Weather | null, now: number, rand: () => number): Weather {
  if (prev?.kind === 'rain') return spell('rainbow', now, rand);
  let r = rand() * 100;
  const kind = WEIGHTS.find(([, w]) => (r -= w) < 0)?.[0] ?? 'rain';
  return spell(kind, now, rand);
}

export function isWeather(v: unknown): v is Weather {
  const w = v as Weather;
  return typeof w === 'object' && w !== null && WEATHER_KINDS.includes(w.kind) && Number.isFinite(w.since) && Number.isFinite(w.until);
}
