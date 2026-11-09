import * as THREE from 'three';
import { INTERACT_RADIUS, MOVE_SPEED, PLAYER_RADIUS } from '../../../shared/constants';
import { inBox, moveWithCollision } from '../../../shared/geometry';
import type { ClientMsg, ErrorCode, ServerMsg } from '../../../shared/protocol';
import { getScene } from '../../../shared/scenes';
import { SLIDE_RUN } from '../../../shared/scenes/kitToys';
import type { SceneDef, Slot, Toy } from '../../../shared/scenes/types';
import {
  angleDelta, BOAT_SPEED, boatOnWater, boatPoseAt, LOCAL_TOYS, slotWorld, type BoatPose, type ToyAction, type ToyState,
} from '../../../shared/toys';
import type { EmoteKind, PlayerView } from '../../../shared/types';
import type { SoundKind } from '../audio/kinds';
import { chime } from '../hud/chime';
import { statusText } from '../hud/format';
import { Minimap, type MapVehicle } from '../hud/minimap';
import type { Hud } from '../hud/hud';
import { Interp } from '../net/interp';
import { slidePath, SLIDE_MS } from '../toys/playground';
import { makeToyView, TOY_DEFAULT_ACTION, toyPrompt, type ToyCtx, type ToyFx, type ToyView } from '../toys/registry';
import type { RowboatView } from '../toys/water';
import { Character } from '../world/character';
import { buildScene, followSun, updateFades, type BuiltScene } from '../world/sceneBuilder';
import { CameraRig } from './cameraRig';
import { serverNow, syncClock } from './clock';
import { Input } from './input';
import { pickTarget, type PlacedSlot, type Target } from './interaction';
import { QUOTES } from './quotes';
import { Fade } from './transition';

interface Remote {
  view: PlayerView;
  char: Character;
  interp: Interp;
}

/** Everything built once per scene and kept while you visit others. */
interface SceneRuntime {
  built: BuiltScene;
  toys: Map<string, ToyView>;
}

/** Hooks later systems (audio, ambient life, sky) plug into. */
export interface GameHooks {
  sound(kind: SoundKind, x: number, z: number, arg?: number): void;
  feedDucks(x: number, z: number): void;
  /** Called every frame after the world is placed. */
  frame(info: FrameInfo): void;
  /** Called when the scene changes. */
  enterScene(def: SceneDef, built: BuiltScene): void;
}

export interface FrameInfo {
  def: SceneDef;
  built: BuiltScene;
  /** Server time, ms. */
  now: number;
  dt: number;
  me: { x: number; z: number };
  toyStates: Record<string, ToyState>;
}

const SEND_EVERY_MS = 80;
const ROW_SEND_MS = 100;
const ROW_TURN = 2.5; // rad/s

export class Game {
  hooks: GameHooks = { sound() {}, feedDucks() {}, frame() {}, enterScene() {} };
  /** E on a toy that opens something on this screen only (Boutique, notice board, coffee machine). */
  onLocalToy: (toy: Toy) => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private rig = new CameraRig();
  private input = new Input();
  private fade: Fade;
  private runtimes = new Map<string, SceneRuntime>();
  private rt: SceneRuntime | null = null;
  private fps: { el: HTMLElement; frames: number; since: number } | null = null;
  private def: SceneDef | null = null;
  private scene: THREE.Scene | null = null;
  private me: PlayerView | null = null;
  private myChar: Character | null = null;
  private remotes = new Map<string, Remote>();
  private toyStates: Record<string, ToyState> = {};
  private x = 0;
  private z = 0;
  private facing = 0;
  private moving = false;
  private lastSent = 0;
  private transitioning = false;
  private standPending = false;
  private waitForRelease = false;
  private target: Target | null = null;
  private last = performance.now();
  private rowing: { toyId: string; pose: BoatPose } | null = null;
  private sliding = new Map<string, { start: number; toy: Toy }>();
  private telescope = false;
  private ctxNow = 0;
  private ctxDt = 0;
  private occupied = new Set<string>();
  private minimap = new Minimap(document.body);

  constructor(canvas: HTMLCanvasElement, fadeEl: HTMLElement, private hud: Hud, private send: (m: ClientMsg) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.fade = new Fade(fadeEl);
    addEventListener('resize', () => this.resize());
    this.resize();
    this.input.on('e', () => this.interact());
    this.input.on(' ', () => this.openSessionPicker());
    this.input.on('m', () => {
      if (!this.hud.modalOpen()) this.minimap.toggle();
    });
    this.input.on('escape', () => {
      this.hud.closeModals();
      this.hud.closeCard();
      if (this.telescope) this.setTelescope(false);
    });
    for (let i = 1; i <= 8; i++) this.input.on(String(i), () => this.playNote(i - 1));
    if (new URLSearchParams(location.search).has('fps')) {
      const el = document.createElement('div');
      el.className = 'fps glass';
      document.body.append(el);
      this.fps = { el, frames: 0, since: performance.now() };
    }
    this.renderer.setAnimationLoop(() => this.frame());
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  myView(): PlayerView | null {
    return this.me;
  }

  onMessage(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome':
        syncClock(m.serverTime);
        this.toyStates = { ...m.toys };
        this.enter(m.you, m.players);
        this.hud.setOnline(m.online);
        this.hud.resetFeed(m.feed);
        if (this.transitioning) this.endTransition();
        break;
      case 'sceneSnapshot':
        this.toyStates = { ...m.toys };
        this.enter(m.you, m.players);
        this.endTransition();
        break;
      case 'playerJoined':
        this.addRemote(m.player);
        break;
      case 'playerLeft':
        this.removeRemote(m.id);
        break;
      case 'playerMoved': {
        const r = this.remotes.get(m.id);
        if (!r) break;
        r.view = { ...r.view, x: m.x, z: m.z, facing: m.facing, anim: m.anim };
        r.interp.push(m, performance.now());
        break;
      }
      case 'playerUpdated':
        if (m.player.id === this.me?.id) this.updateMe(m.player);
        else this.updateRemote(m.player);
        break;
      case 'emote': {
        const c = this.charOf(m.fromId);
        c?.overhead.emote(m.kind, performance.now());
        break;
      }
      case 'toyState':
        this.toyStates[m.toyId] = m.state;
        if (this.rowing?.toyId === m.toyId && m.state.kind === 'rowboat') {
          this.rowing.pose = { x: m.state.x, z: m.state.z, heading: m.state.heading }; // the server snapped us back
        }
        break;
      case 'toyEvent':
        this.onToyEvent(m.toyId, m.by, m.action, m.arg);
        break;
      case 'online':
        this.hud.setOnline(m.list);
        break;
      case 'feed':
        this.hud.addFeed(m.event);
        break;
      case 'error':
        this.onError(m.code, m.message);
        break;
    }
  }

  // ---------- scene & players ----------

  private enter(you: PlayerView, players: PlayerView[]): void {
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    this.def = getScene(you.scene)!;
    let rt = this.runtimes.get(you.scene);
    if (!rt) {
      const built = buildScene(this.def);
      const toys = new Map<string, ToyView>();
      for (const toy of this.def.toys) {
        const v = makeToyView(toy, this.def, this.fx);
        built.scene.add(v.root);
        toys.set(toy.id, v);
      }
      rt = { built, toys };
      this.runtimes.set(you.scene, rt);
    }
    this.rt = rt;
    this.scene = rt.built.scene;
    this.myChar ??= new Character(you.look, you.name, true);
    this.myChar.setLook(you.look);
    this.scene.add(this.myChar.root); // add() detaches it from the previous scene
    this.me = you;
    this.x = you.x;
    this.z = you.z;
    this.facing = you.facing;
    this.moving = false;
    this.standPending = false;
    this.sliding.clear();
    this.setTelescope(false);
    this.rowing = null;
    this.syncRowing(you);
    for (const p of players) this.addRemote(p);
    this.rig.snap(this.x, this.z);
    this.hud.closeCard();
    this.hooks.enterScene(this.def, rt.built);
    this.minimap.setScene(this.def);
  }

  private addRemote(v: PlayerView): void {
    if (!this.scene || v.id === this.me?.id || this.remotes.has(v.id)) return;
    const char = new Character(v.look, v.name);
    const interp = new Interp();
    interp.push(v, performance.now());
    this.scene.add(char.root);
    this.remotes.set(v.id, { view: v, char, interp });
  }

  private updateRemote(v: PlayerView): void {
    const r = this.remotes.get(v.id);
    if (!r) {
      if (v.scene === this.me?.scene) this.addRemote(v);
      return;
    }
    r.view = v;
    r.interp.push(v, performance.now());
    r.char.setLook(v.look);
  }

  private removeRemote(id: string): void {
    const r = this.remotes.get(id);
    if (!r) return;
    r.char.dispose();
    this.remotes.delete(id);
    this.sliding.delete(id);
    if (this.hud.cardTarget() === id) this.hud.closeCard();
  }

  private charOf(id: string): Character | null {
    return id === this.me?.id ? this.myChar : this.remotes.get(id)?.char ?? null;
  }

  private updateMe(p: PlayerView): void {
    const prev = this.me!;
    this.me = p;
    if (p.slotId) {
      if (!this.isMovingSlot(p.slotId)) {
        this.x = p.x;
        this.z = p.z;
        this.facing = p.facing;
      }
    } else {
      this.standPending = false;
      if (prev.slotId) {
        this.x = p.x; // the server puts you down: on shore, clear of the merry-go-round
        this.z = p.z;
      }
    }
    this.syncRowing(p);
    this.myChar!.setLook(p.look);
    if (prev.session?.phase === 'focus' && p.session?.phase === 'break') {
      chime();
      this.hud.toast('✨ Session done! Break time ☕ Stretch, wander, grab a coffee.', 6000);
    }
    if (prev.session?.phase === 'break' && !p.session) {
      chime();
      this.hud.toast(p.slotId ? "Break's over! Press Space to start another round 📖" : "Break's over! Find a seat to start another round 📖", 6000);
    }
  }

  /** Starts or stops local rowing to match the slot the server says we hold. */
  private syncRowing(p: PlayerView): void {
    const slot = p.slotId ? this.slotById(p.slotId) : undefined;
    if (slot?.pose !== 'row' || !slot.toyId) {
      if (this.rowing) (this.rt?.toys.get(this.rowing.toyId) as RowboatView | undefined)?.setLocal(null);
      this.rowing = null;
      return;
    }
    if (this.rowing?.toyId === slot.toyId) return;
    const toy = this.toyById(slot.toyId)!;
    const st = this.toyStates[slot.toyId];
    const pose = st?.kind === 'rowboat' ? boatPoseAt(st, this.restPose(toy), serverNow()) : this.restPose(toy);
    this.rowing = { toyId: slot.toyId, pose: { ...pose } };
  }

  private onError(code: ErrorCode, message: string): void {
    if (code === 'bad_door' && this.transitioning) {
      this.x -= Math.sin(this.facing) * 0.8; // step back out of the doorway
      this.z -= Math.cos(this.facing) * 0.8;
      this.endTransition();
      return;
    }
    this.hud.toast(code === 'slot_taken' ? '💺 That seat is taken!' : message);
  }

  // ---------- toys ----------

  private fx: ToyFx = {
    sound: (kind, x, z, arg) => this.hooks.sound(kind, x, z, arg),
    say: (id, text) => this.charOf(id)?.overhead.say(text, performance.now()),
    feedDucks: (x, z) => this.hooks.feedDucks(x, z),
    playerPos: (id) => {
      if (id === this.me?.id) return { x: this.x, z: this.z };
      const c = this.remotes.get(id)?.char;
      return c ? { x: c.root.position.x, z: c.root.position.z } : null;
    },
  };

  private toyById(id: string): Toy | undefined {
    return this.def?.toys.find((t) => t.id === id);
  }

  private slotById(id: string): Slot | undefined {
    return this.def?.slots.find((s) => s.id === id);
  }

  private isMovingSlot(slotId: string): boolean {
    const toyId = this.slotById(slotId)?.toyId;
    const kind = toyId ? this.toyById(toyId)?.kind : undefined;
    return kind === 'rowboat' || kind === 'merryGoRound';
  }

  private restPose(toy: Toy): BoatPose {
    return { x: toy.x, z: toy.z, heading: toy.rot ?? 0 };
  }

  private toyCtx(toyId: string): ToyCtx {
    return { now: this.ctxNow, dt: this.ctxDt, state: this.toyStates[toyId], occupied: this.occupied };
  }

  private onToyEvent(toyId: string, by: string, action: ToyAction, arg?: number): void {
    const toy = this.toyById(toyId);
    if (!toy) return;
    if (action === 'slide') {
      this.sliding.set(by, { start: performance.now(), toy });
      this.fx.sound('whoosh', toy.x, toy.z);
      return;
    }
    if (action === 'note' && by === this.me?.id) return; // already played the moment the key went down
    this.rt?.toys.get(toyId)?.onEvent?.({ action, arg, by }, this.toyCtx(toyId));
  }

  private playNote(i: number): void {
    const slot = this.me?.slotId ? this.slotById(this.me.slotId) : undefined;
    const toy = slot?.toyId ? this.toyById(slot.toyId) : undefined;
    if (!toy || toy.kind !== 'piano' || this.hud.modalOpen()) return;
    this.send({ t: 'use', toyId: toy.id, action: 'note', arg: i });
    this.rt?.toys.get(toy.id)?.onEvent?.({ action: 'note', arg: i, by: this.me!.id }, this.toyCtx(toy.id));
  }

  private setTelescope(on: boolean): void {
    this.telescope = on;
    this.rig.lookUp(on);
  }

  /** Where someone sitting in this slot is right now, including swing arcs and boat bobbing. */
  private riderSpot(slot: Slot): { x: number; y: number; z: number; facing: number } {
    const toy = slot.toyId ? this.toyById(slot.toyId) : undefined;
    if (!toy) return { x: slot.x, y: 0, z: slot.z, facing: slot.facing };
    const view = this.rt?.toys.get(toy.id);
    const ctx = this.toyCtx(toy.id);
    const w = slotWorld(slot, toy, view?.pose?.(ctx) ?? this.restPose(toy));
    const off = view?.riderOffset?.(slot, ctx) ?? { dx: 0, dy: 0, dz: 0 };
    return { x: w.x + off.dx, y: off.dy, z: w.z + off.dz, facing: w.facing };
  }

  /** Climb, then slide: position along the slide for a slide that started at `start`. */
  private slideSpot(s: { start: number; toy: Toy }, nowP: number): { x: number; y: number; z: number; done: boolean } {
    const u = (nowP - s.start) / SLIDE_MS;
    const p = slidePath(Math.min(u, 1));
    return { x: s.toy.x, y: p.y, z: s.toy.z + p.dz, done: u >= 1 };
  }

  // ---------- local player ----------

  private updateLocal(dt: number, nowP: number): void {
    const me = this.me!;
    const def = this.def!;
    const a = this.input.axis();
    const pressing = a.x !== 0 || a.z !== 0;
    if (!pressing) this.waitForRelease = false;
    if (this.transitioning || this.hud.modalOpen() || this.waitForRelease || this.sliding.has(me.id)) {
      this.stopMoving(nowP);
      return;
    }
    if (me.slotId) {
      if (this.rowing) this.row(dt, a, pressing, nowP);
      else if (pressing && !this.standPending) this.requestStand();
      return;
    }
    if (this.telescope) {
      if (!pressing) return;
      this.setTelescope(false);
    }
    if (!pressing) {
      this.stopMoving(nowP);
      return;
    }
    const r = moveWithCollision(this.x, this.z, a.x * MOVE_SPEED * dt, a.z * MOVE_SPEED * dt, PLAYER_RADIUS, def.colliders, def.size);
    this.x = r.x;
    this.z = r.z;
    this.facing = Math.atan2(a.x, a.z);
    this.moving = true;
    if (nowP - this.lastSent >= SEND_EVERY_MS) this.sendMove(nowP);
    const door = def.doors.find((d) => inBox(d.box, this.x, this.z));
    if (door) void this.goThrough(door.id);
  }

  /** WASD steers the boat: turn towards the key direction, pull forward as you line up. */
  private row(dt: number, a: { x: number; z: number }, pressing: boolean, nowP: number): void {
    const r = this.rowing!;
    const wasMoving = this.moving;
    this.moving = pressing;
    if (pressing) {
      const d = angleDelta(r.pose.heading, Math.atan2(a.x, a.z));
      r.pose.heading += Math.sign(d) * Math.min(Math.abs(d), ROW_TURN * dt);
      const pull = BOAT_SPEED * 0.92 * Math.max(0, Math.cos(d)) * dt;
      const nx = r.pose.x + Math.sin(r.pose.heading) * pull;
      const nz = r.pose.z + Math.cos(r.pose.heading) * pull;
      if (boatOnWater(this.def!.water?.outline, nx, nz)) {
        r.pose.x = nx;
        r.pose.z = nz;
      }
    }
    if ((pressing && nowP - this.lastSent >= ROW_SEND_MS) || (wasMoving && !pressing)) {
      this.lastSent = nowP;
      this.send({ t: 'move', x: r.pose.x, z: r.pose.z, facing: r.pose.heading, anim: 'sit' });
    }
  }

  private stopMoving(nowP: number): void {
    if (!this.moving) return;
    this.moving = false;
    if (!this.me?.slotId) this.sendMove(nowP);
  }

  private sendMove(nowP: number): void {
    this.lastSent = nowP;
    this.send({ t: 'move', x: this.x, z: this.z, facing: this.facing, anim: this.moving ? 'walk' : 'idle' });
  }

  private requestStand(): void {
    this.standPending = true;
    if (this.me?.session?.phase === 'focus') {
      this.hud.confirmLeave(
        () => this.send({ t: 'stand' }),
        () => {
          this.standPending = false;
          this.waitForRelease = true;
        },
      );
      return;
    }
    this.send({ t: 'stand' });
  }

  private interact(): void {
    if (!this.me || this.transitioning || this.hud.modalOpen() || this.sliding.has(this.me.id)) return;
    if (this.telescope) return this.setTelescope(false);
    if (this.me.slotId) {
      if (!this.standPending) this.requestStand();
      return;
    }
    const t = this.target;
    if (!t) return;
    if (t.kind === 'slot') {
      this.sendMove(performance.now()); // make sure the server has our exact spot
      this.send({ t: 'sit', slotId: t.slot.id });
      this.waitForRelease = true; // don't let a still-held movement key stand us straight back up
      return;
    }
    if (t.kind === 'toy') {
      if (t.toy.kind === 'telescope') return this.setTelescope(true);
      if (t.toy.kind === 'quotes') {
        this.fx.say(this.me.id, QUOTES[Math.floor(Math.random() * QUOTES.length)]);
        return;
      }
      if (LOCAL_TOYS.includes(t.toy.kind)) return this.onLocalToy(t.toy);
      const action = TOY_DEFAULT_ACTION[t.toy.kind];
      if (!action) return;
      this.sendMove(performance.now());
      this.send({ t: 'use', toyId: t.toy.id, action });
      return;
    }
    const r = this.remotes.get(t.id);
    if (r) this.hud.openPlayerCard(r.view, (kind: EmoteKind) => this.send({ t: 'emote', kind, targetId: t.id }));
  }

  private openSessionPicker(): void {
    if (!this.me || this.transitioning || this.hud.modalOpen()) return;
    const slot = this.me.slotId ? this.slotById(this.me.slotId) : undefined;
    if (!slot) {
      this.hud.toast('🪑 Find a seat first: walk up to a desk and press E');
      return;
    }
    if (!slot.deskId) {
      this.hud.toast('📚 This is a fun seat! Study at a desk, café table or bench');
      return;
    }
    if (this.me.session?.phase === 'focus') return;
    this.hud.openSessionPicker((focusMin, breakMin) => this.send({ t: 'startSession', focusMin, breakMin }));
  }

  private async goThrough(doorId: string): Promise<void> {
    this.transitioning = true;
    this.moving = false;
    this.sendMove(performance.now());
    this.hud.closeCard();
    this.rig.zoomTo(0.8);
    await this.fade.out();
    this.send({ t: 'enterScene', doorId });
  }

  private endTransition(): void {
    this.rig.zoomTo(1);
    void this.fade.in().then(() => {
      this.transitioning = false;
    });
  }

  private promptText(): string | null {
    const me = this.me!;
    if (this.transitioning) return null;
    if (this.telescope) return '✨ Stargazing… [E] or move to stop';
    if (me.slotId) {
      const slot = this.slotById(me.slotId);
      if (slot && !slot.deskId) {
        if (this.rowing) return '[WASD] row · [E] get out';
        const toy = slot.toyId ? this.toyById(slot.toyId) : undefined;
        if (toy?.kind === 'piano') return '[1–8] play · [E] stand up';
        return '[E] hop off';
      }
      if (me.session?.phase === 'focus') return 'Focusing… [E] leave early';
      if (me.session?.phase === 'break') return '[Space] start another round · [E] stand up';
      return '[Space] start a study session · [E] stand up';
    }
    const t = this.target;
    if (t?.kind === 'toy') return t.prompt;
    if (t?.kind === 'slot') return slotPrompt(t.slot, t.slot.toyId ? this.toyById(t.slot.toyId) : undefined);
    if (t?.kind === 'player') return `[E] say hi to ${this.remotes.get(t.id)?.view.name ?? 'them'}`;
    return null;
  }

  // ---------- frame ----------

  private resize(): void {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.rig.resize(innerWidth, innerHeight);
  }

  private frame(): void {
    const nowP = performance.now();
    const dt = Math.min((nowP - this.last) / 1000, 0.1);
    this.last = nowP;
    if (!this.me || !this.def || !this.scene || !this.myChar || !this.rt) return;
    const sNow = serverNow();
    this.ctxNow = sNow;
    this.ctxDt = dt;
    this.updateLocal(dt, nowP);

    this.occupied = new Set<string>();
    if (this.me.slotId) this.occupied.add(this.me.slotId);
    for (const r of this.remotes.values()) if (r.view.slotId) this.occupied.add(r.view.slotId);

    for (const [id, view] of this.rt.toys) {
      if (this.rowing?.toyId === id) (view as RowboatView).setLocal(this.rowing.pose);
      view.update(this.toyCtx(id));
    }

    const others: { id: string; x: number; z: number }[] = [];
    for (const [id, r] of this.remotes) {
      const pose = r.interp.sample(nowP);
      let x = pose.x;
      let y = 0;
      let z = pose.z;
      let facing = pose.facing;
      const slot = r.view.slotId ? this.slotById(r.view.slotId) : undefined;
      const slide = this.sliding.get(id);
      r.char.anim = slot ? 'sit' : r.view.anim;
      r.char.pose = slot?.pose ?? 'sit';
      r.char.active = slot?.pose === 'row';
      if (slot) ({ x, y, z, facing } = this.riderSpot(slot));
      else if (slide) {
        const s = this.slideSpot(slide, nowP);
        ({ x, y, z } = s);
        facing = 0;
        r.char.anim = s.y > 0.2 ? 'sit' : 'idle';
        r.char.pose = 'ride';
        if (s.done) this.sliding.delete(id);
      }
      r.char.root.position.set(x, y, z);
      r.char.facing = facing;
      r.char.setDim(!r.view.connected);
      r.char.overhead.setSession(r.view.session, sNow);
      r.char.overhead.setRain(r.view.rainUntil > sNow);
      r.char.update(dt, nowP);
      others.push({ id, x, z });
    }

    const c = this.myChar;
    const mySlot = this.me.slotId ? this.slotById(this.me.slotId) : undefined;
    const mySlide = this.sliding.get(this.me.id);
    let y = 0;
    c.anim = mySlot ? 'sit' : this.moving ? 'walk' : 'idle';
    c.pose = mySlot?.pose ?? 'sit';
    c.active = mySlot?.pose === 'row' && this.moving;
    if (mySlot?.toyId) {
      const spot = this.riderSpot(mySlot);
      this.x = spot.x;
      this.z = spot.z;
      this.facing = spot.facing;
      y = spot.y;
    } else if (mySlide) {
      const s = this.slideSpot(mySlide, nowP);
      c.anim = s.y > 0.2 ? 'sit' : 'idle';
      c.pose = 'ride';
      this.facing = 0;
      if (s.done) {
        this.sliding.delete(this.me.id);
        this.x = mySlide.toy.x;
        this.z = mySlide.toy.z + SLIDE_RUN;
        this.sendMove(nowP);
      } else {
        this.x = s.x;
        this.z = s.z;
        y = s.y;
      }
    }
    c.root.position.set(this.x, y, this.z);
    c.facing = this.facing;
    c.overhead.setSession(this.me.session, sNow);
    c.overhead.setRain(this.me.rainUntil > sNow);
    c.update(dt, nowP);

    if (this.transitioning || this.me.slotId || mySlide || this.telescope) {
      this.target = null;
    } else {
      const placed: PlacedSlot[] = this.def.slots.map((slot) => {
        const spot = slot.toyId ? this.riderSpot(slot) : slot;
        return { slot, x: spot.x, z: spot.z };
      });
      const toys = this.def.toys.map((toy) => ({ toy, prompt: toyPrompt(toy, this.toyStates[toy.id]) }));
      this.target = pickTarget(this.x, this.z, placed, this.occupied, toys, others);
    }
    this.hud.setPrompt(this.promptText());
    this.hud.setStatus(this.me, this.def, sNow);

    const cardId = this.hud.cardTarget();
    if (cardId) {
      const r = this.remotes.get(cardId);
      const far = !r || Math.hypot(r.char.root.position.x - this.x, r.char.root.position.z - this.z) > INTERACT_RADIUS + 1;
      if (far) this.hud.closeCard();
      else this.hud.updateCard(statusText(r.view, sNow));
    }

    this.rig.follow(this.x, this.z, dt);
    const built = this.rt.built;
    built.sway.value = nowP / 1000;
    followSun(built, this.x, this.z);
    updateFades(built, this.x, this.z, dt);
    const vehicles: MapVehicle[] = [];
    for (const toy of this.def.toys) {
      if (toy.kind !== 'rowboat') continue;
      const p = this.rt.toys.get(toy.id)?.pose?.(this.toyCtx(toy.id));
      if (p) vehicles.push({ x: p.x, z: p.z, heading: p.heading, icon: '🚣' });
    }
    this.minimap.draw(nowP, { x: this.x, z: this.z, facing: this.facing, color: this.me.look.body },
      [...this.remotes.values()].map((r) => ({ x: r.char.root.position.x, z: r.char.root.position.z, color: r.view.look.body })), vehicles);
    this.hooks.frame({ def: this.def, built, now: sNow, dt, me: { x: this.x, z: this.z }, toyStates: this.toyStates });
    this.renderer.render(this.scene, this.rig.camera);
    if (this.fps) {
      this.fps.frames++;
      if (nowP - this.fps.since >= 500) {
        this.fps.el.textContent = `${Math.round((this.fps.frames * 1000) / (nowP - this.fps.since))} fps`;
        this.fps.frames = 0;
        this.fps.since = nowP;
      }
    }
  }
}

function slotPrompt(slot: Slot, toy: Toy | undefined): string {
  if (!toy) return '[E] sit down';
  switch (slot.pose) {
    case 'swing': return '[E] swing';
    case 'ride': return '[E] hop on';
    case 'row': return '[E] row the boat';
    default:
      if (toy.kind === 'piano') return '[E] sit at the piano';
      if (toy.kind === 'campfire') return '[E] sit by the fire';
      if (toy.kind === 'rowboat') return '[E] hop in the back';
      return '[E] sit down';
  }
}
