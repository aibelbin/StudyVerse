import { describe, expect, it } from 'vitest';
import { BoothTimer } from './booth';

describe('BoothTimer', () => {
  it('counts 3-2-1 at 1 s steps, then shoots once', () => {
    const t = new BoothTimer();
    expect(t.tick(0)).toBeNull(); // not started
    t.start(1000);
    expect(t.tick(1000)).toBe(3);
    expect(t.tick(1500)).toBeNull();
    expect(t.tick(2000)).toBe(2);
    expect(t.tick(2999)).toBeNull();
    expect(t.tick(3000)).toBe(1);
    expect(t.tick(4000)).toBe('shoot');
    expect(t.tick(9000)).toBeNull();
  });

  it('allows one use per 10 s', () => {
    const t = new BoothTimer();
    expect(t.canUse(0)).toBe(true);
    t.start(0);
    expect(t.canUse(9999)).toBe(false);
    expect(t.canUse(10_000)).toBe(true);
  });
});
