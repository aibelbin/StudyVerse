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
});
