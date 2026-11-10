import { FEATURE_KINDS, FEATURES, type AdminPlayer, type Features } from '../../../shared/gifts';
import type { AdminAction } from '../../../shared/protocol';
import { book } from '../world/book';
import { h } from './dom';
import { moodText } from './gifts';

type Tab = 'players' | 'features' | 'announce';

const when = (ms: number) => (ms >= Number.MAX_SAFE_INTEGER ? 'for good' : `until ${new Date(ms).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`);

/**
 * The admin side panel (only admins get the 🛡️ button; the server checks every action anyway):
 * who's here and what to do about them, feature switches, and announcements.
 */
export class AdminPanel {
  open = false;
  private el = h('div', { className: 'glass admin-panel', hidden: true });
  private tab: Tab = 'players';
  private players: AdminPlayer[] = [];
  private features: Features | null = null;
  private draft = '';

  /** onOpenChange: the chat shows 🗑 buttons while the panel is open. */
  constructor(private send: (a: AdminAction) => void, private onOpenChange: (open: boolean) => void, private meId: () => string = () => '') {
    document.body.append(this.el);
  }

  toggle(): void {
    this.open = !this.open;
    this.el.hidden = !this.open;
    this.onOpenChange(this.open);
    if (this.open) this.send({ action: 'list' });
    this.render();
  }

  setPlayers(list: AdminPlayer[]): void {
    this.players = list;
    if (this.open) this.render();
  }

  setFeatures(f: Features): void {
    this.features = f;
    if (this.open) this.render();
  }

  private act(a: AdminAction, confirmText?: string): void {
    if (confirmText && !confirm(confirmText)) return;
    this.send(a);
  }

  private render(): void {
    const tabBtn = (t: Tab, label: string) => h('button', { type: 'button', className: `mini${this.tab === t ? ' on' : ''}`, textContent: label, onclick: () => {
      this.tab = t;
      if (t === 'players') this.send({ action: 'list' });
      this.render();
    } });
    const body = this.tab === 'players' ? this.playersTab() : this.tab === 'features' ? this.featuresTab() : this.announceTab();
    this.el.replaceChildren(
      h('h2', {}, h('span', { textContent: '🛡️ Admin' }), h('button', { type: 'button', className: 'mini', textContent: '✕', onclick: () => this.toggle() })),
      h('div', { className: 'admin-tabs' }, tabBtn('players', '👥 Players'), tabBtn('features', '🎚️ Features'), tabBtn('announce', '📢 Announce')),
      body,
    );
  }

  private playersTab(): HTMLElement {
    const sorted = [...this.players].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    return h('div', {},
      h('button', { type: 'button', className: 'mini', textContent: '🔄 Refresh', onclick: () => this.send({ action: 'list' }) }),
      ...sorted.map((p) => {
        const banSel = h('select', {},
          h('option', { value: '', textContent: '⛔ Ban…' }),
          h('option', { value: '60', textContent: '1 hour' }), h('option', { value: '1440', textContent: '24 hours' }),
          h('option', { value: '10080', textContent: '7 days' }), h('option', { value: 'forever', textContent: 'For good' }));
        banSel.addEventListener('change', () => {
          const v = banSel.value;
          if (v) this.act({ action: 'ban', id: p.id, minutes: v === 'forever' ? null : Number(v) }, `Ban ${p.name}${v === 'forever' ? ' for good' : ''}?`);
          banSel.value = '';
        });
        const muteSel = h('select', {},
          h('option', { value: '', textContent: '🔇 Mute…' }),
          h('option', { value: '10', textContent: '10 min' }), h('option', { value: '60', textContent: '1 hour' }), h('option', { value: '1440', textContent: '24 hours' }));
        muteSel.addEventListener('change', () => {
          if (muteSel.value) this.act({ action: 'mute', id: p.id, minutes: Number(muteSel.value) });
          muteSel.value = '';
        });
        const btn = (label: string, a: AdminAction, confirmText?: string) => h('button', { type: 'button', className: 'mini', textContent: label, onclick: () => this.act(a, confirmText) });
        const meta = [
          p.online ? `🟢 ${book.name(p.scene)}` : p.scene ? '💤 away' : '⚪ offline',
          `✨ ${p.kp}`,
          moodText(p.status),
          p.mutedUntil ? `🔇 muted ${when(p.mutedUntil)}` : '',
          p.bannedUntil ? `⛔ banned ${when(p.bannedUntil)}` : '',
        ].filter(Boolean).join(' · ');
        if (p.id === this.meId()) {
          return h('div', { className: 'admin-player' }, h('b', { textContent: `${p.name} (you)` }), h('div', { className: 'meta', textContent: meta }));
        }
        return h('div', { className: 'admin-player' },
          h('b', { textContent: p.name }),
          h('div', { className: 'meta', textContent: meta }),
          h('div', { className: 'acts' },
            ...(p.online ? [btn('📍 Go to', { action: 'goto', id: p.id }), btn('🏠 Send home', { action: 'sendHome', id: p.id }), btn('👢 Kick', { action: 'kick', id: p.id }, `Kick ${p.name}?`)] : []),
            p.mutedUntil ? btn('🔊 Unmute', { action: 'unmute', id: p.id }) : muteSel,
            p.bannedUntil ? btn('✅ Unban', { action: 'unban', id: p.id }) : banSel));
      }),
      h('div', { className: 'admin-note', textContent: 'Bans are per player. The invite code is public, so someone banned could join under a new name: change INVITE_CODE on the server if that happens. While this panel is open, chat messages get a 🗑.' }),
    );
  }

  private featuresTab(): HTMLElement {
    const f = this.features;
    return h('div', {},
      ...FEATURE_KINDS.map((k) => {
        const on = f ? f[k] : true;
        return h('div', { className: 'admin-feature' },
          h('span', { textContent: FEATURES[k] }),
          h('button', { type: 'button', className: `mini${on ? ' on' : ''}`, textContent: on ? 'On' : 'Off', onclick: () => this.send({ action: 'feature', feature: k, on: !on }) }));
      }),
      h('div', { className: 'admin-feature' },
        h('span', { textContent: 'Stage screen text' }),
        h('button', { type: 'button', className: 'mini', textContent: 'Clear it', onclick: () => this.send({ action: 'clearStage' }) })),
    );
  }

  private announceTab(): HTMLElement {
    const ta = h('textarea', { maxLength: 160, placeholder: 'e.g. Study jam on the stage at 8pm 📚', value: this.draft });
    ta.addEventListener('input', () => (this.draft = ta.value));
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    return h('div', {},
      ta,
      h('button', { type: 'button', className: 'primary', textContent: '📢 Announce to everyone', onclick: () => {
        const text = ta.value.trim();
        if (!text) return;
        this.send({ action: 'announce', text });
        this.draft = '';
        this.render();
      } }),
    );
  }
}

/** A big banner for everyone (from an admin), gone after 8 seconds. */
export function showAnnouncement(text: string): void {
  document.querySelector('.announce')?.remove();
  const el = h('div', { className: 'glass announce' }, h('small', { textContent: '📢 Announcement' }), text);
  document.body.append(el);
  setTimeout(() => el.remove(), 8000);
}
