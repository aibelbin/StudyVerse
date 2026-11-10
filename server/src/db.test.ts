import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../../shared/wardrobe';
import { ProfileStore } from './db';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const tempDb = () => {
  const d = mkdtempSync(join(tmpdir(), 'vsw-'));
  dirs.push(d);
  return join(d, 'test.db');
};

describe('ProfileStore', () => {
  it('creates a profile and finds it again by token', () => {
    const s = new ProfileStore(':memory:');
    const { profile, token } = s.create('Sam', DEFAULT_LOOK);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(s.findByToken(token)).toEqual(profile);
    s.close();
  });

  it('keeps the newest chat per channel and hands each profile its own history', () => {
    const s = new ProfileStore(':memory:');
    const msg = (from: string, to: string | null, text: string) => s.addChat({ from, fromName: from, to, text, at: 1 }, 3);
    for (let i = 0; i < 5; i++) msg('a', null, `g${i}`);
    msg('a', 'b', 'hi b');
    msg('b', 'a', 'hi a');
    msg('a', 'c', 'hi c');
    const forB = s.chatFor('b', 10, 10).map((m) => m.text);
    expect(forB).toEqual(['g2', 'g3', 'g4', 'hi b', 'hi a']); // only the newest 3 Everyone lines; not a↔c
    expect(s.chatFor('c', 2, 10).map((m) => m.text)).toEqual(['g3', 'g4', 'hi c']);
    const m = s.chatFor('b', 0, 1)[0];
    expect(m).toMatchObject({ from: 'b', to: 'a', reactions: {} });
    s.setReactions(m.id, { '👍': ['a'] });
    expect(s.chatById(m.id)!.reactions).toEqual({ '👍': ['a'] });
    expect(s.chatById(9999)).toBeNull();
    s.close();
  });

  it('looks up profile names', () => {
    const s = new ProfileStore(':memory:');
    const { profile } = s.create('Sam', DEFAULT_LOOK);
    expect(s.profileName(profile.id)).toBe('Sam');
    expect(s.profileName('nobody')).toBeNull();
    s.close();
  });

  it('returns null for an unknown token', () => {
    const s = new ProfileStore(':memory:');
    expect(s.findByToken('nope')).toBeNull();
    s.close();
  });

  it('persists profiles and look changes across reopen', () => {
    const path = tempDb();
    const a = new ProfileStore(path);
    const { profile, token } = a.create('Alex', DEFAULT_LOOK);
    a.updateLook(profile.id, { ...DEFAULT_LOOK, body: '#111111', hat: 'cap' });
    a.close();
    const b = new ProfileStore(path);
    expect(b.findByToken(token)).toEqual({ ...profile, look: { ...DEFAULT_LOOK, body: '#111111', hat: 'cap' } });
    b.close();
  });

  it('never stores the raw token', () => {
    const path = tempDb();
    const s = new ProfileStore(path);
    const { token } = s.create('Jo', DEFAULT_LOOK);
    s.close();
    const raw = readFileSync(path).toString('latin1');
    expect(raw.includes(token)).toBe(false);
  });
});

describe('wallet, wardrobe, notes and daily totals', () => {
  it('upgrades an old database in place', () => {
    const path = tempDb();
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE profiles (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, look_json TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL)`);
    old.prepare('INSERT INTO profiles VALUES (?, ?, ?, ?, 0, 0)').run('p1', 'h', 'Old', JSON.stringify({ body: '#111111', skin: '#222222', hat: 'flower' }));
    old.close();
    const s = new ProfileStore(path);
    expect(s.wallet('p1')).toMatchObject({ kp: 0, streak: 0, owned: [], pet: null });
    s.close();
  });

  it('awards, buys once, and refuses what you cannot afford', () => {
    const s = new ProfileStore(':memory:');
    const { profile: p } = s.create('Sam', DEFAULT_LOOK);
    s.award(p.id, 50, 1, '2026-11-09');
    expect(s.buy(p.id, 'scarf', 30)).toBe(true);
    expect(s.buy(p.id, 'scarf', 30)).toBe(false);
    expect(s.buy(p.id, 'crown', 400)).toBe(false);
    expect(s.wallet(p.id)).toMatchObject({ kp: 20, streak: 1, lastDay: '2026-11-09', owned: ['scarf'] });
  });

  it('adopts pets, switching to an owned kind for free', () => {
    const s = new ProfileStore(':memory:');
    const { profile: p } = s.create('Sam', DEFAULT_LOOK);
    s.award(p.id, 200, 1, '2026-11-09');
    expect(s.adoptPet(p.id, { kind: 'frog', name: 'Hop' }, 120)).toBe(true);
    expect(s.adoptPet(p.id, { kind: 'kitten', name: 'Mo' }, 200)).toBe(false);
    expect(s.adoptPet(p.id, { kind: 'frog', name: 'Hoppy' }, 120)).toBe(true);
    expect(s.wallet(p.id)).toMatchObject({ kp: 80, pets: ['frog'], pet: { kind: 'frog', name: 'Hoppy' } });
  });

  it('keeps notes and the daily total', () => {
    const s = new ProfileStore(':memory:');
    const n = s.addNote('a', 'Sam', 'hi', 5);
    s.addNote('b', 'Jo', 'yo', 6);
    expect(s.notes(10).map((x) => x.text)).toEqual(['yo', 'hi']);
    expect(s.deleteNote(n.id, 'b')).toBe(false);
    expect(s.deleteNote(n.id, 'a')).toBe(true);
    expect(s.noteCount('a')).toBe(0);
    expect(s.addDailyMinutes('2026-11-09', 25)).toBe(25);
    expect(s.addDailyMinutes('2026-11-09', 10)).toBe(35);
  });

  it('keeps small saved values and tops up KP without touching the streak', () => {
    const s = new ProfileStore(':memory:');
    expect(s.getKv('cairn')).toBeNull();
    s.setKv('cairn', '{"height":3}');
    s.setKv('cairn', '{"height":4}');
    expect(s.getKv('cairn')).toBe('{"height":4}');
    const { profile } = s.create('Sam', { body: '#aabbcc', eyes: 'dot', hat: 'none', top: 'none', face: 'none', back: 'none', neck: 'none' });
    s.award(profile.id, 10, 2, '2026-11-09');
    s.addKp(profile.id, 4);
    expect(s.wallet(profile.id)).toMatchObject({ kp: 14, streak: 2 });
  });

  it('hands out cabins by lot with current profile names', () => {
    const s = new ProfileStore(':memory:');
    const a = s.create('Ann', DEFAULT_LOOK).profile.id;
    const b = s.create('Bo', DEFAULT_LOOK).profile.id;
    s.addCabin(b, 1, 5);
    s.addCabin(a, 0, 4);
    expect(s.cabinCount()).toBe(2);
    expect(s.cabinOf(a)).toEqual({ lot: 0, locked: false });
    expect(s.cabinOf('nobody')).toBeNull();
    s.setCabinLocked(a, true);
    expect(s.cabins()).toEqual([
      { owner: a, name: 'Ann', lot: 0, locked: true },
      { owner: b, name: 'Bo', lot: 1, locked: false },
    ]);
  });

  it('upserts and takes cabin items, and reads a keepsake', () => {
    const s = new ProfileStore(':memory:');
    const a = s.create('Ann', DEFAULT_LOOK).profile.id;
    s.setCabinItem(a, 'wall-1', 'painting', '3');
    s.setCabinItem(a, 'wall-1', 'keepsake', '7');
    s.setCabinItem(a, 'shelf', 'bouquet', 'rose');
    expect(s.cabinItems(a)).toEqual([
      { spot: 'shelf', kind: 'bouquet', ref: 'rose' },
      { spot: 'wall-1', kind: 'keepsake', ref: '7' },
    ]);
    expect(s.takeCabinItem(a, 'wall-1')).toEqual({ kind: 'keepsake', ref: '7' });
    expect(s.takeCabinItem(a, 'wall-1')).toBeNull();
    const k = s.addKeepsake(a, 'x', 'Zed', 'teddy', 1, 'rose');
    expect(s.keepsake(a, k)).toEqual({ gift: 'teddy', fromName: 'Zed', flower: 'rose' });
    const k2 = s.addKeepsake(a, 'x', 'Zed', 'teddy', 1);
    expect(s.keepsake(a, k2)).toEqual({ gift: 'teddy', fromName: 'Zed' });
    expect(s.keepsake('other', k)).toBeNull();
  });

  it('lists paintings newest first and buys prints', () => {
    const s = new ProfileStore(':memory:');
    const a = s.create('Ann', DEFAULT_LOOK).profile.id;
    const b = s.create('Bo', DEFAULT_LOOK).profile.id;
    const png = Buffer.from([1, 2, 3]);
    const p1 = s.addPainting(a, 'One', 10, 'pixel', png, true, 1);
    const p2 = s.addPainting(a, 'Two', 20, 'free', png, true, 2);
    const p3 = s.addPainting(a, 'Three', 5, 'pixel', png, false, 3);
    expect(s.forSale().map((p) => p.id)).toEqual([p2, p1]);
    expect(s.painting(p1)).toMatchObject({ artist: a, artistName: 'Ann', title: 'One', price: 10, mode: 'pixel', sold: 0, forSale: true, at: 1 });
    expect(s.paintingPng(p1)).toEqual(png);
    expect(s.paintingCount(a)).toBe(3);
    expect(s.forSaleCount(a)).toBe(2);
    expect(s.byArtist(a)).toHaveLength(3);
    expect(s.setForSale(p3, b, true)).toBe(false);
    expect(s.setForSale(p3, a, true)).toBe(true);

    expect(s.buyPrint(b, p1, 10, 5)).toEqual({ ok: false, reason: 'kp' });
    s.addKp(b, 15);
    expect(s.buyPrint(a, p1, 10, 5)).toEqual({ ok: false, reason: 'own' });
    expect(s.buyPrint(b, 999, 10, 5)).toEqual({ ok: false, reason: 'gone' });
    const ok = s.buyPrint(b, p1, 10, 5);
    expect(ok).toEqual({ ok: true, artist: a, price: 10, title: 'One' });
    expect(s.wallet(b).kp).toBe(5);
    expect(s.wallet(a).kp).toBe(10);
    expect(s.painting(p1)?.sold).toBe(1);
    expect(s.buyPrint(b, p1, 10, 5)).toEqual({ ok: false, reason: 'owned' });
    expect(s.ownsPainting(b, p1)).toBe(true);
    expect(s.ownsPainting(a, p1)).toBe(true);
    expect(s.ownsPainting(b, p2)).toBe(false);
    expect(s.prints(b).map((p) => p.id)).toEqual([p1]);
    s.setForSale(p2, a, false);
    expect(s.buyPrint(b, p2, 1, 5)).toEqual({ ok: false, reason: 'gone' });
  });
});
