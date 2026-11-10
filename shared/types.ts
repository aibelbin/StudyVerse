import { FLOWERS, type Flower } from './garden';
import { GIFTS, type Gift, type Keepsake, type Status } from './gifts';
export type Eyes = 'dot' | 'happy' | 'sleepy';
export type OutfitSlot = 'hat' | 'top' | 'face' | 'back' | 'neck';

/** A round blob's look: body colour ('#rrggbb'), eye style, and one wardrobe item id (or 'none') per slot. */
export interface Look {
  body: string;
  eyes: Eyes;
  hat: string;
  top: string;
  face: string;
  back: string;
  neck: string;
}

export type Anim = 'idle' | 'walk' | 'sit';

/** What a pet is doing (everyone sees the same moves). */
export type PetAnim =
  | 'idle' | 'walk' | 'run' | 'sit' | 'sleep' | 'sniff' | 'play' | 'pounce' | 'zoom'
  | 'hop' | 'binky' | 'flop' | 'swim' | 'quack' | 'leap' | 'tongue' | 'croak';
export const PET_ANIMS: PetAnim[] = [
  'idle', 'walk', 'run', 'sit', 'sleep', 'sniff', 'play', 'pounce', 'zoom', 'hop', 'binky', 'flop', 'swim', 'quack', 'leap', 'tongue', 'croak',
];
export type Phase = 'focus' | 'break';

export interface Session {
  phase: Phase;
  focusMin: number;
  breakMin: number;
  /** Server epoch ms when the current phase began. */
  phaseStartedAt: number;
}

/** Everything other clients may know about a player. */
export interface PlayerView {
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
  connected: boolean;
  /** Server epoch ms until which the rain cloud shows; 0 = none. */
  rainUntil: number;
  /** Do not disturb: no cheers, no voice. */
  dnd: boolean;
  /** Opted in to proximity voice chat. */
  voice: boolean;
  /** A drink (or a bouquet from the garden) in hand. */
  holding: Holding | null;
  pet: PetView | null;
  /** "🍜 Eating" and so on; null when not set. */
  status: Status | null;
  /** The newest keepsakes (gifts received), and how many in all. */
  keepsakes: Keepsake[];
  keepsakeCount: number;
}

export type Drink = 'espresso' | 'latte' | 'matcha' | 'cocoa';
export type HoldItem = Drink | 'bouquet' | 'gift';
export interface Holding {
  item: HoldItem;
  stars: number;
  sips: number;
  /** For a bouquet: which flowers. */
  flower?: Flower;
  /** For a gift from the stall: which one. */
  gift?: Gift;
}

/** "latte", or "bouquet of roses". */
export function holdName(h: { item: HoldItem; flower?: Flower; gift?: Gift }): string {
  if (h.item === 'gift') return h.gift ? GIFTS[h.gift].name : 'gift';
  return h.item === 'bouquet' ? `bouquet of ${h.flower ? FLOWERS[h.flower].plural : 'flowers'}` : h.item;
}
export const DRINKS: Drink[] = ['espresso', 'latte', 'matcha', 'cocoa'];

export interface PetView {
  kind: PetKind;
  name: string;
  x: number;
  z: number;
  facing: number;
  anim: PetAnim;
}

export interface OnlineEntry {
  id: string;
  name: string;
  scene: string;
  status?: Status | null;
}

export type FeedKind = 'arrive' | 'leave' | 'start' | 'finish' | 'quit' | 'cheer' | 'coffee' | 'gift' | 'meditate' | 'garden' | 'golf' | 'giftSent' | 'art';

export interface FeedEvent {
  kind: FeedKind;
  text: string;
  at: number;
}

export type EmoteKind = 'wave' | 'clap' | 'flex' | 'coffee';

export type PetKind = 'duckling' | 'kitten' | 'bunny' | 'frog';

export interface PetInfo {
  kind: PetKind;
  name: string;
}

/** Private to its owner: Knowledge Points, streak, wardrobe items and pets owned. */
export interface Wallet {
  kp: number;
  streak: number;
  owned: string[];
  pets: PetKind[];
  pet: PetInfo | null;
  /** Admins spend nothing (shown as ∞). */
  admin?: boolean;
}

/** A chat line: to null is the Everyone channel, otherwise a direct message to that profile. */
export interface ChatMsg {
  id: number;
  from: string;
  fromName: string;
  to: string | null;
  text: string;
  at: number;
  /** emoji -> profile ids who reacted with it */
  reactions: Record<string, string[]>;
}

export const REACTIONS = ['👍', '❤️', '😂', '😮', '🎉'] as const;

/** Emotes your blob acts out from the emote wheel. */
export type Act = 'wave' | 'cheer' | 'dance' | 'laugh' | 'love' | 'think' | 'sleepy' | 'clap';
export const ACTS: Act[] = ['wave', 'cheer', 'dance', 'laugh', 'love', 'think', 'sleepy', 'clap'];
export const ACT_EMOJI: Record<Act, string> = { wave: '👋', cheer: '🙌', dance: '💃', laugh: '😂', love: '💖', think: '🤔', sleepy: '😴', clap: '👏' };

export interface Note {
  id: number;
  authorId: string;
  name: string;
  text: string;
  at: number;
}
