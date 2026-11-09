import { beforeEach, describe, expect, it } from 'vitest';
import { PLOT_IDLE_MS } from '../../shared/constants';
import type { Flower, PlotState } from '../../shared/garden';
import type { ErrorCode, ServerMsg } from '../../shared/protocol';
import { SCENES } from '../../shared/scenes';
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
  return { id: profile.id, c, profile };
}
const plots = SCENES.town.toys.filter((x) => x.kind === 'plot');
const go = (id: string, x: number, z: number) => {
  t += 10_000;
  w.handle(id, { t: 'move', x, z, facing: 0, anim: 'idle' });
};
const atPlot = (id: string, i: number) => go(id, plots[i].x, plots[i].z + 1.2);
const act = (id: string, i: number, action: 'claim' | 'plant' | 'water' | 'harvest' | 'vase', extra: { spot?: number; flower?: Flower } = {}) =>
  w.handle(id, { t: 'garden', toyId: plots[i].id, action, ...extra });
const plot = (c: FakeConn, i: number) => c.of('toyState').filter((m) => m.toyId === plots[i].id).at(-1)?.state as PlotState | undefined;
const lastError = (c: FakeConn) => c.of('error').at(-1)?.message ?? '';

/** A finished focus session of `minutes` at a park bench. */
function study(id: string, minutes: number) {
  go(id, -35, 2.5);
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

describe('garden plots', () => {
  it('claims one plot each, and only free ones', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    atPlot(a.id, 0);
    act(a.id, 0, 'claim');
    expect(plot(b.c, 0)).toMatchObject({ owner: a.id, ownerName: 'Sam' });
    atPlot(a.id, 1);
    act(a.id, 1, 'claim');
    expect(lastError(a.c)).toMatch(/already have a plot/);
    atPlot(b.id, 0);
    act(b.id, 0, 'claim');
    expect(lastError(b.c)).toMatch(/Sam's plot/);
  });

  it('frees a plot whose owner has been away a month, but only when the garden is full', () => {
    const owners = Array.from({ length: 20 }, (_, i) => joinNew(`P${i}`));
    owners.forEach((o, i) => {
      atPlot(o.id, i);
      act(o.id, i, 'claim');
    });
    const late = joinNew('Late');
    atPlot(late.id, 3);
    act(late.id, 3, 'claim');
    expect(lastError(late.c)).toMatch(/full/);
    t += PLOT_IDLE_MS + MIN;
    atPlot(late.id, 3);
    act(late.id, 3, 'claim');
    expect(plot(late.c, 3)).toMatchObject({ owner: late.id, spots: [null, null, null, null] });
  });
});

describe('growing', () => {
  it('plants free seeds, needs an unlock for rare ones, and grows from finished focus', () => {
    const a = joinNew('Sam');
    atPlot(a.id, 0);
    act(a.id, 0, 'claim');
    act(a.id, 0, 'plant', { spot: 0, flower: 'tulip' });
    act(a.id, 0, 'plant', { spot: 1, flower: 'rose' });
    expect(lastError(a.c)).toMatch(/Unlock roses/);
    study(a.id, 25); // 25 + 5 streak = 30 KP
    expect(a.c.of('bloomed').at(-1)).toEqual({ t: 'bloomed', flower: 'tulip' });
    w.handle(a.id, { t: 'buySeed', flower: 'rose' });
    expect(store.wallet(a.id)).toMatchObject({ kp: 5, owned: expect.arrayContaining(['seed-rose']) });
    atPlot(a.id, 0);
    act(a.id, 0, 'plant', { spot: 1, flower: 'rose' });
    expect(plot(a.c, 0)!.spots.map((s) => s && [s.flower, s.progress])).toEqual([['tulip', 25], ['rose', 0], null, null]);
  });

  it('does not grow on an early quit, and nobody else can plant in your plot', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    atPlot(a.id, 0);
    act(a.id, 0, 'claim');
    act(a.id, 0, 'plant', { spot: 0, flower: 'tulip' });
    go(a.id, -35, 2.5);
    w.handle(a.id, { t: 'sit', slotId: 'park-b1-a' });
    w.handle(a.id, { t: 'startSession', focusMin: 25, breakMin: 5 });
    t += 10 * MIN;
    w.handle(a.id, { t: 'stand' });
    expect(plot(b.c, 0)!.spots[0]!.progress).toBe(0);
    atPlot(b.id, 0);
    act(b.id, 0, 'plant', { spot: 1, flower: 'tulip' });
    expect(lastError(b.c)).toMatch(/your own plot/);
  });
});

describe('watering', () => {
  it('lets each visitor water once a day, tells the owner, and speeds up the next hour of focus', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    atPlot(a.id, 0);
    act(a.id, 0, 'claim');
    act(a.id, 0, 'plant', { spot: 0, flower: 'poppy' });
    atPlot(b.id, 0);
    act(b.id, 0, 'water');
    expect(a.c.of('gardenNote').at(-1)).toEqual({ t: 'gardenNote', text: '💧 Jo watered your garden' });
    expect(plot(a.c, 0)!.boostMin).toBe(60);
    act(b.id, 0, 'water');
    expect(lastError(b.c)).toMatch(/already watered/);
    study(a.id, 20);
    expect(plot(a.c, 0)).toMatchObject({ boostMin: 40, spots: [{ flower: 'poppy', progress: 30 }, null, null, null] });
  });
});

describe('harvest and bouquets', () => {
  function bloomTulip() {
    const a = joinNew('Sam');
    atPlot(a.id, 0);
    act(a.id, 0, 'claim');
    act(a.id, 0, 'plant', { spot: 2, flower: 'tulip' });
    study(a.id, 25);
    atPlot(a.id, 0);
    return a;
  }

  it('picks a bloom into a bouquet with a little KP, and refuses unripe spots', () => {
    const a = bloomTulip();
    act(a.id, 0, 'harvest', { spot: 0 });
    expect(lastError(a.c)).toMatch(/isn't in bloom/);
    const before = store.wallet(a.id).kp;
    act(a.id, 0, 'harvest', { spot: 2 });
    expect(w.view(a.id)!.holding).toEqual({ item: 'bouquet', flower: 'tulip', stars: 0, sips: 0 });
    expect(store.wallet(a.id).kp).toBe(before + 5);
    expect(plot(a.c, 0)!.spots[2]).toBeNull();
    expect(a.c.of('feed').at(-1)!.event.text).toBe('🌷 Sam picked a bouquet of tulips');
  });

  it('puts a bouquet in the vase, and a bouquet cannot be sipped', () => {
    const a = bloomTulip();
    act(a.id, 0, 'harvest', { spot: 2 });
    w.handle(a.id, { t: 'sip' });
    expect(w.view(a.id)!.holding).toMatchObject({ item: 'bouquet' });
    act(a.id, 0, 'vase');
    expect(plot(a.c, 0)!.vase).toBe('tulip');
    expect(w.view(a.id)!.holding).toBeNull();
  });

  it('gifts a bouquet like a coffee', () => {
    const a = bloomTulip();
    act(a.id, 0, 'harvest', { spot: 2 });
    const b = joinNew('Jo');
    go(b.id, plots[0].x + 1, plots[0].z + 1.2);
    w.handle(a.id, { t: 'offerCoffee', to: b.id });
    expect(b.c.of('coffeeOffer').at(-1)).toMatchObject({ drink: 'bouquet', flower: 'tulip', name: 'Sam' });
    w.handle(b.id, { t: 'answerCoffee', fromId: a.id, accept: true });
    expect(w.view(b.id)!.holding).toMatchObject({ item: 'bouquet', flower: 'tulip' });
    expect(b.c.of('feed').at(-1)!.event.text).toBe('🎁 Sam gave Jo a bouquet of tulips');
  });

  it('keeps gardens across a restart', () => {
    const a = bloomTulip();
    const w2 = new World(() => t, Math.random, undefined, store);
    const c = new FakeConn();
    w2.join(a.profile, c);
    expect(c.of('welcome')[0].toys[plots[0].id]).toMatchObject({ owner: a.id, spots: [null, null, { flower: 'tulip', progress: 25 }, null] });
  });
});
