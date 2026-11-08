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
  | { t: 'updateLook'; look: Look };

export type ErrorCode =
  | 'bad_invite'
  | 'unknown_token'
  | 'bad_profile'
  | 'slot_taken'
  | 'bad_slot'
  | 'not_seated'
  | 'bad_session'
  | 'bad_door'
  | 'connected_elsewhere';

export type ServerMsg =
  | {
      t: 'welcome';
      you: PlayerView;
      token?: string;
      serverTime: number;
      players: PlayerView[];
      online: OnlineEntry[];
      feed: FeedEvent[];
    }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'sceneSnapshot'; scene: string; you: PlayerView; players: PlayerView[] }
  | { t: 'playerJoined'; player: PlayerView }
  | { t: 'playerLeft'; id: string }
  | { t: 'playerMoved'; id: string; x: number; z: number; facing: number; anim: Anim }
  | { t: 'playerUpdated'; player: PlayerView }
  | { t: 'emote'; fromId: string; kind: EmoteKind; targetId?: string }
  | { t: 'online'; list: OnlineEntry[] }
  | { t: 'feed'; event: FeedEvent };
