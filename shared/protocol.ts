import type { ToyAction, ToyState } from './toys';
import type { Anim, EmoteKind, FeedEvent, Look, OnlineEntry, PlayerView } from './types';

export type ClientMsg =
  | { t: 'hello'; token?: string; inviteCode?: string; name?: string; look?: Look }
  | { t: 'move'; x: number; z: number; facing: number; anim: Anim }
  | { t: 'enterScene'; doorId: string }
  | { t: 'sit'; slotId: string }
  | { t: 'stand' }
  | { t: 'startSession'; focusMin: number; breakMin: number }
  | { t: 'cancelSession' }
  | { t: 'emote'; kind: EmoteKind; targetId?: string }
  | { t: 'updateLook'; look: Look }
  | { t: 'use'; toyId: string; action: ToyAction; arg?: number };

export type ErrorCode =
  | 'bad_invite'
  | 'unknown_token'
  | 'bad_profile'
  | 'slot_taken'
  | 'bad_slot'
  | 'not_seated'
  | 'bad_session'
  | 'bad_door'
  | 'connected_elsewhere'
  | 'bad_toy';

export type ServerMsg =
  | {
      t: 'welcome';
      you: PlayerView;
      token?: string;
      serverTime: number;
      players: PlayerView[];
      online: OnlineEntry[];
      feed: FeedEvent[];
      toys: Record<string, ToyState>;
    }
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
  | { t: 'toyState'; toyId: string; state: ToyState };
