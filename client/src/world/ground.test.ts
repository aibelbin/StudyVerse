import { describe, expect, it } from 'vitest';
import { SCENES } from '../../../shared/scenes';
import { paintPlan } from './ground';

describe('painted ground', () => {
  const town = SCENES.town;

  it('paints the same ground from the same seed, at the town\'s proportions', () => {
    const a = paintPlan(town, 31, 512);
    const b = paintPlan(town, 31, 512);
    expect(a).toEqual(b);
    expect(a.h).toBe(Math.round(512 * (130 / 150)));
    expect(paintPlan(town, 32, 512).patches[0]).not.toEqual(a.patches[0]);
  });

  it('shades the grass under every tree', () => {
    const plan = paintPlan(town, 31, 512);
    const tree = town.decor.find((d) => d.kind === 'tree')!;
    const u = (tree.x / 150 + 0.5) * 512;
    const v = (tree.z / 130 + 0.5) * plan.h;
    expect(plan.shades.some((s) => Math.hypot(s.x - u, s.y - v) < 0.01)).toBe(true);
    expect(plan.shades.length).toBeGreaterThan(100);
  });

  it('keeps flower specks off the paths', () => {
    const plan = paintPlan(town, 31, 512);
    const street = town.decor.find((d) => d.kind === 'path' && (d.w ?? 0) > 100)!;
    const inStreet = plan.specks.filter((s) => {
      const x = (s.x / 512 - 0.5) * 150;
      const z = (s.y / plan.h - 0.5) * 130;
      return Math.abs(x - street.x) < (street.w ?? 0) / 2 - 0.2 && Math.abs(z - street.z) < (street.d ?? 0) / 2 - 0.2;
    });
    expect(inStreet).toHaveLength(0);
    expect(plan.specks.length).toBeGreaterThan(1500);
  });
});
