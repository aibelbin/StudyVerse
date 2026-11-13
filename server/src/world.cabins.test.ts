import { beforeEach, describe, expect, it } from 'vitest';
import { cabinSceneId } from '../../shared/art';
import type { ErrorCode, ServerMsg } from '../../shared/protocol';
import { SCENES } from '../../shared/scenes';
import { SceneBook } from '../../shared/scenes/book';
import { DEFAULT_LOOK } from '../../shared/wardrobe';
import { ProfileStore } from './db';
import { World, type Conn } from './world';

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  closed: { code: ErrorCode; message?: string } | null = null;
  send(m: ServerMsg) { this.msgs.push(m); }
  close(code: ErrorCode, message?: string) { this.closed = { code, message }; }
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}

let t: number;
let store: ProfileStore;
let w: World;

function newProfile(name: string) {
  return store.create(name, DEFAULT_LOOK, t).profile;
}
function join(profile: { id: string; name: string; look: typeof DEFAULT_LOOK }) {
  const c = new FakeConn();
  w.join(profile, c);
  return { id: profile.id, c, profile };
}
const joinNew = (name: string) => join(newProfile(name));
const go = (id: string, x: number, z: number) => {
  t += 10_000;
  w.handle(id, { t: 'move', x, z, facing: 0, anim: 'idle' });
};
const lastError = (c: FakeConn) => c.of('error').at(-1);

/** The book as a client would build it from the latest roster it was sent. */
function bookFor(c: FakeConn): SceneBook {
  const b = new SceneBook(SCENES);
  b.setRoster(c.of('village').at(-1)?.cabins ?? c.of('welcome').at(-1)!.cabins);
  return b;
}

function through(id: string, sceneId: string, doorId: string, book: SceneBook) {
  const door = book.get(sceneId)!.doors.find((d) => d.id === doorId)!;
  go(id, door.box.x, door.box.z);
  w.handle(id, { t: 'enterScene', doorId });
}

/** Town → gate → village → this owner's cabin door. */
function walkToCabin(p: { id: string; c: FakeConn }, owner: string) {
  through(p.id, 'town', 'to-village', bookFor(p.c));
  expect(w.view(p.id)!.scene).toBe('village');
  through(p.id, 'village', `cabin-${owner}`, bookFor(p.c));
}

beforeEach(() => {
  t = new Date(2026, 10, 10, 10).getTime();
  store = new ProfileStore(':memory:');
  w = new World(() => t, Math.random, undefined, store);
});

describe('cabins', () => {
  it('gives each newcomer the next lot and tells everyone', () => {
    const a = joinNew('Ann');
    expect(a.c.of('welcome')[0].cabins).toEqual([{ owner: a.id, name: 'Ann', lot: 0, locked: false, mail: false }]);
    const b = joinNew('Bo');
    expect(b.c.of('welcome')[0].cabins.map((e) => [e.name, e.lot])).toEqual([['Ann', 0], ['Bo', 1]]);
    for (const c of [a.c, b.c]) expect(c.of('village').at(-1)!.cabins.map((e) => e.lot)).toEqual([0, 1]);
    // a rejoin builds nothing and broadcasts nothing
    const before = a.c.of('village').length;
    join(b.profile);
    expect(store.cabinCount()).toBe(2);
    expect(a.c.of('village')).toHaveLength(before);
  });

  it('walks from the gate through the village into your own cabin', () => {
    const a = joinNew('Ann');
    walkToCabin(a, a.id);
    expect(w.view(a.id)!.scene).toBe(cabinSceneId(a.id));
    expect(a.c.of('sceneSnapshot').at(-1)!.scene).toBe(cabinSceneId(a.id));
    expect(a.c.of('cabinState').at(-1)!.state).toEqual({ owner: a.id, locked: false, items: [] });
    through(a.id, cabinSceneId(a.id), 'to-village', bookFor(a.c));
    expect(w.view(a.id)!.scene).toBe('village');
  });

  it('a latched door keeps visitors out but not the owner', () => {
    const a = joinNew('Ann');
    const b = joinNew('Bo');
    walkToCabin(a, a.id);
    w.handle(a.id, { t: 'cabin', action: 'lock', on: true });
    expect(b.c.of('village').at(-1)!.cabins.find((e) => e.owner === a.id)!.locked).toBe(true);
    expect(a.c.of('cabinState').at(-1)!.state.locked).toBe(true);
    walkToCabin(b, a.id);
    expect(w.view(b.id)!.scene).toBe('village');
    expect(lastError(b.c)).toMatchObject({ code: 'locked', message: 'The door is latched 🔒' });
    // the owner walks out and back in
    through(a.id, cabinSceneId(a.id), 'to-village', bookFor(a.c));
    through(a.id, 'village', `cabin-${a.id}`, bookFor(a.c));
    expect(w.view(a.id)!.scene).toBe(cabinSceneId(a.id));
    w.handle(a.id, { t: 'cabin', action: 'lock', on: false });
    through(b.id, 'village', `cabin-${a.id}`, bookFor(b.c));
    expect(w.view(b.id)!.scene).toBe(cabinSceneId(a.id));
    expect(b.c.of('cabinState').at(-1)!.state).toMatchObject({ owner: a.id, locked: false });
  });

  it('a latch flip that changes nothing, or comes too soon, re-sends nothing', () => {
    const a = joinNew('Ann');
    const b = joinNew('Bo');
    walkToCabin(a, a.id);
    const n = b.c.of('village').length;
    w.handle(a.id, { t: 'cabin', action: 'lock', on: false }); // already open
    expect(b.c.of('village')).toHaveLength(n);
    w.handle(a.id, { t: 'cabin', action: 'lock', on: true });
    w.handle(a.id, { t: 'cabin', action: 'lock', on: false }); // too soon
    expect(b.c.of('village')).toHaveLength(n + 1);
    expect(lastError(a.c)?.code).toBe('bad_cabin');
    t += 2000;
    w.handle(a.id, { t: 'cabin', action: 'lock', on: false });
    expect(b.c.of('village')).toHaveLength(n + 2);
  });

  it('decorates fixed spots with your paintings, keepsakes and bouquets', () => {
    const ann = newProfile('Ann');
    const bo = newProfile('Bo');
    const art = store.addPainting(ann.id, 'Sunset', 10, 'pixel', Buffer.from([1]), false, t);
    const notMine = store.addPainting(bo.id, 'Hills', 10, 'pixel', Buffer.from([1]), false, t);
    const k = store.addKeepsake(ann.id, bo.id, 'Bo', 'bear', t);
    const rose = store.addBagItem(ann.id, 'bouquet', 'rose', t);
    const a = join(ann);
    const b = join(bo);
    walkToCabin(a, a.id);
    walkToCabin(b, a.id); // a visitor inside sees changes too

    w.handle(a.id, { t: 'cabin', action: 'place', spot: 'w1', item: { kind: 'painting', id: art } });
    w.handle(a.id, { t: 'cabin', action: 'place', spot: 's1', item: { kind: 'keepsake', id: k } });
    w.handle(a.id, { t: 'cabin', action: 'place', spot: 's2', item: { kind: 'bouquet', id: rose } });
    expect(a.c.of('bag').at(-1)!.items).toEqual([]);
    expect(store.bag(a.id)).toEqual([]);
    const items = b.c.of('cabinState').at(-1)!.state.items;
    expect(items).toHaveLength(3);
    expect(items.find((i) => i.spot === 'w1')).toMatchObject({ kind: 'painting', painting: { id: art, title: 'Sunset' } });
    expect(items.find((i) => i.spot === 's1')).toEqual({ spot: 's1', kind: 'keepsake', id: k, gift: 'bear', fromName: 'Bo' });
    expect(items.find((i) => i.spot === 's2')).toEqual({ spot: 's2', kind: 'bouquet', flower: 'rose' });

    w.handle(a.id, { t: 'cabin', action: 'clear', spot: 's2' });
    expect(a.c.of('bag').at(-1)!.items).toMatchObject([{ kind: 'bouquet', flower: 'rose' }]);
    expect(a.c.of('cabinState').at(-1)!.state.items.map((i) => i.spot).sort()).toEqual(['s1', 'w1']);

    // wrong kind for the spot, someone else's painting, an unknown spot
    const errs = a.c.of('error').length;
    w.handle(a.id, { t: 'cabin', action: 'place', spot: 's3', item: { kind: 'painting', id: art } });
    w.handle(a.id, { t: 'cabin', action: 'place', spot: 'w2', item: { kind: 'keepsake', id: k } });
    w.handle(a.id, { t: 'cabin', action: 'place', spot: 'w2', item: { kind: 'painting', id: notMine } });
    w.handle(a.id, { t: 'cabin', action: 'place', spot: 'zz', item: { kind: 'painting', id: art } });
    expect(a.c.of('error').slice(errs).map((e) => e.code)).toEqual(['bad_cabin', 'bad_cabin', 'bad_cabin', 'bad_cabin']);

    // a visitor can't decorate someone else's cabin
    const bErrs = b.c.of('error').length;
    w.handle(b.id, { t: 'cabin', action: 'place', spot: 'w2', item: { kind: 'painting', id: notMine } });
    w.handle(b.id, { t: 'cabin', action: 'lock', on: true });
    expect(b.c.of('error').slice(bErrs).map((e) => e.code)).toEqual(['bad_cabin', 'bad_cabin']);
    expect(store.cabinItems(a.id).map((r) => r.spot)).toEqual(['s1', 'w1']);
  });

  it('moves an item placed twice, returns a replaced bouquet, and drops keepsakes that are gone', () => {
    const ann = newProfile('Ann');
    const k = store.addKeepsake(ann.id, 'x', 'Zed', 'cupcake', t);
    const rose = store.addBagItem(ann.id, 'bouquet', 'rose', t);
    const a = join(ann);
    walkToCabin(a, a.id);
    w.handle(a.id, { t: 'cabin', action: 'place', spot: 's1', item: { kind: 'bouquet', id: rose } });
    w.handle(a.id, { t: 'cabin', action: 'place', spot: 's1', item: { kind: 'keepsake', id: k } });
    expect(a.c.of('bag').at(-1)!.items).toMatchObject([{ kind: 'bouquet', flower: 'rose' }]);
    w.handle(a.id, { t: 'cabin', action: 'place', spot: 's4', item: { kind: 'keepsake', id: k } });
    expect(a.c.of('cabinState').at(-1)!.state.items.map((i) => i.spot)).toEqual(['s4']);
    store.takeKeepsake(a.id, k); // eaten elsewhere
    through(a.id, cabinSceneId(a.id), 'to-village', bookFor(a.c));
    through(a.id, 'village', `cabin-${a.id}`, bookFor(a.c));
    expect(a.c.of('cabinState').at(-1)!.state.items).toEqual([]);
    expect(store.cabinItems(a.id)).toEqual([]);
  });

  it('refuses decorating from outside your cabin', () => {
    const a = joinNew('Ann');
    w.handle(a.id, { t: 'cabin', action: 'lock', on: true });
    expect(lastError(a.c)?.code).toBe('bad_cabin');
    expect(store.cabinOf(a.id)!.locked).toBe(false);
  });
});
