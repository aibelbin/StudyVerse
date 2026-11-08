import * as THREE from 'three';
import { INTERACT_RADIUS, MOVE_SPEED, PLAYER_RADIUS } from '../../../shared/constants';
import { inBox, moveWithCollision } from '../../../shared/geometry';
import type { ClientMsg, ErrorCode, ServerMsg } from '../../../shared/protocol';
import { getScene } from '../../../shared/scenes';
import type { SceneDef } from '../../../shared/scenes/types';
import type { EmoteKind, PlayerView } from '../../../shared/types';
import { chime } from '../hud/chime';
import { statusText } from '../hud/format';
import type { Hud } from '../hud/hud';
import { Interp } from '../net/interp';
import { Character } from '../world/character';
import { buildScene } from '../world/sceneBuilder';
import { CameraRig } from './cameraRig';
import { serverNow, syncClock } from './clock';
import { Input } from './input';
import { pickTarget, type Target } from './interaction';
import { Fade } from './transition';

interface Remote {
  view: PlayerView;
  char: Character;
  interp: Interp;
}

const SEND_EVERY_MS = 80;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private rig = new CameraRig();
  private input = new Input();
  private fade: Fade;
  private scenes = new Map<string, THREE.Scene>();
  private def: SceneDef | null = null;
  private scene: THREE.Scene | null = null;
  private me: PlayerView | null = null;
  private myChar: Character | null = null;
  private remotes = new Map<string, Remote>();
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

  constructor(canvas: HTMLCanvasElement, fadeEl: HTMLElement, private hud: Hud, private send: (m: ClientMsg) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.fade = new Fade(fadeEl);
    addEventListener('resize', () => this.resize());
    this.resize();
    this.input.on('e', () => this.interact());
    this.input.on(' ', () => this.openSessionPicker());
    this.input.on('escape', () => {
      this.hud.closeModals();
      this.hud.closeCard();
    });
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
        this.enter(m.you, m.players);
        this.hud.setOnline(m.online);
        this.hud.resetFeed(m.feed);
        if (this.transitioning) this.endTransition();
        break;
      case 'sceneSnapshot':
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
        const c = m.fromId === this.me?.id ? this.myChar : this.remotes.get(m.fromId)?.char;
        c?.overhead.emote(m.kind, performance.now());
        break;
      }
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
    let scene = this.scenes.get(you.scene);
    if (!scene) {
      scene = buildScene(this.def);
      this.scenes.set(you.scene, scene);
    }
    this.scene = scene;
    this.myChar ??= new Character(you.look, you.name, true);
    this.myChar.setLook(you.look);
    scene.add(this.myChar.root); // add() detaches it from the previous scene
    this.me = you;
    this.x = you.x;
    this.z = you.z;
    this.facing = you.facing;
    this.moving = false;
    this.standPending = false;
    for (const p of players) this.addRemote(p);
    this.rig.snap(this.x, this.z);
    this.hud.closeCard();
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
    if (this.hud.cardTarget() === id) this.hud.closeCard();
  }

  private updateMe(p: PlayerView): void {
    const prev = this.me!;
    this.me = p;
    if (p.slotId) {
      this.x = p.x;
      this.z = p.z;
      this.facing = p.facing;
    } else {
      this.standPending = false;
    }
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

  private onError(code: ErrorCode, message: string): void {
    if (code === 'bad_door' && this.transitioning) {
      this.x -= Math.sin(this.facing) * 0.8; // step back out of the doorway
      this.z -= Math.cos(this.facing) * 0.8;
      this.endTransition();
      return;
    }
    this.hud.toast(code === 'slot_taken' ? '💺 That seat is taken!' : message);
  }

  // ---------- local player ----------

  private updateLocal(dt: number, nowP: number): void {
    const me = this.me!;
    const def = this.def!;
    const a = this.input.axis();
    const pressing = a.x !== 0 || a.z !== 0;
    if (!pressing) this.waitForRelease = false;
    if (this.transitioning || this.hud.modalOpen() || this.waitForRelease) {
      this.stopMoving(nowP);
      return;
    }
    if (me.slotId) {
      if (pressing && !this.standPending) this.requestStand();
      return;
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

  private stopMoving(nowP: number): void {
    if (!this.moving) return;
    this.moving = false;
    this.sendMove(nowP);
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
    if (!this.me || this.transitioning || this.hud.modalOpen()) return;
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
    const r = this.remotes.get(t.id);
    if (r) this.hud.openPlayerCard(r.view, (kind: EmoteKind) => this.send({ t: 'emote', kind, targetId: t.id }));
  }

  private openSessionPicker(): void {
    if (!this.me || this.transitioning || this.hud.modalOpen()) return;
    if (!this.me.slotId) {
      this.hud.toast('🪑 Find a seat first: walk up to a desk and press E');
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
    if (me.slotId) {
      if (me.session?.phase === 'focus') return 'Focusing… [E] leave early';
      if (me.session?.phase === 'break') return '[Space] start another round · [E] stand up';
      return '[Space] start a study session · [E] stand up';
    }
    if (this.target?.kind === 'slot') return '[E] sit down';
    if (this.target?.kind === 'player') return `[E] say hi to ${this.remotes.get(this.target.id)?.view.name ?? 'them'}`;
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
    if (!this.me || !this.def || !this.scene || !this.myChar) return;
    const sNow = serverNow();
    this.updateLocal(dt, nowP);

    const taken = new Set<string>();
    if (this.me.slotId) taken.add(this.me.slotId);
    const others: { id: string; x: number; z: number }[] = [];
    for (const [id, r] of this.remotes) {
      const pose = r.interp.sample(nowP);
      r.char.root.position.set(pose.x, 0, pose.z);
      r.char.facing = pose.facing;
      r.char.anim = r.view.slotId ? 'sit' : r.view.anim;
      r.char.setDim(!r.view.connected);
      r.char.overhead.setSession(r.view.session, sNow);
      r.char.overhead.setRain(r.view.rainUntil > sNow);
      r.char.update(dt, nowP);
      if (r.view.slotId) taken.add(r.view.slotId);
      others.push({ id, x: pose.x, z: pose.z });
    }

    const c = this.myChar;
    c.root.position.set(this.x, 0, this.z);
    c.facing = this.facing;
    c.anim = this.me.slotId ? 'sit' : this.moving ? 'walk' : 'idle';
    c.overhead.setSession(this.me.session, sNow);
    c.overhead.setRain(this.me.rainUntil > sNow);
    c.update(dt, nowP);

    this.target = this.transitioning || this.me.slotId ? null : pickTarget(this.x, this.z, this.def.slots, taken, others);
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
    this.renderer.render(this.scene, this.rig.camera);
  }
}
