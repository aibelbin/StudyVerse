const GAME_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);

function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}

/** Keyboard state for WASD/arrows plus one-shot key handlers. Ignores keys typed into inputs. */
export class Input {
  private down = new Set<string>();
  private handlers = new Map<string, () => void>();

  constructor() {
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (isTyping(e.target) && k !== 'escape') return; // Escape still closes dialogs while typing
      if (GAME_KEYS.has(k) && e.target === document.body) e.preventDefault(); // no page scroll on Space/arrows
      this.down.add(k);
      if (!e.repeat) this.handlers.get(k)?.();
    });
    addEventListener('keyup', (e) => this.down.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.down.clear());
  }

  on(key: string, fn: () => void): void {
    this.handlers.set(key, fn);
  }

  /** Tank-style driving keys: W/↑ throttle, S/↓ brake-then-reverse, A/← steer left (+), D/→ right. */
  driveAxis(): { throttle: number; steer: number } {
    const d = (a: string, b: string) => this.down.has(a) || this.down.has(b);
    return {
      throttle: (d('w', 'arrowup') ? 1 : 0) - (d('s', 'arrowdown') ? 1 : 0),
      steer: (d('a', 'arrowleft') ? 1 : 0) - (d('d', 'arrowright') ? 1 : 0),
    };
  }

  /** Normalised movement direction on the ground plane (+z = down the screen). */
  axis(): { x: number; z: number } {
    const d = (a: string, b: string) => this.down.has(a) || this.down.has(b);
    let x = (d('d', 'arrowright') ? 1 : 0) - (d('a', 'arrowleft') ? 1 : 0);
    let z = (d('s', 'arrowdown') ? 1 : 0) - (d('w', 'arrowup') ? 1 : 0);
    const len = Math.hypot(x, z);
    if (len > 0) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }
}
