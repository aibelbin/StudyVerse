import { describe, expect, it } from 'vitest';
import { cabinSceneId, LOT_XS, lotSpawn, villageRows, type CabinEntry } from '../art';
import { PLAYER_RADIUS } from '../constants';
import { inBox } from '../geometry';
import { MOVING_TOYS } from '../toys';
import { SceneBook } from './book';
import { CABIN_SPOTS, cabinScene } from './cabin';
import { SCENES } from './index';
import type { SceneDef } from './types';
import { villageScene } from './village';

// copied from scenes.test.ts (not exported from a test file)
const inside = (w: number, d: number, x: number, z: number, pad: number) =>
  Math.abs(x) <= w / 2 - pad && Math.abs(z) <= d / 2 - pad;

function invariants(s: SceneDef) {
  const moving = new Set(s.toys.filter((t) => MOVING_TOYS.includes(t.kind)).map((t) => t.id));
  for (const slot of s.slots) {
    if (slot.toyId && moving.has(slot.toyId)) continue;
    expect(inside(s.size.w, s.size.d, slot.x, slot.z, PLAYER_RADIUS), slot.id).toBe(true);
    expect(s.colliders.some((c) => inBox(c, slot.x, slot.z, 0.05)), slot.id).toBe(false);
  }
  for (const toy of s.toys) {
    expect(inside(s.size.w, s.size.d, toy.x, toy.z, 0), toy.id).toBe(true);
    if (toy.slotIds?.length) continue;
    const spots = [[0, 0], ...Array.from({ length: 8 }, (_, k) => [Math.sin(k * Math.PI / 4), Math.cos(k * Math.PI / 4)])]
      .map(([dx, dz]) => [toy.x + dx * toy.radius * 0.8, toy.z + dz * toy.radius * 0.8]);
    expect(spots.some(([x, z]) => !s.colliders.some((c) => inBox(c, x, z, PLAYER_RADIUS))), toy.id).toBe(true);
  }
  for (const z of s.life) expect(inside(s.size.w, s.size.d, z.x, z.z, 0), `${z.kind}@${z.x},${z.z}`).toBe(true);
  for (const sp of s.spawns) {
    expect(inside(s.size.w, s.size.d, sp.x, sp.z, PLAYER_RADIUS), sp.id).toBe(true);
    expect(s.colliders.some((c) => inBox(c, sp.x, sp.z, PLAYER_RADIUS)), sp.id).toBe(false);
    expect(s.doors.some((d) => inBox(d.box, sp.x, sp.z)), sp.id).toBe(false);
  }
  for (const door of s.doors) {
    expect(inside(s.size.w, s.size.d, door.box.x, door.box.z, door.box.d / 2), door.id).toBe(true);
    expect(s.colliders.some((c) => inBox(c, door.box.x, door.box.z, PLAYER_RADIUS)), door.id).toBe(false);
  }
  for (const d of s.decor) expect(inside(s.size.w, s.size.d, d.x, d.z, 0) || s.theme.indoor === false, `${d.kind}@${d.x},${d.z}`).toBe(true);
}

const entry = (i: number): CabinEntry => ({ owner: `p${i}`, name: `Player ${i}`, lot: i, locked: i === 2 });
const roster = (n: number) => Array.from({ length: n }, (_, i) => entry(i));

describe('village', () => {
  it.each([0, 1, 6, 7])('%i cabins: scene invariants hold', (n) => {
    invariants(villageScene(roster(n)));
  });

  it.each([0, 1, 6, 7])('%i cabins: colliders, doors and spawns are inside the bounds; the hedge is 1.5 m in', (n) => {
    const s = villageScene(roster(n));
    const { w, d } = s.size;
    for (const c of s.colliders) expect(Math.abs(c.x) + c.w / 2 <= w / 2 && Math.abs(c.z) + c.d / 2 <= d / 2, `${c.x},${c.z}`).toBe(true);
    for (const b of s.doors.map((x) => x.box)) expect(inside(w, d, b.x, b.z, Math.max(b.w, b.d) / 2)).toBe(true);
    // non-tree-line decor (the edge trees sit outside, by design) is inside
    const line = (x: number, z: number) => Math.abs(x) > w / 2 - 1.5 || Math.abs(z) > d / 2 - 1.5;
    for (const o of s.decor) if (!((o.kind === 'tree' || o.kind === 'pine') && line(o.x, o.z))) expect(inside(w, d, o.x, o.z, 0), `${o.kind}@${o.x},${o.z}`).toBe(true);
    const hedges = s.decor.filter((o) => o.kind === 'hedge');
    expect(hedges.map((h) => Math.abs(h.z) || Math.abs(h.x)).sort()).toEqual([w / 2 - 1.5, w / 2 - 1.5, d / 2 - 1.5, d / 2 - 1.5].sort());
  });

  it('grows a row per six cabins and keeps the gate spawn inside', () => {
    expect([0, 6, 7].map((n) => villageRows(n))).toEqual([1, 2, 3]);
    for (const [n, rows] of [[0, 1], [6, 2], [7, 3]]) {
      const s = villageScene(roster(n));
      expect(s.decor.filter((o) => o.kind === 'path' && o.w === 50)).toHaveLength(rows);
      const gate = s.spawns.find((x) => x.id === 'gate')!;
      expect(inside(s.size.w, s.size.d, gate.x, gate.z, PLAYER_RADIUS)).toBe(true);
    }
  });

  it.each([0, 1, 6, 7])('%i cabins: occupied lots have a door and spawn in front; empty ones a free lot sign', (n) => {
    const s = villageScene(roster(n));
    const rows = villageRows(n);
    const cabins = s.decor.filter((o) => o.kind === 'cabin');
    const free = s.decor.filter((o) => o.kind === 'signpost' && o.label === 'free lot');
    expect(cabins).toHaveLength(n);
    expect(free).toHaveLength(rows * 6 - n);
    for (const e of roster(n)) {
      const door = s.doors.find((d) => d.id === `cabin-${e.owner}`)!;
      expect(door).toMatchObject({ toScene: cabinSceneId(e.owner), toSpawn: 'entrance' });
      const sp = s.spawns.find((x) => x.id === lotSpawn(e.lot))!;
      expect(sp).toBeDefined();
      const body = s.colliders.find((c) => c.w === 5 && c.d === 4.5 && c.x === door.box.x && Math.abs(door.box.z - c.z) < 4)!;
      expect(body.x).toBe(LOT_XS[e.lot % 6]);
      expect(door.box.z - door.box.d / 2).toBeGreaterThan(body.z + body.d / 2);
      expect(inBox(door.box, sp.x, sp.z)).toBe(false);
      expect(sp.z).toBeGreaterThan(door.box.z);
    }
    expect(s.decor.find((o) => o.kind === 'cabin' && o.label === '🔒 Player 2') !== undefined).toBe(n > 2);
  });

  it('has the gate to town and the studio door, both resolvable', () => {
    const book = new SceneBook(SCENES);
    const s = book.get('village')!;
    expect(s.doors.find((d) => d.id === 'to-town')).toMatchObject({ toScene: 'town', toSpawn: 'from-village' });
    expect(s.doors.find((d) => d.id === 'to-studio')).toMatchObject({ toScene: 'studio', toSpawn: 'entrance' });
    for (const d of s.doors) expect(book.get(d.toScene)?.spawns.some((x) => x.id === d.toSpawn), d.id).toBe(true);
    expect(SCENES.studio.doors[0]).toMatchObject({ toScene: 'village', toSpawn: 'studio-door' });
    expect(s.spawns.some((x) => x.id === 'studio-door')).toBe(true);
  });
});

describe('cabin', () => {
  const e = entry(3);
  const s = cabinScene(e);

  it('holds the scene invariants', () => invariants(s));

  it('is named for its owner and leads back to its lot', () => {
    expect(s).toMatchObject({ id: 'cabin:p3', name: "Player 3's cabin", where: "at Player 3's cabin", size: { w: 7, d: 6 } });
    expect(s.doors).toEqual([{ id: 'to-village', box: { x: 0, z: 2.6, w: 1.6, d: 0.8 }, toScene: 'village', toSpawn: 'lot-3' }]);
    const book = new SceneBook(SCENES);
    book.setRoster([e]);
    expect(book.get('village')!.spawns.some((x) => x.id === 'lot-3')).toBe(true);
  });

  it('seats you at the desk and spawns you clear of the door', () => {
    const seat = s.slots.find((x) => x.id === 'cabin:p3-desk-n')!;
    expect(inside(7, 6, seat.x, seat.z, PLAYER_RADIUS)).toBe(true);
    expect(s.colliders.some((c) => inBox(c, seat.x, seat.z, 0.05))).toBe(false);
    const sp = s.spawns[0];
    expect(inBox(s.doors[0].box, sp.x, sp.z, PLAYER_RADIUS)).toBe(false);
  });

  it('has six wall spots and four shelf spots inside the room', () => {
    expect(s.spots).toBe(CABIN_SPOTS);
    expect(CABIN_SPOTS.filter((x) => x.kind === 'wall')).toHaveLength(6);
    expect(CABIN_SPOTS.filter((x) => x.kind === 'shelf')).toHaveLength(4);
    expect(new Set(CABIN_SPOTS.map((x) => x.id)).size).toBe(10);
    for (const sp of CABIN_SPOTS) expect(inside(7, 6, sp.x, sp.z, 0), sp.id).toBe(true);
  });
});

describe('SceneBook', () => {
  it('serves fixed scenes and builds the village with no roster', () => {
    const book = new SceneBook();
    expect(book.get('town')).toBe(SCENES.town);
    expect(book.get('village')!.decor.filter((o) => o.kind === 'cabin')).toHaveLength(0);
    expect(book.name('cafe')).toBe('Café');
    expect(book.name('nowhere')).toBe('nowhere');
    expect(book.get('nowhere')).toBeUndefined();
  });

  it('knows a cabin only once its owner is on the roster, and rebuilds on setRoster', () => {
    const book = new SceneBook(SCENES);
    expect(book.get('cabin:x')).toBeUndefined();
    const v0 = book.get('village')!;
    expect(book.get('village')).toBe(v0);
    book.setRoster([{ owner: 'x', name: 'Ex', lot: 0, locked: false }]);
    expect(book.version).toBe(1);
    const cabin = book.get('cabin:x')!;
    expect(cabin.name).toBe("Ex's cabin");
    expect(book.get('cabin:x')).toBe(cabin);
    expect(book.name('cabin:x')).toBe("Ex's cabin");
    const v1 = book.get('village')!;
    expect(v1).not.toBe(v0);
    expect(v1.doors.some((d) => d.id === 'cabin-x')).toBe(true);
    book.setRoster([]);
    expect(book.version).toBe(2);
    expect(book.get('cabin:x')).toBeUndefined();
  });
});
