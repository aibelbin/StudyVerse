import { beforeEach, describe, expect, it } from 'vitest';
import { HOLES } from '../../shared/golf';
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

let t: number;
let store: ProfileStore;
let w: World;

function joinNew(name: string) {
  const { profile } = store.create(name, DEFAULT_LOOK);
  const c = new FakeConn();
  w.join(profile, c);
  return { id: profile.id, c, profile };
}
const go = (id: string, x: number, z: number) => {
  t += 10_000;
  w.handle(id, { t: 'move', x, z, facing: 0, anim: 'idle' });
};
const tee = (id: string, n: number) => {
  const h = HOLES[n - 1];
  go(id, h.tee.x, h.tee.z);
  w.handle(id, { t: 'golfTee', hole: n });
};
const ballAt = (id: string, x: number, y: number, z: number) => {
  t += 100;
  w.handle(id, { t: 'golfBall', x, y, z });
};
/** Plays hole n in `strokes` putts, the last one dropping in the cup. */
function play(id: string, n: number, strokes: number) {
  tee(id, n);
  const h = HOLES[n - 1];
  for (let i = 0; i < strokes; i++) w.handle(id, { t: 'golfShot', hole: n });
  ballAt(id, h.cup.x + 0.1, h.cup.y + 0.1, h.cup.z);
  w.handle(id, { t: 'golfHoled', hole: n });
}
const card = (c: FakeConn) => c.of('golfCard').at(-1)!;
const board = (c: FakeConn) => c.of('toyState').filter((m) => m.toyId === 'golf-board').at(-1)?.state;

beforeEach(() => {
  t = new Date(2026, 10, 9, 10).getTime();
  store = new ProfileStore(':memory:');
  w = new World(() => t, Math.random, undefined, store);
});

describe('mini-golf holes', () => {
  it('starts a hole only from its tee, and shows the ball to everyone', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    go(a.id, 0, -13.5);
    w.handle(a.id, { t: 'golfTee', hole: 1 });
    expect(a.c.of('error').at(-1)).toMatchObject({ code: 'bad_golf' });
    tee(a.id, 1);
    expect(b.c.of('golfBall').at(-1)).toMatchObject({ id: a.id, hole: 1, x: HOLES[0].tee.x, z: HOLES[0].tee.z });
    expect(card(a.c)).toMatchObject({ hole: 1, strokes: 0 });
  });

  it('counts putts and penalties, caps at six putts, and scores a pick-up as 7', () => {
    const a = joinNew('Sam');
    tee(a.id, 3);
    for (let i = 0; i < 5; i++) w.handle(a.id, { t: 'golfShot', hole: 3 });
    w.handle(a.id, { t: 'golfShot', hole: 3, penalty: true });
    expect(card(a.c).strokes).toBe(6);
    w.handle(a.id, { t: 'golfShot', hole: 3 });
    expect(a.c.of('error').at(-1)!.message).toMatch(/pick up/);
    w.handle(a.id, { t: 'golfPickUp', hole: 3 });
    expect(card(a.c)).toMatchObject({ hole: null, card: [null, null, 7, null, null, null] });
    expect(a.c.of('golfDone').at(-1)).toMatchObject({ hole: 3, strokes: 7, holeInOne: false });
  });

  it('accepts a holed ball only near the cup', () => {
    const a = joinNew('Sam');
    tee(a.id, 1);
    w.handle(a.id, { t: 'golfShot', hole: 1 });
    ballAt(a.id, 18, 0.17, 41);
    w.handle(a.id, { t: 'golfHoled', hole: 1 });
    expect(a.c.of('error').at(-1)!.message).toMatch(/isn't in the cup/);
    w.handle(a.id, { t: 'golfShot', hole: 1 });
    ballAt(a.id, HOLES[0].cup.x, 0.1, HOLES[0].cup.z + 0.2);
    w.handle(a.id, { t: 'golfHoled', hole: 1 });
    expect(card(a.c).card[0]).toBe(2);
  });

  it('celebrates a hole-in-one in the feed', () => {
    const a = joinNew('Sam');
    play(a.id, 2, 1);
    expect(a.c.of('golfDone').at(-1)).toMatchObject({ hole: 2, strokes: 1, holeInOne: true });
    expect(a.c.of('feed').at(-1)!.event.text).toBe('🎉 Sam got a hole-in-one on the Windmill!');
  });

  it('relays the rolling ball to others, at most every 80 ms', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    tee(a.id, 1);
    const before = b.c.of('golfBall').length;
    ballAt(a.id, 12, 0.17, 41);
    t += 10;
    w.handle(a.id, { t: 'golfBall', x: 12.2, y: 0.17, z: 41 });
    ballAt(a.id, 13, 0.17, 41);
    expect(b.c.of('golfBall').length - before).toBe(2);
    expect(a.c.of('golfBall').filter((m) => m.x === 12)).toHaveLength(0); // not echoed to the player
  });

  it('removes your ball when you leave, sit down or disconnect', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    tee(a.id, 1);
    w.handle(a.id, { t: 'golfQuit' });
    expect(b.c.of('golfGone').at(-1)).toEqual({ t: 'golfGone', id: a.id });
    tee(a.id, 1);
    w.disconnect(a.id, a.c);
    expect(b.c.of('golfGone')).toHaveLength(2);
  });
});

describe('mini-golf rounds', () => {
  it('posts a full round to today\'s board (best 5, one each) and pays KP once a day', () => {
    const a = joinNew('Sam');
    [3, 3, 3, 3, 3, 3].forEach((s, i) => play(a.id, i + 1, s)); // 18: par
    expect(board(a.c)).toMatchObject({ kind: 'golfBoard', top: [{ name: 'Sam', strokes: 18 }], paid: [a.id] });
    expect(store.wallet(a.id).kp).toBe(6);
    expect(a.c.of('feed').at(-1)!.event.text).toBe('⛳ Sam went round the mini-golf in 18');
    expect(card(a.c).card).toEqual([null, null, null, null, null, null]);
    [2, 2, 3, 3, 3, 3].forEach((s, i) => play(a.id, i + 1, s)); // 16: better, but no more KP today
    expect(board(a.c)).toMatchObject({ top: [{ name: 'Sam', strokes: 16 }] });
    expect(store.wallet(a.id).kp).toBe(6);
  });

  it('pays 3 KP over par, and starts a new board on a new day', () => {
    const a = joinNew('Sam');
    [4, 4, 4, 4, 4, 4].forEach((s, i) => play(a.id, i + 1, s));
    expect(store.wallet(a.id).kp).toBe(3);
    t += 24 * 60 * 60_000;
    const b = joinNew('Jo');
    [3, 3, 3, 3, 3, 3].forEach((s, i) => play(b.id, i + 1, s));
    expect(board(b.c)).toMatchObject({ top: [{ name: 'Jo', strokes: 18 }], paid: [b.id] });
  });

  it('keeps the board across a restart', () => {
    const a = joinNew('Sam');
    [3, 3, 3, 3, 3, 3].forEach((s, i) => play(a.id, i + 1, s));
    const w2 = new World(() => t, Math.random, undefined, store);
    const c = new FakeConn();
    w2.join(store.create('Jo', DEFAULT_LOOK).profile, c);
    expect(c.of('welcome')[0].toys['golf-board']).toMatchObject({ top: [{ name: 'Sam', strokes: 18 }] });
  });
});
