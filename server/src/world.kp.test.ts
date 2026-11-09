import { beforeEach, describe, expect, it } from 'vitest';
import type { ErrorCode, ServerMsg } from '../../shared/protocol';
import { DEFAULT_LOOK } from '../../shared/wardrobe';
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
