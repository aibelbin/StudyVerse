import type { ChatMsg } from '../../../shared/types';
import type { Input } from '../game/input';
import { h } from '../hud/dom';
import type { Hud } from '../hud/hud';
import { promptActions } from './actions';
import { canFullscreen, enterFullscreen, isFullscreen, isIPhone, isStandalone, toggleFullscreen } from './fullscreen';
import { Joystick } from './stick';

export interface TouchHost {
  input: Input;
  canvas: HTMLCanvasElement;
  hud: Hud;
  /** False while something else owns finger drags (a mini-golf hole). */
  joystickOn(): boolean;
  toggleMap(): void;
  openChat(): void;
  closeChat(): void;
}

/**
 * Phone and tablet controls: a floating joystick on the left, an action button (and small buttons)
 * built from the on-screen hint on the right, note keys for instruments, and round buttons for
 * chat, emotes and a menu sheet. The rest of the HUD hides away until it's asked for.
 */
export class TouchUI {
  private actionsEl = h('div', { className: 'touch-actions' });
  private pianoEl = h('div', { className: 'touch-piano' });
  private chatBtn: HTMLButtonElement;
  private menu = h('div', { className: 'glass touch-menu', hidden: true });
  private lastPrompt: string | null = '\u0000';
  private stick: Joystick;

  constructor(private host: TouchHost) {
    document.body.classList.add('touch');
    this.stick = new Joystick(host.canvas, (v) => (host.input.stick = v));
    const hold = (el: HTMLElement, key: string) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('down');
        host.input.press(key);
      });
      const up = () => {
        if (!el.classList.contains('down')) return;
        el.classList.remove('down');
        host.input.release(key);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    for (let i = 1; i <= 8; i++) {
      const k = h('button', { type: 'button', className: 'touch-key', textContent: String(i) });
      hold(k, String(i));
      this.pianoEl.append(k);
    }
    this.pianoEl.hidden = true;
    this.chatBtn = h('button', { type: 'button', className: 'touch-round', textContent: '💬', title: 'Chat' });
    this.chatBtn.addEventListener('click', () => this.toggleChat());
    const emote = h('button', { type: 'button', className: 'touch-round', textContent: '😊', title: 'Emotes' });
    hold(emote, 't');
    const menuBtn = h('button', { type: 'button', className: 'touch-round', textContent: '☰', title: 'Menu' });
    menuBtn.addEventListener('click', () => this.toggleMenu());
    const hud = host.hud;
    const item = (text: string, fn: () => void) => h('button', { type: 'button', className: 'touch-item', textContent: text, onclick: () => {
      fn();
      this.renderMenu();
    } });
    this.renderMenu = () => {
      this.menu.replaceChildren(
        h('div', { className: 'touch-menu-row' },
          item('🗺️ Map', () => {
            this.toggleMenu(false);
            host.toggleMap();
          }),
          item(hud.dnd ? '🔕 DND on' : '🔔 DND off', () => hud.onToggleDnd()),
          item(hud.voiceState === 'off' ? '🎙️ Voice' : hud.voiceState === 'muted' ? '🤐 Unmute' : '🎙️ Leave voice', () => hud.onToggleVoice()),
          item(hud.muted ? '🔇 Sound off' : '🔊 Sound on', () => hud.onToggleMute()),
          item(hud.quality === 'high' ? '✨ Graphics: High' : '🍃 Graphics: Lite', () => hud.onToggleQuality()),
          ...(canFullscreen() ? [item(isFullscreen() ? '⛶ Exit full screen' : '⛶ Full screen', () => toggleFullscreen())] : []),
          item('✏️ Look', () => {
            this.toggleMenu(false);
            hud.onEditLook();
          })),
        h('div', { className: 'touch-menu-note', textContent: 'Who\'s around and what\'s happening →' }),
      );
    };
    this.renderMenu();
    // Hide the browser's address bar: full screen on the first tap (and again after swiping out of it).
    host.canvas.addEventListener('pointerdown', () => {
      if (!isFullscreen() && !isStandalone()) void enterFullscreen();
    });
    if (!canFullscreen() && !isStandalone() && isIPhone(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
      const shown = Number(localStorage.getItem('sv-a2hs') ?? 0);
      if (shown < 3) {
        localStorage.setItem('sv-a2hs', String(shown + 1));
        setTimeout(() => host.hud.toast('📱 For full screen on iPhone: tap Share ⬆️ then "Add to Home Screen"', 8000), 4000);
      }
    }
    const portrait = h('div', { className: 'touch-portrait' }, h('div', { textContent: '🔄' }), h('p', { textContent: 'Turn your phone sideways to play' }));
    document.body.append(
      this.actionsEl, this.pianoEl, this.menu, portrait,
      h('div', { className: 'touch-rounds' }, this.chatBtn, emote, menuBtn),
    );
    // Keep the chat sheet above the on-screen keyboard.
    const vv = window.visualViewport;
    vv?.addEventListener('resize', () => {
      const off = Math.max(0, innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${off}px`);
    });
    // No pinch or double-tap zoom (iOS ignores user-scalable).
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    let lastTap = 0;
    document.addEventListener('touchend', (e) => {
      const now = performance.now();
      if (now - lastTap < 300 && !(e.target instanceof HTMLInputElement)) e.preventDefault();
      lastTap = now;
    }, { passive: false });
  }

  private renderMenu: () => void;

  /** Call every frame (cheap: only rebuilds when the hint changes). */
  update(prompt: string | null): void {
    this.stick.enabled = this.host.joystickOn();
    if (!this.stick.enabled) this.host.input.stick = { x: 0, z: 0 };
    if (prompt === this.lastPrompt) return;
    this.lastPrompt = prompt;
    const p = promptActions(prompt);
    this.pianoEl.hidden = !p.piano;
    this.actionsEl.replaceChildren(...p.actions.map((a) => {
      const b = h('button', { type: 'button', className: a.primary ? 'touch-act main' : 'touch-act', textContent: a.label });
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.host.input.press(a.key);
      });
      b.addEventListener('pointerup', () => this.host.input.release(a.key));
      return b;
    }));
  }

  /** A chat line arrived: a red dot on 💬 (and a small toast) unless the chat is open. */
  onChat(m: ChatMsg, mine: boolean): void {
    if (mine || document.body.classList.contains('chat-open')) return;
    this.chatBtn.classList.add('dot');
    this.host.hud.toast(`💬 ${m.fromName}: ${m.text.length > 50 ? `${m.text.slice(0, 49)}…` : m.text}`, 3500);
  }

  private toggleChat(open = !document.body.classList.contains('chat-open')): void {
    document.body.classList.toggle('chat-open', open);
    if (open) {
      this.toggleMenu(false);
      this.chatBtn.classList.remove('dot');
      this.host.openChat();
    } else {
      this.host.closeChat();
    }
  }

  private toggleMenu(open: boolean = this.menu.hidden === true): void {
    this.menu.hidden = !open;
    document.body.classList.toggle('menu-open', open);
    if (open) {
      this.renderMenu();
      this.toggleChat(false);
    }
  }
}
