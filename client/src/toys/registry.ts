import type * as THREE from 'three';
import type { SceneDef, Slot, Toy } from '../../../shared/scenes/types';
import type { BoatPose, ToyAction, ToyKind, ToyState } from '../../../shared/toys';
import type { SoundKind } from '../audio/kinds';
import { bellView, chimesView, jukeboxView, pianoView } from './music';
import { merryGoRoundView, seesawView, slideView, swingView } from './playground';
import { boardView, coffeeView, easelView, galleryView, observatoryView, postBoxView, giftShopView, photoBoothView, quotesView, shopView, wheelView } from './local';
import { campfireView, telescopeView } from './misc';
import { truckView } from './truck';
import { plotView } from './garden';
import { golfBoardView } from '../golf/course';
import { HOLES } from '../../../shared/golf';
import { Group } from 'three';
import { cairnView, cushionsView, drumsView, guitarView, keysView, koiView, stageScreenView } from './park';
import { ducksView, fountainView, rowboatView, stonesView } from './water';

export interface ToyCtx {
  /** Server time, ms. */
  now: number;
  dt: number;
  state?: ToyState;
  /** Slot ids with someone in them. */
  occupied: Set<string>;
  /** 0 by day, 1 at night. */
  night: number;
}

export interface ToyEvent {
  action: ToyAction;
  arg?: number;
  by: string;
}

/** What toys can ask of the game: sounds, speech bubbles, the ducks, where a player stands. */
export interface ToyFx {
  sound(kind: SoundKind, x: number, z: number, arg?: number): void;
  say(byId: string, text: string): void;
  feedDucks(x: number, z: number): void;
  playerPos(id: string): { x: number; z: number } | null;
}

export interface ToyView {
  root: THREE.Object3D;
  update(ctx: ToyCtx): void;
  /** Current pose, used to place riders (boats, merry-go-round). Defaults to the rest pose. */
  pose?(ctx: ToyCtx): BoatPose;
  /** Extra rider offset (lift, swing arc) applied after slotWorld. */
  riderOffset?(slot: Slot, ctx: ToyCtx): { dx: number; dy: number; dz: number };
  onEvent?(e: ToyEvent, ctx: ToyCtx): void;
}

/** What pressing E on the toy (not one of its seats) does. */
export const TOY_DEFAULT_ACTION: Partial<Record<ToyKind, ToyAction>> = {
  merryGoRound: 'push', slide: 'slide', jukebox: 'next', ducks: 'feed', fountain: 'coin',
  bell: 'ring', chimes: 'ring', stones: 'skip', campfire: 'toggle', koi: 'feed', cairn: 'stack',
};

/** HUD prompt for pressing E on the toy itself, or null if it is only something you sit in. */
export function toyPrompt(toy: Toy, state?: ToyState): string | null {
  switch (toy.kind) {
    case 'merryGoRound': return '[E] give it a spin';
    case 'slide': return '[E] go down the slide';
    case 'jukebox': {
      const track = state?.kind === 'jukebox' ? state.track : 0;
      return track === 0 ? '[E] turn on the jukebox' : track === 3 ? '[E] turn off the jukebox' : '[E] next song';
    }
    case 'ducks': return '[E] feed the ducks';
    case 'fountain': return '[E] toss a coin';
    case 'bell': return '[E] ring the bell';
    case 'chimes': return '[E] ring the chimes';
    case 'stones': return '[E] skip a stone';
    case 'campfire': return state?.kind === 'campfire' && state.lit ? '[E] put out the fire' : '[E] light the fire';
    case 'telescope': return '[E] look at the sky';
    case 'shop': return '[E] browse the Boutique';
    case 'board': return '[E] read the notice board';
    case 'quotes': return '[E] pull a book off the shelf';
    case 'coffee': return '[E] make a coffee';
    case 'koi': return '[E] feed the koi';
    case 'cairn': return '[E] add a stone to the cairn';
    case 'stageScreen': return '[E] change the stage screen';
    case 'giftShop': return '[E] browse the gift stall 🎁';
    case 'easel': return '[E] paint something 🎨';
    case 'gallery': return '[E] browse the gallery 🖼️';
    case 'photoBooth': return '[E] take a photo 📸';
    case 'wheel': return '[E] throw a mug 🏺';
    case 'postBox': return '[E] write a letter ✉️';
    case 'observatory': return '[E] look at the stars 🔭';
    case 'golfTee': {
      const h = HOLES[Number(toy.id.split('-').pop()) - 1];
      return h ? `[E] play hole ${h.n} · ${h.name} (par ${h.par}) ⛳` : null;
    }
    default: return null;
  }
}

export function makeToyView(toy: Toy, def: SceneDef, fx: ToyFx): ToyView {
  const v = build(toy, def, fx);
  v.root.position.set(toy.x, 0, toy.z);
  v.root.rotation.y = toy.rot ?? 0;
  return v;
}

function build(toy: Toy, def: SceneDef, fx: ToyFx): ToyView {
  switch (toy.kind) {
    case 'swing': return swingView(toy, def);
    case 'seesaw': return seesawView(toy);
    case 'merryGoRound': return merryGoRoundView(toy);
    case 'slide': return slideView();
    case 'piano': return pianoView(toy, fx);
    case 'jukebox': return jukeboxView();
    case 'bell': return bellView(toy, fx);
    case 'chimes': return chimesView(toy, fx);
    case 'fountain': return fountainView(toy, fx);
    case 'stones': return stonesView(toy, def, fx);
    case 'ducks': return ducksView(toy, def, fx);
    case 'rowboat': return rowboatView(toy);
    case 'campfire': return campfireView();
    case 'telescope': return telescopeView();
    case 'shop': return shopView();
    case 'board': return boardView();
    case 'quotes': return quotesView();
    case 'coffee': return coffeeView();
    case 'truck': return truckView(toy, fx);
    case 'koi': return koiView(toy, fx);
    case 'cairn': return cairnView(toy, fx);
    case 'cushions': return cushionsView();
    case 'drums': return drumsView(toy, fx);
    case 'guitar': return guitarView(toy, fx);
    case 'keys': return keysView(toy, fx);
    case 'stageScreen': return stageScreenView();
    case 'plot': return plotView(toy);
    case 'golfBoard': return golfBoardView();
    case 'giftShop': return giftShopView();
    case 'easel': return easelView();
    case 'gallery': return galleryView();
    case 'photoBooth': return photoBoothView();
    case 'wheel': return wheelView();
    case 'golfTee': return { root: new Group(), update() {} }; // the course draws the tee
    case 'postBox': return postBoxView();
    case 'observatory': return observatoryView();
    case 'mailbox': return { root: new Group(), update() {} }; // the decor draws it
  }
}
