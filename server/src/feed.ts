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
  coffee: (name: string, stars: number, drink: string) => `☕ ${name} made a ${'★'.repeat(stars)} ${drink}`,
  gift: (from: string, to: string, stars: number, drink: string) => `🎁 ${from} gave ${to} a ${stars ? `${'★'.repeat(stars)} ` : ''}${drink}`,
  harvest: (name: string, what: string) => `🌷 ${name} picked a ${what}`,
  holeInOne: (name: string, hole: string) => `🎉 ${name} got a hole-in-one on the ${hole}!`,
  golfRound: (name: string, total: number) => `⛳ ${name} went round the mini-golf in ${total}`,
  meditate: (name: string, companions: number) =>
    `🧘 ${name} finished a breather${companions ? ` with ${companions} ${companions === 1 ? 'friend' : 'friends'}` : ''}`,
};
