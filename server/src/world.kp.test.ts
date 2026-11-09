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
  w.handle(id, { t: 'move', x: -35, z: 2.5, facing: 0, anim: 'idle' });
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
    w.handle(a.id, { t: 'move', x: -35, z: 2.5, facing: 0, anim: 'idle' });
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
    w.handle(id, { t: 'move', x: 12, z: -17.35, facing: 0, anim: 'idle' });
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
    t += 60 * MIN;
    w.tick();
    expect(w.view(a.id)!.holding).toMatchObject({ item: 'latte', sips: 4 }); // cups don't vanish any more
  });

  it('four sips finish the cup, each one a coffee emote', () => {
    const a = joinNew('Sam');
    toCafe(a.id);
    w.handle(a.id, { t: 'brew', drink: 'matcha', stars: 2 });
    for (let i = 0; i < 3; i++) w.handle(a.id, { t: 'sip' });
    expect(w.view(a.id)!.holding).toMatchObject({ sips: 1 });
    w.handle(a.id, { t: 'sip' });
    expect(w.view(a.id)!.holding).toBeNull();
    expect(a.c.of('emote').filter((e) => e.kind === 'coffee')).toHaveLength(4);
    w.handle(a.id, { t: 'sip' }); // nothing left: nothing happens
    expect(a.c.of('emote')).toHaveLength(4);
  });

  describe('gifts', () => {
    function pair() {
      const a = joinNew('Sam');
      const b = joinNew('Jo');
      toCafe(a.id);
      toCafe(b.id);
      w.handle(b.id, { t: 'move', x: -1.5, z: -2.2, facing: 0, anim: 'idle' });
      w.handle(a.id, { t: 'brew', drink: 'latte', stars: 3 });
      return { a, b };
    }

    it('offers a cup and moves it, sips and all, when accepted', () => {
      const { a, b } = pair();
      w.handle(a.id, { t: 'sip' });
      w.handle(a.id, { t: 'offerCoffee', to: b.id });
      expect(b.c.of('coffeeOffer').at(-1)).toEqual({ t: 'coffeeOffer', fromId: a.id, name: 'Sam', drink: 'latte', stars: 3 });
      w.handle(b.id, { t: 'answerCoffee', fromId: a.id, accept: true });
      expect(w.view(a.id)!.holding).toBeNull();
      expect(w.view(b.id)!.holding).toEqual({ item: 'latte', stars: 3, sips: 3 });
      expect(a.c.of('coffeeAnswer').at(-1)).toEqual({ t: 'coffeeAnswer', name: 'Jo', accepted: true });
      expect(a.c.of('feed').at(-1)!.event.text).toBe('🎁 Sam gave Jo a ★★★ latte');
      w.handle(b.id, { t: 'answerCoffee', fromId: a.id, accept: true }); // a stale second answer does nothing
      expect(w.view(b.id)!.holding).toMatchObject({ sips: 3 });
    });

    it('tells the giver when it is declined or times out', () => {
      const { a, b } = pair();
      w.handle(a.id, { t: 'offerCoffee', to: b.id });
      w.handle(b.id, { t: 'answerCoffee', fromId: a.id, accept: false });
      expect(a.c.of('coffeeAnswer').at(-1)).toMatchObject({ accepted: false });
      expect(w.view(a.id)!.holding).not.toBeNull();
      w.handle(a.id, { t: 'offerCoffee', to: b.id });
      t += 16_000;
      w.tick();
      expect(a.c.of('coffeeAnswer')).toHaveLength(2);
      w.handle(b.id, { t: 'answerCoffee', fromId: a.id, accept: true });
      expect(w.view(b.id)!.holding).toBeNull(); // too late
    });

    it('refuses empty hands, people far away, on do-not-disturb, or already holding a cup', () => {
      const { a, b } = pair();
      const c = joinNew('Ali');
      w.handle(c.id, { t: 'offerCoffee', to: a.id });
      expect(c.c.of('error').at(-1)).toMatchObject({ code: 'bad_gift' });
      w.handle(a.id, { t: 'offerCoffee', to: c.id }); // Ali is out in town
      expect(a.c.of('error').at(-1)).toMatchObject({ code: 'bad_gift' });
      t += 1000;
      w.handle(b.id, { t: 'move', x: -1.5, z: 2.5, facing: 0, anim: 'idle' });
      w.handle(a.id, { t: 'offerCoffee', to: b.id });
      expect(a.c.of('error').at(-1)!.message).toMatch(/closer/);
      t += 1000;
      w.handle(b.id, { t: 'move', x: -1.5, z: -2.2, facing: 0, anim: 'idle' });
      w.handle(b.id, { t: 'setDnd', on: true });
      w.handle(a.id, { t: 'offerCoffee', to: b.id });
      expect(a.c.of('error').at(-1)!.message).toMatch(/focusing/);
      w.handle(b.id, { t: 'setDnd', on: false });
      t += 30_000;
      w.handle(b.id, { t: 'brew', drink: 'cocoa', stars: 1 });
      w.handle(a.id, { t: 'offerCoffee', to: b.id });
      expect(a.c.of('error').at(-1)!.message).toMatch(/already has/);
      expect(b.c.of('coffeeOffer')).toHaveLength(0);
    });
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
    w.handle(a.id, { t: 'move', x: 28, z: -39, facing: 0, anim: 'sit' }); // the middle of the lake
    expect(truckState(a.c)).toMatchObject({ x: truck.x + 5 });
    w.handle(a.id, { t: 'stand' });
    const v = w.view(a.id)!;
    expect(Math.hypot(v.x - (truck.x + 5), v.z - truck.z)).toBeGreaterThan(1.5);
    expect(truckState(b.c)).toMatchObject({ x: truck.x + 5, returnFrom: null });
  });

  it('accepts full-speed driving even when moves arrive bunched up by network jitter', () => {
    const a = joinNew('Sam');
    board(a.id);
    const truck = SCENES.town.toys.find((x) => x.id === 'truck-1')!;
    let x = truck.x;
    const before = a.c.of('toyState').filter((m) => m.toyId === 'truck-1').length;
    for (const gap of [100, 160, 40, 100, 30, 170, 100]) {
      t += gap;
      x += 1.07; // 10.7 m/s, the physics truck's top speed, sent every 100 ms
      w.handle(a.id, { t: 'move', x, z: truck.z, facing: Math.PI / 2, anim: 'sit' });
    }
    expect(a.c.of('toyState').filter((m) => m.toyId === 'truck-1')).toHaveLength(before); // never snapped back
    expect(w.view(a.id)!.x).toBeCloseTo(x);
  });

  it('tells the driver where they left the truck when they hop out', () => {
    const a = joinNew('Sam');
    board(a.id);
    const truck = SCENES.town.toys.find((x) => x.id === 'truck-1')!;
    t += 1000;
    w.handle(a.id, { t: 'move', x: truck.x, z: truck.z + 4, facing: 0, anim: 'sit' });
    expect(truckState(a.c)).toBeUndefined(); // the driver isn't echoed while driving
    w.handle(a.id, { t: 'stand' });
    expect(truckState(a.c)).toMatchObject({ kind: 'truck', x: truck.x, z: truck.z + 4 });
  });

  it('an abandoned truck parks itself in the nearest free bay after 10 minutes', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    board(a.id);
    const truck = SCENES.town.toys.find((x) => x.id === 'truck-1')!;
    t += 1000;
    w.handle(a.id, { t: 'move', x: truck.x + 1, z: truck.z + 5, facing: 0.6, anim: 'sit' });
    w.handle(a.id, { t: 'stand' });
    t += 9 * MIN;
    w.tick();
    expect(truckState(b.c)).toMatchObject({ x: truck.x + 1, z: truck.z + 5 });
    t += 2 * MIN;
    w.tick();
    expect(truckState(b.c)).toMatchObject({ x: truck.x, z: truck.z, heading: 0 }); // back in its own bay
  });

  it('does not park itself with someone aboard, or when it is already in a bay', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    board(a.id);
    const truck = SCENES.town.toys.find((x) => x.id === 'truck-1')!;
    const bay2 = SCENES.town.parking!.find((x) => x.id === 'lot-w-2')!;
    t += 1000;
    w.handle(a.id, { t: 'move', x: truck.x, z: truck.z + 4, facing: 0, anim: 'sit' });
    const bed = SCENES.town.slots.find((x) => x.id === 'truck-1-bed-l')!;
    t += 10_000;
    w.handle(b.id, { t: 'move', x: bed.x - 1, z: bed.z + 4, facing: 0, anim: 'idle' }); // the truck moved 4 m south
    w.handle(b.id, { t: 'sit', slotId: 'truck-1-bed-l' });
    expect(w.view(b.id)!.slotId).toBe('truck-1-bed-l');
    w.handle(a.id, { t: 'stand' });
    t += 11 * MIN;
    w.tick();
    expect(truckState(a.c)).toMatchObject({ z: truck.z + 4 }); // Jo is still in the back
    w.handle(b.id, { t: 'stand' });
    const seat = SCENES.town.slots.find((x) => x.id === 'truck-1-drive')!;
    t += 10_000;
    w.handle(a.id, { t: 'move', x: seat.x, z: seat.z + 5, facing: 0, anim: 'idle' });
    w.handle(a.id, { t: 'sit', slotId: 'truck-1-drive' });
    t += 1000;
    w.handle(a.id, { t: 'move', x: bay2.x, z: bay2.z, facing: Math.PI, anim: 'sit' }); // parked nose-in in bay 2
    w.handle(a.id, { t: 'stand' });
    t += 11 * MIN;
    w.tick();
    expect(truckState(b.c)).toMatchObject({ x: bay2.x, z: bay2.z });
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

describe('voice signalling', () => {
  it('relays only between voice users in the same scene', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    w.handle(a.id, { t: 'rtc', to: b.id, data: 'offer' });
    expect(b.c.of('rtc')).toEqual([]); // nobody has voice on yet
    w.handle(a.id, { t: 'setVoice', on: true });
    w.handle(b.id, { t: 'setVoice', on: true });
    expect(a.c.of('playerUpdated').at(-1)!.player).toMatchObject({ id: b.id, voice: true });
    w.handle(a.id, { t: 'rtc', to: b.id, data: 'offer' });
    expect(b.c.of('rtc')).toEqual([{ t: 'rtc', from: a.id, data: 'offer' }]);
    t += 10_000;
    w.handle(b.id, { t: 'move', x: 12, z: -17.35, facing: 0, anim: 'idle' });
    w.handle(b.id, { t: 'enterScene', doorId: 'to-cafe' });
    w.handle(a.id, { t: 'rtc', to: b.id, data: 'again' });
    expect(b.c.of('rtc')).toHaveLength(1);
  });

  it('do not disturb turns voice off and keeps it off', () => {
    const a = joinNew('Sam');
    w.handle(a.id, { t: 'setVoice', on: true });
    w.handle(a.id, { t: 'setDnd', on: true });
    expect(w.view(a.id)).toMatchObject({ dnd: true, voice: false });
    w.handle(a.id, { t: 'setVoice', on: true });
    expect(w.view(a.id)!.voice).toBe(false);
  });

  it('hands out ICE servers', () => {
    const { c } = joinNew('Sam');
    expect(c.of('welcome')[0].ice[0].urls).toContain('stun:');
  });
});

describe('pets', () => {
  function rich(name: string) {
    const j = joinNew(name);
    store.award(j.id, 500, 1, '2026-11-09');
    // reload the wallet the way a reconnect would
    w.disconnect(j.id, j.c);
    const c2 = new FakeConn();
    w.join({ id: j.id, name, look: DEFAULT_LOOK }, c2);
    (w as unknown as { players: Map<string, { wallet: unknown }> }).players.get(j.id)!.wallet = store.wallet(j.id);
    return { id: j.id, c: c2 };
  }

  it('adopts with KP, shows the pet to everyone, and switching to an owned kind is free', () => {
    const a = rich('Sam');
    const b = joinNew('Jo');
    w.handle(a.id, { t: 'adoptPet', kind: 'frog', name: 'Hop' });
    expect(a.c.of('wallet').at(-1)!.wallet).toMatchObject({ kp: 380, pets: ['frog'], pet: { kind: 'frog', name: 'Hop' } });
    expect(b.c.of('playerUpdated').at(-1)!.player.pet).toMatchObject({ kind: 'frog', name: 'Hop' });
    w.handle(a.id, { t: 'adoptPet', kind: 'frog', name: 'Hoppy' });
    expect(a.c.of('wallet').at(-1)!.wallet.kp).toBe(380);
  });

  it('refuses a pet you cannot afford', () => {
    const a = joinNew('Sam');
    w.handle(a.id, { t: 'adoptPet', kind: 'kitten', name: 'Mo' });
    expect(a.c.of('error').at(-1)!.code).toBe('no_kp');
    expect(w.view(a.id)!.pet).toBeNull();
  });

  it('relays sensible pet moves, ignores teleports, and can be put away', () => {
    const a = rich('Sam');
    const b = joinNew('Jo');
    w.handle(a.id, { t: 'adoptPet', kind: 'duckling', name: 'Quack' });
    const start = w.view(a.id)!.pet!;
    t += 500;
    w.handle(a.id, { t: 'pet', x: start.x + 1, z: start.z, facing: 1, anim: 'walk' });
    expect(b.c.of('petMoved').at(-1)).toMatchObject({ id: a.id, x: start.x + 1, anim: 'walk' });
    t += 100;
    w.handle(a.id, { t: 'pet', x: start.x + 30, z: start.z, facing: 1, anim: 'walk' });
    expect(b.c.of('petMoved')).toHaveLength(1);
    w.handle(a.id, { t: 'setPetOut', on: false });
    expect(w.view(a.id)!.pet).toBeNull();
    w.handle(a.id, { t: 'setPetOut', on: true });
    expect(w.view(a.id)!.pet).toMatchObject({ kind: 'duckling' });
  });
});
