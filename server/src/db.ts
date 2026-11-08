import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Look } from '../../shared/types';

export interface Profile {
  id: string;
  name: string;
  look: Look;
}

interface Row {
  id: string;
  name: string;
  look_json: string;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export class ProfileStore {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      look_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )`);
  }

  create(name: string, look: Look, now = Date.now()): { profile: Profile; token: string } {
    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    this.db
      .prepare('INSERT INTO profiles (id, token_hash, name, look_json, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, hash(token), name, JSON.stringify(look), now, now);
    return { profile: { id, name, look }, token };
  }

  findByToken(token: string, now = Date.now()): Profile | null {
    const row = this.db
      .prepare('SELECT id, name, look_json FROM profiles WHERE token_hash = ?')
      .get(hash(token)) as unknown as Row | undefined;
    if (!row) return null;
    this.db.prepare('UPDATE profiles SET last_seen_at = ? WHERE id = ?').run(now, row.id);
    return { id: row.id, name: row.name, look: JSON.parse(row.look_json) as Look };
  }

  updateLook(id: string, look: Look): void {
    this.db.prepare('UPDATE profiles SET look_json = ? WHERE id = ?').run(JSON.stringify(look), id);
  }

  close(): void {
    this.db.close();
  }
}
