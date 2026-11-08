import {
  CHEER_FEED_COOLDOWN_MS, DOOR_PAD, FEED_ON_WELCOME, GRACE_MS, MAX_SPEED, PLAYER_RADIUS, RAIN_MS, SEAT_RADIUS,
} from '../../shared/constants';
import { clampToBounds, dist, inBox, pointInPolygon } from '../../shared/geometry';
import type { ClientMsg, ErrorCode, ServerMsg } from '../../shared/protocol';
import { SCENES, START_SCENE, START_SPAWN } from '../../shared/scenes';
import type { SceneDef, Slot, Toy } from '../../shared/scenes/types';
import {
  BOAT_SPEED, boatPoseAt, slotWorld, spinAt, type BoatPose, type ToyAction, type ToyState,
} from '../../shared/toys';
import type { Anim, EmoteKind, FeedKind, Look, OnlineEntry, PlayerView, Session } from '../../shared/types';
import type { Profile } from './db';
import { Feed, feedText } from './feed';
import { elapsedMin, newSession, stepSession, validLengths } from './sessions';
import { COOLDOWN_MS, HANDLERS } from './toys';

/** What the World needs from a network connection. */
export interface Conn {
  send(msg: ServerMsg): void;
  close(code: ErrorCode): void;
}

interface Player {
  id: string;
  name: string;
  look: Look;
  scene: string;
  x: number;
  z: number;
  facing: number;
  anim: Anim;
  slotId: string | null;
  session: Session | null;
  rainUntil: number;
  conn: Conn | null;
  disconnectedAt: number | null;
  lastMoveAt: number;
  lastCheerFeedAt: number;
  /** `toyId|action` -> last accepted use, for cooldowns. */
  lastUse: Map<string, number>;
}

const EMOJI: Record<EmoteKind, string> = { wave: '👋', clap: '👏', flex: '💪', coffee: '☕' };

export class World {
  private players = new Map<string, Player>();
  private slots = new Map<string, string>(); // slotId -> playerId
  private feed = new Feed();
  private toyStates = new Map<string, ToyState>(); // toyId -> state (toy ids are unique across scenes)
  private toySceneOf = new Map<string, string>(); // toyId -> scene id

  constructor(
    private now: () => number = Date.now,
    private rand: () => number = Math.random,
    private scenes: Record<string, SceneDef> = SCENES,
  ) {
    for (const def of Object.values(scenes)) for (const toy of def.toys) this.toySceneOf.set(toy.id, def.id);
  }

  private scene(id: string): SceneDef {
    return this.scenes[id];
  }

  view(id: string): PlayerView | undefined {
    const p = this.players.get(id);
    return p && this.toView(p);
  }

  join(profile: Profile, conn: Conn, newToken?: string): void {
    const existing = this.players.get(profile.id);
    if (existing) {
      const old = existing.conn;
      existing.conn = conn;
      existing.disconnectedAt = null;
      existing.name = profile.name;
      existing.look = profile.look;
      if (old) old.close('connected_elsewhere');
      this.sendWelcome(existing, newToken);
      this.toScene(existing.scene, { t: 'playerUpdated', player: this.toView(existing) }, existing.id);
      return;
    }
    const spawn = this.scene(START_SCENE).spawns.find((s) => s.id === START_SPAWN)!;
    const p: Player = {
      id: profile.id, name: profile.name, look: profile.look, scene: START_SCENE,
      x: spawn.x, z: spawn.z, facing: spawn.facing, anim: 'idle',
      slotId: null, session: null, rainUntil: 0,
      conn, disconnectedAt: null, lastMoveAt: this.now(), lastCheerFeedAt: 0, lastUse: new Map(),
    };
    this.players.set(p.id, p);
    this.sendWelcome(p, newToken);
    this.toScene(p.scene, { t: 'playerJoined', player: this.toView(p) }, p.id);
    this.pushFeed('arrive', feedText.arrive(p.name));
    this.broadcastOnline();
  }

  /** Only the player's current connection counts; a replaced socket closing is ignored. */
  disconnect(id: string, conn: Conn): void {
    const p = this.players.get(id);
    if (!p || p.conn !== conn) return;
    p.conn = null;
    p.disconnectedAt = this.now();
    this.toScene(p.scene, { t: 'playerUpdated', player: this.toView(p) }, p.id);
  }

  handle(id: string, msg: ClientMsg): void {
    const p = this.players.get(id);
    if (!p || !p.conn) return;
    switch (msg.t) {
      case 'move': return this.move(p, msg.x, msg.z, msg.facing, msg.anim);
      case 'enterScene': return this.enterScene(p, msg.doorId);
      case 'sit': return this.sit(p, msg.slotId);
      case 'stand': return this.stand(p);
      case 'startSession': return this.startSession(p, msg.focusMin, msg.breakMin);
      case 'cancelSession': return this.cancelSession(p);
      case 'emote': return this.emote(p, msg.kind, msg.targetId);
      case 'use': return this.use(p, msg.toyId, msg.action, msg.arg);
      case 'updateLook':
        p.look = msg.look;
        return this.updated(p);
      case 'hello':
        return;
    }
  }

  /** Call about once a second: advances timers and expires disconnected players. */
  tick(): void {
    const t = this.now();
    for (const p of [...this.players.values()]) {
      if (p.session) {
        const { session, event } = stepSession(p.session, t);
        p.session = session;
        if (event === 'focusDone') this.pushFeed('finish', feedText.finish(p.name, session!.focusMin));
        if (event) this.updated(p);
      }
      if (!p.conn && p.disconnectedAt !== null && t - p.disconnectedAt >= GRACE_MS) this.remove(p);
    }
  }

  // ---------- rules ----------

  private move(p: Player, x: number, z: number, facing: number, anim: Anim): void {
    if (p.slotId) {
      const slot = this.findSlot(p.scene, p.slotId);
      if (slot?.pose === 'row' && slot.toyId) this.rowBoat(p, slot.toyId, x, z, facing);
      return;
    }
    const t = this.now();
    const c = clampToBounds(x, z, PLAYER_RADIUS, this.scene(p.scene).size);
    const allowed = (MAX_SPEED * Math.max(t - p.lastMoveAt, 50)) / 1000 + 0.5;
    if (dist(p.x, p.z, c.x, c.z) > allowed) return;
    p.x = c.x;
    p.z = c.z;
    p.facing = facing;
    p.anim = anim === 'sit' ? 'idle' : anim;
    p.lastMoveAt = t;
    this.toScene(p.scene, { t: 'playerMoved', id: p.id, x: p.x, z: p.z, facing, anim: p.anim }, p.id);
  }

  private enterScene(p: Player, doorId: string): void {
    const door = this.scene(p.scene).doors.find((d) => d.id === doorId);
    if (!door || p.slotId || !inBox(door.box, p.x, p.z, DOOR_PAD)) {
      return this.error(p, 'bad_door', 'You are not at that door.');
    }
    const target = this.scene(door.toScene);
    const spawn = target.spawns.find((s) => s.id === door.toSpawn)!;
    this.toScene(p.scene, { t: 'playerLeft', id: p.id }, p.id);
    p.scene = target.id;
    p.x = spawn.x;
    p.z = spawn.z;
    p.facing = spawn.facing;
    p.anim = 'idle';
    p.lastMoveAt = this.now();
    p.conn!.send({ t: 'sceneSnapshot', scene: target.id, you: this.toView(p), players: this.scenePlayers(target.id, p.id), toys: this.sceneToys(target.id) });
    this.toScene(target.id, { t: 'playerJoined', player: this.toView(p) }, p.id);
    this.broadcastOnline();
  }

  private sit(p: Player, slotId: string): void {
    if (p.slotId) return;
    const slot = this.findSlot(p.scene, slotId);
    const t = this.now();
    const pos = slot && this.slotPos(slot, t);
    if (!slot || !pos || dist(p.x, p.z, pos.x, pos.z) > SEAT_RADIUS + 0.3) {
      return this.error(p, 'bad_slot', 'Get a little closer to that seat.');
    }
    if (this.slots.has(slotId)) return this.error(p, 'slot_taken', 'That seat is taken!');
    this.slots.set(slotId, p.id);
    p.slotId = slotId;
    p.x = pos.x;
    p.z = pos.z;
    p.facing = pos.facing;
    p.anim = 'sit';
    p.lastMoveAt = t;
    if (slot.pose === 'row' && slot.toyId) this.freezeBoat(slot.toyId, t);
    this.updated(p);
  }

  private stand(p: Player): void {
    if (!p.slotId) return;
    if (p.session?.phase === 'focus') this.earlyQuit(p);
    const slot = this.findSlot(p.scene, p.slotId);
    const off = slot && this.leavePos(slot);
    this.freeSlot(p);
    if (off) {
      p.x = off.x;
      p.z = off.z;
    }
    p.anim = 'idle';
    p.lastMoveAt = this.now();
    this.updated(p);
  }

  /** Frees the player's slot; an abandoned rowing seat sends its boat home. */
  private freeSlot(p: Player): void {
    if (!p.slotId) return;
    const slot = this.findSlot(p.scene, p.slotId);
    this.slots.delete(p.slotId);
    p.slotId = null;
    if (slot?.pose === 'row' && slot.toyId) this.sendBoatHome(slot.toyId);
  }

  private startSession(p: Player, focusMin: number, breakMin: number): void {
    const slot = p.slotId ? this.findSlot(p.scene, p.slotId) : undefined;
    if (!slot?.deskId) return this.error(p, 'not_seated', 'Sit at a desk first.');
    if (!validLengths(focusMin, breakMin) || p.session?.phase === 'focus') {
      return this.error(p, 'bad_session', 'Focus 1–120 min, break 1–30 min.');
    }
    p.session = newSession(focusMin, breakMin, this.now());
    this.pushFeed('start', feedText.start(p.name, focusMin, this.scene(p.scene).where));
    this.updated(p);
  }

  private cancelSession(p: Player): void {
    if (!p.session) return;
    if (p.session.phase === 'focus') this.earlyQuit(p);
    else p.session = null;
    this.updated(p);
  }

  private earlyQuit(p: Player): void {
    const s = p.session!;
    const t = this.now();
    this.pushFeed('quit', feedText.quit(p.name, elapsedMin(s, t), s.focusMin));
    p.session = null;
    p.rainUntil = t + RAIN_MS;
  }

  private emote(p: Player, kind: EmoteKind, targetId?: string): void {
    const target = targetId ? this.players.get(targetId) : undefined;
    if (targetId && (!target || target.scene !== p.scene)) return;
    this.toScene(p.scene, { t: 'emote', fromId: p.id, kind, ...(targetId ? { targetId } : {}) });
    const t = this.now();
    if (target && kind !== 'wave' && t - p.lastCheerFeedAt >= CHEER_FEED_COOLDOWN_MS) {
      p.lastCheerFeedAt = t;
      this.pushFeed('cheer', feedText.cheer(p.name, target.name, EMOJI[kind]));
    }
  }

  private remove(p: Player): void {
    if (p.session?.phase === 'focus') {
      this.pushFeed('quit', feedText.quitDisconnect(p.name, elapsedMin(p.session, this.now()), p.session.focusMin));
    } else {
      this.pushFeed('leave', feedText.leave(p.name));
    }
    this.freeSlot(p);
    this.players.delete(p.id);
    this.toScene(p.scene, { t: 'playerLeft', id: p.id });
    this.broadcastOnline();
  }

  // ---------- toys ----------

  private use(p: Player, toyId: string, action: ToyAction, arg?: number): void {
    const def = this.scene(p.scene);
    const toy = def.toys.find((x) => x.id === toyId);
    const handler = toy && HANDLERS[toy.kind];
    if (!toy || !handler || !handler.actions.includes(action)) return this.error(p, 'bad_toy', "That isn't here.");
    if (action === 'note') {
      if (!p.slotId || !toy.slotIds?.includes(p.slotId)) return this.error(p, 'not_seated', 'Sit at the piano first.');
      if (arg === undefined) return;
    } else if (p.slotId || dist(p.x, p.z, toy.x, toy.z) > toy.radius + 0.3) {
      return this.error(p, 'bad_toy', 'Get a little closer.');
    }
    const t = this.now();
    const key = `${toyId}|${action}`;
    const last = p.lastUse.get(key);
    if (last !== undefined && t - last < COOLDOWN_MS[action]) return;
    p.lastUse.set(key, t);
    const r = handler.apply(this.stateOf(toy), action, arg, t, this.rand);
    if (r.state) this.setToyState(toy.id, r.state);
    this.toScene(p.scene, { t: 'toyEvent', toyId, by: p.id, action, ...(r.arg !== undefined ? { arg: r.arg } : {}), at: t });
  }

  private findSlot(sceneId: string, slotId: string): Slot | undefined {
    return this.scene(sceneId).slots.find((s) => s.id === slotId);
  }

  private findToy(toyId: string): Toy | undefined {
    const sceneId = this.toySceneOf.get(toyId);
    return sceneId ? this.scene(sceneId).toys.find((x) => x.id === toyId) : undefined;
  }

  /** Current state of a stateful toy, created on first use. */
  private stateOf(toy: Toy): ToyState | undefined {
    let s = this.toyStates.get(toy.id);
    const init = HANDLERS[toy.kind].init;
    if (!s && init) {
      s = init(toy, this.now());
      this.toyStates.set(toy.id, s);
    }
    return s;
  }

  private setToyState(toyId: string, state: ToyState, exceptId?: string): void {
    this.toyStates.set(toyId, state);
    const sceneId = this.toySceneOf.get(toyId);
    if (sceneId) this.toScene(sceneId, { t: 'toyState', toyId, state }, exceptId);
  }

  private sceneToys(sceneId: string): Record<string, ToyState> {
    const out: Record<string, ToyState> = {};
    for (const toy of this.scene(sceneId).toys) {
      const s = this.stateOf(toy);
      if (s) out[toy.id] = s;
    }
    return out;
  }

  private mooring(toy: Toy): BoatPose {
    return { x: toy.x, z: toy.z, heading: toy.rot ?? 0 };
  }

  /** Where a toy is right now (boats drift home, the merry-go-round turns). */
  private toyPose(toy: Toy, t: number): BoatPose {
    const s = this.stateOf(toy);
    if (s?.kind === 'rowboat') return boatPoseAt(s, this.mooring(toy), t);
    if (s?.kind === 'merryGoRound') return { x: toy.x, z: toy.z, heading: (toy.rot ?? 0) + spinAt(s, t).angle };
    return this.mooring(toy);
  }

  private slotPos(slot: Slot, t: number): { x: number; z: number; facing: number } {
    const toy = slot.toyId ? this.findToy(slot.toyId) : undefined;
    return toy ? slotWorld(slot, toy, this.toyPose(toy, t)) : { x: slot.x, z: slot.z, facing: slot.facing };
  }

  /** Where you end up when you get up: boats drop you at the nearest landing, the merry-go-round flings you clear. */
  private leavePos(slot: Slot): { x: number; z: number } {
    const t = this.now();
    const pos = this.slotPos(slot, t);
    const toy = slot.toyId ? this.findToy(slot.toyId) : undefined;
    if (toy?.kind === 'rowboat') {
      const landings = this.scene(this.toySceneOf.get(toy.id)!).water?.landings ?? [];
      let best = pos as { x: number; z: number };
      let bestD = Infinity;
      for (const l of landings) {
        const d = dist(l.x, l.z, pos.x, pos.z);
        if (d < bestD) [best, bestD] = [l, d];
      }
      return { x: best.x, z: best.z };
    }
    if (toy?.kind === 'merryGoRound') {
      const a = Math.atan2(pos.x - toy.x, pos.z - toy.z);
      return { x: toy.x + Math.sin(a) * 2.2, z: toy.z + Math.cos(a) * 2.2 };
    }
    return pos;
  }

  private boatState(toyId: string): { toy: Toy; s: Extract<ToyState, { kind: 'rowboat' }> } | null {
    const toy = this.findToy(toyId);
    const s = toy && this.stateOf(toy);
    return toy && s?.kind === 'rowboat' ? { toy, s } : null;
  }

  private freezeBoat(toyId: string, t: number): void {
    const b = this.boatState(toyId);
    if (!b || !b.s.returnFrom) return;
    const pose = boatPoseAt(b.s, this.mooring(b.toy), t);
    this.setToyState(toyId, { kind: 'rowboat', ...pose, returnFrom: null });
  }

  private sendBoatHome(toyId: string): void {
    const b = this.boatState(toyId);
    if (!b) return;
    const pose = boatPoseAt(b.s, this.mooring(b.toy), this.now());
    this.setToyState(toyId, { kind: 'rowboat', ...pose, returnFrom: { ...pose, at: this.now() } });
  }

  private onWater(sceneId: string, x: number, z: number): boolean {
    const outline = this.scene(sceneId).water?.outline;
    if (!outline) return false;
    const r = 0.7;
    return [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => pointInPolygon(outline, x + dx, z + dz));
  }

  private rowBoat(p: Player, toyId: string, x: number, z: number, heading: number): void {
    const b = this.boatState(toyId);
    if (!b) return;
    const t = this.now();
    const allowed = (BOAT_SPEED * Math.max(t - p.lastMoveAt, 50)) / 1000 + 0.5;
    if (dist(b.s.x, b.s.z, x, z) > allowed || !this.onWater(p.scene, x, z)) {
      p.conn?.send({ t: 'toyState', toyId, state: b.s });
      return;
    }
    p.lastMoveAt = t;
    p.x = x;
    p.z = z;
    this.setToyState(toyId, { kind: 'rowboat', x, z, heading, returnFrom: null }, p.id);
  }

  // ---------- messaging ----------

  private sendWelcome(p: Player, token?: string): void {
    p.conn!.send({
      t: 'welcome',
      you: this.toView(p),
      ...(token ? { token } : {}),
      serverTime: this.now(),
      players: this.scenePlayers(p.scene, p.id),
      online: this.online(),
      feed: this.feed.recent(FEED_ON_WELCOME),
      toys: this.sceneToys(p.scene),
    });
  }

  private updated(p: Player): void {
    this.toScene(p.scene, { t: 'playerUpdated', player: this.toView(p) });
  }

  private error(p: Player, code: ErrorCode, message: string): void {
    p.conn?.send({ t: 'error', code, message });
  }

  private pushFeed(kind: FeedKind, text: string): void {
    const event = this.feed.push(kind, text, this.now());
    this.toAll({ t: 'feed', event });
  }

  private scenePlayers(scene: string, exceptId: string): PlayerView[] {
    return [...this.players.values()].filter((q) => q.scene === scene && q.id !== exceptId).map((q) => this.toView(q));
  }

  private online(): OnlineEntry[] {
    return [...this.players.values()].map((q) => ({ id: q.id, name: q.name, scene: q.scene }));
  }

  private broadcastOnline(): void {
    this.toAll({ t: 'online', list: this.online() });
  }

  private toScene(scene: string, msg: ServerMsg, exceptId?: string): void {
    for (const q of this.players.values()) if (q.scene === scene && q.id !== exceptId) q.conn?.send(msg);
  }

  private toAll(msg: ServerMsg): void {
    for (const q of this.players.values()) q.conn?.send(msg);
  }

  private toView(p: Player): PlayerView {
    return {
      id: p.id, name: p.name, look: p.look, scene: p.scene,
      x: p.x, z: p.z, facing: p.facing, anim: p.anim,
      slotId: p.slotId, session: p.session, connected: p.conn !== null, rainUntil: p.rainUntil,
    };
  }
}
