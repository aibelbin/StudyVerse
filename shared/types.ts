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
}

export interface OnlineEntry {
  id: string;
  name: string;
  scene: string;
}

export type FeedKind = 'arrive' | 'leave' | 'start' | 'finish' | 'quit' | 'cheer';

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
}

export interface Note {
  id: number;
  authorId: string;
  name: string;
  text: string;
  at: number;
}
