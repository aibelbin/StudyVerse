import { FEED_KEEP } from '../../shared/constants';
import type { FeedEvent, FeedKind } from '../../shared/types';

export class Feed {
  private events: FeedEvent[] = [];

  push(kind: FeedKind, text: string, at: number): FeedEvent {
    const e: FeedEvent = { kind, text, at };
    this.events.push(e);
    if (this.events.length > FEED_KEEP) this.events.shift();
    return e;
  }

  recent(n: number): FeedEvent[] {
    return this.events.slice(-n);
  }
}

export const feedText = {
  arrive: (name: string) => `🌷 ${name} arrived`,
  leave: (name: string) => `👋 ${name} headed home`,
  start: (name: string, min: number, where: string) => `📚 ${name} started a ${min} min session ${where}`,
  finish: (name: string, min: number, kp: number, streak: number) =>
    `✨ ${name} finished a ${min} min session! (+${kp} KP${streak > 1 ? `, 🔥${streak}-day streak` : ''})`,
  quit: (name: string, elapsed: number, total: number) => `🥀 ${name} left ${elapsed} min into a ${total} min session`,
  quitDisconnect: (name: string, elapsed: number, total: number) =>
    `🥀 ${name} disconnected and didn't come back, ${elapsed} min into a ${total} min session`,
  cheer: (from: string, to: string, emoji: string) => `${from} cheered ${to} ${emoji}`,
};
