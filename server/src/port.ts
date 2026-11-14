import type { Mug } from '../../shared/mug';
import type { ErrorCode, ServerMsg } from '../../shared/protocol';
import type { FeedKind } from '../../shared/types';

/**
 * What a feature module (cabins, studio) may ask of the World. Everything is keyed by player id, so modules
 * never touch the World's player records; a call about someone who isn't online is a no-op.
 */
export interface Port {
  now(): number;
  send(id: string, msg: ServerMsg): void;
  toScene(scene: string, msg: ServerMsg, exceptId?: string): void;
  toAll(msg: ServerMsg): void;
  error(id: string, code: ErrorCode, message: string): void;
  feed(kind: FeedKind, text: string): void;
  /** Admins pay nothing and may take any painting down. */
  isAdmin(id: string): boolean;
  /** Reloads the player's wallet from the store and pushes `wallet`. */
  walletChanged(id: string): void;
  /** Sets the player's mug and pushes `playerUpdated`. */
  mugChanged(id: string, mug: Mug): void;
  /** Pushes the player's `bag`. */
  bagChanged(id: string): void;
  /** The scene the player is in, or null if they aren't in the world. */
  sceneOf(id: string): string | null;
  /** Where the player stands, or null if they aren't in the world. */
  posOf(id: string): { x: number; z: number } | null;
  /** The player's name (online or not), or null if there's no such profile. */
  nameOf(id: string): string | null;
  /** Reloads the cabin roster (latches, mail flags) and sends `village` to everyone. */
  rosterChanged(): void;
}
