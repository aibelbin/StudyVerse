import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { DEFAULT_LOOK } from '../../shared/looks';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import { findSeat } from '../../shared/scenes';
import { startServer, type RunningServer } from './server';

type Msg<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;

class TestClient {
  private inbox: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      const i = this.waiters.findIndex((w) => w.pred(m));
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m);
      else this.inbox.push(m);
    });
  }

  static async open(port: number): Promise<TestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    return new TestClient(ws);
  }

  send(m: ClientMsg) { this.ws.send(JSON.stringify(m)); }

  next<T extends ServerMsg['t']>(t: T, pred: (m: Msg<T>) => boolean = () => true): Promise<Msg<T>> {
    const match = (m: ServerMsg) => m.t === t && pred(m as Msg<T>);
    const i = this.inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0] as Msg<T>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${t}`)), 2000);
      this.waiters.push({ pred: match, resolve: (m) => { clearTimeout(timer); resolve(m as Msg<T>); } });
    });
  }

  close() { this.ws.close(); }
}

let srv: RunningServer;
let t: number;
const clients: TestClient[] = [];
const open = async () => { const c = await TestClient.open(srv.port); clients.push(c); return c; };
const join = async (name: string) => {
  const c = await open();
  c.send({ t: 'hello', inviteCode: 'cozy', name, look: DEFAULT_LOOK });
  const welcome = await c.next('welcome');
  return { c, welcome };
};

beforeEach(async () => {
  t = 1_000_000;
  srv = await startServer({ port: 0, dbPath: ':memory:', inviteCode: 'cozy', now: () => t, tickMs: 20 });
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await srv.close();
});

describe('server', () => {
  it('answers /health', async () => {
    const r = await fetch(`http://127.0.0.1:${srv.port}/health`);
    expect(await r.text()).toBe('ok');
  });

  it('rejects a wrong invite code', async () => {
    const c = await open();
    c.send({ t: 'hello', inviteCode: 'nope', name: 'Sam', look: DEFAULT_LOOK });
    expect((await c.next('error')).code).toBe('bad_invite');
  });

  it('rejects an unknown token', async () => {
    const c = await open();
    c.send({ t: 'hello', token: 'f'.repeat(64) });
    expect((await c.next('error')).code).toBe('unknown_token');
  });

  it('creates a profile, then recognises its token on a new connection', async () => {
    const { c, welcome } = await join('Sam');
    expect(welcome.token).toMatch(/^[0-9a-f]{64}$/);
    c.close();
    const again = await open();
    again.send({ t: 'hello', token: welcome.token! });
    const w2 = await again.next('welcome');
    expect(w2.token).toBeUndefined();
    expect(w2.you.id).toBe(welcome.you.id);
    expect(w2.you.name).toBe('Sam');
  });

  it('two players see each other, study, and an early quit is broadcast', async () => {
    const { c: a, welcome: wa } = await join('Sam');
    const { c: b } = await join('Alex');
    expect((await a.next('playerJoined')).player.name).toBe('Alex');

    const seat = findSeat('town', 'park-b1-a')!;
    t += 10_000;
    a.send({ t: 'move', x: seat.x, z: seat.z + 0.5, facing: 0, anim: 'walk' });
    a.send({ t: 'sit', seatId: seat.id });
    await b.next('playerUpdated', (m) => m.player.id === wa.you.id && m.player.seatId === seat.id);

    a.send({ t: 'startSession', focusMin: 25, breakMin: 5 });
    await b.next('feed', (m) => m.event.text === '📚 Sam started a 25 min session in the park');

    t += 12 * 60_000;
    a.send({ t: 'stand' });
    await b.next('feed', (m) => m.event.text === '🥀 Sam left 12 min into a 25 min session');
    const upd = await b.next('playerUpdated', (m) => m.player.id === wa.you.id && m.player.seatId === null);
    expect(upd.player.rainUntil).toBeGreaterThan(t);
  });

  it('ignores garbage without crashing', async () => {
    const { c } = await join('Sam');
    c.ws.send('{{{nope');
    c.send({ t: 'emote', kind: 'wave' });
    expect((await c.next('emote')).kind).toBe('wave');
  });

  it('a replaced socket can no longer act on the player', async () => {
    const { c: a, welcome } = await join('Sam');
    const b = await open();
    b.send({ t: 'hello', token: welcome.token! });
    await b.next('welcome');
    a.send({ t: 'emote', kind: 'wave' });
    await new Promise((r) => setTimeout(r, 200));
    b.send({ t: 'emote', kind: 'clap' });
    expect((await b.next('emote')).kind).toBe('clap');
  });
});
