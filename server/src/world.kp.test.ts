import { beforeEach, describe, expect, it } from 'vitest';
import type { ErrorCode, ServerMsg } from '../../shared/protocol';
import { DEFAULT_LOOK } from '../../shared/wardrobe';
import { SCENES } from '../../shared/scenes';
import { ProfileStore } from './db';
import { World, type Conn } from './world';

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  send(m: ServerMsg) { this.msgs.push(m); }
  close(_c: ErrorCode) {}
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}

const MIN = 60_000;
let t: number;
let store: ProfileStore;
let w: World;

function joinNew(name: string) {
  const { profile } = store.create(name, DEFAULT_LOOK);
  const c = new FakeConn();
  w.join(profile, c);
  return { id: profile.id, c };
}

function study(id: string, minutes: number) {
  t += 10_000;
  w.handle(id, { t: 'move', x: -20, z: 12.5, facing: 0, anim: 'idle' });
  w.handle(id, { t: 'sit', slotId: 'park-b1-a' });
  w.handle(id, { t: 'startSession', focusMin: minutes, breakMin: 5 });
  t += minutes * MIN + 1000;
  w.tick();
  w.handle(id, { t: 'stand' });
}

beforeEach(() => {
  t = new Date(2026, 10, 9, 10).getTime();
  store = new ProfileStore(':memory:');
  w = new World(() => t, Math.random, undefined, store);
});

describe('knowledge points', () => {
  it('starts with an empty wallet and the day total', () => {
    const { c } = joinNew('Sam');
    expect(c.of('welcome')[0]).toMatchObject({ wallet: { kp: 0, streak: 0, owned: [], pets: [], pet: null }, treeMinutes: 0 });
  });

  it('pays for finished focus, grows the streak and the town tree', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    study(a.id, 25);
    expect(a.c.of('wallet').at(-1)!.wallet).toMatchObject({ kp: 30, streak: 1 });
    expect(b.c.of('tree').at(-1)!.minutes).toBe(25);
    expect(b.c.of('wallet')).toEqual([]); // wallets are private
    study(a.id, 10);
    expect(a.c.of('wallet').at(-1)!.wallet.kp).toBe(40);
    t += 24 * 60 * MIN;
    study(a.id, 10);
    expect(a.c.of('wallet').at(-1)!.wallet).toMatchObject({ kp: 60, streak: 2 });
  });

  it('pays nothing for an early quit', () => {
    const a = joinNew('Sam');
    t += 10_000;
    w.handle(a.id, { t: 'move', x: -20, z: 12.5, facing: 0, anim: 'idle' });
    w.handle(a.id, { t: 'sit', slotId: 'park-b1-a' });
    w.handle(a.id, { t: 'startSession', focusMin: 25, breakMin: 5 });
    t += 10 * MIN;
    w.handle(a.id, { t: 'stand' });
    expect(a.c.of('wallet')).toEqual([]);
  });
});

describe('wardrobe', () => {
  it('buys with KP and refuses what you cannot afford or free items', () => {
    const a = joinNew('Sam');
    study(a.id, 25); // 30 KP
    w.handle(a.id, { t: 'buy', itemId: 'crown' });
    expect(a.c.of('error').at(-1)!.code).toBe('no_kp');
    w.handle(a.id, { t: 'buy', itemId: 'beanie' });
    expect(a.c.of('error').at(-1)!.code).toBe('bad_item');
    w.handle(a.id, { t: 'buy', itemId: 'scarf' });
    expect(a.c.of('wallet').at(-1)!.wallet).toMatchObject({ kp: 0, owned: ['scarf'] });
  });

  it('only lets you wear what you own', () => {
    const a = joinNew('Sam');
    w.handle(a.id, { t: 'updateLook', look: { ...DEFAULT_LOOK, top: 'hoodie' } });
    expect(a.c.of('error').at(-1)!.code).toBe('bad_look');
    study(a.id, 25);
    w.handle(a.id, { t: 'buy', itemId: 'tee' });
    w.handle(a.id, { t: 'updateLook', look: { ...DEFAULT_LOOK, top: 'tee', hat: 'cap' } });
    expect(w.view(a.id)!.look).toMatchObject({ top: 'tee', hat: 'cap' });
  });
});

describe('notice board', () => {
  it('posts, lists, enforces the cooldown and lets authors take notes down', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    w.handle(a.id, { t: 'postNote', text: '  study group at 8?  ' });
    expect(b.c.of('notes').at(-1)!.list.map((n) => [n.name, n.text])).toEqual([['Sam', 'study group at 8?']]);
    w.handle(a.id, { t: 'postNote', text: 'again' });
    expect(a.c.of('error').at(-1)!.code).toBe('bad_note');
    t += 31_000;
    w.handle(a.id, { t: 'postNote', text: 'x'.repeat(141) });
    expect(a.c.of('error').at(-1)!.code).toBe('bad_note');
    const id = b.c.of('notes').at(-1)!.list[0].id;
    w.handle(b.id, { t: 'deleteNote', id });
    expect(store.notes(10)).toHaveLength(1);
    w.handle(a.id, { t: 'deleteNote', id });
    expect(store.notes(10)).toHaveLength(0);
    w.handle(b.id, { t: 'getNotes' });
    expect(b.c.of('notes').at(-1)!.list).toEqual([]);
  });

  it('caps notes per author', () => {
    const a = joinNew('Sam');
    for (let i = 0; i < 6; i++) {
      t += 31_000;
      w.handle(a.id, { t: 'postNote', text: `note ${i}` });
    }
    expect(store.noteCount(a.id)).toBe(5);
    expect(a.c.of('error').at(-1)!.code).toBe('bad_note');
  });
});

describe('do not disturb', () => {
  it('shows on the player and blocks cheers aimed at them', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    w.handle(b.id, { t: 'setDnd', on: true });
    expect(a.c.of('playerUpdated').at(-1)!.player).toMatchObject({ id: b.id, dnd: true, voice: false });
    w.handle(a.id, { t: 'emote', kind: 'clap', targetId: b.id });
    expect(b.c.of('emote')).toEqual([]);
  });
});

describe('coffee', () => {
  function toCafe(id: string) {
    t += 10_000;
    w.handle(id, { t: 'move', x: 12, z: -2.35, facing: 0, anim: 'idle' });
    w.handle(id, { t: 'enterScene', doorId: 'to-cafe' });
    t += 10_000;
    w.handle(id, { t: 'move', x: -2.8, z: -2.2, facing: 0, anim: 'idle' });
  }

  it('brews at the machine, carries the cup for a while, and announces it', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    toCafe(a.id);
    w.handle(a.id, { t: 'brew', drink: 'latte', stars: 3 });
    expect(w.view(a.id)!.holding).toMatchObject({ item: 'latte', stars: 3 });
    expect(b.c.of('feed').at(-1)!.event.text).toBe('☕ Sam made a ★★★ latte');
    w.handle(a.id, { t: 'brew', drink: 'cocoa', stars: 1 });
    expect(w.view(a.id)!.holding!.item).toBe('latte'); // cooldown
    t += 10 * MIN;
    w.tick();
    expect(w.view(a.id)!.holding).toBeNull();
  });

  it('needs you at the machine', () => {
    const a = joinNew('Sam');
    w.handle(a.id, { t: 'brew', drink: 'latte', stars: 3 });
    expect(a.c.of('error').at(-1)!.code).toBe('bad_toy');
  });
});

describe('trucks', () => {
  const truckState = (c: FakeConn) => c.of('toyState').filter((m) => m.toyId === 'truck-1').at(-1)?.state;

  function board(id: string, slotId = 'truck-1-drive') {
    const slot = SCENES.town.slots.find((s) => s.id === slotId)!;
    t += 10_000;
    w.handle(id, { t: 'move', x: slot.x, z: slot.z + 1.0, facing: 0, anim: 'idle' });
    w.handle(id, { t: 'sit', slotId });
  }

  it('drives on land, refuses water, walls and speeding, and does not drive home', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    board(a.id);
    expect(w.view(a.id)!.slotId).toBe('truck-1-drive');
    const truck = SCENES.town.toys.find((x) => x.id === 'truck-1')!;
    t += 1000;
    w.handle(a.id, { t: 'move', x: truck.x + 5, z: truck.z, facing: Math.PI / 2, anim: 'sit' });
    expect(truckState(b.c)).toMatchObject({ kind: 'truck', x: truck.x + 5 });
    t += 100;
    w.handle(a.id, { t: 'move', x: truck.x + 15, z: truck.z, facing: 0, anim: 'sit' });
    expect(truckState(a.c)).toMatchObject({ x: truck.x + 5 }); // too fast: snapped back
    t += 60_000;
    w.handle(a.id, { t: 'move', x: 28, z: -24, facing: 0, anim: 'sit' }); // the middle of the lake
    expect(truckState(a.c)).toMatchObject({ x: truck.x + 5 });
    w.handle(a.id, { t: 'stand' });
    const v = w.view(a.id)!;
    expect(Math.hypot(v.x - (truck.x + 5), v.z - truck.z)).toBeGreaterThan(1.5);
    expect(truckState(b.c)).toMatchObject({ x: truck.x + 5, returnFrom: null });
  });

  it('anyone in the truck can honk, people outside cannot', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    board(b.id, 'truck-1-bed-l');
    w.handle(b.id, { t: 'use', toyId: 'truck-1', action: 'honk' });
    expect(b.c.of('toyEvent').filter((e) => e.action === 'honk')).toHaveLength(1); // any seat in the truck may honk
    w.handle(a.id, { t: 'use', toyId: 'truck-1', action: 'honk' });
    expect(a.c.of('error').at(-1)!.code).toBe('not_seated');
  });
});
