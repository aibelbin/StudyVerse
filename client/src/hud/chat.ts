import { CHAT_MAX } from '../../../shared/constants';
import { REACTIONS, type ChatMsg } from '../../../shared/types';
import { h } from './dom';

export const GLOBAL = 'global';
const READ_KEY = 'sv-chat-read';
const PEEK_MS = 8000;

/** Which tab a message belongs to: Everyone, or the other person in a DM. */
export const tabOf = (m: ChatMsg, me: string): string => (m.to === null ? GLOBAL : m.from === me ? m.to : m.from);

/** Messages from others in this tab newer than the last one read. */
export function unreadCount(msgs: ChatMsg[], tab: string, me: string, lastRead: number): number {
  return msgs.filter((m) => m.id > lastRead && m.from !== me && tabOf(m, me) === tab).length;
}

function loadRead(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * The chat panel (bottom left): an Everyone tab and one tab per DM partner, unread badges,
 * reactions, and an input that opens with Enter. Collapsed, it peeks at fresh messages.
 */
export class ChatPanel {
  onSend: (text: string, to?: string) => void = () => {};
  onReact: (id: number, emoji: string) => void = () => {};
  /** Set while the admin panel is open: each line gets a 🗑. */
  onAdminDelete: ((id: number) => void) | null = null;
  /** A DM from someone else arrived while you weren't looking at it. */
  onPing: (m: ChatMsg) => void = () => {};

  private el: HTMLElement;
  private tabsEl = h('div', { className: 'chat-tabs' });
  private listEl = h('div', { className: 'chat-list' });
  private input = h('input', { type: 'text', maxLength: CHAT_MAX, placeholder: 'Say something… (Enter to send, Esc to close)' });
  private me = '';
  private msgs: ChatMsg[] = [];
  private names = new Map<string, string>();
  private dmTabs: string[] = [];
  private active = GLOBAL;
  private open = false;
  private read = loadRead();
  private seenAt = new Map<number, number>(); // message id -> when it arrived (for peeking)
  private pickerFor: number | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
    const send = h('button', { className: 'mini', type: 'button', textContent: 'Send', onclick: () => this.submit() });
    el.append(this.tabsEl, this.listEl, h('div', { className: 'chat-input' }, this.input, send));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.collapse();
      }
    });
    this.input.addEventListener('focus', () => this.expand());
    this.listEl.addEventListener('click', () => this.expand());
    new ResizeObserver(() => document.documentElement.style.setProperty('--chat-h', `${el.offsetHeight}px`)).observe(el);
    setInterval(() => {
      if (!this.open) this.renderList(); // let peeked messages fade away
    }, 2000);
    this.render();
  }

  get typing(): boolean {
    return document.activeElement === this.input;
  }

  setMe(id: string): void {
    this.me = id;
  }

  /** Names we know (from the online list), for DM tabs to people who haven't written yet. */
  setName(id: string, name: string): void {
    this.names.set(id, name);
  }

  load(history: ChatMsg[]): void {
    this.msgs = history.slice();
    for (const m of history) {
      this.names.set(m.from, m.fromName);
      const tab = tabOf(m, this.me);
      if (tab !== GLOBAL && !this.dmTabs.includes(tab)) this.dmTabs.push(tab);
    }
    this.render();
  }

  add(m: ChatMsg): void {
    if (this.msgs.some((x) => x.id === m.id)) return;
    this.msgs.push(m);
    if (this.msgs.length > 600) this.msgs.splice(0, this.msgs.length - 600);
    this.seenAt.set(m.id, performance.now());
    this.names.set(m.from, m.fromName);
    const tab = tabOf(m, this.me);
    if (tab !== GLOBAL && !this.dmTabs.includes(tab)) this.dmTabs.push(tab);
    const looking = this.open && this.active === tab;
    if (looking) this.markRead(tab);
    if (tab !== GLOBAL && m.from !== this.me && !looking) this.onPing(m);
    this.render();
  }

  /** A message an admin removed. */
  remove(id: number): void {
    this.msgs = this.msgs.filter((m) => m.id !== id);
    this.renderList();
  }

  /** Redraw (e.g. to show or hide the admin 🗑 buttons). */
  refresh(): void {
    this.renderList();
  }

  setReactions(id: number, reactions: Record<string, string[]>): void {
    const m = this.msgs.find((x) => x.id === id);
    if (!m) return;
    m.reactions = reactions;
    this.renderList();
  }

  /** Opens (and selects) a DM tab with this person, then focuses the input. */
  openDm(id: string, name: string): void {
    if (id === this.me) return;
    this.names.set(id, name);
    if (!this.dmTabs.includes(id)) this.dmTabs.push(id);
    this.active = id;
    this.focus();
  }

  focus(): void {
    this.expand();
    this.input.focus();
  }

  private expand(): void {
    if (this.open) return;
    this.open = true;
    this.markRead(this.active);
    this.render();
  }

  /** Closes the panel (the touch chat sheet's ✕). */
  close(): void {
    this.collapse();
  }

  private collapse(): void {
    this.open = false;
    this.pickerFor = null;
    this.input.blur();
    this.render();
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text) return this.collapse();
    this.onSend(text, this.active === GLOBAL ? undefined : this.active);
    this.input.value = '';
  }

  private markRead(tab: string): void {
    const last = this.msgs.filter((m) => tabOf(m, this.me) === tab).at(-1);
    if (!last || (this.read[tab] ?? 0) >= last.id) return;
    this.read[tab] = last.id;
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(this.read));
    } catch { /* private mode: unread just resets */ }
  }

  private render(): void {
    this.el.classList.toggle('open', this.open);
    const tab = (id: string, label: string) => {
      const n = unreadCount(this.msgs, id, this.me, this.read[id] ?? 0);
      const b = h('button', {
        type: 'button',
        className: `chat-tab${id === this.active ? ' on' : ''}`,
        onclick: (e: MouseEvent) => {
          e.stopPropagation();
          this.active = id;
          this.expand();
          this.markRead(id);
          this.render();
        },
      }, label, ...(n ? [h('span', { className: 'badge', textContent: n > 9 ? '9+' : String(n) })] : []));
      if (id !== GLOBAL) {
        b.append(h('span', {
          className: 'close',
          textContent: '×',
          title: 'Close this conversation',
          onclick: (e: MouseEvent) => {
            e.stopPropagation();
            this.dmTabs = this.dmTabs.filter((x) => x !== id);
            if (this.active === id) this.active = GLOBAL;
            this.render();
          },
        }));
      }
      return b;
    };
    this.tabsEl.replaceChildren(
      tab(GLOBAL, '💬 Everyone'),
      ...this.dmTabs.map((id) => tab(id, this.names.get(id) ?? 'Friend')),
      ...(this.open ? [] : [h('span', { className: 'chat-hint', textContent: 'Enter to chat' })]),
    );
    this.renderList();
  }

  private renderList(): void {
    const now = performance.now();
    let shown = this.msgs.filter((m) => tabOf(m, this.me) === this.active);
    if (!this.open) shown = shown.filter((m) => now - (this.seenAt.get(m.id) ?? -1e9) < PEEK_MS).slice(-3);
    const stick = this.listEl.scrollHeight - this.listEl.scrollTop - this.listEl.clientHeight < 40;
    this.listEl.replaceChildren(...shown.map((m) => this.line(m)));
    if (this.open && this.active !== GLOBAL && !shown.length) {
      this.listEl.append(h('div', { className: 'chat-empty', textContent: `Say hi to ${this.names.get(this.active) ?? 'them'} 👋 (only the two of you see this)` }));
    }
    if (stick || !this.open) this.listEl.scrollTop = this.listEl.scrollHeight;
  }

  private line(m: ChatMsg): HTMLElement {
    const mine = m.from === this.me;
    const chips = Object.entries(m.reactions).filter(([, who]) => who.length).map(([emoji, who]) => h('button', {
      type: 'button',
      className: `chip${who.includes(this.me) ? ' mine' : ''}`,
      textContent: `${emoji} ${who.length}`,
      title: who.map((id) => this.names.get(id) ?? 'someone').join(', '),
      onclick: (e: MouseEvent) => {
        e.stopPropagation();
        this.onReact(m.id, emoji);
      },
    }));
    const add = h('button', {
      type: 'button',
      className: 'chip add',
      textContent: '＋',
      title: 'React',
      onclick: (e: MouseEvent) => {
        e.stopPropagation();
        this.pickerFor = this.pickerFor === m.id ? null : m.id;
        this.renderList();
      },
    });
    const picker = this.pickerFor === m.id
      ? [h('span', { className: 'picker' }, ...REACTIONS.map((emoji) => h('button', {
        type: 'button',
        textContent: emoji,
        onclick: (e: MouseEvent) => {
          e.stopPropagation();
          this.pickerFor = null;
          this.onReact(m.id, emoji);
        },
      })))]
      : [];
    return h('div', { className: `chat-line${mine ? ' mine' : ''}`, title: new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
      h('b', { textContent: `${mine ? 'You' : m.fromName}: ` }),
      h('span', { className: 'text', textContent: m.text }),
      h('span', { className: 'reacts' }, ...chips, ...(this.open ? [add, ...picker] : [])),
      ...(this.onAdminDelete ? [h('button', { type: 'button', className: 'del', title: 'Delete (admin)', textContent: '🗑', onclick: (e: MouseEvent) => {
        e.stopPropagation();
        this.onAdminDelete?.(m.id);
      } })] : []),
    );
  }
}
