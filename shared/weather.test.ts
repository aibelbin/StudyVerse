import { describe, expect, it } from 'vitest';
import { isWeather, nextWeather, RAINBOW_MS } from './weather';

const MIN = 60_000;

describe('nextWeather', () => {
  it('follows rain with a 4 minute rainbow', () => {
    expect(nextWeather({ kind: 'rain', since: 0, until: 100 }, 100, () => 0.5)).toEqual({ kind: 'rainbow', since: 100, until: 100 + RAINBOW_MS });
  });

  it('picks clear 50 / cloudy 30 / rain 20 for 20 to 40 minutes', () => {
    const at = (r: number) => nextWeather(null, 0, () => r).kind;
    expect([at(0), at(0.49), at(0.5), at(0.79), at(0.8), at(0.999)]).toEqual(['clear', 'clear', 'cloudy', 'cloudy', 'rain', 'rain']);
    expect(nextWeather({ kind: 'rainbow', since: 0, until: 0 }, 0, () => 0).until).toBe(20 * MIN);
    const long = nextWeather({ kind: 'clear', since: 0, until: 0 }, 0, () => 0.9999).until;
    expect(long > 39 * MIN && long <= 40 * MIN).toBe(true);
  });

  it('checks the shape', () => {
    expect(isWeather({ kind: 'rain', since: 1, until: 2 })).toBe(true);
    expect(isWeather({ kind: 'snow', since: 1, until: 2 })).toBe(false);
    expect(isWeather(null)).toBe(false);
  });
});
