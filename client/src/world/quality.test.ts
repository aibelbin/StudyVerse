import { describe, expect, it } from 'vitest';
import { initialQuality, SlowFrames } from './quality';

describe('graphics quality', () => {
  it('defaults to High, remembers Lite, and ?lite forces it', () => {
    expect(initialQuality('', null)).toBe('high');
    expect(initialQuality('', 'lite')).toBe('lite');
    expect(initialQuality('', 'junk')).toBe('high');
    expect(initialQuality('?debug&lite', 'high')).toBe('lite');
  });

  it('suggests Lite once after 5 s under 40 fps on High', () => {
    const s = new SlowFrames();
    let t = 1000;
    let told = 0;
    for (let i = 0; i < 400; i++) {
      t += 33; // ~30 fps
      if (s.update(0.033, t, 'high')) told++;
    }
    expect(told).toBe(1);
    const fast = new SlowFrames();
    t = 1000;
    for (let i = 0; i < 400; i++) {
      t += 16;
      expect(fast.update(0.016, t, 'high')).toBe(false);
    }
    expect(new SlowFrames().update(0.2, 99999, 'lite')).toBe(false);
  });
});
