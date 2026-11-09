import { describe, expect, it } from 'vitest';
import { emptyPlot, FLOWER_KINDS, FLOWERS, grow, stageOf, type PlotState } from './garden';
import { holdName } from './types';

const plot = (over: Partial<PlotState> = {}): PlotState => ({ ...emptyPlot(), owner: 'a', ownerName: 'Sam', ...over });

describe('flowers', () => {
  it('has four free and four rare kinds that take longer', () => {
    expect(FLOWER_KINDS).toHaveLength(8);
    const free = FLOWER_KINDS.filter((f) => FLOWERS[f].price === 0);
    expect(free).toEqual(['tulip', 'daisy', 'sunflower', 'poppy']);
    for (const f of FLOWER_KINDS) expect(FLOWERS[f].harvestKp).toBe(FLOWERS[f].price ? 10 : 5);
    expect(Math.min(...FLOWER_KINDS.filter((f) => FLOWERS[f].price).map((f) => FLOWERS[f].growMin))).toBeGreaterThan(45);
  });

  it('names what you hold', () => {
    expect(holdName({ item: 'bouquet', flower: 'rose' })).toBe('bouquet of roses');
    expect(holdName({ item: 'bouquet', flower: 'glowLily' })).toBe('bouquet of glow-lilies');
    expect(holdName({ item: 'latte' })).toBe('latte');
  });
});

describe('stageOf', () => {
  it('goes seed, sprout, bud, bloom', () => {
    expect(stageOf(0, 40)).toBe('seed');
    expect(stageOf(10, 40)).toBe('sprout');
    expect(stageOf(24, 40)).toBe('bud');
    expect(stageOf(40, 40)).toBe('bloom');
  });
});

describe('grow', () => {
  it('adds focus minutes to every growing spot and reports new blooms', () => {
    const s = plot({ spots: [{ flower: 'tulip', progress: 20 }, null, { flower: 'rose', progress: 0 }, { flower: 'daisy', progress: 30 }] });
    const r = grow(s, 10);
    expect(r.state.spots.map((x) => x?.progress ?? null)).toEqual([25, null, 10, 30]); // capped at the bloom
    expect(r.bloomed).toEqual(['tulip']); // the daisy had already bloomed
  });

  it('counts watered minutes 50% extra and uses the boost up', () => {
    const s = plot({ spots: [{ flower: 'glowLily', progress: 0 }, null, null, null], boostMin: 60 });
    const a = grow(s, 40);
    expect(a.state.spots[0]!.progress).toBe(60);
    expect(a.state.boostMin).toBe(20);
    const b = grow(a.state, 40);
    expect(b.state.spots[0]!.progress).toBe(60 + 40 + 10);
    expect(b.state.boostMin).toBe(0);
  });

  it('keeps the boost when nothing is growing', () => {
    expect(grow(plot({ boostMin: 60 }), 25).state.boostMin).toBe(60);
  });
});
