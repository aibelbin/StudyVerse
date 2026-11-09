import { SCENES } from '../../../shared/scenes';
import type { SceneDef } from '../../../shared/scenes/types';
import type { EmoteKind, FeedEvent, OnlineEntry, PlayerView } from '../../../shared/types';
import type { ConnStatus } from '../net/connection';
import { byId, h } from './dom';
import { formatClock, sessionLeftMs } from './format';

const FEED_SHOWN = 6;
const FEED_FADE_MS = 30_000;
const EMOTE_BUTTONS: [EmoteKind, string][] = [['wave', '👋 Wave'], ['clap', '👏'], ['flex', '💪'], ['coffee', '☕']];

export class Hud {
  onEditLook: () => void = () => {};
  onEndBreak: () => void = () => {};
  onToggleMute: () => void = () => {};
  onToggleDnd: () => void = () => {};
  muted = false;
  dnd = false;
  private walletText = '';
  private statusKey = '';
  private modal: HTMLElement | null = null;
  private modalClose: (() => void) | null = null;
  private cardId: string | null = null;

  constructor() {
    // After clicking a HUD button, give focus back to the page so Space/E keep driving the game.
    addEventListener('pointerup', () => {
      const a = document.activeElement;
      if (a instanceof HTMLButtonElement && !this.modal) a.blur();
    });
  }

  show(): void {
    byId('hud').hidden = false;
  }

  setConnection(s: ConnStatus): void {
    byId('conn').hidden = s !== 'reconnecting';
  }

  setStatus(me: PlayerView, def: SceneDef, now: number): void {
    const s = me.session;
    const line = s
      ? `${s.phase === 'focus' ? '📖 Focus' : '☕ Break'} · ${formatClock(sessionLeftMs(s, now))}`
      : me.slotId ? '🪑 Sitting' : `🚶 Wandering ${def.where}`;
    this.dnd = me.dnd;
    const key = `${me.name}|${line}|${def.id}|${this.muted}|${this.walletText}|${me.dnd}`;
    if (key === this.statusKey) return;
    this.statusKey = key;
    byId('status').replaceChildren(
      h('div', { className: 'row' },
        h('b', { textContent: me.name }),
        h('span', { className: 'buttons' },
          h('button', { className: `mini${me.dnd ? ' on' : ''}`, title: me.dnd ? 'Do not disturb is on (N)' : 'Do not disturb (N)', textContent: me.dnd ? '🔕' : '🔔', onclick: () => this.onToggleDnd() }),
          h('button', { className: 'mini', title: this.muted ? 'Sound off' : 'Sound on', textContent: this.muted ? '🔇' : '🔊', onclick: () => this.onToggleMute() }),
          h('button', { className: 'mini', title: 'Change your look', textContent: '✏️', onclick: () => this.onEditLook() }))),
      h('div', { className: s ? `timer ${s.phase}` : 'sub', textContent: line }),
      ...(s?.phase === 'break' ? [h('button', { className: 'mini', textContent: 'End break', onclick: () => this.onEndBreak() })] : []),
      h('div', { className: 'sub', textContent: `📍 ${def.name}` }),
      ...(this.walletText ? [h('div', { className: 'sub kp', textContent: this.walletText })] : []),
    );
  }

  setWallet(kp: number, streak: number): void {
    this.walletText = `✨ ${kp} KP${streak > 1 ? ` · 🔥 ${streak}-day streak` : ''}`;
  }

  setOnline(list: OnlineEntry[]): void {
    const by = new Map<string, string[]>();
    for (const p of list) {
      const scene = SCENES[p.scene]?.name ?? p.scene;
      by.set(scene, [...(by.get(scene) ?? []), p.name]);
    }
    byId('online').replaceChildren(
      h('div', { className: 'title', textContent: `🏡 ${list.length} in town` }),
      ...[...by].map(([scene, names]) => h('div', {}, h('b', { textContent: scene }), ` · ${names.join(', ')}`)),
    );
  }

  resetFeed(events: FeedEvent[]): void {
    byId('feed').replaceChildren();
    for (const e of events.slice(-FEED_SHOWN)) this.addFeed(e);
  }

  addFeed(e: FeedEvent): void {
    const feed = byId('feed');
    const item = h('div', { className: `item ${e.kind}`, textContent: e.text });
    feed.append(item);
    while (feed.children.length > FEED_SHOWN) feed.firstElementChild!.remove();
    setTimeout(() => item.classList.add('old'), FEED_FADE_MS);
  }

  setPrompt(text: string | null): void {
    const el = byId('prompt');
    el.hidden = !text;
    if (text && el.textContent !== text) el.textContent = text;
  }

  toast(text: string, ms = 4000): void {
    const t = h('div', { className: 'glass toast', textContent: text });
    byId('toasts').append(t);
    setTimeout(() => t.remove(), ms);
  }

  modalOpen(): boolean {
    return this.modal !== null || !byId('join').hidden;
  }

  /** Closes the open modal and runs its "dismissed" callback, if any. */
  closeModals(): void {
    if (!this.modal) return;
    this.modal.remove();
    this.modal = null;
    const f = this.modalClose;
    this.modalClose = null;
    f?.();
  }

  openModal(content: HTMLElement, onDismiss?: () => void, wide = false): void {
    this.closeModals();
    const back = h('div', { className: 'modal-back' }, h('div', { className: `glass modal${wide ? ' wide' : ''}` }, content));
    back.addEventListener('mousedown', (e) => {
      if (e.target === back) this.closeModals();
    });
    document.body.append(back);
    this.modal = back;
    this.modalClose = onDismiss ?? null;
  }

  /** Closes the modal without running its dismissed callback (the user chose an action). */
  finishModal(): void {
    this.modalClose = null;
    this.closeModals();
  }

  openSessionPicker(onPick: (focusMin: number, breakMin: number) => void): void {
    const pick = (f: number, b: number) => {
      this.finishModal();
      onPick(f, b);
    };
    const focus = h('input', { type: 'number', min: '1', max: '120', value: '40' });
    const brk = h('input', { type: 'number', min: '1', max: '30', value: '8' });
    const custom = h('div', { className: 'custom', hidden: true },
      h('label', {}, 'Focus ', focus, ' min'),
      h('label', {}, 'Break ', brk, ' min'),
      h('button', {
        className: 'primary', textContent: 'Start',
        onclick: () => {
          const f = Math.round(Number(focus.value));
          const b = Math.round(Number(brk.value));
          if (f >= 1 && f <= 120 && b >= 1 && b <= 30) pick(f, b);
          else this.toast('Focus 1–120 min, break 1–30 min');
        },
      }));
    const choice = (title: string, sub: string, onclick: () => void) =>
      h('button', { className: 'choice', onclick }, h('b', { textContent: title }), h('span', { textContent: sub }));
    this.openModal(h('div', {},
      h('h2', { textContent: '📖 Start a study session' }),
      h('div', { className: 'choices' },
        choice('25 / 5', 'classic pomodoro', () => pick(25, 5)),
        choice('50 / 10', 'deep focus', () => pick(50, 10)),
        choice('Custom', 'your call', () => { custom.hidden = false; focus.focus(); })),
      custom,
      h('p', { className: 'sub', textContent: 'Everyone in town will see you studying. Leaving early shows up in the feed 🥀' }),
    ));
  }

  confirmLeave(onLeave: () => void, onStay: () => void): void {
    const stay = h('button', { className: 'primary', textContent: 'Keep studying', onclick: () => this.closeModals() });
    this.openModal(h('div', {},
      h('h2', { textContent: 'Leave your session early?' }),
      h('p', { textContent: 'Your friends will see that you left early 🥀' }),
      h('div', { className: 'actions' }, stay, h('button', { textContent: 'Leave anyway', onclick: () => { this.finishModal(); onLeave(); } })),
    ), onStay);
    stay.focus();
  }

  openPlayerCard(v: PlayerView, onEmote: (k: EmoteKind) => void): void {
    this.cardId = v.id;
    const el = byId('card');
    el.hidden = false;
    el.replaceChildren(
      h('div', { className: 'row' }, h('b', { textContent: v.name }), h('button', { className: 'mini', textContent: '✕', onclick: () => this.closeCard() })),
      h('div', { className: 'sub', id: 'card-status' }),
      v.dnd
        ? h('div', { className: 'sub', textContent: '🔕 Do not disturb: they are focusing' })
        : h('div', { className: 'actions' }, ...EMOTE_BUTTONS.map(([k, label]) => h('button', { textContent: label, onclick: () => onEmote(k) }))),
    );
  }

  updateCard(text: string): void {
    const s = document.getElementById('card-status');
    if (s && s.textContent !== text) s.textContent = text;
  }

  cardTarget(): string | null {
    return this.cardId;
  }

  closeCard(): void {
    this.cardId = null;
    byId('card').hidden = true;
  }
}
