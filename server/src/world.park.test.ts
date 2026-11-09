import { beforeEach, describe, expect, it } from 'vitest';
import { MEDITATE_MS, STAGE_TEXT_TTL_MS } from '../../shared/constants';
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

let t: number;
let store: ProfileStore;
let w: World;
let rolls: number[];

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
const slot = (id: string) => SCENES.town.slots.find((s) => s.id === id)!;
const sitOn = (id: string, slotId: string) => {
  const s = slot(slotId);
  go(id, s.x, s.z);
  w.handle(id, { t: 'sit', slotId });
};
const ring = (c: FakeConn) => c.of('toyState').filter((m) => m.toyId === 'zen-ring').at(-1)?.state;

beforeEach(() => {
  t = new Date(2026, 10, 9, 10).getTime();
  store = new ProfileStore(':memory:');
  rolls = [];
  w = new World(() => t, () => rolls.shift() ?? 0.99, undefined, store);
});

describe('meditation ring', () => {
  it('starts the shared breathing clock on the first sit and stops it when the ring empties', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    sitOn(a.id, 'zen-cushion-0');
    const started = t;
    expect(ring(b.c)).toEqual({ kind: 'meditate', startedAt: started });
    sitOn(b.id, 'zen-cushion-2');
    expect(ring(b.c)).toEqual({ kind: 'meditate', startedAt: started }); // the clock is not restarted
    w.handle(a.id, { t: 'stand' });
    expect(ring(b.c)).toEqual({ kind: 'meditate', startedAt: started });
    w.handle(b.id, { t: 'stand' });
    expect(ring(b.c)).toEqual({ kind: 'meditate', startedAt: null });
  });

  it('pays 3 KP plus one per companion after five minutes, once an hour', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    sitOn(a.id, 'zen-cushion-0');
    sitOn(b.id, 'zen-cushion-1');
    t += MEDITATE_MS;
    w.tick();
    // Sam sat first: Jo wasn't there yet, so Sam gets no companion bonus; Jo had Sam the whole time.
    expect(a.c.of('meditated').at(-1)).toEqual({ t: 'meditated', kp: 3, companions: 0 });
    expect(b.c.of('meditated').at(-1)).toEqual({ t: 'meditated', kp: 4, companions: 1 });
    expect(store.wallet(b.id).kp).toBe(4);
    expect(a.c.of('feed').some((m) => m.event.kind === 'meditate')).toBe(true);
    t += MEDITATE_MS;
    w.tick();
    expect(a.c.of('meditated')).toHaveLength(1); // still seated, but the next breather needs a fresh sit
    w.handle(a.id, { t: 'stand' });
    sitOn(a.id, 'zen-cushion-0');
    t += MEDITATE_MS;
    w.tick();
    expect(a.c.of('meditated').at(-1)).toEqual({ t: 'meditated', kp: 0, companions: 0 }); // within the hour
    expect(store.wallet(a.id).kp).toBe(3);
  });

  it('caps the companion bonus at 3 and pays nothing to someone who stood up early', () => {
    const ps = ['A', 'B', 'C', 'D', 'E'].map(joinNew);
    ps.forEach((p, i) => sitOn(p.id, `zen-cushion-${i}`));
    t += MEDITATE_MS - 30_000;
    w.handle(ps[0].id, { t: 'stand' });
    t += 30_000;
    w.tick();
    expect(ps[0].c.of('meditated')).toHaveLength(0);
    expect(ps[4].c.of('meditated').at(-1)).toMatchObject({ kp: 6, companions: 3 });
  });

  it('remembers the hourly limit across a reconnect', () => {
    const a = joinNew('Sam');
    sitOn(a.id, 'zen-cushion-0');
    t += MEDITATE_MS;
    w.tick();
    const c2 = new FakeConn();
    w.join(a.profile, c2);
    w.handle(a.id, { t: 'stand' });
    sitOn(a.id, 'zen-cushion-0');
    t += MEDITATE_MS;
    w.tick();
    expect(c2.of('meditated').at(-1)).toMatchObject({ kp: 0 });
  });
});

describe('cairn', () => {
  const cairn = SCENES.town.toys.find((x) => x.id === 'zen-cairn')!;
  const stack = (id: string) => {
    t += 6000;
    w.handle(id, { t: 'use', toyId: 'zen-cairn', action: 'stack' });
  };
  const state = (c: FakeConn) => c.of('toyState').filter((m) => m.toyId === 'zen-cairn').at(-1)?.state;

  it('grows, keeps the record and who set it, topples, and survives a restart', () => {
    const a = joinNew('Sam');
    go(a.id, cairn.x, cairn.z + 1);
    for (let i = 0; i < 6; i++) stack(a.id);
    expect(state(a.c)).toMatchObject({ kind: 'cairn', height: 6, record: 6, recordBy: 'Sam' });
    rolls = [0, 0.5]; // the 7th stone topples (chance 9.6%)
    stack(a.id);
    expect(state(a.c)).toMatchObject({ height: 0, record: 6, recordBy: 'Sam' });
    expect(a.c.of('toyEvent').at(-1)).toMatchObject({ toyId: 'zen-cairn', action: 'stack', arg: 1 });
    stack(a.id);
    const w2 = new World(() => t, Math.random, undefined, store);
    const c = new FakeConn();
    w2.join(store.create('Jo', DEFAULT_LOOK).profile, c);
    expect(c.of('welcome')[0].toys['zen-cairn']).toMatchObject({ height: 1, record: 6, recordBy: 'Sam' });
  });

  it('allows one stone every five seconds per player', () => {
    const a = joinNew('Sam');
    go(a.id, cairn.x, cairn.z + 1);
    w.handle(a.id, { t: 'use', toyId: 'zen-cairn', action: 'stack' });
    t += 2000;
    w.handle(a.id, { t: 'use', toyId: 'zen-cairn', action: 'stack' });
    expect(state(a.c)).toMatchObject({ height: 1 });
  });
});

describe('stage screen', () => {
  const screen = (c: FakeConn) => c.of('toyState').filter((m) => m.toyId === 'stage-screen').at(-1)?.state;
  const onStage = (id: string) => go(id, -30, 47.5);

  it('is set from the stage, rate limited, cleared after two hours, and saved', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    go(a.id, -30, 52); // in the seats, not on the stage
    w.handle(a.id, { t: 'stageText', text: 'Calculus review 7pm' });
    expect(a.c.of('error').at(-1)).toMatchObject({ code: 'bad_stage' });
    onStage(a.id);
    w.handle(a.id, { t: 'stageText', text: 'Calculus review 7pm' });
    expect(screen(b.c)).toMatchObject({ kind: 'stageScreen', text: 'Calculus review 7pm', by: 'Sam', until: t + STAGE_TEXT_TTL_MS });
    t += 5000;
    w.handle(a.id, { t: 'stageText', text: 'Open mic' });
    expect(screen(b.c)).toMatchObject({ text: 'Calculus review 7pm' });
    expect(JSON.parse(store.getKv('stage-screen')!)).toMatchObject({ text: 'Calculus review 7pm' });
    t += STAGE_TEXT_TTL_MS;
    w.tick();
    expect(screen(b.c)).toMatchObject({ text: null, by: null });
  });
});

describe('south park toys', () => {
  it('play the stage instruments from their stools', () => {
    const a = joinNew('Sam');
    sitOn(a.id, 'stage-drums-stool');
    w.handle(a.id, { t: 'use', toyId: 'stage-drums', action: 'note', arg: 3 });
    expect(a.c.of('toyEvent').at(-1)).toMatchObject({ toyId: 'stage-drums', action: 'note', arg: 3 });
  });

  it('feeds the koi from the pond edge', () => {
    const a = joinNew('Sam');
    go(a.id, -29.5, 30.2);
    w.handle(a.id, { t: 'use', toyId: 'zen-koi', action: 'feed' });
    expect(a.c.of('toyEvent').at(-1)).toMatchObject({ toyId: 'zen-koi', action: 'feed' });
  });
});
