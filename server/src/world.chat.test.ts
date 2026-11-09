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

let t: number;
let store: ProfileStore;
let w: World;

function joinNew(name: string) {
  const { profile } = store.create(name, DEFAULT_LOOK);
  const c = new FakeConn();
  w.join(profile, c);
  return { id: profile.id, c, profile };
}
const say = (id: string, text: string, to?: string) => {
  t += 1100;
  w.handle(id, to ? { t: 'chat', text, to } : { t: 'chat', text });
};

beforeEach(() => {
  t = 1_000_000;
  store = new ProfileStore(':memory:');
  w = new World(() => t, Math.random, undefined, store);
});

describe('chat', () => {
  it('Everyone messages reach players in any scene', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    t += 10_000;
    w.handle(b.id, { t: 'move', x: -12, z: -2.1, facing: 0, anim: 'idle' });
    w.handle(b.id, { t: 'enterScene', doorId: 'to-library' });
    expect(w.view(b.id)!.scene).toBe('library');
    say(a.id, 'hello town');
    for (const c of [a.c, b.c]) expect(c.of('chat').at(-1)!.msg).toMatchObject({ from: a.id, fromName: 'Sam', to: null, text: 'hello town' });
  });

  it('DMs reach only the pair, and offline DMs are waiting in history', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    const c = joinNew('Ali');
    say(a.id, 'psst', b.id);
    expect(b.c.of('chat').at(-1)!.msg).toMatchObject({ to: b.id, text: 'psst' });
    expect(a.c.of('chat').at(-1)!.msg.text).toBe('psst');
    expect(c.c.of('chat')).toHaveLength(0);
    const { profile: offline } = store.create('Mo', DEFAULT_LOOK);
    say(a.id, 'see you later', offline.id);
    const conn = new FakeConn();
    w.join(offline, conn);
    expect(conn.of('welcome')[0].chat.map((m) => m.text)).toEqual(['see you later']);
    expect(c.c.of('welcome')[0].chat).toEqual([]);
  });

  it('refuses DMs to unknown people and to yourself', () => {
    const a = joinNew('Sam');
    say(a.id, 'hi', 'ghost');
    expect(a.c.of('error').at(-1)!.code).toBe('bad_chat');
    say(a.id, 'hi me', a.id);
    expect(a.c.of('error').at(-1)!.code).toBe('bad_chat');
    expect(a.c.of('chat')).toHaveLength(0);
  });

  it('rate limits: one a second, five per ten seconds', () => {
    const a = joinNew('Sam');
    w.handle(a.id, { t: 'chat', text: '1' });
    w.handle(a.id, { t: 'chat', text: 'too soon' });
    expect(a.c.of('error').at(-1)!.code).toBe('chat_slow');
    for (let i = 2; i <= 6; i++) say(a.id, String(i));
    expect(a.c.of('chat').map((m) => m.msg.text)).toEqual(['1', '2', '3', '4', '5']);
    t += 10_000;
    say(a.id, 'again');
    expect(a.c.of('chat').at(-1)!.msg.text).toBe('again');
  });

  it('reactions toggle, are saved, and only people who can see the message may react', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    const c = joinNew('Ali');
    say(a.id, 'hey all');
    const id = a.c.of('chat').at(-1)!.msg.id;
    t += 500;
    w.handle(b.id, { t: 'react', id, emoji: '🎉' });
    expect(c.c.of('chatReact').at(-1)).toEqual({ t: 'chatReact', id, reactions: { '🎉': [b.id] } });
    t += 500;
    w.handle(b.id, { t: 'react', id, emoji: '🎉' });
    expect(c.c.of('chatReact').at(-1)!.reactions).toEqual({});
    say(a.id, 'secret', b.id);
    const dm = a.c.of('chat').at(-1)!.msg.id;
    t += 500;
    w.handle(c.id, { t: 'react', id: dm, emoji: '👍' }); // Ali can't see it
    expect(store.chatById(dm)!.reactions).toEqual({});
    t += 500;
    w.handle(b.id, { t: 'react', id: dm, emoji: '❤️' });
    expect(store.chatById(dm)!.reactions).toEqual({ '❤️': [b.id] });
    expect(c.c.of('chatReact')).toHaveLength(2); // the DM reaction stayed between Sam and Jo
  });
});

describe('emotes', () => {
  it('broadcasts acts to the scene, including the sender, at most every 1.5 s', () => {
    const a = joinNew('Sam');
    const b = joinNew('Jo');
    w.handle(a.id, { t: 'act', kind: 'dance' });
    w.handle(a.id, { t: 'act', kind: 'laugh' });
    for (const c of [a.c, b.c]) expect(c.of('act')).toEqual([{ t: 'act', fromId: a.id, kind: 'dance' }]);
    t += 1600;
    w.handle(a.id, { t: 'act', kind: 'laugh' });
    expect(b.c.of('act')).toHaveLength(2);
  });
});
