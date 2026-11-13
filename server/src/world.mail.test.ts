import { beforeEach, describe, expect, it } from 'vitest';
import { LETTERS_PER_DAY } from '../../shared/mail';
import type { ErrorCode, ServerMsg } from '../../shared/protocol';
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

const newProfile = (name: string) => store.create(name, DEFAULT_LOOK, t).profile;
function join(profile: { id: string; name: string; look: typeof DEFAULT_LOOK }) {
  const c = new FakeConn();
  w.join(profile, c);
  return { id: profile.id, c, profile };
}
const joinNew = (name: string) => join(newProfile(name));
const send = (from: string, to: string, text: string) => w.handle(from, { t: 'sendLetter', to, text });
const flag = (c: FakeConn, owner: string) => c.of('village').at(-1)!.cabins.find((e) => e.owner === owner)!.mail;

beforeEach(() => {
  t = new Date(2026, 10, 10, 10).getTime();
  store = new ProfileStore(':memory:');
  w = new World(() => t, Math.random, undefined, store);
});

describe('letters', () => {
  it('goes to the recipient (and back to the sender) and nobody else', () => {
    const a = joinNew('Ann'), b = joinNew('Bo'), c = joinNew('Cy');
    const cBefore = c.c.msgs.length;
    send(a.id, b.id, 'meet at the pond?');
    const got = b.c.of('letter');
    expect(got).toHaveLength(1);
    expect(got[0].letter).toMatchObject({ from: a.id, fromName: 'Ann', to: b.id, text: 'meet at the pond?', read: false });
    expect(a.c.of('letter').map((m) => m.letter.id)).toEqual([got[0].letter.id]);
    const cNew = c.c.msgs.slice(cBefore);
    expect(cNew.map((m) => m.t)).toEqual(['village']); // only the public flag
    expect(JSON.stringify(c.c.msgs)).not.toContain('pond');
    expect(JSON.stringify(a.c.of('feed'))).not.toContain('pond');
  });

  it('raises the roster mail flag for everyone and readMail clears it', () => {
    const a = joinNew('Ann'), b = joinNew('Bo'), c = joinNew('Cy');
    send(a.id, b.id, 'hi');
    for (const x of [a, b, c]) expect(flag(x.c, b.id)).toBe(true);
    // a second letter while the flag is already up doesn't re-broadcast
    const villages = c.c.of('village').length;
    t += 30_000;
    send(a.id, b.id, 'hi again');
    expect(c.c.of('village')).toHaveLength(villages);
    // the login carries the unread count
    const again = join(b.profile);
    expect(again.c.of('welcome')[0].unread).toBe(2);
    w.handle(b.id, { t: 'getMail' });
    expect(again.c.of('mail').at(-1)!.letters.map((l) => l.text)).toEqual(['hi again', 'hi']);
    w.handle(b.id, { t: 'readMail' });
    for (const x of [a, again, c]) expect(flag(x.c, b.id)).toBe(false);
    expect(store.unreadCount(b.id)).toBe(0);
    // nothing left unread: no broadcast
    const n = c.c.of('village').length;
    w.handle(b.id, { t: 'readMail' });
    expect(c.c.of('village')).toHaveLength(n);
  });

  it('spaces letters out and caps them per day', () => {
    const a = joinNew('Ann'), b = joinNew('Bo');
    send(a.id, b.id, 'one');
    send(a.id, b.id, 'too soon');
    expect(a.c.of('error').at(-1)!.code).toBe('bad_letter');
    expect(store.letters(b.id, 50)).toHaveLength(1);
    for (let i = 1; i < LETTERS_PER_DAY; i++) {
      t += 30_000;
      send(a.id, b.id, `n${i}`);
    }
    expect(store.letters(b.id, 50)).toHaveLength(LETTERS_PER_DAY);
    t += 30_000;
    const errs = a.c.of('error').length;
    send(a.id, b.id, 'one too many');
    expect(a.c.of('error')).toHaveLength(errs + 1);
    expect(store.letters(b.id, 50)).toHaveLength(LETTERS_PER_DAY);
    t = new Date(2026, 10, 11, 9).getTime();
    send(a.id, b.id, 'new day');
    expect(store.letters(b.id, 50)).toHaveLength(LETTERS_PER_DAY + 1);
  });

  it('refuses a recipient without a cabin, and yourself', () => {
    const a = joinNew('Ann');
    const ghost = newProfile('Ghost'); // never joined: no cabin
    for (const to of [ghost.id, 'nobody', a.id]) send(a.id, to, 'hello?');
    expect(a.c.of('error').map((e) => e.code)).toEqual(['bad_letter', 'bad_letter', 'bad_letter']);
    expect(store.lettersSentSince(a.id, 0)).toBe(0);
  });

  it('deletes only your own letters', () => {
    const a = joinNew('Ann'), b = joinNew('Bo'), c = joinNew('Cy');
    send(a.id, b.id, 'keep this');
    const id = b.c.of('letter')[0].letter.id;
    w.handle(c.id, { t: 'deleteLetter', id });
    w.handle(a.id, { t: 'deleteLetter', id }); // the sender can't either
    expect(c.c.of('error').at(-1)!.code).toBe('bad_letter');
    expect(a.c.of('error').at(-1)!.code).toBe('bad_letter');
    expect(store.letters(b.id, 50)).toHaveLength(1);
    w.handle(b.id, { t: 'deleteLetter', id });
    expect(b.c.of('mail').at(-1)!.letters).toEqual([]);
  });

  it('lets an admin delete any letter', () => {
    const a = joinNew('Ann'), b = joinNew('Bo');
    send(a.id, b.id, 'rude');
    const id = b.c.of('letter')[0].letter.id;
    w.handle(a.id, { t: 'admin', action: 'deleteLetter', id });
    expect(a.c.of('error').at(-1)!.code).toBe('not_admin');
    expect(store.letters(b.id, 50)).toHaveLength(1);
    w.admins = new Set([a.id]);
    w.handle(a.id, { t: 'admin', action: 'deleteLetter', id });
    expect(store.letters(b.id, 50)).toEqual([]);
    expect(flag(b.c, b.id)).toBe(false);
  });
});
