import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fallbackBrain, mlpForward, observe, PARAMS } from './brain';
import { runEpisode, stepReward } from './sim';

describe('pet brain', () => {
  it('observes 10 numbers and outputs a bounded velocity', () => {
    const obs = observe({ pet: { x: 0, z: 0, vx: 0, vz: 0 }, owner: { x: 3, z: 4, vx: 1, vz: 0, sitting: false }, boxes: [{ x: 0.5, z: 0, w: 0.4, d: 0.4 }] });
    expect(obs).toHaveLength(10);
    expect(obs[2]).toBeCloseTo(1); // 5 m away, scaled by 5
    expect(obs[8]).toBeLessThan(0); // the box to the east pushes west
    const a = mlpForward(new Float64Array(PARAMS).fill(0.01), obs);
    for (const v of a) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('rewards the comfortable distance band', () => {
    expect(stepReward(2, false, 0, 1, false)).toBeGreaterThan(stepReward(6, false, 0, 1, false));
    expect(stepReward(2, true, 0, 1, false)).toBeLessThan(stepReward(2, false, 0, 1, false));
  });

  it('the hand-written brain beats doing nothing', () => {
    const seeds = [1, 2, 3];
    const fb = seeds.reduce((s, sd) => s + runEpisode(fallbackBrain, sd), 0);
    const idle = seeds.reduce((s, sd) => s + runEpisode(() => [0, 0], sd), 0);
    expect(fb).toBeGreaterThan(idle);
  });

  it('the trained policy, if shipped, beats doing nothing', () => {
    const path = new URL('./policy.json', import.meta.url);
    if (!existsSync(path)) return;
    const policy = JSON.parse(readFileSync(path, 'utf8')) as { params: number[] };
    expect(policy.params).toHaveLength(PARAMS);
    const seeds = [11, 12];
    const trained = seeds.reduce((s, sd) => s + runEpisode((o) => mlpForward(policy.params, o), sd), 0);
    const idle = seeds.reduce((s, sd) => s + runEpisode(() => [0, 0], sd), 0);
    expect(trained).toBeGreaterThan(idle);
  });
});
