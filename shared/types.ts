export type Hat = 'none' | 'beanie' | 'cap' | 'bucket' | 'flower';

/** Colors are '#rrggbb'. */
export interface Look {
  body: string;
  skin: string;
  hat: Hat;
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
  seatId: string | null;
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
