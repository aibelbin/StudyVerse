import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS } from '../constants';
import { inBox, pointInPolygon } from '../geometry';
import { inBay } from '../parking';
import { MOVING_TOYS, TOY_KINDS } from '../toys';
import { GARDEN_BOX, PATHS } from './town/scatter';
import { villageScene } from './village';
import { SceneBook } from './book';
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

  it.each(scenes.map((s) => [s.id, s] as const))('%s: fixed slots are inside bounds and outside colliders', (_id, s) => {
    const moving = new Set(s.toys.filter((t) => MOVING_TOYS.includes(t.kind)).map((t) => t.id));
    for (const slot of s.slots) {
      if (slot.toyId && moving.has(slot.toyId)) continue;
      expect(inside(s.size.w, s.size.d, slot.x, slot.z, PLAYER_RADIUS), slot.id).toBe(true);
      expect(s.colliders.some((c) => inBox(c, slot.x, slot.z, 0.05)), slot.id).toBe(false);
    }
  });

  it.each(scenes.map((s) => [s.id, s] as const))('%s: slots and toys point at each other', (_id, s) => {
    for (const slot of s.slots) {
      if (!slot.toyId) continue;
      const toy = s.toys.find((t) => t.id === slot.toyId);
      expect(toy?.slotIds, slot.id).toContain(slot.id);
    }
    for (const toy of s.toys) for (const id of toy.slotIds ?? []) expect(s.slots.find((x) => x.id === id)?.toyId, id).toBe(toy.id);
  });

  it.each(scenes.map((s) => [s.id, s] as const))('%s: every toy can be reached', (_id, s) => {
    for (const toy of s.toys) {
      expect(inside(s.size.w, s.size.d, toy.x, toy.z, 0), toy.id).toBe(true);
      if (toy.slotIds?.length) continue;
      const spots = [[0, 0], ...Array.from({ length: 8 }, (_, k) => [Math.sin(k * Math.PI / 4), Math.cos(k * Math.PI / 4)])]
        .map(([dx, dz]) => [toy.x + dx * toy.radius * 0.8, toy.z + dz * toy.radius * 0.8]);
      const clear = spots.some(([x, z]) => !s.colliders.some((c) => inBox(c, x, z, PLAYER_RADIUS)));
      expect(clear, toy.id).toBe(true);
    }
  });

  it.each(scenes.map((s) => [s.id, s] as const))('%s: life zones are inside bounds', (_id, s) => {
    for (const z of s.life) expect(inside(s.size.w, s.size.d, z.x, z.z, 0), `${z.kind}@${z.x},${z.z}`).toBe(true);
  });

  it.each(scenes.map((s) => [s.id, s] as const))('%s: spawns are clear of colliders and doors', (_id, s) => {
    for (const sp of s.spawns) {
      expect(inside(s.size.w, s.size.d, sp.x, sp.z, PLAYER_RADIUS), sp.id).toBe(true);
      expect(s.colliders.some((c) => inBox(c, sp.x, sp.z, PLAYER_RADIUS)), sp.id).toBe(false);
      expect(s.doors.some((d) => inBox(d.box, sp.x, sp.z)), sp.id).toBe(false);
    }
  });

  // the village is built from the cabin roster: with no cabins it still exists, so every door resolves
  const book = new SceneBook(SCENES);
  it.each([...scenes, book.get('village')!].map((s) => [s.id, s] as const))('%s: doors lead somewhere real and are reachable', (_id, s) => {
    for (const door of s.doors) {
      const target = book.get(door.toScene);
      expect(target, door.id).toBeDefined();
      expect(target!.spawns.some((sp) => sp.id === door.toSpawn), door.id).toBe(true);
      expect(s.colliders.some((c) => inBox(c, door.box.x, door.box.z, PLAYER_RADIUS)), door.id).toBe(false);
    }
  });

  it('slot and toy ids are unique across all scenes', () => {
    for (const ids of [scenes.flatMap((s) => s.slots.map((x) => x.id)), scenes.flatMap((s) => s.toys.map((x) => x.id))]) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('the town is 150 x 130 and every kind of toy is somewhere', () => {
    expect(SCENES.town.size).toEqual({ w: 150, d: 130 });
    const village = villageScene([{ lot: 0, owner: 'a', name: 'A', locked: false, mail: false }]); // mailboxes only exist for cabins
    const notYet = ['fishing']; // placed in the town by round 4 Task 2: drop this then
    for (const k of TOY_KINDS.filter((k) => !notYet.includes(k))) expect([...scenes, village].some((s) => s.toys.some((t) => t.kind === k)), k).toBe(true);
  });

  it('boats moor on the water, sailboats sail on it, landings are on shore', () => {
    const w = SCENES.town.water!;
    for (const t of SCENES.town.toys.filter((x) => x.kind === 'rowboat')) expect(pointInPolygon(w.outline, t.x, t.z), t.id).toBe(true);
    for (const p of w.sailPaths.flatMap((x) => x.points)) expect(pointInPolygon(w.outline, p[0], p[1])).toBe(true);
    expect(w.landings.length).toBeGreaterThanOrEqual(4);
    for (const l of w.landings) {
      expect(pointInPolygon(w.outline, l.x, l.z)).toBe(false);
      expect(inside(150, 130, l.x, l.z, PLAYER_RADIUS)).toBe(true);
      expect(SCENES.town.colliders.some((c) => inBox(c, l.x, l.z, PLAYER_RADIUS)), `${l.x},${l.z}`).toBe(false);
    }
  });

  it('you can board each boat from the dock', () => {
    const t = SCENES.town;
    for (const id of ['boat-1-row', 'boat-2-row']) {
      const slot = t.slots.find((s) => s.id === id)!;
      // a spot on the dock within reach of the rowing seat
      const ok = [38.35, 39.65].some((x) => Math.hypot(x - slot.x, -35.9 - slot.z) <= 1.5
        && !t.colliders.some((c) => inBox(c, x, -35.9, PLAYER_RADIUS)));
      expect(ok, id).toBe(true);
    }
  });

  it('has the slots later tests rely on', () => {
    const slot = findSlot('town', 'park-b1-a')!;
    expect(slot.x).toBeCloseTo(-35.45);
    expect(slot.z).toBe(2);
    expect(SCENES.library.slots.length).toBe(16);
    expect(SCENES.cafe.slots.length).toBe(12);
  });

  it('has a gate to the village at the east end of the street', () => {
    const door = SCENES.town.doors.find((d) => d.id === 'to-village')!;
    expect(door).toMatchObject({ toScene: 'village', toSpawn: 'gate' });
    expect(door.box.x).toBeGreaterThan(70);
    const spawn = SCENES.town.spawns.find((s) => s.id === 'from-village')!;
    expect(Math.abs(spawn.z - door.box.z)).toBeLessThan(0.1);
    expect(SCENES.town.decor.some((d) => d.kind === 'gate')).toBe(true);
  });
});

describe('car parks', () => {
  const town = SCENES.town;
  const lots = town.decor.filter((d) => d.kind === 'parking');

  it('has two lots of six bays and four trucks', () => {
    expect(lots).toHaveLength(2);
    expect(town.parking).toHaveLength(12);
    expect(town.toys.filter((t) => t.kind === 'truck')).toHaveLength(4);
  });

  it('every truck starts in a bay', () => {
    for (const t of town.toys.filter((x) => x.kind === 'truck')) {
      expect(town.parking!.some((b) => inBay(b, t.x, t.z, t.rot ?? 0)), t.id).toBe(true);
    }
  });

  it('bays are clear of colliders, water and paths other than the street', () => {
    for (const b of town.parking!) {
      for (const [dx, dz] of [[0, 0], [-1.4, -2.6], [1.4, -2.6], [-1.4, 2.6], [1.4, 2.6]]) {
        const x = b.x + dx;
        const z = b.z + dz;
        expect(town.colliders.some((c) => inBox(c, x, z)), `${b.id} ${dx},${dz}`).toBe(false);
        expect(pointInPolygon(town.water!.outline, x, z), b.id).toBe(false);
      }
    }
  });

  it('every lot touches the main street', () => {
    const street = PATHS[0];
    for (const l of lots) expect(Math.abs(l.z + (l.d ?? 0) / 2 - (street.z - street.d / 2))).toBeLessThan(1);
  });

  describe('south park', () => {
    const town = SCENES.town;
    const inBoxes = (boxes: { x: number; z: number; w: number; d: number }[], x: number, z: number, pad = 0) => boxes.some((b) => inBox(b, x, z, pad));

    it('moved the old town 15 m north', () => {
      expect(findSlot('town', 'park-b1-a')!.z).toBe(2); // was 17
      expect(town.parking!.find((b) => b.id.endsWith('1'))!.z).toBeCloseTo(-25.5);
      expect(town.spawns.find((s) => s.id === 'start')).toMatchObject({ x: 0, z: -13.5 });
    });

    it('lays out 20 garden plots inside the garden, clear of paths, colliders and each other', () => {
      const plots = town.toys.filter((t) => t.kind === 'plot');
      expect(plots).toHaveLength(20);
      for (const p of plots) {
        for (const [dx, dz] of [[-1, -0.9], [1, -0.9], [-1, 0.9], [1, 0.9]]) {
          expect(inBox(GARDEN_BOX, p.x + dx, p.z + dz), p.id).toBe(true);
          expect(inBoxes(town.colliders, p.x + dx, p.z + dz), p.id).toBe(false);
        }
        expect(inBoxes(PATHS, p.x, p.z, 1), p.id).toBe(false);
        for (const q of plots) if (q !== p) expect(Math.abs(q.x - p.x) >= 2.8 - 1e-9 || Math.abs(q.z - p.z) >= 2.6 - 1e-9).toBe(true);
      }
      expect(town.slots.some((s) => inBox(GARDEN_BOX, s.x, s.z))).toBe(false);
    });

    it('puts every new seat where you can stand, clear of paths', () => {
      const ids = town.slots.filter((s) => /^(zen|stage)-/.test(s.id));
      expect(ids.length).toBe(5 + 4 + 18 + 3);
      for (const s of ids) {
        expect(inBoxes(town.colliders, s.x, s.z, 0.1), s.id).toBe(false);
        expect(inBoxes(PATHS, s.x, s.z), s.id).toBe(false);
      }
    });

    it('lays out the stage: seats in the audience, stools on the stage, screen behind', () => {
      const st = town.stage!;
      for (const s of town.slots.filter((x) => x.id.startsWith('stage-seat'))) expect(inBox(st.audience, s.x, s.z), s.id).toBe(true);
      for (const s of town.slots.filter((x) => x.id.endsWith('-stool'))) expect(inBox(st.stage, s.x, s.z), s.id).toBe(true);
      expect(st.screen.z).toBeLessThan(st.stage.z - st.stage.d / 2);
      expect(inBox(st.stage, st.audience.x, st.audience.z)).toBe(false);
    });

    it('puts the signposts on grass, clear of paths', () => {
      const posts = town.decor.filter((d) => d.kind === 'signpost');
      expect(posts).toHaveLength(3);
      for (const p of posts) {
        expect(inBoxes(PATHS, p.x, p.z, 0.3), p.label).toBe(false);
        expect(p.label!.split('|').length).toBeGreaterThanOrEqual(2);
      }
    });

    it('decorates the library and the café', () => {
      const kinds = (id: 'library' | 'cafe') => new Set(SCENES[id].decor.map((d) => d.kind));
      for (const k of ['frame', 'sunbeam'] as const) expect(kinds('library').has(k), k).toBe(true);
      for (const k of ['frame', 'pendant', 'chalkboard', 'stringLights'] as const) expect(kinds('cafe').has(k), k).toBe(true);
      expect(SCENES.cafe.decor.filter((d) => d.kind === 'pendant')).toHaveLength(6);
    });

    it('scatters no rocks or grass on the stage or in the zen corner', () => {
      const tidy = [{ x: -30, z: 50, w: 22, d: 18 }, { x: -32, z: 25, w: 14, d: 12 }];
      expect(town.decor.filter((d) => (d.kind === 'rock' || d.kind === 'grass') && inBoxes(tidy, d.x, d.z))).toHaveLength(0);
    });

    it('keeps the zen corner and stage off the paths and inside the map', () => {
      for (const t of town.toys.filter((x) => /^(zen|stage)-/.test(x.id))) {
        expect(inBoxes(PATHS, t.x, t.z), t.id).toBe(false);
        expect(inside(150, 130, t.x, t.z, 2), t.id).toBe(true);
      }
      expect(inBoxes(PATHS, -30, 46, 3)).toBe(false); // the stage
    });
  });
});
