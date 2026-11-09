import {
  CHEER_FEED_COOLDOWN_MS, DOOR_PAD, FEED_ON_WELCOME, GRACE_MS, MAX_SPEED, NOTE_COOLDOWN_MS, NOTE_MAX, NOTES_PER_AUTHOR,
  NOTES_SHOWN, PLAYER_RADIUS, RAIN_MS, SEAT_RADIUS, BREW_COOLDOWN_MS, CUP_SIPS, GIFT_RANGE, GIFT_TTL_MS, SELF_PARK_MS,
  ACT_GAP_MS, CHAT_BURST, CHAT_DM_HISTORY, CHAT_GAP_MS, CHAT_KEEP, CHAT_WINDOW_MS, REACT_GAP_MS,
  MEDITATE_COMPANION_MAX, MEDITATE_EVERY_MS, MEDITATE_KP, MEDITATE_MS, STAGE_TEXT_GAP_MS, STAGE_TEXT_TTL_MS,
} from '../../shared/constants';
import { clampToBounds, dist, inBox, pointInPolygon } from '../../shared/geometry';
import type { ClientMsg, ErrorCode, IceServer, ServerMsg } from '../../shared/protocol';
import { SCENES, START_SCENE, START_SPAWN } from '../../shared/scenes';
import type { SceneDef, Slot, Toy } from '../../shared/scenes/types';
import {
  boatPoseAt, SEATED_ACTIONS, slotWorld, spinAt, type BoatPose, type ToyAction, type ToyState,
  type Tilt,
} from '../../shared/toys';
import { CONTROLLER_POSES, VEHICLES, vehicleOk } from '../../shared/vehicles';
import type { Act, Anim, ChatMsg, Drink, EmoteKind, FeedKind, Look, OnlineEntry, PetView, PlayerView, Session, Wallet } from '../../shared/types';
import { isFree, itemById, SLOTS } from '../../shared/wardrobe';
import { petPrice } from '../../shared/pets/kinds';
import type { PetKind } from '../../shared/types';
import { ProfileStore, type Profile, type Store } from './db';
import { awardFor, dayOf } from './rewards';
import { Feed, feedText } from './feed';
import { elapsedMin, newSession, stepSession, validLengths } from './sessions';
import { COOLDOWN_MS, HANDLERS } from './toys';
import { freeBay, inBay } from '../../shared/parking';

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
  wallet: Wallet & { lastDay: string | null };
  dnd: boolean;
  voice: boolean;
  holding: { item: Drink; stars: number; sips: number } | null;
  pet: PetView | null;
  lastNoteAt: number;
  lastBrewAt: number;
  /** Recent chat send times, for the rate limit. */
  chatTimes: number[];
  lastReactAt: number;
  lastActAt: number;
  lastPetAt: number;
  /** When they sat on a meditation cushion (null when not on one, or once this breather is done). */
  meditateFrom: number | null;
  lastStageTextAt: number;
}

/** World state that survives restarts, saved in the store's kv table under the toy kind. */
const SAVED_KINDS = ['cairn', 'stageScreen'] as const;

const EMOJI: Record<EmoteKind, string> = { wave: '👋', clap: '👏', flex: '💪', coffee: '☕' };

export class World {
  private players = new Map<string, Player>();
  private slots = new Map<string, string>(); // slotId -> playerId
  private feed = new Feed();
  private toyStates = new Map<string, ToyState>(); // toyId -> state (toy ids are unique across scenes)
  private offers = new Map<string, { fromId: string; at: number }>(); // target playerId -> pending coffee offer
  private lastDrivenAt = new Map<string, number>(); // truck toyId -> when someone last drove it (absent = never)
  private toySceneOf = new Map<string, string>(); // toyId -> scene id
  private meditatedAt = new Map<string, number>(); // profile id -> last breather award (survives reconnects)
  /** STUN/TURN servers handed to clients for voice chat. */
  ice: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  constructor(
    private now: () => number = Date.now,
    private rand: () => number = Math.random,
    private scenes: Record<string, SceneDef> = SCENES,
    private store: Store = new ProfileStore(':memory:'),
  ) {
    for (const def of Object.values(scenes)) for (const toy of def.toys) this.toySceneOf.set(toy.id, def.id);
    for (const def of Object.values(scenes)) {
      for (const toy of def.toys) {
        if (!(SAVED_KINDS as readonly string[]).includes(toy.kind)) continue;
        const saved = this.store.getKv(toy.id);
        if (!saved) continue;
        try {
          const s = JSON.parse(saved) as ToyState;
          if (s.kind === toy.kind) this.toyStates.set(toy.id, s);
        } catch { /* a damaged row just starts fresh */ }
      }
    }
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
      existing.wallet = this.store.wallet(profile.id);
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
      wallet: this.store.wallet(profile.id),
      dnd: false, voice: false, holding: null, pet: null, lastNoteAt: 0, lastBrewAt: 0, lastPetAt: 0,
      chatTimes: [], lastReactAt: 0, lastActAt: 0, meditateFrom: null, lastStageTextAt: 0,
    };
    this.players.set(p.id, p);
    this.spawnPet(p);
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
      case 'move': return this.move(p, msg.x, msg.z, msg.facing, msg.anim, msg.tilt);
      case 'enterScene': return this.enterScene(p, msg.doorId);
      case 'sit': return this.sit(p, msg.slotId);
      case 'stand': return this.stand(p);
      case 'startSession': return this.startSession(p, msg.focusMin, msg.breakMin);
      case 'cancelSession': return this.cancelSession(p);
      case 'emote': return this.emote(p, msg.kind, msg.targetId);
      case 'use': return this.use(p, msg.toyId, msg.action, msg.arg);
      case 'updateLook': return this.updateLook(p, msg.look);
      case 'buy': return this.buy(p, msg.itemId);
      case 'getNotes': return p.conn!.send({ t: 'notes', list: this.store.notes(NOTES_SHOWN) });
      case 'postNote': return this.postNote(p, msg.text);
      case 'deleteNote': return this.deleteNote(p, msg.id);
      case 'brew': return this.brew(p, msg.drink, msg.stars);
      case 'sip': return this.sip(p);
      case 'chat': return this.chat(p, msg.text, msg.to);
      case 'react': return this.react(p, msg.id, msg.emoji);
      case 'act': return this.act(p, msg.kind);
      case 'stageText': return this.stageText(p, msg.text);
      case 'offerCoffee': return this.offerCoffee(p, msg.to);
      case 'answerCoffee': return this.answerCoffee(p, msg.fromId, msg.accept);
      case 'setVoice': {
        const on = msg.on && !p.dnd;
        if (p.voice === on) return;
        p.voice = on;
        return this.updated(p);
      }
      case 'rtc': {
        const q = this.players.get(msg.to);
        if (!q || q.scene !== p.scene || !p.voice || !q.voice) return;
        q.conn?.send({ t: 'rtc', from: p.id, data: msg.data });
        return;
      }
      case 'adoptPet': return this.adoptPet(p, msg.kind, msg.name);
      case 'setPetOut':
        if (msg.on) this.spawnPet(p);
        else p.pet = null;
        return this.updated(p);
      case 'pet': return this.movePet(p, msg.x, msg.z, msg.facing, msg.anim);
      case 'setDnd':
        if (p.dnd === msg.on) return;
        p.dnd = msg.on;
        if (p.dnd) p.voice = false;
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
        if (event === 'focusDone') this.finishFocus(p, session!.focusMin);
        if (event) this.updated(p);
      }
      if (!p.conn && p.disconnectedAt !== null && t - p.disconnectedAt >= GRACE_MS) this.remove(p);
    }
    for (const [toId, o] of this.offers) {
      if (t - o.at < GIFT_TTL_MS) continue;
      this.offers.delete(toId);
      const to = this.players.get(toId);
      this.players.get(o.fromId)?.conn?.send({ t: 'coffeeAnswer', name: to?.name ?? 'They', accepted: false });
    }
    this.selfPark(t);
    const done = [...this.players.values()].filter((p) => p.meditateFrom !== null && t - p.meditateFrom >= MEDITATE_MS);
    const companions = done.map((p) => this.companionsOf(p)); // before anyone's breather is marked done
    done.forEach((p, i) => this.finishBreather(p, t, companions[i]));
    for (const [toyId, s] of this.toyStates) {
      if (s.kind === 'stageScreen' && s.text !== null && t >= s.until) this.saveToyState(toyId, { kind: 'stageScreen', text: null, by: null, until: 0 });
    }
  }

  /** Trucks left out of a bay with nobody aboard for SELF_PARK_MS pop back to the nearest free bay. */
  private selfPark(t: number): void {
    for (const def of Object.values(this.scenes)) {
      const bays = def.parking;
      if (!bays?.length) continue;
      const trucks = def.toys.filter((toy) => toy.kind === 'truck');
      for (const toy of trucks) {
        const since = this.lastDrivenAt.get(toy.id);
        if (since === undefined || t - since < SELF_PARK_MS) continue;
        if ((toy.slotIds ?? []).some((id) => this.slots.has(id))) continue;
        const s = this.toyStates.get(toy.id);
        if (s?.kind !== 'truck') continue;
        this.lastDrivenAt.delete(toy.id);
        if (bays.some((b) => inBay(b, s.x, s.z, s.heading))) continue;
        const others = trucks.filter((o) => o.id !== toy.id).map((o) => this.toyStates.get(o.id)).filter((o) => o?.kind === 'truck') as { x: number; z: number }[];
        const bay = freeBay(bays, others, s.x, s.z);
        if (bay) this.setToyState(toy.id, { kind: 'truck', x: bay.x, z: bay.z, heading: bay.rot, returnFrom: null });
      }
    }
  }

  // ---------- rules ----------

  private move(p: Player, x: number, z: number, facing: number, anim: Anim, tilt?: Tilt): void {
    if (p.slotId) {
      const slot = this.findSlot(p.scene, p.slotId);
      if (slot && isController(slot.pose) && slot.toyId) this.driveVehicle(p, slot.toyId, x, z, facing, tilt);
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
    if (p.pet) this.spawnPet(p);
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
    if (isController(slot.pose) && slot.toyId) this.freezeVehicle(slot.toyId, t);
    const ring = slot.toyId ? this.findToy(slot.toyId) : undefined;
    if (ring?.kind === 'cushions') {
      p.meditateFrom = t;
      const s = this.stateOf(ring);
      if (s?.kind !== 'meditate' || s.startedAt === null) this.setToyState(ring.id, { kind: 'meditate', startedAt: t });
    }
    this.updated(p);
  }

  private stand(p: Player): void {
    if (!p.slotId) return;
    if (p.session?.phase === 'focus') this.earlyQuit(p);
    const slot = this.findSlot(p.scene, p.slotId);
    const off = slot && this.leavePos(slot);
    this.freeSlot(p);
    if (slot && isController(slot.pose) && slot.toyId) {
      const s = this.toyStates.get(slot.toyId);
      if (s) p.conn?.send({ t: 'toyState', toyId: slot.toyId, state: s }); // the driver was never echoed its own pose
    }
    // Anyone hopping out of a truck restarts its self-park clock, so it never vanishes from under their nose.
    if (slot?.toyId && this.lastDrivenAt.has(slot.toyId)) this.lastDrivenAt.set(slot.toyId, this.now());
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
    p.meditateFrom = null;
    if (slot && isController(slot.pose) && slot.toyId) this.sendVehicleHome(slot.toyId);
    const ring = slot?.toyId ? this.findToy(slot.toyId) : undefined;
    if (ring?.kind === 'cushions' && !(ring.slotIds ?? []).some((id) => this.slots.has(id))) {
      this.setToyState(ring.id, { kind: 'meditate', startedAt: null });
    }
  }

  /**
   * Five minutes on the cushions: KP (once an hour), plus one per companion who sat down no later
   * than you and is still there. You stay seated, but the next breather needs a fresh sit.
   */
  private finishBreather(p: Player, t: number, companions: number): void {
    p.meditateFrom = null;
    const last = this.meditatedAt.get(p.id);
    const kp = last !== undefined && t - last < MEDITATE_EVERY_MS ? 0 : MEDITATE_KP + Math.min(MEDITATE_COMPANION_MAX, companions);
    if (kp > 0) {
      this.meditatedAt.set(p.id, t);
      this.store.addKp(p.id, kp);
      p.wallet = this.store.wallet(p.id);
      p.conn?.send({ t: 'wallet', wallet: this.publicWallet(p) });
      this.pushFeed('meditate', feedText.meditate(p.name, companions));
    }
    p.conn?.send({ t: 'meditated', kp, companions });
  }

  /** Others on the same ring who sat down no later than p and are still mid-breather. */
  private companionsOf(p: Player): number {
    const ringId = p.slotId ? this.findSlot(p.scene, p.slotId)?.toyId : undefined;
    const ring = ringId ? this.findToy(ringId) : undefined;
    let n = 0;
    for (const id of ring?.slotIds ?? []) {
      const other = this.players.get(this.slots.get(id) ?? '');
      if (other && other.id !== p.id && other.meditateFrom !== null && other.meditateFrom <= p.meditateFrom!) n++;
    }
    return n;
  }

  /** Anyone on the stage can put up to a line on the stage screen; it clears itself after two hours. */
  private stageText(p: Player, text: string): void {
    const def = this.scene(p.scene);
    const screen = def.toys.find((toy) => toy.kind === 'stageScreen');
    if (!def.stage || !screen || !inBox(def.stage.stage, p.x, p.z, 0.3)) return this.error(p, 'bad_stage', 'Hop up on the stage to change the screen.');
    const t = this.now();
    if (t - p.lastStageTextAt < STAGE_TEXT_GAP_MS) return this.error(p, 'bad_stage', 'Give the screen a moment before changing it again.');
    p.lastStageTextAt = t;
    this.saveToyState(screen.id, text ? { kind: 'stageScreen', text, by: p.name, until: t + STAGE_TEXT_TTL_MS } : { kind: 'stageScreen', text: null, by: null, until: 0 });
  }

  /** setToyState for the toys whose state is kept across restarts. */
  private saveToyState(toyId: string, state: ToyState): void {
    this.setToyState(toyId, state);
    this.store.setKv(toyId, JSON.stringify(state));
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
    if (targetId && (!target || target.scene !== p.scene || target.dnd)) return;
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
    this.offers.delete(p.id);
    for (const [toId, o] of this.offers) if (o.fromId === p.id) this.offers.delete(toId);
    this.players.delete(p.id);
    this.toScene(p.scene, { t: 'playerLeft', id: p.id });
    this.broadcastOnline();
  }

  // ---------- knowledge points & wardrobe ----------

  private finishFocus(p: Player, focusMin: number): void {
    const today = dayOf(this.now());
    const a = awardFor(p.wallet, today, focusMin);
    this.store.award(p.id, a.kp, a.streak, today);
    p.wallet = this.store.wallet(p.id);
    p.conn?.send({ t: 'wallet', wallet: this.publicWallet(p) });
    this.pushFeed('finish', feedText.finish(p.name, focusMin, a.kp, a.streak));
    this.toAll({ t: 'tree', minutes: this.store.addDailyMinutes(today, focusMin) });
  }

  private publicWallet(p: Player): Wallet {
    const { kp, streak, owned, pets, pet } = p.wallet;
    return { kp, streak, owned, pets, pet };
  }

  private buy(p: Player, itemId: string): void {
    const item = itemById(itemId);
    if (!item || isFree(itemId)) return this.error(p, 'bad_item', "That isn't for sale.");
    if (p.wallet.owned.includes(itemId)) return;
    if (p.wallet.kp < item.price || !this.store.buy(p.id, itemId, item.price)) {
      return this.error(p, 'no_kp', `You need ${item.price} ✨ KP for that. Study a little more!`);
    }
    p.wallet = this.store.wallet(p.id);
    p.conn?.send({ t: 'wallet', wallet: this.publicWallet(p) });
  }

  /** Wear only what you own (or got for free, or already had on). */
  private updateLook(p: Player, look: Look): void {
    for (const slot of SLOTS) {
      const id = look[slot];
      if (!isFree(id) && !p.wallet.owned.includes(id) && p.look[slot] !== id) {
        return this.error(p, 'bad_look', `You don't own the ${itemById(id)?.name ?? id} yet.`);
      }
    }
    p.look = look;
    this.store.updateLook(p.id, look);
    this.updated(p);
  }

  // ---------- pets ----------

  /** Puts the player's active pet (if any) next to them. */
  private spawnPet(p: Player): void {
    const info = p.wallet.pet;
    p.pet = info ? { kind: info.kind, name: info.name, x: p.x + 1, z: p.z + 0.5, facing: 0, anim: 'idle' } : null;
    p.lastPetAt = this.now();
  }

  private adoptPet(p: Player, kind: PetKind, name: string): void {
    const owned = p.wallet.pets.includes(kind);
    const price = owned ? 0 : petPrice(kind);
    if (p.wallet.kp < price || !this.store.adoptPet(p.id, { kind, name }, price)) {
      return this.error(p, 'no_kp', `A ${kind} needs ${price} ✨ KP. Keep studying!`);
    }
    p.wallet = this.store.wallet(p.id);
    p.conn?.send({ t: 'wallet', wallet: this.publicWallet(p) });
    this.spawnPet(p);
    this.updated(p);
  }

  private movePet(p: Player, x: number, z: number, facing: number, anim: PetView['anim']): void {
    if (!p.pet) return;
    const t = this.now();
    const allowed = (8 * Math.max(t - p.lastPetAt, 50)) / 1000 + 0.5;
    if (dist(p.pet.x, p.pet.z, x, z) > allowed || dist(p.x, p.z, x, z) > 20) return;
    const c = clampToBounds(x, z, 0.25, this.scene(p.scene).size);
    Object.assign(p.pet, { x: c.x, z: c.z, facing, anim });
    p.lastPetAt = t;
    this.toScene(p.scene, { t: 'petMoved', id: p.id, x: c.x, z: c.z, facing, anim }, p.id);
  }

  // ---------- chat & emotes ----------

  private chat(p: Player, text: string, to?: string): void {
    const t = this.now();
    p.chatTimes = p.chatTimes.filter((at) => t - at < CHAT_WINDOW_MS);
    const last = p.chatTimes.at(-1);
    if ((last !== undefined && t - last < CHAT_GAP_MS) || p.chatTimes.length >= CHAT_BURST) {
      return this.error(p, 'chat_slow', 'Slow down a little 🐢');
    }
    if (to !== undefined && (to === p.id || this.store.profileName(to) === null)) {
      return this.error(p, 'bad_chat', "That message couldn't be delivered.");
    }
    p.chatTimes.push(t);
    const msg = this.store.addChat({ from: p.id, fromName: p.name, to: to ?? null, text, at: t }, CHAT_KEEP);
    this.toAudience(msg, { t: 'chat', msg });
  }

  /** Toggles p's reaction on a message they can see. */
  private react(p: Player, id: number, emoji: string): void {
    const t = this.now();
    if (t - p.lastReactAt < REACT_GAP_MS) return;
    const msg = this.store.chatById(id);
    if (!msg || (msg.to !== null && msg.to !== p.id && msg.from !== p.id)) return;
    p.lastReactAt = t;
    const who = msg.reactions[emoji] ?? [];
    const next = who.includes(p.id) ? who.filter((x) => x !== p.id) : [...who, p.id];
    const reactions = { ...msg.reactions, [emoji]: next };
    if (!next.length) delete reactions[emoji];
    this.store.setReactions(id, reactions);
    this.toAudience(msg, { t: 'chatReact', id, reactions });
  }

  /** Everyone messages go to everyone online; DMs to the pair. */
  private toAudience(msg: ChatMsg, out: ServerMsg): void {
    if (msg.to === null) return this.toAll(out);
    this.players.get(msg.from)?.conn?.send(out);
    if (msg.to !== msg.from) this.players.get(msg.to)?.conn?.send(out);
  }

  private act(p: Player, kind: Act): void {
    const t = this.now();
    if (t - p.lastActAt < ACT_GAP_MS) return;
    p.lastActAt = t;
    this.toScene(p.scene, { t: 'act', fromId: p.id, kind });
  }

  // ---------- coffee ----------

  /** A sip from your cup (the ☕ emote); the fourth one finishes it. */
  private sip(p: Player): void {
    if (!p.holding) return;
    p.holding = p.holding.sips > 1 ? { ...p.holding, sips: p.holding.sips - 1 } : null;
    this.toScene(p.scene, { t: 'emote', fromId: p.id, kind: 'coffee' });
    this.updated(p);
  }

  private offerCoffee(p: Player, toId: string): void {
    const to = this.players.get(toId);
    const why = !p.holding ? 'You have nothing to give.'
      : !to || to.id === p.id || to.scene !== p.scene || !to.conn ? 'There is nobody there.'
      : dist(p.x, p.z, to.x, to.z) > GIFT_RANGE ? `Get a little closer to ${to.name}.`
      : to.dnd ? `${to.name} is focusing (do not disturb).`
      : to.holding ? `${to.name} already has a drink.`
      : this.offers.has(to.id) ? `${to.name} is already deciding on a drink.`
      : null;
    if (why || !to || !p.holding) return this.error(p, 'bad_gift', why ?? 'There is nobody there.');
    this.offers.set(to.id, { fromId: p.id, at: this.now() });
    to.conn!.send({ t: 'coffeeOffer', fromId: p.id, name: p.name, drink: p.holding.item, stars: p.holding.stars });
  }

  private answerCoffee(p: Player, fromId: string, accept: boolean): void {
    const o = this.offers.get(p.id);
    if (!o || o.fromId !== fromId) return;
    this.offers.delete(p.id);
    const from = this.players.get(fromId);
    if (!from) return;
    const cup = from.holding;
    const ok = accept && cup && !p.holding && this.now() - o.at < GIFT_TTL_MS;
    if (!ok) {
      from.conn?.send({ t: 'coffeeAnswer', name: p.name, accepted: false });
      if (accept && !cup) this.error(p, 'bad_gift', `${from.name} doesn't have it any more.`);
      return;
    }
    p.holding = cup;
    from.holding = null;
    this.updated(p);
    this.updated(from);
    from.conn?.send({ t: 'coffeeAnswer', name: p.name, accepted: true });
    this.pushFeed('gift', feedText.gift(from.name, p.name, cup.stars, cup.item));
  }

  private brew(p: Player, drink: Drink, stars: number): void {
    const machine = this.scene(p.scene).toys.find((x) => x.kind === 'coffee');
    if (!machine || p.slotId || dist(p.x, p.z, machine.x, machine.z) > machine.radius + 0.5) {
      return this.error(p, 'bad_toy', 'Stand at the coffee machine to brew.');
    }
    const t = this.now();
    if (t - p.lastBrewAt < BREW_COOLDOWN_MS) return;
    p.lastBrewAt = t;
    p.holding = { item: drink, stars, sips: CUP_SIPS };
    this.updated(p);
    this.pushFeed('coffee', feedText.coffee(p.name, stars, drink));
  }

  // ---------- notice board ----------

  private postNote(p: Player, raw: string): void {
    const text = raw.replace(/\s+/g, ' ').trim();
    const t = this.now();
    if (!text || [...text].length > NOTE_MAX) return this.error(p, 'bad_note', `Notes are 1–${NOTE_MAX} characters.`);
    if (t - p.lastNoteAt < NOTE_COOLDOWN_MS) return this.error(p, 'bad_note', 'Give it a few seconds before posting again.');
    if (this.store.noteCount(p.id) >= NOTES_PER_AUTHOR) return this.error(p, 'bad_note', `You can have ${NOTES_PER_AUTHOR} notes up at once. Take one down first.`);
    p.lastNoteAt = t;
    this.store.addNote(p.id, p.name, text, t);
    this.toAll({ t: 'notes', list: this.store.notes(NOTES_SHOWN) });
  }

  private deleteNote(p: Player, id: number): void {
    if (this.store.deleteNote(id, p.id)) this.toAll({ t: 'notes', list: this.store.notes(NOTES_SHOWN) });
  }

  // ---------- toys ----------

  private use(p: Player, toyId: string, action: ToyAction, arg?: number): void {
    const def = this.scene(p.scene);
    const toy = def.toys.find((x) => x.id === toyId);
    const handler = toy && HANDLERS[toy.kind];
    if (!toy || !handler || !handler.actions.includes(action)) return this.error(p, 'bad_toy', "That isn't here.");
    if (SEATED_ACTIONS.includes(action)) {
      if (!p.slotId || !toy.slotIds?.includes(p.slotId)) return this.error(p, 'not_seated', 'Hop on first.');
      if (action === 'note' && arg === undefined) return;
    } else if (p.slotId || dist(p.x, p.z, toy.x, toy.z) > toy.radius + 0.3) {
      return this.error(p, 'bad_toy', 'Get a little closer.');
    }
    const t = this.now();
    const key = `${toyId}|${action}`;
    const last = p.lastUse.get(key);
    if (last !== undefined && t - last < COOLDOWN_MS[action]) return;
    p.lastUse.set(key, t);
    const r = handler.apply(this.stateOf(toy), action, arg, t, this.rand);
    if (r.state?.kind === 'cairn') {
      const s = r.state.height > r.state.record ? { ...r.state, record: r.state.height, recordBy: p.name } : r.state;
      this.saveToyState(toy.id, s);
    } else if (r.state) this.setToyState(toy.id, r.state);
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
    if (s?.kind === 'rowboat' || s?.kind === 'truck') return boatPoseAt(s, this.mooring(toy), t);
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
    if (toy?.kind === 'truck') {
      const def = this.scene(this.toySceneOf.get(toy.id)!);
      const pose = this.toyPose(toy, t);
      const right = { x: Math.cos(pose.heading), z: -Math.sin(pose.heading) };
      const back = { x: -Math.sin(pose.heading), z: -Math.cos(pose.heading) };
      const spots = [
        { x: pose.x - right.x * 1.7, z: pose.z - right.z * 1.7 },
        { x: pose.x + right.x * 1.7, z: pose.z + right.z * 1.7 },
        { x: pose.x + back.x * 2.6, z: pose.z + back.z * 2.6 },
      ];
      const clear = spots.find((q) => Math.abs(q.x) < def.size.w / 2 - 0.5 && Math.abs(q.z) < def.size.d / 2 - 0.5
        && !def.colliders.some((b) => inBox(b, q.x, q.z, PLAYER_RADIUS)) && !(def.water && pointInPolygon(def.water.outline, q.x, q.z)));
      return clear ?? pos;
    }
    if (toy?.kind === 'merryGoRound') {
      const a = Math.atan2(pos.x - toy.x, pos.z - toy.z);
      return { x: toy.x + Math.sin(a) * 2.2, z: toy.z + Math.cos(a) * 2.2 };
    }
    return pos;
  }

  private vehicleState(toyId: string): { toy: Toy; s: Extract<ToyState, { kind: 'rowboat' | 'truck' }> } | null {
    const toy = this.findToy(toyId);
    const s = toy && this.stateOf(toy);
    return toy && (s?.kind === 'rowboat' || s?.kind === 'truck') ? { toy, s } : null;
  }

  private freezeVehicle(toyId: string, t: number): void {
    const b = this.vehicleState(toyId);
    if (!b || b.s.kind !== 'rowboat' || !b.s.returnFrom) return;
    const pose = boatPoseAt(b.s, this.mooring(b.toy), t);
    this.setToyState(toyId, { kind: 'rowboat', ...pose, returnFrom: null });
  }

  private sendVehicleHome(toyId: string): void {
    const b = this.vehicleState(toyId);
    if (!b || b.s.kind !== 'rowboat' || !VEHICLES[b.toy.kind]?.home) return;
    const pose = boatPoseAt(b.s, this.mooring(b.toy), this.now());
    this.setToyState(toyId, { kind: 'rowboat', ...pose, returnFrom: { ...pose, at: this.now() } });
  }

  private driveVehicle(p: Player, toyId: string, x: number, z: number, heading: number, tilt?: Tilt): void {
    const b = this.vehicleState(toyId);
    const spec = b && VEHICLES[b.toy.kind];
    if (!b || !spec) return;
    const t = this.now();
    // Moves are sent every 100 ms but can arrive bunched up by network jitter, so never judge one
    // over less than 100 ms: a false "too fast" snaps the driver back and stops them dead.
    const allowed = (spec.speed * Math.max(t - p.lastMoveAt, 100)) / 1000 + 0.5;
    if (dist(b.s.x, b.s.z, x, z) > allowed || !vehicleOk(b.toy.kind, this.scene(p.scene), x, z)) {
      p.conn?.send({ t: 'toyState', toyId, state: b.s });
      return;
    }
    p.lastMoveAt = t;
    p.x = x;
    p.z = z;
    if (b.toy.kind === 'truck') this.lastDrivenAt.set(toyId, t);
    const state: ToyState = b.s.kind === 'rowboat'
      ? { kind: 'rowboat', x, z, heading, returnFrom: null }
      : { kind: 'truck', x, z, heading, returnFrom: null, ...(tilt ? { tilt } : {}) };
    this.setToyState(toyId, state, p.id);
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
      wallet: this.publicWallet(p),
      treeMinutes: this.store.dailyMinutes(dayOf(this.now())),
      ice: this.ice,
      chat: this.store.chatFor(p.id, CHAT_KEEP, CHAT_DM_HISTORY),
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
      dnd: p.dnd, voice: p.voice, holding: p.holding, pet: p.pet && { ...p.pet },
    };
  }
}

function isController(pose: string): boolean {
  return (CONTROLLER_POSES as readonly string[]).includes(pose);
}
