import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../../shared/looks';
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
    a.updateLook(profile.id, { body: '#111111', skin: '#222222', hat: 'cap' });
    a.close();
    const b = new ProfileStore(path);
    expect(b.findByToken(token)).toEqual({ ...profile, look: { body: '#111111', skin: '#222222', hat: 'cap' } });
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
