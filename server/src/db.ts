import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { ChatMsg, Look, Note, PetInfo, PetKind, Wallet } from '../../shared/types';
import type { CabinEntry, PaintMode, PaintingMeta } from '../../shared/art';
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
  /**
   * The last `globalLimit` Everyone messages sent since `since` (newcomers don't see older ones) plus the
   * last `dmLimit` DMs to or from this profile, oldest first.
   */
  chatFor(profileId: string, globalLimit: number, dmLimit: number, since?: number): ChatMsg[];
  deleteChat(id: number): boolean;
  /** When the profile was created (0 if unknown). */
  createdAt(id: string): number;
  addKeepsake(toId: string, fromId: string, fromName: string, gift: string, at: number, flower?: string): number;
  keepsakes(toId: string, limit: number): { id: number; gift: string; fromName: string; flower?: string }[];
  /** The bag: kind 'gift' (value = gift) or 'bouquet' (value = flower). */
  addBagItem(owner: string, kind: 'gift' | 'bouquet', value: string, at: number): number;
  bag(owner: string): { id: number; kind: string; value: string }[];
  /** Takes an item out of the bag (null if it isn't theirs). */
  takeBagItem(owner: string, id: number): { kind: string; value: string } | null;
  keepsakeCount(toId: string): number;
  /** Removes one of this profile's keepsakes and says which gift it was (null if not theirs). */
  takeKeepsake(toId: string, id: number): string | null;
  /** Bans and chat mutes: until is server ms (Number.MAX_SAFE_INTEGER = for good). */
  setRestriction(id: string, kind: 'ban' | 'mute', until: number | null): void;
  restriction(id: string, kind: 'ban' | 'mute'): number | null;
  restrictions(kind: 'ban' | 'mute'): { id: string; name: string; until: number }[];
  /** Deletes a note whoever wrote it (admins). */
  deleteNoteAny(noteId: number): boolean;
  chatById(id: number): ChatMsg | null;
  setReactions(id: number, reactions: Record<string, string[]>): void;
  /** A profile's name, or null if there's no such profile. */
  profileName(id: string): string | null;
  /** Plain KP top-up (no streak), e.g. for a finished breather. */
  addKp(id: string, kp: number): void;
  /** Small saved bits of world state (the cairn, the stage screen), as JSON strings. */
  getKv(key: string): string | null;
  setKv(key: string, value: string): void;
  addCabin(owner: string, lot: number, at: number): void;
  cabinOf(owner: string): { lot: number; locked: boolean } | null;
  cabinCount(): number;
  cabins(): CabinEntry[];
  setCabinLocked(owner: string, on: boolean): void;
  setCabinItem(owner: string, spot: string, kind: string, ref: number): void;
  takeCabinItem(owner: string, spot: string): { kind: string; ref: number } | null;
  cabinItems(owner: string): { spot: string; kind: string; ref: number }[];
  keepsake(owner: string, id: number): { gift: string; fromName: string; flower?: string } | null;
  addPainting(artist: string, title: string, price: number, mode: PaintMode, png: Buffer, forSale: boolean, at: number): number;
  painting(id: number): PaintingMeta | null;
  paintingPng(id: number): Buffer | null;
  /** Paintings on sale, newest first. */
  forSale(): PaintingMeta[];
  byArtist(artist: string): PaintingMeta[];
  /** Paintings this profile owns a print of. */
  prints(owner: string): PaintingMeta[];
  paintingCount(artist: string): number;
  forSaleCount(artist: string): number;
  setForSale(id: number, artist: string, on: boolean): boolean;
  /** True for the artist and for anyone holding a print. */
  ownsPainting(owner: string, id: number): boolean;
  buyPrint(buyer: string, id: number, pay: number): { ok: true; artist: string; price: number; title: string } | { ok: false; reason: 'gone' | 'own' | 'owned' | 'kp' };
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
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS keepsakes (id INTEGER PRIMARY KEY AUTOINCREMENT, to_id TEXT NOT NULL, from_id TEXT NOT NULL, from_name TEXT NOT NULL, gift TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS keepsakes_to ON keepsakes (to_id, id);
      CREATE TABLE IF NOT EXISTS bag (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS bag_owner ON bag (owner, id);
      CREATE TABLE IF NOT EXISTS restrictions (profile_id TEXT NOT NULL, kind TEXT NOT NULL, until INTEGER NOT NULL, PRIMARY KEY (profile_id, kind));
      CREATE TABLE IF NOT EXISTS cabins (owner_id TEXT PRIMARY KEY, lot INTEGER UNIQUE, locked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cabin_items (owner_id TEXT NOT NULL, spot TEXT NOT NULL, kind TEXT NOT NULL, ref INTEGER NOT NULL, PRIMARY KEY (owner_id, spot));
      CREATE TABLE IF NOT EXISTS paintings (id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id TEXT NOT NULL, title TEXT NOT NULL, price INTEGER NOT NULL, mode TEXT NOT NULL,
        png BLOB NOT NULL, for_sale INTEGER NOT NULL DEFAULT 0, sold INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS paintings_sale ON paintings (for_sale, id);
      CREATE TABLE IF NOT EXISTS prints (painting_id INTEGER NOT NULL, owner_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (painting_id, owner_id));
    `);
    const kcols = new Set((this.db.prepare('PRAGMA table_info(keepsakes)').all() as { name: string }[]).map((c) => c.name));
    if (!kcols.has('flower')) this.db.exec('ALTER TABLE keepsakes ADD COLUMN flower TEXT');
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

  chatFor(profileId: string, globalLimit: number, dmLimit: number, since = 0): ChatMsg[] {
    const g = this.db.prepare("SELECT * FROM chat WHERE pair = 'global' AND at >= ? ORDER BY id DESC LIMIT ?").all(since, globalLimit) as unknown as ChatRow[];
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

  deleteChat(id: number): boolean {
    return Number(this.db.prepare('DELETE FROM chat WHERE id = ?').run(id).changes) > 0;
  }

  createdAt(id: string): number {
    return (this.db.prepare('SELECT created_at FROM profiles WHERE id = ?').get(id) as { created_at: number } | undefined)?.created_at ?? 0;
  }

  addKeepsake(toId: string, fromId: string, fromName: string, gift: string, at: number, flower?: string): number {
    return Number(this.db.prepare('INSERT INTO keepsakes (to_id, from_id, from_name, gift, at, flower) VALUES (?, ?, ?, ?, ?, ?)').run(toId, fromId, fromName, gift, at, flower ?? null).lastInsertRowid);
  }

  keepsakes(toId: string, limit: number): { id: number; gift: string; fromName: string; flower?: string }[] {
    return (this.db.prepare('SELECT id, gift, from_name, flower FROM keepsakes WHERE to_id = ? ORDER BY id DESC LIMIT ?').all(toId, limit) as { id: number; gift: string; from_name: string; flower: string | null }[])
      .map((r) => ({ id: Number(r.id), gift: r.gift, fromName: r.from_name, ...(r.flower ? { flower: r.flower } : {}) }));
  }

  addBagItem(owner: string, kind: 'gift' | 'bouquet', value: string, at: number): number {
    return Number(this.db.prepare('INSERT INTO bag (owner, kind, value, at) VALUES (?, ?, ?, ?)').run(owner, kind, value, at).lastInsertRowid);
  }

  bag(owner: string): { id: number; kind: string; value: string }[] {
    return (this.db.prepare('SELECT id, kind, value FROM bag WHERE owner = ? ORDER BY id').all(owner) as { id: number; kind: string; value: string }[])
      .map((r) => ({ id: Number(r.id), kind: r.kind, value: r.value }));
  }

  takeBagItem(owner: string, id: number): { kind: string; value: string } | null {
    const r = this.db.prepare('SELECT kind, value FROM bag WHERE id = ? AND owner = ?').get(id, owner) as { kind: string; value: string } | undefined;
    if (!r) return null;
    this.db.prepare('DELETE FROM bag WHERE id = ?').run(id);
    return r;
  }

  keepsakeCount(toId: string): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM keepsakes WHERE to_id = ?').get(toId) as { n: number }).n);
  }

  takeKeepsake(toId: string, id: number): string | null {
    const row = this.db.prepare('SELECT gift FROM keepsakes WHERE id = ? AND to_id = ?').get(id, toId) as { gift: string } | undefined;
    if (!row) return null;
    this.db.prepare('DELETE FROM keepsakes WHERE id = ?').run(id);
    return row.gift;
  }

  addCabin(owner: string, lot: number, at: number): void {
    this.db.prepare('INSERT INTO cabins (owner_id, lot, locked, created_at) VALUES (?, ?, 0, ?)').run(owner, lot, at);
  }

  cabinOf(owner: string): { lot: number; locked: boolean } | null {
    const r = this.db.prepare('SELECT lot, locked FROM cabins WHERE owner_id = ?').get(owner) as { lot: number; locked: number } | undefined;
    return r ? { lot: Number(r.lot), locked: !!r.locked } : null;
  }

  cabinCount(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM cabins').get() as { n: number }).n);
  }

  cabins(): CabinEntry[] {
    return (this.db.prepare('SELECT c.owner_id AS owner, p.name AS name, c.lot AS lot, c.locked AS locked FROM cabins c JOIN profiles p ON p.id = c.owner_id ORDER BY c.lot').all() as { owner: string; name: string; lot: number; locked: number }[])
      .map((r) => ({ owner: r.owner, name: r.name, lot: Number(r.lot), locked: !!r.locked }));
  }

  setCabinLocked(owner: string, on: boolean): void {
    this.db.prepare('UPDATE cabins SET locked = ? WHERE owner_id = ?').run(on ? 1 : 0, owner);
  }

  setCabinItem(owner: string, spot: string, kind: string, ref: number): void {
    this.db.prepare('INSERT INTO cabin_items (owner_id, spot, kind, ref) VALUES (?, ?, ?, ?) ON CONFLICT(owner_id, spot) DO UPDATE SET kind = excluded.kind, ref = excluded.ref').run(owner, spot, kind, ref);
  }

  takeCabinItem(owner: string, spot: string): { kind: string; ref: number } | null {
    const r = this.db.prepare('SELECT kind, ref FROM cabin_items WHERE owner_id = ? AND spot = ?').get(owner, spot) as { kind: string; ref: number } | undefined;
    if (!r) return null;
    this.db.prepare('DELETE FROM cabin_items WHERE owner_id = ? AND spot = ?').run(owner, spot);
    return { kind: r.kind, ref: Number(r.ref) };
  }

  cabinItems(owner: string): { spot: string; kind: string; ref: number }[] {
    return (this.db.prepare('SELECT spot, kind, ref FROM cabin_items WHERE owner_id = ?').all(owner) as { spot: string; kind: string; ref: number }[]).map((r) => ({ spot: r.spot, kind: r.kind, ref: Number(r.ref) }));
  }

  keepsake(owner: string, id: number): { gift: string; fromName: string; flower?: string } | null {
    const r = this.db.prepare('SELECT gift, from_name, flower FROM keepsakes WHERE id = ? AND to_id = ?').get(id, owner) as { gift: string; from_name: string; flower: string | null } | undefined;
    if (!r) return null;
    return { gift: r.gift, fromName: r.from_name, ...(r.flower ? { flower: r.flower } : {}) };
  }

  private static readonly PAINTING_SELECT =
    'SELECT p.id, p.artist_id, pr.name AS artist_name, p.title, p.price, p.mode, p.sold, p.for_sale, p.created_at FROM paintings p JOIN profiles pr ON pr.id = p.artist_id';

  private static meta(r: Record<string, unknown>): PaintingMeta {
    return {
      id: Number(r.id),
      artist: r.artist_id as string,
      artistName: r.artist_name as string,
      title: r.title as string,
      price: Number(r.price),
      mode: r.mode as PaintMode,
      sold: Number(r.sold),
      forSale: !!r.for_sale,
      at: Number(r.created_at),
    };
  }

  addPainting(artist: string, title: string, price: number, mode: PaintMode, png: Buffer, forSale: boolean, at: number): number {
    return Number(this.db.prepare('INSERT INTO paintings (artist_id, title, price, mode, png, for_sale, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(artist, title, price, mode, png, forSale ? 1 : 0, at).lastInsertRowid);
  }

  painting(id: number): PaintingMeta | null {
    const r = this.db.prepare(`${ProfileStore.PAINTING_SELECT} WHERE p.id = ?`).get(id) as Record<string, unknown> | undefined;
    return r ? ProfileStore.meta(r) : null;
  }

  paintingPng(id: number): Buffer | null {
    const r = this.db.prepare('SELECT png FROM paintings WHERE id = ?').get(id) as { png: Uint8Array } | undefined;
    return r ? Buffer.from(r.png) : null;
  }

  forSale(): PaintingMeta[] {
    return (this.db.prepare(`${ProfileStore.PAINTING_SELECT} WHERE p.for_sale = 1 ORDER BY p.id DESC`).all() as Record<string, unknown>[]).map(ProfileStore.meta);
  }

  byArtist(artist: string): PaintingMeta[] {
    return (this.db.prepare(`${ProfileStore.PAINTING_SELECT} WHERE p.artist_id = ? ORDER BY p.id DESC`).all(artist) as Record<string, unknown>[]).map(ProfileStore.meta);
  }

  prints(owner: string): PaintingMeta[] {
    return (this.db.prepare(`${ProfileStore.PAINTING_SELECT} JOIN prints t ON t.painting_id = p.id WHERE t.owner_id = ? ORDER BY t.at DESC, p.id DESC`).all(owner) as Record<string, unknown>[]).map(ProfileStore.meta);
  }

  paintingCount(artist: string): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM paintings WHERE artist_id = ?').get(artist) as { n: number }).n);
  }

  forSaleCount(artist: string): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM paintings WHERE artist_id = ? AND for_sale = 1').get(artist) as { n: number }).n);
  }

  setForSale(id: number, artist: string, on: boolean): boolean {
    return Number(this.db.prepare('UPDATE paintings SET for_sale = ? WHERE id = ? AND artist_id = ?').run(on ? 1 : 0, id, artist).changes) === 1;
  }

  ownsPainting(owner: string, id: number): boolean {
    return !!this.db.prepare('SELECT 1 FROM paintings WHERE id = ? AND artist_id = ? UNION ALL SELECT 1 FROM prints WHERE painting_id = ? AND owner_id = ?').get(id, owner, id, owner);
  }

  buyPrint(buyer: string, id: number, pay: number): { ok: true; artist: string; price: number; title: string } | { ok: false; reason: 'gone' | 'own' | 'owned' | 'kp' } {
    this.db.exec('BEGIN');
    try {
      const p = this.db.prepare('SELECT artist_id, title, price, for_sale FROM paintings WHERE id = ?').get(id) as { artist_id: string; title: string; price: number; for_sale: number } | undefined;
      let out: { ok: true; artist: string; price: number; title: string } | { ok: false; reason: 'gone' | 'own' | 'owned' | 'kp' };
      if (!p || !p.for_sale) out = { ok: false, reason: 'gone' };
      else if (p.artist_id === buyer) out = { ok: false, reason: 'own' };
      else if (this.db.prepare('SELECT 1 FROM prints WHERE painting_id = ? AND owner_id = ?').get(id, buyer)) out = { ok: false, reason: 'owned' };
      else if (Number(this.db.prepare('UPDATE profiles SET kp = kp - ? WHERE id = ? AND kp >= ?').run(pay, buyer, pay).changes) !== 1) out = { ok: false, reason: 'kp' };
      else {
        const price = Number(p.price);
        this.db.prepare('UPDATE profiles SET kp = kp + ? WHERE id = ?').run(price, p.artist_id);
        this.db.prepare('INSERT INTO prints (painting_id, owner_id, at) VALUES (?, ?, ?)').run(id, buyer, Date.now());
        this.db.prepare('UPDATE paintings SET sold = sold + 1 WHERE id = ?').run(id);
        out = { ok: true, artist: p.artist_id, price, title: p.title };
      }
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  setRestriction(id: string, kind: 'ban' | 'mute', until: number | null): void {
    if (until === null) this.db.prepare('DELETE FROM restrictions WHERE profile_id = ? AND kind = ?').run(id, kind);
    else this.db.prepare('INSERT INTO restrictions (profile_id, kind, until) VALUES (?, ?, ?) ON CONFLICT(profile_id, kind) DO UPDATE SET until = excluded.until').run(id, kind, until);
  }

  restriction(id: string, kind: 'ban' | 'mute'): number | null {
    const r = this.db.prepare('SELECT until FROM restrictions WHERE profile_id = ? AND kind = ?').get(id, kind) as { until: number } | undefined;
    return r ? Number(r.until) : null;
  }

  restrictions(kind: 'ban' | 'mute'): { id: string; name: string; until: number }[] {
    return (this.db.prepare('SELECT r.profile_id AS id, p.name AS name, r.until AS until FROM restrictions r JOIN profiles p ON p.id = r.profile_id WHERE r.kind = ?').all(kind) as { id: string; name: string; until: number }[])
      .map((r) => ({ id: r.id, name: r.name, until: Number(r.until) }));
  }

  deleteNoteAny(noteId: number): boolean {
    return Number(this.db.prepare('DELETE FROM notes WHERE id = ?').run(noteId).changes) > 0;
  }

  addKp(id: string, kp: number): void {
    this.db.prepare('UPDATE profiles SET kp = kp + ? WHERE id = ?').run(kp, id);
  }

  getKv(key: string): string | null {
    return (this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;
  }

  setKv(key: string, value: string): void {
    this.db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
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
