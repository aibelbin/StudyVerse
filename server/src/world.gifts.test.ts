import { beforeEach, describe, expect, it } from 'vitest';
import type { ErrorCode, ServerMsg } from '../../shared/protocol';
import { SCENES } from '../../shared/scenes';
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

function joinNew(name: string, kp = 0) {
  const { profile } = store.create(name, DEFAULT_LOOK, t);
  if (kp) store.addKp(profile.id, kp);
  const c = new FakeConn();
  w.join(profile, c);
  return { id: profile.id, c, profile };
}
const go = (id: string, x: number, z: number) => {
  t += 10_000;
  w.handle(id, { t: 'move', x, z, facing: 0, anim: 'idle' });
};
const stall = SCENES.town.toys.find((x) => x.kind === 'giftShop')!;
const lastError = (c: FakeConn) => c.of('error').at(-1)?.message ?? '';

beforeEach(() => {
  t = new Date(2026, 10, 9, 10).getTime();
  store = new ProfileStore(':memory:');
  w = new World(() => t, Math.random, undefined, store);
});

describe('gifts', () => {
  it('buys gifts into the bag and gives them from it onto the keepsakes shelf', () => {
    const a = joinNew('Sam', 40);
    const b = joinNew('Jo');
    go(a.id, stall.x, stall.z + 1.2);
    w.handle(a.id, { t: 'buyGift', gift: 'bear' });
    w.handle(a.id, { t: 'buyGift', gift: 'letter' });
    expect(w.view(a.id)!.holding).toBeNull(); // nothing to carry
    expect(a.c.of('bag').at(-1)!.items.map((i) => i.kind === 'gift' && i.gift)).toEqual(['bear', 'letter']);
    expect(store.wallet(a.id).kp).toBe(10);
    const bear = a.c.of('bag').at(-1)!.items[0];
    w.handle(a.id, { t: 'giveItem', id: bear.id, to: b.id });
    expect(a.c.of('bag').at(-1)!.items.map((i) => i.kind === 'gift' && i.gift)).toEqual(['letter']);
    expect(w.view(b.id)!.holding).toBeNull();
    expect(w.view(b.id)).toMatchObject({ keepsakeCount: 1, keepsakes: [{ gift: 'bear', fromName: 'Sam' }] });
    expect(b.c.of('giftReceived').at(-1)).toMatchObject({ fromName: 'Sam', gift: 'bear' });
    expect(b.c.of('feed').at(-1)!.event.text).toBe('🧸 Sam gave Jo a plushie bear');
  });

  it('sends from the player card to anyone, charges KP, and rate-limits', () => {
    const a = joinNew('Sam', 20);
    const b = joinNew('Jo');
    w.handle(a.id, { t: 'sendGift', to: b.id, gift: 'cupcake' });
    expect(store.wallet(a.id).kp).toBe(10);
    expect(w.view(b.id)!.keepsakeCount).toBe(1);
    t += 3000;
    w.handle(a.id, { t: 'sendGift', to: b.id, gift: 'letter' });
    expect(lastError(a.c)).toMatch(/One gift at a time/);
    t += 10_000;
    w.handle(a.id, { t: 'sendGift', to: b.id, gift: 'starJar' });
    expect(lastError(a.c)).toMatch(/costs 30/);
    w.handle(a.id, { t: 'sendGift', to: a.id, gift: 'letter' });
    expect(lastError(a.c)).toMatch(/couldn't be delivered/);
  });

  it('eats a cupcake and lets a balloon go, both leaving the shelf', () => {
    const a = joinNew('Sam', 50);
    const b = joinNew('Jo');
    w.handle(a.id, { t: 'sendGift', to: b.id, gift: 'cupcake' });
    t += 11_000;
    w.handle(a.id, { t: 'sendGift', to: b.id, gift: 'balloon' });
    const [balloon, cupcake] = w.view(b.id)!.keepsakes;
    w.handle(b.id, { t: 'useKeepsake', id: cupcake.id });
    expect(b.c.of('act').at(-1)).toMatchObject({ fromId: b.id, kind: 'love' });
    w.handle(b.id, { t: 'useKeepsake', id: balloon.id });
    expect(b.c.of('balloonUp').at(-1)).toMatchObject({ color: '#ff5a6a' });
    expect(w.view(b.id)!.keepsakeCount).toBe(0);
    w.handle(a.id, { t: 'useKeepsake', id: cupcake.id }); // not theirs, already gone: nothing happens
  });
});

describe('status', () => {
  it('shows a status to everyone, clears it after its time, or when emptied', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    w.handle(a.id, { t: 'setStatus', emoji: '🍜', text: 'Eating', minutes: 30 });
    expect(w.view(a.id)!.status).toEqual({ emoji: '🍜', text: 'Eating', until: t + 30 * 60_000 });
    expect(b.c.of('online').at(-1)!.list.find((e) => e.id === a.id)!.status).toMatchObject({ text: 'Eating' });
    t += 31 * 60_000;
    w.tick();
    expect(w.view(a.id)!.status).toBeNull();
    w.handle(a.id, { t: 'setStatus', emoji: '🎧', text: 'In the zone', minutes: null });
    t += 24 * 60 * 60_000;
    w.tick();
    expect(w.view(a.id)!.status).toMatchObject({ text: 'In the zone', until: null });
    w.handle(a.id, { t: 'setStatus', emoji: '', text: '', minutes: null });
    expect(w.view(a.id)!.status).toBeNull();
  });
});

describe('fresh chat', () => {
  it("doesn't show newcomers what was said before they joined", () => {
    const a = joinNew('Sam');
    w.handle(a.id, { t: 'chat', text: 'old news' });
    t += 60_000;
    const b = joinNew('Jo');
    expect(b.c.of('welcome')[0].chat.map((m) => m.text)).toEqual([]);
    t += 2000;
    w.handle(a.id, { t: 'chat', text: 'hi Jo' });
    const c2 = new FakeConn();
    w.join(b.profile, c2);
    expect(c2.of('welcome')[0].chat.map((m) => m.text)).toEqual(['hi Jo']);
    const c3 = new FakeConn();
    w.join(a.profile, c3);
    expect(c3.of('welcome')[0].chat.map((m) => m.text)).toEqual(['old news', 'hi Jo']);
  });
});

describe('admin', () => {
  const admin = () => {
    const a = joinNew('Aibel');
    w.admins = new Set([a.id]);
    return a;
  };

  it('buys anything for nothing and shows an admin wallet', () => {
    const a = admin();
    go(a.id, stall.x, stall.z + 1.2);
    w.handle(a.id, { t: 'buyGift', gift: 'starJar' });
    expect(a.c.of('bag').at(-1)!.items).toMatchObject([{ kind: 'gift', gift: 'starJar' }]);
    w.handle(a.id, { t: 'buy', itemId: 'frogHood' });
    expect(store.wallet(a.id).owned).toContain('frogHood');
    expect(a.c.of('wallet').at(-1)!.wallet).toMatchObject({ kp: 0, admin: true });
  });

  it('refuses admin actions from everyone else', () => {
    const a = joinNew('Aibel'); // same name, not an admin
    w.admins = new Set(['someone-else']);
    w.handle(a.id, { t: 'admin', action: 'list' });
    expect(a.c.of('error').at(-1)).toMatchObject({ code: 'not_admin' });
  });

  it('kicks, bans for a while (refusing the login), and unbans', () => {
    const a = admin();
    const b = joinNew('Troll');
    w.handle(a.id, { t: 'admin', action: 'kick', id: b.id });
    expect(b.c.closed).toMatchObject({ code: 'kicked' });
    expect(w.view(b.id)).toBeUndefined();
    const b2 = new FakeConn();
    w.join(b.profile, b2);
    w.handle(a.id, { t: 'admin', action: 'ban', id: b.id, minutes: 60 });
    expect(b2.closed).toMatchObject({ code: 'banned' });
    const b3 = new FakeConn();
    w.join(b.profile, b3);
    expect(b3.closed).toMatchObject({ code: 'banned' });
    expect(a.c.of('adminList').at(-1)!.players.find((p) => p.id === b.id)).toMatchObject({ bannedUntil: t + 60 * 60_000 });
    t += 61 * 60_000;
    const b4 = new FakeConn();
    w.join(b.profile, b4);
    expect(b4.closed).toBeNull(); // the break is over
    w.handle(a.id, { t: 'admin', action: 'ban', id: b.id, minutes: null });
    w.handle(a.id, { t: 'admin', action: 'unban', id: b.id });
    const b5 = new FakeConn();
    w.join(b.profile, b5);
    expect(b5.closed).toBeNull();
  });

  it('mutes chat for a while', () => {
    const a = admin();
    const b = joinNew('Loud');
    w.handle(a.id, { t: 'admin', action: 'mute', id: b.id, minutes: 10 });
    t += 2000;
    w.handle(b.id, { t: 'chat', text: 'hello??' });
    expect(b.c.of('error').at(-1)).toMatchObject({ code: 'muted' });
    t += 10 * 60_000;
    w.handle(b.id, { t: 'chat', text: 'sorry' });
    expect(b.c.of('chat').at(-1)!.msg.text).toBe('sorry');
  });

  it('switches features off for everyone and remembers it', () => {
    const a = admin();
    const b = joinNew('Jo');
    w.handle(a.id, { t: 'admin', action: 'feature', feature: 'globalChat', on: false });
    expect(b.c.of('features').at(-1)!.features.globalChat).toBe(false);
    t += 2000;
    w.handle(b.id, { t: 'chat', text: 'hi' });
    expect(b.c.of('error').at(-1)).toMatchObject({ code: 'feature_off' });
    const w2 = new World(() => t, Math.random, undefined, store);
    const c = new FakeConn();
    w2.join(store.create('Kim', DEFAULT_LOOK, t).profile, c);
    expect(c.of('welcome')[0].features.globalChat).toBe(false);
  });

  it('announces, deletes chat and notes, and moves people around', () => {
    const a = admin();
    const b = joinNew('Jo');
    w.handle(a.id, { t: 'admin', action: 'announce', text: 'Study jam at 8pm 📚' });
    expect(b.c.of('announce').at(-1)).toEqual({ t: 'announce', text: 'Study jam at 8pm 📚' });
    t += 2000;
    w.handle(b.id, { t: 'chat', text: 'oops' });
    const id = b.c.of('chat').at(-1)!.msg.id;
    w.handle(a.id, { t: 'admin', action: 'deleteChat', id });
    expect(b.c.of('chatDelete').at(-1)).toEqual({ t: 'chatDelete', id });
    go(b.id, -30, 2);
    w.handle(a.id, { t: 'admin', action: 'goto', id: b.id });
    expect(w.view(a.id)).toMatchObject({ x: -28.8, z: 2.6 });
    w.handle(a.id, { t: 'admin', action: 'sendHome', id: b.id });
    expect(w.view(b.id)).toMatchObject({ scene: 'town', x: 0, z: -13.5 });
    expect(b.c.of('sceneSnapshot').at(-1)!.you).toMatchObject({ x: 0, z: -13.5 });
  });
});
