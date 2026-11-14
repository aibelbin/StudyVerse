import * as THREE from 'three';
import { GIFT_RANGE, INTERACT_RADIUS, MOVE_SPEED, PLAYER_RADIUS } from '../../../shared/constants';
import { showGiftOffer } from '../hud/giftCard';
import { EmoteWheel } from '../hud/emoteWheel';
import { inBox, moveWithCollision, pointInPolygon } from '../../../shared/geometry';
import type { ClientMsg, ErrorCode, ServerMsg } from '../../../shared/protocol';
import { SCENES } from '../../../shared/scenes';
import { SLIDE_RUN } from '../../../shared/scenes/kitToys';
import type { LifeKind, SceneDef, Slot, Spot, Toy } from '../../../shared/scenes/types';
import { cabinOwner, type CabinEntry } from '../../../shared/art';
import { mailFlags } from '../art/mail';
import { BoothTimer, capturePhoto, flash, openPhotoPreview, runCountdown } from '../art/booth';
import { ArtRooms, roomViews, type RoomViews } from '../art/rooms';
import {
  angleDelta, BOAT_SPEED, boatOnWater, boatPoseAt, LOCAL_TOYS, slotWorld, type BoatPose, type Tilt, type ToyAction, type ToyState,
} from '../../../shared/toys';
import { holdName, type EmoteKind, type PetView, type PlayerView } from '../../../shared/types';
import { moodText } from '../hud/gifts';
import { aGift, GIFTS } from '../../../shared/gifts';
import { disposeTree, mesh, toonMat } from '../world/materials';
import type { SoundKind } from '../audio/kinds';
import { chime } from '../hud/chime';
import { statusText } from '../hud/format';
import { Minimap, type MapVehicle } from '../hud/minimap';
import type { Hud } from '../hud/hud';
import { Interp } from '../net/interp';
import { slidePath, SLIDE_MS } from '../toys/playground';
import { makeToyView, TOY_DEFAULT_ACTION, toyPrompt, type ToyCtx, type ToyFx, type ToyView } from '../toys/registry';
import { truckDustRoot, type VehicleView } from '../toys/truck';
import { clockHours, skyAt } from '../world/sky';
import { CONTROLLER_POSES } from '../../../shared/vehicles';
import { DriveWorld, loadRapier } from '../drive/physics';
import { PropsView } from '../world/props';
import { Character } from '../world/character';
import { book } from '../world/book';
import { buildScene, followSun, updateFades, type BuiltScene } from '../world/sceneBuilder';
import { CameraRig } from './cameraRig';
import { serverNow, syncClock } from './clock';
import { Input } from './input';
import { pickTarget, type PlacedSlot, type Target } from './interaction';
import { treeStage } from '../../../shared/tree';
import { QUOTES } from './quotes';
import { Fade } from './transition';
import type { Voice } from '../voice/voice';
import { LocalPet } from '../pets/controller';
import type { Poi } from '../pets/mind';
import { KOI_POND } from '../../../shared/scenes/town/zen';
import { BreathOverlay } from '../hud/breath';
import { floorY } from '../toys/parkMath';
import { toggleFullscreen } from '../touch/fullscreen';
import { FLOWERS } from '../../../shared/garden';
import { StageFx } from '../world/stageFx';
import { Post } from '../world/post';
import { CLOUDS } from '../world/ground';
import { initialQuality, QUALITY_KEY, SlowFrames, type Quality } from '../world/quality';
import { GolfCourse } from '../golf/course';
import { GolfPlay } from '../golf/play';
import { bugsOf, caughtText, Fishing, pickSpecies } from '../fun/fishing';
import { BUG_GAP_MS, CRITTER_HIDE_MS, isNight, possible, SPECIES } from '../../../shared/catches';
import type { Weather, WeatherKind } from '../../../shared/weather';
import { towardWater } from '../toys/water';
import { Floaters } from '../toys/floaters';
import { PetModel } from '../pets/model';
import { DEFAULT_MUG } from '../../../shared/mug';

interface Remote {
  view: PlayerView;
  char: Character;
  interp: Interp;
}

/** Everything built once per scene and kept while you visit others. */
interface SceneRuntime {
  built: BuiltScene;
  toys: Map<string, ToyView>;
  props: PropsView | null;
  stageFx: StageFx | null;
  golf: GolfCourse | null;
  /** Emoji pops in the world (e.g. a hole-in-one). */
  pops: Floaters;
  /** Picture frames and shelves (studio gallery, cabin spots). */
  art: RoomViews;
  /** The scene book version it was built from; a village or cabin from an older roster is rebuilt. */
  version: number;
}

/** Instruments you play from their seat with the number keys. */
const PLAYABLE = new Set(['piano', 'drums', 'guitar', 'keys']);
const INSTRUMENT_NAMES: Record<string, string> = { piano: 'piano', drums: 'drums', guitar: 'guitar', keys: 'keyboard' };

/** Hooks later systems (audio, ambient life, sky) plug into. */
export interface GameHooks {
  sound(kind: SoundKind, x: number, z: number, arg?: number): void;
  feedDucks(x: number, z: number): void;
  /** Called every frame after the world is placed. */
  frame(info: FrameInfo): void;
  /** Called when the scene changes. */
  enterScene(def: SceneDef, built: BuiltScene): void;
  /** The closest catchable critter you can see within net reach. */
  nearestCritter(x: number, z: number): { id: number; kind: LifeKind } | null;
  hideCritter(id: number, ms: number): void;
}

export interface FrameInfo {
  def: SceneDef;
  built: BuiltScene;
  /** Server time, ms. */
  now: number;
  dt: number;
  me: { x: number; z: number };
  toyStates: Record<string, ToyState>;
  weather: WeatherKind | null;
  quality: Quality;
}

const SEND_EVERY_MS = 80;
const ROW_SEND_MS = 100;
const ROW_TURN = 2.5; // rad/s

export class Game {
  hooks: GameHooks = { sound() {}, feedDucks() {}, frame() {}, enterScene() {}, nearestCritter: () => null, hideCritter() {} };
  /** E on a toy that opens something on this screen only (Boutique, notice board, coffee machine). */
  onLocalToy: (toy: Toy) => void = () => {};
  /** E on your own garden plot. */
  onOpenGarden: (toyId: string) => void = () => {};
  /** E on an empty spot in your own cabin: pick something to hang or put there. */
  onSpot: (spot: Spot) => void = () => {};
  /** Called once per frame after the HUD updates (the touch controls follow the hint). */
  onFrame: () => void = () => {};
  /** I: the bag. */
  onBagKey: () => void = () => {};
  onJournalKey: () => void = () => {};
  /** Called once, after the town has been drawn for the first time (the loading screen fades then). */
  onFirstFrame: () => void = () => {};
  private drawnOnce = false;
  onToggleDnd: () => void = () => {};
  onVoiceKey: () => void = () => {};
  voice: Voice | null = null;
  onPetKey: () => void = () => {};
  onChatKey: () => void = () => {};
  private pets = new Map<string, { model: PetModel; key: string; x: number; z: number; facing: number; anim: PetView['anim']; tx: number; tz: number }>();
  private localPet: LocalPet | null = null;
  private treeMinutes = 0;
  private art = new ArtRooms((m) => this.send(m));
  private booth = new BoothTimer();

  private renderer: THREE.WebGLRenderer;
  private rig = new CameraRig();
  readonly input = new Input();
  private fade: Fade;
  private runtimes = new Map<string, SceneRuntime>();
  private rt: SceneRuntime | null = null;
  private fps: { el: HTMLElement; frames: number; since: number } | null = null;
  private def: SceneDef | null = null;
  private scene: THREE.Scene | null = null;
  /** The latest cabin roster, to spot mailbox flag flips. */
  private cabins: CabinEntry[] = [];
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
  private driving: { toyId: string; kind: Toy['kind']; pose: BoatPose; speed: number; tilt?: Tilt } | null = null;
  /** The driver's Rapier world, once the engine has loaded. */
  private dw: DriveWorld | null = null;
  private rapierReady = false;
  /** E was pressed while rolling: brake, then hop out. */
  private exiting = false;
  private breath = new BreathOverlay();
  private post: Post;
  quality: Quality = 'high';
  private slowFrames = new SlowFrames();
  private golf: GolfPlay;
  private fishing: Fishing;
  private nettedAt = -1e9;
  /** The town's latest weather (the fish picker checks for rain). */
  weather: Weather | null = null;
  /** Server time you sat on a meditation cushion (null when not on one). */
  private breathSitAt: number | null = null;
  private breathDone = false;
  private sippedAt = 0;
  /** 0 by day … 1 at night (the observatory is night-only). */
  night = 0;
  private timeOverride = new URLSearchParams(location.search).get('time');
  private sliding = new Map<string, { start: number; toy: Toy }>();
  private telescope = false;
  private ctxNow = 0;
  private ctxDt = 0;
  private occupied = new Set<string>();
  private minimap = new Minimap(document.body);
  private wheel = new EmoteWheel();

  constructor(canvas: HTMLCanvasElement, fadeEl: HTMLElement, private hud: Hud, private send: (m: ClientMsg) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, document.body.classList.contains('touch') ? 1.25 : 1.5)); // phones run cooler at 1.25
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.post = new Post(this.renderer);
    this.quality = initialQuality(location.search, localStorage.getItem(QUALITY_KEY), document.body.classList.contains('touch'));
    this.post.high = this.quality === 'high';
    this.fade = new Fade(fadeEl);
    addEventListener('resize', () => this.resize());
    this.resize();
    this.golf = new GolfPlay({
      scene: () => this.scene,
      camera: () => this.rig.camera,
      canvas,
      hud,
      send: (m) => this.send(m),
      myColor: () => this.me?.look.body ?? '#ffffff',
      colorOf: (id) => this.remotes.get(id)?.view.look.body ?? '#ffffff',
      myId: () => this.me?.id ?? null,
      standAt: (x, z) => {
        // just behind the ball as the camera sees it (north), so you never hide your own ball
        this.x = x;
        this.z = z - 0.7;
        this.sendMove(performance.now());
      },
      sound: (kind, x, z) => this.fx.sound(kind, x, z),
      pop: (x, y, z, text) => this.rt?.pops.text(text, x, y, z, performance.now(), 0.8, 2200),
    });
    this.fishing = new Fishing({
      scene: () => this.scene,
      sound: (kind, x, z) => this.fx.sound(kind, x, z),
      pop: (text) => this.myChar?.overhead.pop(text, performance.now()),
      toast: (text) => this.hud.toast(text, 2500),
      send: (m) => this.send(m),
      hour: () => this.hour(),
      raining: () => this.weather?.kind === 'rain',
    });
    this.input.on('q', () => {
      if (!this.hud.modalOpen()) this.golf.quit();
    });
    this.input.on('e', () => this.interact());
    this.input.on('i', () => {
      if (!this.hud.modalOpen()) this.onBagKey();
    });
    this.input.on('j', () => {
      if (!this.hud.modalOpen()) this.onJournalKey();
    });
    this.input.on('f', () => {
      if (!this.hud.modalOpen()) toggleFullscreen();
    });
    this.input.on(' ', () => this.openSessionPicker());
    this.input.on('m', () => {
      if (!this.hud.modalOpen()) this.minimap.toggle();
    });
    this.input.on('escape', () => {
      this.golf.cancelDrag();
      this.hud.closeModals();
      this.hud.closeCard();
      this.wheel.close();
      if (this.telescope) this.setTelescope(false);
    });
    for (let i = 1; i <= 8; i++) this.input.on(String(i), () => this.playNote(i - 1));
    this.input.on('c', () => {
      if (!this.me?.holding || this.me.holding.item === 'bouquet' || this.hud.modalOpen()) return;
      this.sippedAt = performance.now();
      this.send({ t: 'sip' });
    });
    this.input.on('g', () => {
      if (this.hud.modalOpen() || !this.me) return;
      if (!this.me.holding) return this.onBagKey(); // nothing in hand: gifts live in the bag
      const to = this.nearestPlayer(GIFT_RANGE - 0.5);
      if (!to) return this.hud.toast('Walk up to someone to share your drink 🎁');
      this.send({ t: 'offerCoffee', to: to.view.id });
      this.hud.toast(`Offering your ${holdName(this.me.holding)} to ${to.view.name}…`, 2500);
    });
    this.wheel.onPick = (kind) => this.send({ t: 'act', kind });
    this.input.on('t', () => {
      if (this.hud.modalOpen() || !this.me) return;
      if (this.wheel.open) this.wheel.close();
      else this.wheel.show();
    });
    this.input.onUp('t', () => this.wheel.release());
    this.input.on('enter', () => {
      if (!this.hud.modalOpen()) this.onChatKey();
    });
    this.input.on('h', () => {
      if (this.driving?.kind === 'truck' && !this.hud.modalOpen()) this.send({ t: 'use', toyId: this.driving.toyId, action: 'honk' });
    });
    this.input.on('v', () => {
      if (!this.hud.modalOpen()) this.onVoiceKey();
    });
    this.input.on('p', () => {
      if (!this.hud.modalOpen()) this.onPetKey();
    });
    this.input.on('n', () => {
      if (!this.hud.modalOpen()) this.onToggleDnd();
    });
    if (new URLSearchParams(location.search).has('fps')) {
      const el = document.createElement('div');
      el.className = 'fps glass';
      document.body.append(el);
      this.fps = { el, frames: 0, since: performance.now() };
    }
    this.hud.onToggleLatch = () => this.art.toggleLatch();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  /** The photo booth: 3-2-1 over your head, a flash, then keep or discard the shot. */
  takePhoto(save: (title: string, png: string, done: (ok: boolean) => void) => void): void {
    if (!this.booth.canUse(performance.now())) return this.hud.toast('One photo every 10 seconds', 2500);
    this.booth.start(performance.now());
    this.facing = Math.PI / 2; // turn to the booth camera (it stands east of the curtain)
    this.sendMove(performance.now());
    runCountdown(this.booth, (s) => {
      this.myChar?.overhead.pop(s === 'shoot' ? '📸' : String(s), performance.now());
      if (s !== 'shoot' || !this.scene || this.def?.id !== 'studio') return;
      flash();
      const url = capturePhoto(this.renderer, this.scene);
      openPhotoPreview(this.hud, url, (title, done) => save(title, url.split(',')[1], done), () => {});
    });
  }

  /** A speech bubble over whoever said something in Everyone chat, if they're in this scene. */
  chatBubble(fromId: string, text: string): void {
    this.charOf(fromId)?.overhead.bubble(text, performance.now());
  }

  myView(): PlayerView | null {
    return this.me;
  }

  onMessage(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome':
        syncClock(m.serverTime);
        this.toyStates = { ...m.toys };
        this.weather = m.weather;
        this.treeMinutes = m.treeMinutes;
        this.cabins = m.cabins;
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
        if (m.kind === 'coffee') c?.sip(performance.now());
        break;
      }
      case 'act': {
        const ch = this.charOf(m.fromId);
        ch?.act(m.kind, performance.now());
        // Clapping or cheering from the stage seats is applause everyone hears.
        const st = this.def?.stage;
        if (ch && st && (m.kind === 'clap' || m.kind === 'cheer')) {
          const p = ch.root.position;
          if (inBox(st.audience, p.x, p.z)) this.fx.sound('applause', p.x, p.z);
        }
        break;
      }
      case 'weather':
        this.weather = m.weather;
        break;
      case 'caught':
        this.myChar?.overhead.pop(SPECIES[m.species].emoji, performance.now());
        this.hud.toast(caughtText(m.species, m.size, m.first), 3500);
        break;
      case 'catchPop':
        this.charOf(m.id)?.overhead.pop(SPECIES[m.species].emoji, performance.now());
        break;
      case 'golfBall':
      case 'golfDone':
      case 'golfGone':
      case 'golfCard':
        this.golf.onMessage(m);
        break;
      case 'bloomed':
        this.hud.toast(`🌷 Your ${FLOWERS[m.flower].name} bloomed! Pick it in your garden.`, 4500);
        break;
      case 'gardenNote':
        this.hud.toast(m.text, 4000);
        break;
      case 'meditated':
        this.breathDone = true;
        this.breath.hide();
        this.hud.toast(m.kp ? `Breather done 🧘 +${m.kp} KP${m.companions ? ` (with ${m.companions})` : ''}` : 'Breather done 🧘 (KP again in a while)', 4000);
        break;
      case 'coffeeOffer':
        showGiftOffer(m.name, m.drink, m.stars, (accept) => this.send({ t: 'answerCoffee', fromId: m.fromId, accept }), m.flower);
        break;
      case 'giftReceived': {
        const ch = this.charOf(m.toId);
        if (ch) for (const [i, e] of ['💖', GIFTS[m.gift].emoji, '💕'].entries()) setTimeout(() => ch.overhead.pop(e, performance.now(), 0.45), i * 220);
        if (m.toId === this.me?.id) {
          const what = m.flower ? `a ${holdName({ item: 'bouquet', flower: m.flower })}` : aGift(m.gift);
          this.hud.toast(`${GIFTS[m.gift].emoji} ${m.fromName} sent you ${what}! It's on your keepsakes shelf.`, 5000);
        }
        break;
      }
      case 'balloonUp':
        this.releaseBalloon(m.x, m.z, m.color);
        break;
      case 'coffeeAnswer':
        this.hud.toast(m.accepted ? `${m.name} took your drink ☕💛` : `${m.name} said no thanks`, 3500);
        break;
      case 'toyState':
        this.toyStates[m.toyId] = m.state;
        if (this.driving?.toyId === m.toyId && (m.state.kind === 'rowboat' || m.state.kind === 'truck')) {
          this.driving.pose = { x: m.state.x, z: m.state.z, heading: m.state.heading }; // the server snapped us back
          this.driving.speed = 0;
          this.dw?.teleport(this.driving.pose);
        }
        break;
      case 'petMoved': {
        const pet = this.pets.get(m.id);
        if (pet) Object.assign(pet, { tx: m.x, tz: m.z, facing: m.facing, anim: m.anim });
        break;
      }
      case 'toyEvent':
        this.onToyEvent(m.toyId, m.by, m.action, m.arg);
        break;
      case 'tree':
        this.treeMinutes = m.minutes;
        for (const rt of this.runtimes.values()) rt.built.setTreeStage(treeStage(m.minutes));
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
      case 'gallery':
      case 'cabinState':
        this.art.onMessage(m);
        break;
    }
  }

  // ---------- scene & players ----------

  private enter(you: PlayerView, players: PlayerView[]): void {
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    for (const pet of this.pets.values()) pet.model.dispose();
    this.pets.clear();
    this.localPet = null;
    this.def = book.get(you.scene)!;
    this.fishing.stop();
    // a village or cabin from an older roster is rebuilt; cabins (there are many) aren't kept once you leave
    const stale = [...this.runtimes].filter(([id, r]) => !SCENES[id] && (r.version !== book.version || (cabinOwner(id) && id !== you.scene)));
    for (const [id] of stale) this.runtimes.delete(id);
    let rt = this.runtimes.get(you.scene);
    if (!rt) {
      const built = buildScene(this.def);
      const toys = new Map<string, ToyView>();
      for (const toy of this.def.toys) {
        const v = makeToyView(toy, this.def, this.fx);
        built.scene.add(v.root);
        toys.set(toy.id, v);
      }
      if (this.def.toys.some((t) => t.kind === 'truck')) built.scene.add(truckDustRoot);
      const props = this.def.props?.length ? new PropsView(this.def.props) : null;
      if (props) built.scene.add(props.root);
      const stageFx = this.def.stage ? new StageFx(this.def) : null;
      if (stageFx) built.scene.add(stageFx.root);
      const golf = this.def.toys.some((t) => t.kind === 'golfTee') ? new GolfCourse() : null;
      if (golf) built.scene.add(golf.root);
      rt = { built, toys, props, stageFx, golf, pops: new Floaters(built.scene), art: roomViews(this.def, built.scene), version: book.version };
      this.runtimes.set(you.scene, rt);
      built.setTreeStage(treeStage(this.treeMinutes));
    }
    this.rt = rt;
    this.scene = rt.built.scene;
    this.art.enter(this.def, rt.art);
    this.myChar ??= new Character(you.look, you.name, true);
    this.myChar.setLook(you.look);
    this.scene.add(this.myChar.root); // add() detaches it from the previous scene
    for (const [, r] of stale) disposeTree(r.built.scene);
    this.me = you;
    this.x = you.x;
    this.z = you.z;
    this.facing = you.facing;
    this.moving = false;
    this.standPending = false;
    this.sliding.clear();
    this.setTelescope(false);
    this.endDrive();
    this.driving = null;
    this.rig.zoomTo(1);
    this.syncRowing(you);
    for (const p of players) this.addRemote(p);
    this.rig.snap(this.x, this.z);
    this.hud.closeCard();
    this.hooks.enterScene(this.def, rt.built);
    this.minimap.setScene(this.def);
    if (this.voice) this.voice.stage = this.def.stage;
  }

  /** A cabin was added: if you are standing in the village, rebuild it around you (a latch flip shows on the next visit). Mailbox flags flip in place. */
  onVillage(cabins: CabinEntry[]): void {
    const flipped = mailFlags(this.cabins, cabins);
    this.cabins = cabins;
    if (this.def?.id !== 'village' || !this.me) return;
    if (book.get('village')!.doors.length !== this.def.doors.length) {
      const others = [...this.remotes.values()].map((r) => r.view);
      this.enter({ ...this.me, x: this.x, z: this.z, facing: this.facing }, others);
    }
    if (!flipped.length) return;
    const flags = new Map<string, THREE.Object3D>();
    this.scene?.traverse((o) => {
      if (o.name === 'flag' && o.parent) flags.set(`${o.parent.position.x},${o.parent.position.z}`, o);
    });
    for (const owner of flipped) {
      const toy = this.def.toys.find((t) => t.id === `mailbox-${owner}`);
      const flag = toy && flags.get(`${toy.x},${toy.z}`);
      if (flag) flag.rotation.z = cabins.find((c) => c.owner === owner)!.mail ? 0 : -1.4; // the mailbox decor's up/down poses
    }
  }

  private mailboxPrompt(toy: Toy): string {
    const owner = toy.id.slice('mailbox-'.length);
    if (owner === this.me?.id) return '[E] check your mail 📬';
    return `🔒 ${this.cabins.find((c) => c.owner === owner)?.name ?? 'Someone'}'s mailbox`;
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
    this.pets.get(id)?.model.dispose();
    this.pets.delete(id);
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
    if (prev.holding?.sips === 1 && !p.holding && performance.now() - this.sippedAt < 3000) this.hud.toast('All gone ☕', 2500);
    if (prev.session?.phase === 'focus' && p.session?.phase === 'break') {
      chime();
      this.hud.toast('✨ Session done! Break time ☕ Stretch, wander, grab a coffee.', 6000);
    }
    if (prev.session?.phase === 'break' && !p.session) {
      chime();
      this.hud.toast(p.slotId ? "Break's over! Press Space to start another round 📖" : "Break's over! Find a seat to start another round 📖", 6000);
    }
  }

  /** Starts or stops local steering (rowing, driving) to match the slot the server says we hold. */
  private syncRowing(p: PlayerView): void {
    const slot = p.slotId ? this.slotById(p.slotId) : undefined;
    if (!slot || !(CONTROLLER_POSES as readonly string[]).includes(slot.pose) || !slot.toyId) {
      if (this.driving) {
        const { toyId, kind, pose } = this.driving;
        // Keep the truck where we left it; the server's echo of the final pose follows.
        if (kind === 'truck') this.toyStates[toyId] = { kind: 'truck', ...pose, returnFrom: null };
        (this.rt?.toys.get(toyId) as VehicleView | undefined)?.setLocal(null);
        if (this.driving.kind === 'truck') this.rig.zoomTo(1);
      }
      this.endDrive();
      this.driving = null;
      return;
    }
    if (this.driving?.toyId === slot.toyId) return;
    const toy = this.toyById(slot.toyId)!;
    const st = this.toyStates[slot.toyId];
    const pose = st?.kind === 'rowboat' || st?.kind === 'truck' ? boatPoseAt(st, this.restPose(toy), serverNow()) : this.restPose(toy);
    this.driving = { toyId: slot.toyId, kind: toy.kind, pose: { ...pose }, speed: 0 };
    if (toy.kind === 'truck') {
      this.rig.zoomTo(1.35);
      this.startDrive(slot.toyId);
    }
  }

  /** Loads Rapier (first time only) and builds this truck's physics world at its current pose. */
  private startDrive(toyId: string): void {
    if (!this.rapierReady) this.hud.toast('Warming up the engine… 🔧', 2500);
    const def = this.def!;
    void loadRapier().then((R) => {
      this.rapierReady = true;
      if (this.driving?.toyId !== toyId || this.def !== def) return; // hopped out while it loaded
      this.dw?.dispose();
      this.dw = new DriveWorld(R, def, this.driving.pose);
    }).catch(() => this.hud.toast("The truck won't start right now 😕", 4000));
  }

  private endDrive(): void {
    this.dw?.dispose();
    this.dw = null;
    this.exiting = false;
    this.rt?.props?.resetAll();
  }

  private onError(code: ErrorCode, message: string): void {
    if ((code === 'bad_door' || code === 'locked') && this.transitioning) {
      this.x -= Math.sin(this.facing) * 0.8; // step back out of the doorway
      this.z -= Math.cos(this.facing) * 0.8;
      this.endTransition();
      if (code === 'locked') this.hud.toast(message);
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
    return kind === 'rowboat' || kind === 'merryGoRound' || kind === 'truck';
  }

  private restPose(toy: Toy): BoatPose {
    return { x: toy.x, z: toy.z, heading: toy.rot ?? 0 };
  }

  private toyCtx(toyId: string): ToyCtx {
    return { now: this.ctxNow, dt: this.ctxDt, state: this.toyStates[toyId], occupied: this.occupied, night: this.night };
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

  /** Today's date and the plots you've watered on it (the server allows once a day per plot). */
  private watered = { day: '', plots: new Set<string>() };

  private plotPrompt(toy: Toy): string | null {
    const s = this.toyStates[toy.id];
    const me = this.me;
    if (s?.kind !== 'plot' || !me) return null;
    if (!s.owner) {
      const mine = Object.values(this.toyStates).some((x) => x.kind === 'plot' && x.owner === me.id);
      return mine ? null : '[E] claim this plot 🌱';
    }
    if (s.owner === me.id) return '[E] tend your garden 🌷';
    const today = new Date().toDateString();
    if (this.watered.day === today && this.watered.plots.has(toy.id)) return `${s.ownerName}'s garden · watered today ✓`;
    return `[E] water ${s.ownerName}'s garden 💧`;
  }

  private usePlot(toy: Toy): void {
    const s = this.toyStates[toy.id];
    if (s?.kind !== 'plot' || !this.me) return;
    this.sendMove(performance.now());
    if (!s.owner) return this.send({ t: 'garden', toyId: toy.id, action: 'claim' });
    if (s.owner === this.me.id) return this.onOpenGarden(toy.id);
    const today = new Date().toDateString();
    if (this.watered.day !== today) this.watered = { day: today, plots: new Set() };
    if (this.watered.plots.has(toy.id)) return;
    this.watered.plots.add(toy.id);
    this.send({ t: 'garden', toyId: toy.id, action: 'water' });
    this.fx.sound('splash', toy.x, toy.z);
    this.hud.toast(`💧 You watered ${s.ownerName}'s garden`, 2500);
  }

  /** A balloon someone let go of, floating up and away for everyone in the scene. */
  private releaseBalloon(x: number, z: number, color: string): void {
    const pops = this.rt?.pops;
    if (!pops) return;
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.28, 14, 12), toonMat({ color }), 0, 0, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.8, 4), toonMat({ color: '#ffffff' }), 0, -0.68, 0, false));
    const drift = Math.random() * Math.PI * 2;
    pops.add(g, performance.now(), 8000, (o, k) => {
      o.position.set(x + Math.sin(drift) * k * 3 + Math.sin(k * 12) * 0.2, 1.4 + k * 18, z + Math.cos(drift) * k * 3);
      o.rotation.z = Math.sin(k * 10) * 0.2;
    });
  }

  toyState(id: string): ToyState | undefined {
    return this.toyStates[id];
  }

  /** Shows the breathing circle while you're on a cushion and your breather isn't done yet. */
  private updateBreath(slot: Slot | undefined, now: number): void {
    const toy = slot?.toyId ? this.toyById(slot.toyId) : undefined;
    if (!toy || toy.kind !== 'cushions') {
      this.breathSitAt = null;
      this.breathDone = false;
      this.breath.hide();
      return;
    }
    this.breathSitAt ??= now;
    const ring = this.toyStates[toy.id];
    if (this.breathDone || ring?.kind !== 'meditate' || ring.startedAt === null) return this.breath.hide();
    const others = (toy.slotIds ?? []).filter((id) => id !== slot!.id && this.occupied.has(id)).length;
    this.breath.update(now, ring.startedAt, this.breathSitAt, others);
  }

  private playNote(i: number): void {
    const slot = this.me?.slotId ? this.slotById(this.me.slotId) : undefined;
    const toy = slot?.toyId ? this.toyById(slot.toyId) : undefined;
    if (!toy || !PLAYABLE.has(toy.kind) || this.hud.modalOpen()) return;
    this.send({ t: 'use', toyId: toy.id, action: 'note', arg: i });
    this.rt?.toys.get(toy.id)?.onEvent?.({ action: 'note', arg: i, by: this.me!.id }, this.toyCtx(toy.id));
  }

  /** Creates, removes and moves pets to match everyone's PlayerView; your own runs its brain locally. */
  private updatePets(dt: number, nowP: number): void {
    const views: PlayerView[] = [this.me!, ...[...this.remotes.values()].map((r) => r.view)];
    const seen = new Set<string>();
    for (const v of views) {
      if (!v.pet) continue;
      seen.add(v.id);
      const key = `${v.pet.kind}|${v.pet.name}`;
      let pet = this.pets.get(v.id);
      if (pet && pet.key !== key) {
        pet.model.dispose();
        pet = undefined;
      }
      if (!pet) {
        const model = new PetModel(v.pet.kind, v.pet.name);
        this.scene!.add(model.root);
        pet = { model, key, x: v.pet.x, z: v.pet.z, facing: v.pet.facing, anim: v.pet.anim, tx: v.pet.x, tz: v.pet.z };
        this.pets.set(v.id, pet);
        if (v.id === this.me!.id) this.localPet = new LocalPet(v.pet.kind, v.pet.x, v.pet.z, (p) => this.send({ t: 'pet', ...p }));
      }
      if (v.id === this.me!.id && this.localPet) {
        const pois: Poi[] = [...this.scenePois()];
        for (const [id, r] of this.remotes) {
          pois.push({ kind: 'person', id, x: r.char.root.position.x, z: r.char.root.position.z });
          const op = this.pets.get(id);
          if (op) pois.push({ kind: 'pet', id: `pet:${id}`, x: op.x, z: op.z });
        }
        this.localPet.update(nowP, dt, {
          owner: { x: this.x, z: this.z, sitting: !!this.me!.slotId, studying: this.me!.session?.phase === 'focus' },
          colliders: [...this.def!.colliders, ...this.vehicleBoxes()],
          bounds: this.def!.size,
          pois,
          water: this.waterNear(this.x, this.z),
          isWater: (x, z) => this.isWater(x, z),
        });
        Object.assign(pet, { x: this.localPet.x, z: this.localPet.z, facing: this.localPet.facing, anim: this.localPet.anim });
      } else {
        const k = 1 - Math.exp(-dt * 10);
        pet.x += (pet.tx - pet.x) * k;
        pet.z += (pet.tz - pet.z) * k;
      }
      pet.model.root.position.set(pet.x, 0, pet.z);
      pet.model.update(dt, nowP, pet.anim, pet.facing);
    }
    for (const [id, pet] of this.pets) {
      if (seen.has(id)) continue;
      pet.model.dispose();
      this.pets.delete(id);
      if (id === this.me!.id) this.localPet = null;
    }
  }

  private poiCache: { def: SceneDef; list: Poi[] } | null = null;

  /** The scene's things a pet might find interesting (flowers, plants, toys, benches, rocks, water edges). */
  private scenePois(): Poi[] {
    const def = this.def!;
    if (this.poiCache?.def === def) return this.poiCache.list;
    const list: Poi[] = [];
    const kinds: Partial<Record<string, Poi['kind']>> = {
      flowers: 'flower', bush: 'plant', plant: 'plant', tree: 'plant', cherry: 'plant', pine: 'plant', bench: 'bench', rock: 'rock', soil: 'garden', lilyPad: 'water',
    };
    for (const d of def.decor) {
      const k = kinds[d.kind];
      if (k) list.push({ kind: k, x: d.x, z: d.z });
    }
    for (const t of def.toys) if (t.kind !== 'golfTee' && t.kind !== 'truck') list.push({ kind: 'toy', x: t.x, z: t.z + t.radius * 0.6 });
    const lake = def.water?.outline ?? [];
    for (let i = 0; i < lake.length; i += 2) list.push({ kind: 'water', x: lake[i][0], z: lake[i][1] });
    if (def.toys.some((t) => t.kind === 'koi')) list.push({ kind: 'water', x: KOI_POND.x, z: KOI_POND.z + KOI_POND.d / 2 + 0.3 });
    this.poiCache = { def, list };
    return list;
  }

  /** In the lake or the koi pond. */
  private isWater(x: number, z: number): boolean {
    const def = this.def!;
    if (def.water && pointInPolygon(def.water.outline, x, z)) return true;
    if (!def.toys.some((t) => t.kind === 'koi')) return false;
    const u = (x - KOI_POND.x) / (KOI_POND.w / 2);
    const v = (z - KOI_POND.z) / (KOI_POND.d / 2);
    return u * u + v * v < 1;
  }

  /** A spot a little way into the water near (x, z), for swimming pets (null if no water close by). */
  private waterNear(x: number, z: number): { x: number; z: number } | null {
    const def = this.def!;
    if (def.toys.some((t) => t.kind === 'koi') && Math.hypot(x - KOI_POND.x, z - KOI_POND.z) < 9) return { x: KOI_POND.x + 2, z: KOI_POND.z + 0.6 };
    const lake = def.water?.outline;
    if (!lake?.length) return null;
    let best = lake[0];
    for (const p of lake) if (Math.hypot(p[0] - x, p[1] - z) < Math.hypot(best[0] - x, best[1] - z)) best = p;
    if (Math.hypot(best[0] - x, best[1] - z) > 8) return null;
    const cx = lake.reduce((s, p) => s + p[0], 0) / lake.length;
    const cz = lake.reduce((s, p) => s + p[1], 0) / lake.length;
    const d = Math.hypot(cx - best[0], cz - best[1]) || 1;
    return { x: best[0] + ((cx - best[0]) / d) * 2.2, z: best[1] + ((cz - best[1]) / d) * 2.2 };
  }

  private badgeFor(v: PlayerView): string {
    if (v.dnd) return '🔕';
    if (!v.voice) return '';
    return this.voice?.isSpeaking(v.id) ? '🔊' : '🎙️';
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
      if (this.driving) this.steer(dt, a, pressing, nowP);
      else if (pressing && !this.standPending) this.requestStand();
      return;
    }
    if (this.telescope) {
      if (!pressing) return;
      this.setTelescope(false);
    }
    if (pressing && this.fishing.active) this.fishing.stop(); // walking off reels in
    if (!pressing) {
      this.stopMoving(nowP);
      return;
    }
    const r = moveWithCollision(this.x, this.z, a.x * MOVE_SPEED * dt, a.z * MOVE_SPEED * dt, PLAYER_RADIUS, [...def.colliders, ...this.vehicleBoxes()], def.size);
    this.x = r.x;
    this.z = r.z;
    this.facing = Math.atan2(a.x, a.z);
    this.moving = true;
    if (nowP - this.lastSent >= SEND_EVERY_MS) this.sendMove(nowP);
    const door = def.doors.find((d) => inBox(d.box, this.x, this.z));
    if (door) void this.goThrough(door.id);
  }

  /** Parked and moving trucks are solid for people walking around. */
  private vehicleBoxes(): { x: number; z: number; w: number; d: number }[] {
    const out = [];
    for (const toy of this.def!.toys) {
      if (toy.kind !== 'truck') continue;
      const p = this.rt?.toys.get(toy.id)?.pose?.(this.toyCtx(toy.id));
      if (!p) continue;
      const sideways = Math.abs(Math.sin(p.heading)) > 0.7; // pointing east or west
      out.push({ x: p.x, z: p.z, w: sideways ? 3.0 : 1.5, d: sideways ? 1.5 : 3.0 });
    }
    return out;
  }

  /** WASD steers whatever you're in. */
  private steer(dt: number, a: { x: number; z: number }, pressing: boolean, nowP: number): void {
    if (this.driving!.kind === 'truck') this.drive(dt, a, pressing, nowP);
    else this.row(dt, a, pressing, nowP);
  }

  /**
   * Driving runs the Rapier truck: W/S throttle (S brakes, then reverses), A/D steer. Walkers and
   * other trucks are blockers. Pose and spring tilt go to the server at the rowing rate.
   */
  private drive(dt: number, _a: { x: number; z: number }, _pressing: boolean, nowP: number): void {
    const v = this.driving!;
    const dw = this.dw;
    if (!dw) return; // the engine is still loading
    const wasMoving = this.moving;
    const keys = this.input.driveAxis();
    dw.input = this.exiting ? { throttle: 0, steer: 0, brake: true } : { throttle: keys.throttle, steer: keys.steer, brake: false };
    const walkers: { x: number; z: number }[] = [];
    for (const r of this.remotes.values()) if (!r.view.slotId) walkers.push({ x: r.char.root.position.x, z: r.char.root.position.z });
    const trucks: { id: string; x: number; z: number; heading: number }[] = [];
    for (const toy of this.def!.toys) {
      if (toy.kind !== 'truck' || toy.id === v.toyId) continue;
      const p = this.rt?.toys.get(toy.id)?.pose?.(this.toyCtx(toy.id));
      if (p) trucks.push({ id: toy.id, ...p });
    }
    dw.step(dt, walkers, trucks);
    const p = dw.pose();
    v.pose = { x: p.x, z: p.z, heading: p.heading };
    v.speed = Math.abs(p.speed);
    v.tilt = { y: p.y, pitch: p.pitch, roll: p.roll };
    this.rt?.props?.applyPhysics(dw.props(), nowP);
    if (this.exiting && v.speed < 1) {
      this.exiting = false;
      if (!this.standPending) this.requestStand();
    }
    this.moving = v.speed > 0.05 || Math.abs(p.y) > 0.02;
    if ((this.moving && nowP - this.lastSent >= ROW_SEND_MS) || (wasMoving && !this.moving)) {
      this.lastSent = nowP;
      this.send({ t: 'move', x: p.x, z: p.z, facing: p.heading, anim: 'sit', tilt: v.tilt });
    }
  }

  /** WASD steers the boat: turn towards the key direction, pull forward as you line up. */
  private row(dt: number, a: { x: number; z: number }, pressing: boolean, nowP: number): void {
    const r = this.driving!;
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
    if (this.fishing.active) return this.fishing.strike(performance.now());
    if (this.me.slotId) {
      if (this.dw && this.driving && this.driving.speed > 1) {
        this.exiting = true; // brake to a stop first, then hop out (see drive)
        return;
      }
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
      if (t.toy.kind === 'fishing') return this.cast(t.toy);
      if (LOCAL_TOYS.includes(t.toy.kind)) return this.onLocalToy(t.toy);
      if (t.toy.kind === 'plot') return this.usePlot(t.toy);
      if (t.toy.kind === 'golfTee') return this.golf.tee(Number(t.toy.id.split('-').pop()));
      const action = TOY_DEFAULT_ACTION[t.toy.kind];
      if (!action) return;
      this.sendMove(performance.now());
      this.send({ t: 'use', toyId: t.toy.id, action });
      return;
    }
    if (t.kind === 'spot') return this.art.use(t.spot, this.onSpot);
    if (t.kind === 'critter') return this.net(t.id, t.critter);
    const r = this.remotes.get(t.id);
    if (r) this.hud.openPlayerCard(r.view, (kind: EmoteKind) => this.send({ t: 'emote', kind, targetId: t.id }));
  }

  private hour(): number {
    return Math.floor(clockHours(new Date(), this.timeOverride));
  }

  /** Swing the net at a critter: it's gone for a minute and the server hears what you caught. */
  private net(id: number, kind: LifeKind): void {
    const now = performance.now();
    if (now - this.nettedAt < BUG_GAP_MS) return;
    this.nettedAt = now;
    this.myChar?.swingNet(now);
    this.hooks.hideCritter(id, CRITTER_HIDE_MS);
    const hour = this.hour();
    const species = pickSpecies(bugsOf(kind), { night: isNight(hour), raining: this.weather?.kind === 'rain' });
    if (species) this.send({ t: 'catch', kind: 'bug', species, hour });
  }

  /** A critter in net reach that has a bug you could catch right now (snails only in the rain). */
  private critterTarget(): Target | null {
    const c = this.hooks.nearestCritter(this.x, this.z);
    const ids = c ? bugsOf(c.kind) : [];
    const now = { night: isNight(this.hour()), raining: this.weather?.kind === 'rain' };
    if (!c || !ids.some((id) => possible(id, now))) return null;
    const s = SPECIES[ids[0]];
    return { kind: 'critter', id: c.id, critter: c.kind, prompt: `[E] catch the ${s.name} ${s.emoji}`, dist: 0 };
  }

  /** Face the lake and cast 3 m out. */
  private cast(toy: Toy): void {
    const dir = towardWater({ ...toy, x: this.x, z: this.z }, this.def!);
    this.facing = Math.atan2(dir.x, dir.z);
    this.sendMove(performance.now());
    if (this.myChar) this.fishing.start(this.myChar.root, this.x, this.z, dir, performance.now());
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

  /** The closest other player within range, if any. */
  private nearestPlayer(range: number): Remote | null {
    let best: Remote | null = null;
    let bestD = range;
    for (const r of this.remotes.values()) {
      const d = Math.hypot(r.char.root.position.x - this.x, r.char.root.position.z - this.z);
      if (d <= bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  private promptText(): string | null {
    const me = this.me!;
    if (this.transitioning) return null;
    const golfing = this.golf.prompt();
    if (golfing) return golfing;
    if (this.telescope) return '✨ Stargazing… [E] or move to stop';
    const fishing = this.fishing.prompt(performance.now());
    if (fishing) return fishing;
    if (me.slotId) {
      const slot = this.slotById(me.slotId);
      if (slot && !slot.deskId) {
        if (this.driving) return this.driving.kind === 'truck' ? '[W/S] drive · [A/D] steer · [H] honk · [E] hop out' : '[WASD] row · [E] get out';
        const toy = slot.toyId ? this.toyById(slot.toyId) : undefined;
        if (toy && PLAYABLE.has(toy.kind)) return '[1–8] play · [E] stand up';
        if (toy?.kind === 'cushions') return this.breathDone ? '🧘 Done for now · [E] stand up' : 'Breathe along… [E] stand up';
        return toy ? '[E] hop off' : '[E] stand up';
      }
      if (me.session?.phase === 'focus') return 'Focusing… [E] leave early';
      if (me.session?.phase === 'break') return '[Space] start another round · [E] stand up';
      return '[Space] start a study session · [E] stand up';
    }
    const t = this.target;
    if (t?.kind === 'toy' || t?.kind === 'spot' || t?.kind === 'critter') return t.prompt;
    if (t?.kind === 'slot') return slotPrompt(t.slot, t.slot.toyId ? this.toyById(t.slot.toyId) : undefined);
    const cup = me.holding;
    const drink = cup && cup.item !== 'gift' && cup.item !== 'bouquet' ? cup : null;
    if (t?.kind === 'player') return `[E] say hi to ${this.remotes.get(t.id)?.view.name ?? 'them'}${drink ? ` · [G] give your ${holdName(drink)}` : ''}`;
    // Only drinks are carried now (gifts and bouquets live in the bag).
    if (cup && cup.item !== 'gift' && cup.item !== 'bouquet') return `[C] sip your ${cup.item} (${cup.sips} left) · [G] give it to someone`;
    return null;
  }

  // ---------- frame ----------

  private resize(): void {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.rig.resize(innerWidth, innerHeight);
    this.post?.resize();
  }

  /** How far someone is from you, if they're in the same place (for the bag's people list). */
  distanceTo(id: string): number | null {
    const r = this.remotes.get(id);
    return r ? Math.hypot(r.char.root.position.x - this.x, r.char.root.position.z - this.z) : null;
  }

  toggleMap(): void {
    this.minimap.toggle();
  }

  /** A mini-golf hole is being played (finger drags putt instead of walking). */
  golfing(): boolean {
    return this.golf.active !== null;
  }

  /** The hint currently shown (also drives the touch buttons). */
  currentPrompt(): string | null {
    return this.me ? this.promptText() : null;
  }

  /** High (night glow, cloud shadows) or Lite; remembered on this device. */
  toggleQuality(): Quality {
    this.quality = this.quality === 'high' ? 'lite' : 'high';
    localStorage.setItem(QUALITY_KEY, this.quality);
    this.post.high = this.quality === 'high';
    this.hud.toast(this.quality === 'high' ? 'Graphics: High ✨' : 'Graphics: Lite 🍃', 2000);
    return this.quality;
  }

  private frame(): void {
    const nowP = performance.now();
    const dt = Math.min((nowP - this.last) / 1000, 0.1);
    this.last = nowP;
    if (!this.me || !this.def || !this.scene || !this.myChar || !this.rt) return;
    const sNow = serverNow();
    this.ctxNow = sNow;
    this.ctxDt = dt;
    this.night = this.def.theme.indoor ? 0 : skyAt(clockHours(new Date(), this.timeOverride)).night;
    this.updateLocal(dt, nowP);

    this.occupied = new Set<string>();
    if (this.me.slotId) this.occupied.add(this.me.slotId);
    for (const r of this.remotes.values()) if (r.view.slotId) this.occupied.add(r.view.slotId);

    for (const [id, view] of this.rt.toys) {
      if (this.driving?.toyId === id) (view as VehicleView).setLocal(this.driving.pose, this.driving.speed, this.driving.tilt);
      view.update(this.toyCtx(id));
    }
    if (this.rt.props && !this.dw) {
      const trucks: { x: number; z: number; heading: number; speed: number }[] = [];
      for (const toy of this.def.toys) {
        if (toy.kind !== 'truck') continue;
        const v = this.rt.toys.get(toy.id) as VehicleView | undefined;
        const p = v?.pose?.(this.toyCtx(toy.id));
        if (v && p) trucks.push({ ...p, speed: v.speedNow() });
      }
      this.rt.props.update(nowP, dt, trucks);
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
      r.char.active = slot?.pose === 'row' || slot?.pose === 'drive';
      if (slot) ({ x, y, z, facing } = this.riderSpot(slot));
      else if (slide) {
        const s = this.slideSpot(slide, nowP);
        ({ x, y, z } = s);
        facing = 0;
        r.char.anim = s.y > 0.2 ? 'sit' : 'idle';
        r.char.pose = 'ride';
        if (s.done) this.sliding.delete(id);
      }
      if (!slot && !slide) y = floorY(this.def, x, z);
      r.char.root.position.set(x, y, z);
      r.char.facing = facing;
      r.char.setDim(!r.view.connected);
      r.char.overhead.setBadge(this.badgeFor(r.view));
      r.char.setHolding(r.view.holding?.item ?? null, r.view.holding?.flower, r.view.holding?.gift, r.view.mug ?? DEFAULT_MUG);
      r.char.overhead.setStatus(moodText(r.view.status));
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
    c.active = (mySlot?.pose === 'row' || mySlot?.pose === 'drive') && this.moving;
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
    } else if (!mySlot) {
      y = floorY(this.def, this.x, this.z);
    }
    c.root.position.set(this.x, y, this.z);
    this.updateBreath(mySlot, sNow);
    if (this.rt.stageFx && this.def.stage) {
      const st = this.def.stage.stage;
      const on = inBox(st, this.x, this.z) || [...this.remotes.values()].some((r) => inBox(st, r.char.root.position.x, r.char.root.position.z));
      this.rt.stageFx.update(dt, on, this.night);
    }
    c.facing = this.facing;
    c.overhead.setSession(this.me.session, sNow);
    c.overhead.setRain(this.me.rainUntil > sNow);
    c.overhead.setBadge(this.badgeFor(this.me));
    this.voice?.update(
      { id: this.me.id, x: this.x, z: this.z, voice: this.me.voice, dnd: this.me.dnd },
      [...this.remotes.values()].map((r) => ({ id: r.view.id, x: r.char.root.position.x, z: r.char.root.position.z, voice: r.view.voice && r.view.connected, dnd: r.view.dnd })),
    );
    c.setHolding(this.me.holding?.item ?? null, this.me.holding?.flower, this.me.holding?.gift, this.me.mug ?? DEFAULT_MUG);
    c.overhead.setStatus(moodText(this.me.status));
    c.update(dt, nowP);

    if (this.transitioning || this.me.slotId || mySlide || this.telescope) {
      this.target = null;
    } else {
      const placed: PlacedSlot[] = this.def.slots.map((slot) => {
        const spot = slot.toyId ? this.riderSpot(slot) : slot;
        return { slot, x: spot.x, z: spot.z };
      });
      const toys = this.def.toys.map((toy) => ({ toy, prompt: toy.kind === 'plot' ? this.plotPrompt(toy) : toy.kind === 'mailbox' ? this.mailboxPrompt(toy) : toyPrompt(toy, this.toyStates[toy.id]) }));
      this.target = pickTarget(this.x, this.z, placed, this.occupied, toys, others, this.art.targets(this.me.id)) ?? this.critterTarget();
    }
    this.hud.setPrompt(this.promptText());
    this.onFrame();
    this.hud.latch = this.art.latch(this.me.id);
    this.hud.setStatus(this.me, this.def, sNow);

    const cardId = this.hud.cardTarget();
    if (cardId) {
      const r = this.remotes.get(cardId);
      const far = !r || Math.hypot(r.char.root.position.x - this.x, r.char.root.position.z - this.z) > INTERACT_RADIUS + 1;
      if (far) this.hud.closeCard();
      else this.hud.updateCard(statusText(r.view, sNow));
    }

    this.rt.golf?.update(sNow);
    this.golf.update(dt, sNow);
    this.fishing.update(nowP);
    this.rt.pops.update(performance.now());
    const focus = this.golf.focus();
    this.rig.follow(focus?.x ?? this.x, focus?.z ?? this.z, dt);
    const built = this.rt.built;
    built.sway.value = nowP / 1000;
    followSun(built, this.x, this.z);
    updateFades(built, this.x, this.z, dt);
    this.updatePets(dt, nowP);
    const vehicles: MapVehicle[] = [];
    for (const toy of this.def.toys) {
      if (toy.kind !== 'rowboat' && toy.kind !== 'truck') continue;
      const p = this.rt.toys.get(toy.id)?.pose?.(this.toyCtx(toy.id));
      if (p) vehicles.push({ x: p.x, z: p.z, heading: p.heading, icon: toy.kind === 'truck' ? '🛻' : '🚣' });
    }
    this.minimap.draw(nowP, { x: this.x, z: this.z, facing: this.facing, color: this.me.look.body },
      [...this.remotes.values()].map((r) => ({ x: r.char.root.position.x, z: r.char.root.position.z, color: r.view.look.body })), vehicles);
    const brolly = built.outdoor && this.weather?.kind === 'rain';
    this.myChar?.setUmbrella(brolly);
    for (const r of this.remotes.values()) r.char.setUmbrella(brolly);
    this.hooks.frame({ def: this.def, built, now: sNow, dt, me: { x: this.x, z: this.z }, toyStates: this.toyStates, weather: this.weather?.kind ?? null, quality: this.quality });
    CLOUDS.t.value = nowP / 1000;
    CLOUDS.k.value = this.quality === 'high' && !this.def.theme.indoor ? 0.2 * (1 - this.night) : 0;
    this.post.render(this.scene, this.rig.camera, this.night);
    if (!this.drawnOnce) {
      this.drawnOnce = true;
      requestAnimationFrame(() => this.onFirstFrame()); // after it's actually on screen
    }
    if (this.slowFrames.update(dt, nowP, this.quality)) this.hud.toast('Running a bit slow? The ✨ button switches to Lite graphics 🍃', 6000);
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
    case 'drive': return '[E] drive the truck';
    default:
      if (toy.kind === 'piano') return '[E] sit at the piano';
      if (PLAYABLE.has(toy.kind)) return `[E] play the ${INSTRUMENT_NAMES[toy.kind]}`;
      if (toy.kind === 'cushions') return '[E] sit and breathe (5 min)';
      if (toy.kind === 'campfire') return '[E] sit by the fire';
      if (toy.kind === 'rowboat' || toy.kind === 'truck') return '[E] hop in the back';
      return '[E] sit down';
  }
}
