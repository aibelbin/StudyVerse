import type { Mug } from './mug';
import type { Tilt } from './toys';
import type { CabinEntry, CabinState, PaintingMeta, PaintMode, SpotPick } from './art';
import type { Letter } from './mail';
import type { Constellation } from './stars';

export type GardenAction = 'claim' | 'plant' | 'water' | 'harvest' | 'vase';

/** What an admin can ask for (checked on the server). Minutes null = for good / until cleared. */
export type AdminAction =
  | { action: 'list' }
  | { action: 'kick'; id: string }
  | { action: 'ban'; id: string; minutes: number | null }
  | { action: 'unban'; id: string }
  | { action: 'mute'; id: string; minutes: number }
  | { action: 'unmute'; id: string }
  | { action: 'goto'; id: string }
  | { action: 'sendHome'; id: string }
  | { action: 'feature'; feature: Feature; on: boolean }
  | { action: 'announce'; text: string }
  | { action: 'deleteChat'; id: number }
  | { action: 'deleteNote'; id: number }
  | { action: 'deleteLetter'; id: number }
  | { action: 'clearStage' };
export const GARDEN_ACTIONS: GardenAction[] = ['claim', 'plant', 'water', 'harvest', 'vase'];
import type { ToyAction, ToyState } from './toys';
import type { Flower } from './garden';
import type { AdminPlayer, BagItem, Feature, Features, Gift } from './gifts';
import type { Act, Anim, ChatMsg, Drink, EmoteKind, HoldItem, FeedEvent, Look, Note, OnlineEntry, PetKind, PetView, PlayerView, Wallet } from './types';

export type ClientMsg =
  | { t: 'hello'; token?: string; inviteCode?: string; name?: string; look?: Look }
  | { t: 'move'; x: number; z: number; facing: number; anim: Anim; tilt?: Tilt }
  | { t: 'enterScene'; doorId: string }
  | { t: 'sit'; slotId: string }
  | { t: 'stand' }
  | { t: 'startSession'; focusMin: number; breakMin: number }
  | { t: 'cancelSession' }
  | { t: 'emote'; kind: EmoteKind; targetId?: string }
  | { t: 'updateLook'; look: Look }
  | { t: 'use'; toyId: string; action: ToyAction; arg?: number }
  | { t: 'buy'; itemId: string }
  | { t: 'getNotes' }
  | { t: 'postNote'; text: string }
  | { t: 'deleteNote'; id: number }
  | { t: 'setDnd'; on: boolean }
  | { t: 'brew'; drink: Drink; stars: number }
  | { t: 'sip' }
  | { t: 'chat'; text: string; to?: string }
  | { t: 'react'; id: number; emoji: string }
  | { t: 'act'; kind: Act }
  | { t: 'stageText'; text: string }
  | { t: 'garden'; toyId: string; action: GardenAction; spot?: number; flower?: Flower }
  | { t: 'buySeed'; flower: Flower }
  | { t: 'golfTee'; hole: number }
  | { t: 'golfShot'; hole: number; penalty?: boolean }
  | { t: 'golfBall'; x: number; y: number; z: number }
  | { t: 'golfHoled'; hole: number }
  | { t: 'golfPickUp'; hole: number }
  | { t: 'golfQuit' }
  | { t: 'buyGift'; gift: Gift }
  | { t: 'sendGift'; to: string; gift: Gift }
  | { t: 'useKeepsake'; id: number }
  /** Give something from your bag to someone (anywhere in town). */
  | { t: 'giveItem'; id: number; to: string }
  | { t: 'setStatus'; emoji: string; text: string; minutes: number | null }
  | ({ t: 'admin' } & AdminAction)
  | { t: 'offerCoffee'; to: string }
  | { t: 'answerCoffee'; fromId: string; accept: boolean }
  | { t: 'setVoice'; on: boolean }
  | { t: 'adoptPet'; kind: PetKind; name: string }
  | { t: 'setPetOut'; on: boolean }
  | { t: 'pet'; x: number; z: number; facing: number; anim: PetView['anim'] }
  /** WebRTC signalling for proximity voice, relayed to one player in the same scene. */
  | { t: 'rtc'; to: string; data: string }
  | { t: 'throwMug'; mug: Mug }
  | { t: 'paint'; title: string; price: number; forSale: boolean; mode: PaintMode; png: string }
  | { t: 'setSale'; id: number; on: boolean }
  | { t: 'buyPrint'; id: number }
  | { t: 'getGallery' }
  | { t: 'getPortfolio' }
  | { t: 'cabin'; action: 'place'; spot: string; item: SpotPick }
  | { t: 'cabin'; action: 'clear'; spot: string }
  | { t: 'cabin'; action: 'lock'; on: boolean }
  | { t: 'sendLetter'; to: string; text: string }
  | { t: 'getMail' }
  /** Marks all your letters read. */
  | { t: 'readMail' }
  | { t: 'deleteLetter'; id: number }
  | { t: 'saveConstellation'; name: string; edges: [number, number][] };

export type ErrorCode =
  | 'bad_art'
  | 'bad_letter'
  | 'bad_star'
  | 'bad_mug'
  | 'locked'
  | 'bad_cabin'
  | 'bad_invite'
  | 'unknown_token'
  | 'bad_profile'
  | 'slot_taken'
  | 'bad_slot'
  | 'not_seated'
  | 'bad_session'
  | 'bad_door'
  | 'connected_elsewhere'
  | 'bad_toy'
  | 'bad_look'
  | 'bad_item'
  | 'no_kp'
  | 'bad_note'
  | 'bad_gift'
  | 'chat_slow'
  | 'bad_chat'
  | 'bad_stage'
  | 'bad_garden'
  | 'bad_golf'
  | 'kicked'
  | 'banned'
  | 'muted'
  | 'feature_off'
  | 'not_admin';

export type ServerMsg =
  | { t: 'village'; cabins: CabinEntry[] }
  /** A letter just arrived for you. */
  | { t: 'letter'; letter: Letter }
  /** Your inbox, newest first. */
  | { t: 'mail'; letters: Letter[] }
  | { t: 'sky'; constellations: Constellation[] }
  | { t: 'gallery'; forSale: PaintingMeta[]; photos: PaintingMeta[] }
  | { t: 'portfolio'; mine: PaintingMeta[]; prints: PaintingMeta[] }
  | { t: 'cabinState'; state: CabinState }
  | { t: 'chat'; msg: ChatMsg }
  | { t: 'chatReact'; id: number; reactions: Record<string, string[]> }
  | { t: 'act'; fromId: string; kind: Act }
  | { t: 'coffeeOffer'; fromId: string; name: string; drink: HoldItem; stars: number; flower?: Flower }
  /** One of your garden flowers reached bloom. */
  | { t: 'bloomed'; flower: Flower }
  /** Something happened in your garden while you were away from it (e.g. a friend watered it). */
  | { t: 'gardenNote'; text: string }
  | { t: 'golfBall'; id: string; hole: number; x: number; y: number; z: number }
  /** Someone finished a hole (strokes 7 = picked up). */
  | { t: 'golfDone'; id: string; hole: number; strokes: number; holeInOne: boolean }
  | { t: 'golfGone'; id: string }
  /** Your scorecard: strokes per hole (null = not played yet this round). */
  | { t: 'golfCard'; card: (number | null)[]; hole: number | null; strokes: number }
  | { t: 'coffeeAnswer'; name: string; accepted: boolean }
  /** Your breather on the cushions is done; kp is 0 if you already had one this hour. */
  | { t: 'meditated'; kp: number; companions: number }
  | {
      t: 'welcome';
      cabins: CabinEntry[];
      you: PlayerView;
      token?: string;
      serverTime: number;
      players: PlayerView[];
      online: OnlineEntry[];
      feed: FeedEvent[];
      toys: Record<string, ToyState>;
      wallet: Wallet;
      /** The whole town's focus minutes today (the knowledge tree). */
      treeMinutes: number;
      /** STUN/TURN servers for voice chat. */
      ice: IceServer[];
      /** Recent Everyone messages and this player's DMs, oldest first. */
      chat: ChatMsg[];
      /** Which town features the admins have switched on. */
      features: Features;
      /** Your bag: gifts and bouquets. */
      bag: BagItem[];
      /** How many of your letters are unread. */
      unread: number;
      constellations: Constellation[];
    }
  | { t: 'bag'; items: BagItem[] }
  | { t: 'giftReceived'; fromId: string; fromName: string; toId: string; gift: Gift; flower?: Flower }
  | { t: 'balloonUp'; x: number; z: number; color: string }
  | { t: 'features'; features: Features }
  | { t: 'announce'; text: string }
  | { t: 'chatDelete'; id: number }
  | { t: 'adminList'; players: AdminPlayer[] }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'sceneSnapshot'; scene: string; you: PlayerView; players: PlayerView[]; toys: Record<string, ToyState> }
  | { t: 'playerJoined'; player: PlayerView }
  | { t: 'playerLeft'; id: string }
  | { t: 'playerMoved'; id: string; x: number; z: number; facing: number; anim: Anim }
  | { t: 'playerUpdated'; player: PlayerView }
  | { t: 'emote'; fromId: string; kind: EmoteKind; targetId?: string }
  | { t: 'online'; list: OnlineEntry[] }
  | { t: 'feed'; event: FeedEvent }
  | { t: 'toyEvent'; toyId: string; by: string; action: ToyAction; arg?: number; at: number }
  | { t: 'toyState'; toyId: string; state: ToyState }
  | { t: 'wallet'; wallet: Wallet }
  | { t: 'tree'; minutes: number }
  | { t: 'notes'; list: Note[] }
  | { t: 'rtc'; from: string; data: string }
  | { t: 'petMoved'; id: string; x: number; z: number; facing: number; anim: PetView['anim'] };

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
