import { describe, expect, it } from 'vitest';
import { fadeMix, FADE_S } from './weather';

const CLEAR = { cloud: 0, rain: 0, rainbow: 0 };

describe('fadeMix', () => {
  it('fades rain in over FADE_S seconds, clouds with it', () => {
    const half = fadeMix(CLEAR, 'rain', FADE_S / 2);
    expect(half).toEqual({ cloud: 0.5, rain: 0.5, rainbow: 0 });
    expect(fadeMix(half, 'rain', FADE_S)).toEqual({ cloud: 1, rain: 1, rainbow: 0 });
  });

  it('crossfades rain into a rainbow and clears the clouds', () => {
    const m = fadeMix({ cloud: 1, rain: 1, rainbow: 0 }, 'rainbow', 1);
    expect(m.rain).toBeCloseTo(0.8);
    expect(m.cloud).toBeCloseTo(0.8);
    expect(m.rainbow).toBeCloseTo(0.2);
  });

  it('cloudy greys without rain; unknown weather fades to clear', () => {
    expect(fadeMix(CLEAR, 'cloudy', 99)).toEqual({ cloud: 1, rain: 0, rainbow: 0 });
    expect(fadeMix({ cloud: 1, rain: 1, rainbow: 1 }, null, 99)).toEqual(CLEAR);
  });
});
