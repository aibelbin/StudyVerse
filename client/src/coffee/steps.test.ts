import { describe, expect, it } from 'vitest';
import { DRINKS } from '../../../shared/types';
import { artScore, bandScore, Crank, Fill, guideShape, Heat, Pour, RECIPES, starsFor, STEPS, Tamp, type Pt } from './steps';

const run = (m: { step(dt: number, held: boolean): void }, held: boolean, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) m.step(1 / 60, held);
};

describe('recipes', () => {
  it('every drink has steps and every step is described', () => {
    for (const d of DRINKS) expect(RECIPES[d].length).toBeGreaterThan(0);
    for (const s of Object.values(RECIPES).flat()) expect(STEPS[s]).toBeDefined();
    expect(RECIPES.espresso).toEqual(['grind', 'tamp', 'shot']);
    expect(RECIPES.latte.at(-1)).toBe('art');
  });
});

describe('step models', () => {
  it('bandScore is 1 inside the band and fades to 0', () => {
    expect(bandScore(0.9, 0.8, 1, 0.35)).toBe(1);
    expect(bandScore(1.175, 0.8, 1, 0.35)).toBeCloseTo(0.5);
    expect(bandScore(0.3, 0.8, 1, 0.35)).toBe(0);
  });

  it('crank fills with angle travelled in either direction', () => {
    const c = new Crank(2);
    for (let i = 0; i <= 4 * 16; i++) c.drag((i / 16) * Math.PI); // two full turns
    expect(c.fill).toBeCloseTo(1, 1);
    expect(c.score()).toBeGreaterThan(0.9);
    c.drag(null);
    c.drag(5); // lifting the pointer and touching down elsewhere adds nothing
    expect(c.fill).toBeCloseTo(1, 1);
    for (let i = 0; i <= 32; i++) c.drag(5 - (i / 16) * Math.PI);
    expect(c.score()).toBe(0); // a turn too far
  });

  it('tamp counts held time in the green and punishes pressing too hard', () => {
    const t = new Tamp();
    run(t, true, 0.9); // ~0.56 pressure, just in the zone
    expect(t.inZone).toBeLessThan(0.1);
    for (let i = 0; i < 6; i++) {
      run(t, true, 0.3);
      run(t, false, 0.25);
    }
    expect(t.over).toBe(false);
    expect(t.score()).toBeGreaterThan(0.5);
    const hard = new Tamp();
    run(hard, true, 2);
    expect(hard.over).toBe(true);
    expect(hard.score()).toBeLessThanOrEqual(0.5);
  });

  it('the shot scores between the marks', () => {
    const f = new Fill();
    run(f, true, 1.0);
    expect(f.level).toBeCloseTo(0.9, 1);
    expect(f.score()).toBe(1);
    run(f, true, 1.0);
    expect(f.score()).toBe(0);
  });

  it('steaming to the zone scores, scalding scores nothing', () => {
    const h = new Heat();
    run(h, true, 3);
    expect(h.temp).toBeGreaterThan(58);
    expect(h.temp).toBeLessThan(65);
    expect(h.score()).toBeGreaterThan(0.8);
    run(h, true, 2);
    expect(h.score()).toBe(0);
  });

  it('pouring tilts, lags and spills', () => {
    const p = new Pour();
    run(p, true, 0.1);
    expect(p.flow).toBe(0); // not tilted enough yet
    run(p, true, 1.2);
    expect(p.level).toBeGreaterThan(0);
    run(p, false, 1);
    expect(p.done).toBe(true);
    const spill = new Pour();
    run(spill, true, 4);
    expect(spill.spilled).toBe(true);
    expect(spill.score()).toBe(0);
  });

  it('a careful pour to the line scores full marks', () => {
    const p = new Pour();
    let guard = 0;
    while (p.level + p.flow * 0.3 < Pour.LINE && guard++ < 600) p.step(1 / 60, true);
    run(p, false, 1);
    expect(Math.abs(p.level - Pour.LINE)).toBeLessThan(0.08);
    expect(p.score()).toBeGreaterThan(0.6);
  });
});

describe('latte art', () => {
  const scale = (pts: Pt[]) => pts.map(([x, y]) => [x * 100, y * 100] as Pt);

  it('each guide has 40 points', () => {
    for (const k of ['heart', 'tulip', 'swirl'] as const) expect(guideShape(k)).toHaveLength(40);
  });

  it('tracing the guide scores high, scribbling elsewhere scores nothing', () => {
    const g = scale(guideShape('heart'));
    expect(artScore(g, g)).toBe(1);
    const half = g.slice(0, 20);
    expect(artScore(g, half)).toBeGreaterThan(0.4);
    expect(artScore(g, half)).toBeLessThan(0.7);
    expect(artScore(g, [[300, 300], [310, 300]])).toBe(0);
    expect(artScore(g, [])).toBe(0);
  });
});

describe('stars', () => {
  it('turns the mean score into stars and ignores skipped steps', () => {
    expect(starsFor([1, 0.9, 0.7])).toBe(3);
    expect(starsFor([0.6, 0.5])).toBe(2);
    expect(starsFor([0.2, 0.4])).toBe(1);
    expect(starsFor([1, 1, null])).toBe(3);
  });
});
