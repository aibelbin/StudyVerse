import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS } from '../constants';
import { inBox } from '../geometry';
import { findSlot, SCENES, START_SCENE, START_SPAWN } from './index';

const scenes = Object.values(SCENES);
const inside = (w: number, d: number, x: number, z: number, pad: number) =>
  Math.abs(x) <= w / 2 - pad && Math.abs(z) <= d / 2 - pad;

describe('scene data', () => {
  it('has the start scene and spawn', () => {
    expect(SCENES[START_SCENE].spawns.some((s) => s.id === START_SPAWN)).toBe(true);
  });

  it('keys match ids', () => {
    for (const [key, s] of Object.entries(SCENES)) expect(s.id).toBe(key);
  });

  it.each(scenes.map((s) => [s.id, s] as const))('%s: slots are inside bounds and outside colliders', (_id, s) => {
    for (const slot of s.slots) {
      expect(inside(s.size.w, s.size.d, slot.x, slot.z, PLAYER_RADIUS), slot.id).toBe(true);
      expect(s.colliders.some((c) => inBox(c, slot.x, slot.z, 0.05)), slot.id).toBe(false);
    }
  });

  it.each(scenes.map((s) => [s.id, s] as const))('%s: spawns are clear of colliders and doors', (_id, s) => {
    for (const sp of s.spawns) {
      expect(inside(s.size.w, s.size.d, sp.x, sp.z, PLAYER_RADIUS), sp.id).toBe(true);
      expect(s.colliders.some((c) => inBox(c, sp.x, sp.z, PLAYER_RADIUS)), sp.id).toBe(false);
      expect(s.doors.some((d) => inBox(d.box, sp.x, sp.z)), sp.id).toBe(false);
    }
  });

  it.each(scenes.map((s) => [s.id, s] as const))('%s: doors lead somewhere real and are reachable', (_id, s) => {
    for (const door of s.doors) {
      const target = SCENES[door.toScene];
      expect(target, door.id).toBeDefined();
      expect(target.spawns.some((sp) => sp.id === door.toSpawn), door.id).toBe(true);
      expect(s.colliders.some((c) => inBox(c, door.box.x, door.box.z, PLAYER_RADIUS)), door.id).toBe(false);
    }
  });

  it('slot ids are unique across all scenes', () => {
    const ids = scenes.flatMap((s) => s.slots.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has the slots later tests rely on', () => {
    const slot = findSlot('town', 'park-b1-a')!;
    expect(slot.x).toBeCloseTo(5.55);
    expect(slot.z).toBe(5);
    expect(SCENES.library.slots.length).toBe(16);
    expect(SCENES.cafe.slots.length).toBe(12);
  });
});
