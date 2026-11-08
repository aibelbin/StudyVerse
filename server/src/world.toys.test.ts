import { beforeEach, describe, expect, it } from 'vitest';
import { GRACE_MS } from '../../shared/constants';
import { DEFAULT_LOOK } from '../../shared/wardrobe';
import type { ClientMsg, ErrorCode, ServerMsg } from '../../shared/protocol';
import { SCENES } from '../../shared/scenes';
import type { SceneDef } from '../../shared/scenes/types';
import { World, type Conn } from './world';

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  send(m: ServerMsg) { this.msgs.push(m); }
  close(_c: ErrorCode) {}
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
  clear() { this.msgs = []; }
}

const town: SceneDef = {
  id: 'town', name: 'Town', where: 'here', size: { w: 80, d: 40 }, theme: SCENES.town.theme,
  colliders: [], decor: [], life: [],
  doors: [{ id: 'to-other', box: { x: -30, z: 0, w: 1, d: 1 }, toScene: 'other', toSpawn: 'start' }],
  spawns: [{ id: 'start', x: 0, z: 0, facing: 0 }],
  slots: [
    { id: 'desk-a', x: -5, z: 0, facing: 0, pose: 'sit', deskId: 'desk' },
    { id: 'piano-bench', x: 0, z: 3, facing: Math.PI, pose: 'sit', toyId: 'piano' },
    { id: 'mgr-0', x: -10, z: 1.1, facing: 0, pose: 'ride', toyId: 'mgr' },
    { id: 'boat-row', x: 11.5, z: 0.3, facing: 0, pose: 'row', toyId: 'boat' },
    { id: 'boat-back', x: 11.5, z: -0.55, facing: 0, pose: 'sit', toyId: 'boat' },
  ],
  toys: [
    { id: 'bell', kind: 'bell', x: 2, z: 0, radius: 1.5 },
    { id: 'piano', kind: 'piano', x: 0, z: 2, radius: 1.5, slotIds: ['piano-bench'] },
    { id: 'fire', kind: 'campfire', x: -2, z: -3, radius: 2 },
    { id: 'stones', kind: 'stones', x: 4, z: -3, radius: 1.5 },
    { id: 'mgr', kind: 'merryGoRound', x: -10, z: 0, radius: 2.2, slotIds: ['mgr-0'] },
    { id: 'boat', kind: 'rowboat', x: 11.5, z: 0, rot: 0, radius: 1, slotIds: ['boat-row', 'boat-back'] },
  ],
  water: { outline: [[10, -10], [30, -10], [30, 10], [10, 10]], landings: [{ x: 9, z: 0 }, { x: 31, z: 0 }], sailPaths: [] },
};
const other: SceneDef = { ...town, id: 'other', toys: [], slots: [], water: undefined, doors: [] };

let t: number;
let w: World;
let roll: number;
const join = (id: string) => {
  const c = new FakeConn();
  w.join({ id, name: id, look: DEFAULT_LOOK }, c);
  return c;
};
const send = (id: string, m: ClientMsg) => w.handle(id, m);
const goTo = (id: string, x: number, z: number) => { t += 10_000; send(id, { t: 'move', x, z, facing: 0, anim: 'idle' }); };
const row = (id: string, x: number, z: number, dtMs: number) => { t += dtMs; send(id, { t: 'move', x, z, facing: 0, anim: 'sit' }); };

beforeEach(() => {
  t = 1_000_000;
  roll = 0.5;
  w = new World(() => t, () => roll, { town, other });
});

describe('using toys', () => {
  it('broadcasts an event to the scene, sender included', () => {
    const a = join('a'), b = join('b');
    goTo('a', 2, 1);
    send('a', { t: 'use', toyId: 'bell', action: 'ring' });
    for (const c of [a, b]) expect(c.of('toyEvent')).toEqual([{ t: 'toyEvent', toyId: 'bell', by: 'a', action: 'ring', at: t }]);
  });

  it('does not reach other scenes', () => {
    join('a');
    const b = join('b');
    goTo('b', -30, 0);
    send('b', { t: 'enterScene', doorId: 'to-other' });
    goTo('a', 2, 1);
    send('a', { t: 'use', toyId: 'bell', action: 'ring' });
    expect(b.of('toyEvent')).toEqual([]);
  });

  it('drops presses inside the cooldown, quietly', () => {
    const a = join('a');
    goTo('a', 2, 1);
    send('a', { t: 'use', toyId: 'bell', action: 'ring' });
    t += 1000;
    send('a', { t: 'use', toyId: 'bell', action: 'ring' });
    expect(a.of('toyEvent')).toHaveLength(1);
    expect(a.of('error')).toEqual([]);
    t += 500;
    send('a', { t: 'use', toyId: 'bell', action: 'ring' });
    expect(a.of('toyEvent')).toHaveLength(2);
  });

  it('rejects far away, unknown toys and wrong actions with bad_toy', () => {
    const a = join('a');
    goTo('a', 10, -5);
    send('a', { t: 'use', toyId: 'bell', action: 'ring' });
    send('a', { t: 'use', toyId: 'nope', action: 'ring' });
    goTo('a', 2, 1);
    send('a', { t: 'use', toyId: 'bell', action: 'toggle' });
    expect(a.of('error').map((e) => e.code)).toEqual(['bad_toy', 'bad_toy', 'bad_toy']);
    expect(a.of('toyEvent')).toEqual([]);
  });

  it('piano notes need the bench', () => {
    const a = join('a');
    goTo('a', 0, 3.5);
    send('a', { t: 'use', toyId: 'piano', action: 'note', arg: 3 });
    expect(a.of('error').at(-1)!.code).toBe('not_seated');
    send('a', { t: 'sit', slotId: 'piano-bench' });
    send('a', { t: 'use', toyId: 'piano', action: 'note', arg: 3 });
    expect(a.of('toyEvent').at(-1)).toMatchObject({ toyId: 'piano', action: 'note', arg: 3 });
  });

  it('the campfire state reaches late joiners', () => {
    const a = join('a');
    goTo('a', -2, -2);
    send('a', { t: 'use', toyId: 'fire', action: 'toggle' });
    expect(a.of('toyState').at(-1)).toEqual({ t: 'toyState', toyId: 'fire', state: { kind: 'campfire', lit: true } });
    const b = join('b');
    expect(b.of('welcome')[0].toys.fire).toEqual({ kind: 'campfire', lit: true });
    expect(b.of('welcome')[0].toys.bell).toBeUndefined();
  });

  it('stone skips come from the server roll', () => {
    const a = join('a');
    goTo('a', 4, -2);
    roll = 0.999;
    send('a', { t: 'use', toyId: 'stones', action: 'skip' });
    expect(a.of('toyEvent').at(-1)).toMatchObject({ action: 'skip', arg: 7 });
  });

  it('Pomodoro only starts from desk slots', () => {
    const a = join('a');
    goTo('a', -10, 2);
    send('a', { t: 'sit', slotId: 'mgr-0' });
    expect(w.view('a')!.slotId).toBe('mgr-0');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    expect(a.of('error').at(-1)!.code).toBe('not_seated');
    send('a', { t: 'stand' });
    goTo('a', -5, 0.5);
    send('a', { t: 'sit', slotId: 'desk-a' });
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    expect(w.view('a')!.session?.phase).toBe('focus');
  });

  it('standing off the merry-go-round steps you clear of it', () => {
    join('a');
    goTo('a', -10, 2);
    send('a', { t: 'sit', slotId: 'mgr-0' });
    send('a', { t: 'stand' });
    const v = w.view('a')!;
    expect(Math.hypot(v.x + 10, v.z)).toBeCloseTo(2.2);
  });
});

describe('rowboats', () => {
  const boat = (c: FakeConn) => c.of('toyState').filter((m) => m.toyId === 'boat').at(-1)?.state;

  function board(id: string) {
    goTo(id, 10.5, 0.3);
    send(id, { t: 'sit', slotId: 'boat-row' });
  }

  it('rowing moves the boat for everyone else', () => {
    join('a');
    const b = join('b');
    board('a');
    expect(w.view('a')!.slotId).toBe('boat-row');
    row('a', 13.5, 0, 1000);
    expect(boat(b)).toMatchObject({ kind: 'rowboat', x: 13.5, z: 0, returnFrom: null });
  });

  it('rejects rowing too fast or onto land, snapping the rower back', () => {
    const a = join('a'), b = join('b');
    board('a');
    b.clear();
    row('a', 20, 0, 100);
    expect(boat(a)).toMatchObject({ x: 11.5, z: 0 });
    row('a', 29.6, 0, 10_000);
    expect(boat(a)).toMatchObject({ x: 11.5, z: 0 });
    expect(boat(b)).toBeUndefined();
  });

  it('getting out lands you on shore and sends the boat home', () => {
    const a = join('a');
    board('a');
    row('a', 13.5, 0, 1000);
    send('a', { t: 'stand' });
    expect(w.view('a')).toMatchObject({ slotId: null, x: 9, z: 0 });
    expect(boat(a)).toMatchObject({ x: 13.5, returnFrom: { x: 13.5, z: 0, at: t } });
  });

  it('boarding mid-return freezes the boat where it is', () => {
    const a = join('a');
    board('a');
    row('a', 13.5, 0, 1000);
    send('a', { t: 'stand' });
    t += 750; // 2 m home over a 1.5 s minimum: halfway
    send('a', { t: 'move', x: 11.2, z: 0.3, facing: 0, anim: 'idle' });
    send('a', { t: 'sit', slotId: 'boat-row' });
    const s = boat(a)!;
    expect(s).toMatchObject({ returnFrom: null });
    expect(s.kind === 'rowboat' && s.x).toBeCloseTo(12.5);
  });

  it('a vanished rower frees the boat after the grace period', () => {
    const a = join('a');
    const b = join('b');
    board('a');
    w.disconnect('a', a);
    t += GRACE_MS;
    w.tick();
    expect(boat(b)).toMatchObject({ returnFrom: { x: 11.5, z: 0 } });
  });
});
