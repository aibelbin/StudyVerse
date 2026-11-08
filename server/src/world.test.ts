import { beforeEach, describe, expect, it } from 'vitest';
import { GRACE_MS, RAIN_MS } from '../../shared/constants';
import { DEFAULT_LOOK } from '../../shared/looks';
import type { ClientMsg, ErrorCode, ServerMsg } from '../../shared/protocol';
import { findSlot } from '../../shared/scenes';
import { World, type Conn } from './world';

const MIN = 60_000;

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  closed: ErrorCode | null = null;
  send(m: ServerMsg) { this.msgs.push(m); }
  close(code: ErrorCode) { this.closed = code; }
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
  feed(): string[] { return this.of('feed').map((m) => m.event.text); }
}

let t: number;
let w: World;
const prof = (id: string, name: string) => ({ id, name, look: DEFAULT_LOOK });
const send = (id: string, m: ClientMsg) => w.handle(id, m);
/** Walk somewhere far away: advance the clock so the speed check allows it. */
const goTo = (id: string, x: number, z: number) => { t += 10_000; send(id, { t: 'move', x, z, facing: 0, anim: 'idle' }); };
const slot = findSlot('town', 'park-b1-a')!;
const slotB = findSlot('town', 'park-b1-b')!;
function sitDown(id: string, s = slot) { goTo(id, s.x, s.z + 0.5); send(id, { t: 'sit', slotId: s.id }); }

beforeEach(() => { t = 1_000_000; w = new World(() => t); });

describe('joining', () => {
  it('welcomes a new player in the town and tells others', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a, 'tok');
    w.join(prof('b', 'Alex'), b);
    const welcomeA = a.of('welcome')[0];
    expect(welcomeA.token).toBe('tok');
    expect(welcomeA.you).toMatchObject({ id: 'a', scene: 'town', x: 0, z: 1.5, connected: true });
    expect(b.of('welcome')[0].players.map((p) => p.id)).toEqual(['a']);
    expect(a.of('playerJoined')[0].player.id).toBe('b');
    expect(a.feed()).toEqual(['🌷 Sam arrived', '🌷 Alex arrived']);
    expect(a.of('online').at(-1)!.list.map((o) => o.name)).toEqual(['Sam', 'Alex']);
  });

  it('a second connection replaces the first', () => {
    const a1 = new FakeConn(), a2 = new FakeConn();
    w.join(prof('a', 'Sam'), a1);
    w.join(prof('a', 'Sam'), a2);
    expect(a1.closed).toBe('connected_elsewhere');
    w.disconnect('a', a1); // the old socket closing must not mark the player as gone
    expect(w.view('a')!.connected).toBe(true);
    expect(a2.of('welcome')).toHaveLength(1);
  });
});

describe('slots', () => {
  it('sits at a free slot and rejects a taken one', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    sitDown('a');
    expect(w.view('a')).toMatchObject({ slotId: slot.id, x: slot.x, z: slot.z, anim: 'sit' });
    expect(b.of('playerUpdated').at(-1)!.player.slotId).toBe(slot.id);
    sitDown('b');
    expect(b.of('error').at(-1)!.code).toBe('slot_taken');
  });

  it('rejects sitting from far away', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    send('a', { t: 'sit', slotId: slot.id });
    expect(a.of('error').at(-1)!.code).toBe('bad_slot');
  });

  it('ignores movement while seated', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    sitDown('a');
    goTo('a', 0, 0);
    expect(w.view('a')!.x).toBe(slot.x);
  });
});

describe('sessions', () => {
  it('requires a slot', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    expect(a.of('error').at(-1)!.code).toBe('not_seated');
  });

  it('rejects out-of-range lengths', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 500, breakMin: 5 });
    expect(a.of('error').at(-1)!.code).toBe('bad_session');
  });

  it('runs focus → break → done and announces start and finish', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    expect(a.feed()).toContain('📚 Sam started a 25 min session in town');
    t += 25 * MIN; w.tick();
    expect(w.view('a')!.session!.phase).toBe('break');
    expect(a.feed()).toContain('✨ Sam finished a 25 min session!');
    t += 5 * MIN; w.tick();
    expect(w.view('a')!.session).toBeNull();
  });

  it('standing during focus is an early quit with a rain cloud and frees the slot', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    t += 12 * MIN;
    send('a', { t: 'stand' });
    expect(b.feed()).toContain('🥀 Sam left 12 min into a 25 min session');
    expect(w.view('a')).toMatchObject({ session: null, slotId: null, rainUntil: t + RAIN_MS });
    sitDown('b');
    expect(w.view('b')!.slotId).toBe(slot.id);
  });

  it('cancelling during focus is also an early quit', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    t += 3 * MIN;
    send('a', { t: 'cancelSession' });
    expect(a.feed()).toContain('🥀 Sam left 3 min into a 25 min session');
    expect(w.view('a')!.slotId).toBe(slot.id);
  });

  it('standing during a break is free and the break keeps running', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    t += 25 * MIN; w.tick();
    send('a', { t: 'stand' });
    expect(a.feed().some((x) => x.startsWith('🥀'))).toBe(false);
    expect(w.view('a')!.session!.phase).toBe('break');
  });
});

describe('disconnects', () => {
  it('reconnecting within the grace period keeps the session', () => {
    const a1 = new FakeConn(), a2 = new FakeConn();
    w.join(prof('a', 'Sam'), a1);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    w.disconnect('a', a1);
    expect(w.view('a')!.connected).toBe(false);
    t += GRACE_MS - 1_000; w.tick();
    w.join(prof('a', 'Sam'), a2);
    expect(a2.of('welcome')[0].you).toMatchObject({ connected: true, slotId: slot.id });
    expect(a2.of('welcome')[0].you.session!.phase).toBe('focus');
  });

  it('staying away past the grace period during focus is announced and removes the player', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    sitDown('a');
    send('a', { t: 'startSession', focusMin: 25, breakMin: 5 });
    t += 10 * MIN;
    w.disconnect('a', a);
    t += GRACE_MS + 1_000; w.tick();
    expect(b.feed()).toContain("🥀 Sam disconnected and didn't come back, 11 min into a 25 min session");
    expect(b.of('playerLeft').at(-1)!.id).toBe('a');
    expect(w.view('a')).toBeUndefined();
    sitDown('b');
    expect(w.view('b')!.slotId).toBe(slot.id);
  });

  it('leaving outside a session says headed home', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    w.disconnect('a', a);
    t += GRACE_MS; w.tick();
    expect(b.feed()).toContain('👋 Sam headed home');
  });
});

describe('scenes and emotes', () => {
  it('goes through a door into the library', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    goTo('a', -12, -2.1);
    send('a', { t: 'enterScene', doorId: 'to-library' });
    const snap = a.of('sceneSnapshot')[0];
    expect(snap.scene).toBe('library');
    expect(snap.you).toMatchObject({ x: 0, z: 4.2, scene: 'library' });
    expect(b.of('playerLeft').at(-1)!.id).toBe('a');
    expect(b.of('online').at(-1)!.list.find((o) => o.id === 'a')!.scene).toBe('library');
  });

  it('rejects a door you are not standing at', () => {
    const a = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    send('a', { t: 'enterScene', doorId: 'to-library' });
    expect(a.of('error').at(-1)!.code).toBe('bad_door');
    expect(w.view('a')!.scene).toBe('town');
  });

  it('cheers go to the feed (with a cooldown), waves do not', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    send('a', { t: 'emote', kind: 'wave', targetId: 'b' });
    send('a', { t: 'emote', kind: 'flex', targetId: 'b' });
    send('a', { t: 'emote', kind: 'clap', targetId: 'b' });
    expect(b.of('emote')).toHaveLength(3);
    expect(b.feed().filter((x) => x.includes('cheered'))).toEqual(['Sam cheered Alex 💪']);
  });

  it('second slot on the same bench is independent', () => {
    const a = new FakeConn(), b = new FakeConn();
    w.join(prof('a', 'Sam'), a);
    w.join(prof('b', 'Alex'), b);
    sitDown('a');
    sitDown('b', slotB);
    expect(w.view('b')!.slotId).toBe(slotB.id);
  });
});
