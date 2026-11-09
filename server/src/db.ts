import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { ChatMsg, Look, Note, PetInfo, PetKind, Wallet } from '../../shared/types';
import { DEFAULT_LOOK, normalizeLook } from '../../shared/wardrobe';

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

/** What the World persists: wallets, wardrobe, notes and the town's daily study total. */
export interface Store {
  updateLook(id: string, look: Look): void;
  wallet(id: string): Wallet & { lastDay: string | null };
  award(id: string, kp: number, streak: number, day: string): void;
  /** Spends KP and records ownership atomically; false if unaffordable or already owned. */
  buy(id: string, itemId: string, price: number): boolean;
  /** Spends KP on a new pet kind (price 0 to just switch) and makes it the active pet. */
  adoptPet(id: string, pet: PetInfo, price: number): boolean;
  setActivePet(id: string, pet: PetInfo | null): void;
  addNote(authorId: string, name: string, text: string, at: number): Note;
  deleteNote(noteId: number, authorId: string): boolean;
  notes(limit: number): Note[];
  noteCount(authorId: string): number;
  addDailyMinutes(day: string, minutes: number): number;
  dailyMinutes(day: string): number;
  /** Saves a chat line (keeping only the newest `keep` in its channel) and returns it with its id. */
  addChat(msg: Omit<ChatMsg, 'id' | 'reactions'>, keep: number): ChatMsg;
  /** The last `globalLimit` Everyone messages plus the last `dmLimit` DMs to or from this profile, oldest first. */
  chatFor(profileId: string, globalLimit: number, dmLimit: number): ChatMsg[];
  chatById(id: number): ChatMsg | null;
  setReactions(id: number, reactions: Record<string, string[]>): void;
  /** A profile's name, or null if there's no such profile. */
  profileName(id: string): string | null;
}

export class ProfileStore implements Store {
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
    const cols = new Set((this.db.prepare('PRAGMA table_info(profiles)').all() as { name: string }[]).map((c) => c.name));
    const addCol = (name: string, def: string) => {
      if (!cols.has(name)) this.db.exec(`ALTER TABLE profiles ADD COLUMN ${name} ${def}`);
    };
    addCol('kp', 'INTEGER NOT NULL DEFAULT 0');
    addCol('streak', 'INTEGER NOT NULL DEFAULT 0');
    addCol('last_study_day', 'TEXT');
    addCol('pet_json', 'TEXT');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS owned (profile_id TEXT NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY (profile_id, item_id));
      CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, minutes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, pair TEXT NOT NULL, from_id TEXT NOT NULL, from_name TEXT NOT NULL,
        to_id TEXT, text TEXT NOT NULL, at INTEGER NOT NULL, reactions_json TEXT NOT NULL DEFAULT '{}');
      CREATE INDEX IF NOT EXISTS chat_pair ON chat (pair, id);
      CREATE INDEX IF NOT EXISTS chat_to ON chat (to_id, id);
      CREATE INDEX IF NOT EXISTS chat_from ON chat (from_id, id);
    `);
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
    return { id: row.id, name: row.name, look: normalizeLook(JSON.parse(row.look_json)) ?? DEFAULT_LOOK };
  }

  updateLook(id: string, look: Look): void {
    this.db.prepare('UPDATE profiles SET look_json = ? WHERE id = ?').run(JSON.stringify(look), id);
  }

  wallet(id: string): Wallet & { lastDay: string | null } {
    const row = this.db.prepare('SELECT kp, streak, last_study_day, pet_json FROM profiles WHERE id = ?').get(id) as
      | { kp: number; streak: number; last_study_day: string | null; pet_json: string | null }
      | undefined;
    const items = (this.db.prepare('SELECT item_id FROM owned WHERE profile_id = ? ORDER BY item_id').all(id) as { item_id: string }[]).map((r) => r.item_id);
    const pets = items.filter((i) => i.startsWith('pet:')).map((i) => i.slice(4) as PetKind);
    return {
      kp: row?.kp ?? 0,
      streak: row?.streak ?? 0,
      lastDay: row?.last_study_day ?? null,
      owned: items.filter((i) => !i.startsWith('pet:')),
      pets,
      pet: row?.pet_json ? (JSON.parse(row.pet_json) as PetInfo) : null,
    };
  }

  award(id: string, kp: number, streak: number, day: string): void {
    this.db.prepare('UPDATE profiles SET kp = kp + ?, streak = ?, last_study_day = ? WHERE id = ?').run(kp, streak, day, id);
  }

  private spend(id: string, ownedId: string, price: number): boolean {
    this.db.exec('BEGIN');
    try {
      const has = this.db.prepare('SELECT 1 FROM owned WHERE profile_id = ? AND item_id = ?').get(id, ownedId);
      const r = has ? { changes: 0 } : this.db.prepare('UPDATE profiles SET kp = kp - ? WHERE id = ? AND kp >= ?').run(price, id, price);
      if (!has && Number(r.changes) === 1) this.db.prepare('INSERT INTO owned (profile_id, item_id) VALUES (?, ?)').run(id, ownedId);
      this.db.exec('COMMIT');
      return !has && Number(r.changes) === 1;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  buy(id: string, itemId: string, price: number): boolean {
    return this.spend(id, itemId, price);
  }

  adoptPet(id: string, pet: PetInfo, price: number): boolean {
    const owned = this.db.prepare('SELECT 1 FROM owned WHERE profile_id = ? AND item_id = ?').get(id, `pet:${pet.kind}`);
    if (!owned && !this.spend(id, `pet:${pet.kind}`, price)) return false;
    this.setActivePet(id, pet);
    return true;
  }

  setActivePet(id: string, pet: PetInfo | null): void {
    this.db.prepare('UPDATE profiles SET pet_json = ? WHERE id = ?').run(pet ? JSON.stringify(pet) : null, id);
  }

  addNote(authorId: string, name: string, text: string, at: number): Note {
    const r = this.db.prepare('INSERT INTO notes (profile_id, name, text, created_at) VALUES (?, ?, ?, ?)').run(authorId, name, text, at);
    return { id: Number(r.lastInsertRowid), authorId, name, text, at };
  }

  deleteNote(noteId: number, authorId: string): boolean {
    return Number(this.db.prepare('DELETE FROM notes WHERE id = ? AND profile_id = ?').run(noteId, authorId).changes) === 1;
  }

  notes(limit: number): Note[] {
    return (this.db.prepare('SELECT id, profile_id, name, text, created_at FROM notes ORDER BY id DESC LIMIT ?').all(limit) as {
      id: number; profile_id: string; name: string; text: string; created_at: number;
    }[]).map((r) => ({ id: r.id, authorId: r.profile_id, name: r.name, text: r.text, at: r.created_at }));
  }

  noteCount(authorId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM notes WHERE profile_id = ?').get(authorId) as { n: number }).n;
  }

  addChat(msg: Omit<ChatMsg, 'id' | 'reactions'>, keep: number): ChatMsg {
    const pair = msg.to === null ? 'global' : [msg.from, msg.to].sort().join('|');
    const r = this.db.prepare('INSERT INTO chat (pair, from_id, from_name, to_id, text, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(pair, msg.from, msg.fromName, msg.to, msg.text, msg.at);
    this.db.prepare('DELETE FROM chat WHERE pair = ? AND id NOT IN (SELECT id FROM chat WHERE pair = ? ORDER BY id DESC LIMIT ?)').run(pair, pair, keep);
    return { ...msg, id: Number(r.lastInsertRowid), reactions: {} };
  }

  chatFor(profileId: string, globalLimit: number, dmLimit: number): ChatMsg[] {
    const g = this.db.prepare("SELECT * FROM chat WHERE pair = 'global' ORDER BY id DESC LIMIT ?").all(globalLimit) as unknown as ChatRow[];
    const d = this.db.prepare('SELECT * FROM chat WHERE pair != \'global\' AND (to_id = ? OR from_id = ?) ORDER BY id DESC LIMIT ?').all(profileId, profileId, dmLimit) as unknown as ChatRow[];
    return [...g, ...d].sort((a, b) => a.id - b.id).map(toChat);
  }

  chatById(id: number): ChatMsg | null {
    const r = this.db.prepare('SELECT * FROM chat WHERE id = ?').get(id) as unknown as ChatRow | undefined;
    return r ? toChat(r) : null;
  }

  setReactions(id: number, reactions: Record<string, string[]>): void {
    this.db.prepare('UPDATE chat SET reactions_json = ? WHERE id = ?').run(JSON.stringify(reactions), id);
  }

  profileName(id: string): string | null {
    return (this.db.prepare('SELECT name FROM profiles WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? null;
  }

  addDailyMinutes(day: string, minutes: number): number {
    this.db.prepare('INSERT INTO daily (day, minutes) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET minutes = minutes + excluded.minutes').run(day, minutes);
    return this.dailyMinutes(day);
  }

  dailyMinutes(day: string): number {
    return (this.db.prepare('SELECT minutes FROM daily WHERE day = ?').get(day) as { minutes: number } | undefined)?.minutes ?? 0;
  }

  close(): void {
    this.db.close();
  }
}

interface ChatRow { id: number; from_id: string; from_name: string; to_id: string | null; text: string; at: number; reactions_json: string }

function toChat(r: ChatRow): ChatMsg {
  let reactions: Record<string, string[]> = {};
  try {
    reactions = JSON.parse(r.reactions_json) as Record<string, string[]>;
  } catch { /* a damaged row just loses its reactions */ }
  return { id: r.id, from: r.from_id, fromName: r.from_name, to: r.to_id, text: r.text, at: r.at, reactions };
}
