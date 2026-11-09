const GAME_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);

function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}

/** Keyboard state for WASD/arrows plus one-shot key handlers. Ignores keys typed into inputs. */
export class Input {
  private down = new Set<string>();
  private handlers = new Map<string, () => void>();
  private upHandlers = new Map<string, () => void>();
  /** The touch joystick's push (length 0..1); used when no movement keys are down. */
  stick = { x: 0, z: 0 };

  constructor() {
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (isTyping(e.target) && k !== 'escape') return; // Escape still closes dialogs while typing
      if (GAME_KEYS.has(k) && e.target === document.body) e.preventDefault(); // no page scroll on Space/arrows
      this.down.add(k);
      if (!e.repeat) this.handlers.get(k)?.();
    });
    addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.down.delete(k);
      if (!isTyping(e.target)) this.upHandlers.get(k)?.();
    });
    addEventListener('blur', () => this.down.clear());
  }

  on(key: string, fn: () => void): void {
    this.handlers.set(key, fn);
  }

  /** A touch button standing in for a key going down (runs its handler, counts as held). */
  press(key: string): void {
    this.down.add(key);
    this.handlers.get(key)?.();
  }

  release(key: string): void {
    this.down.delete(key);
    this.upHandlers.get(key)?.();
  }

  /** Runs fn when the key is released (not while typing). */
  onUp(key: string, fn: () => void): void {
    this.upHandlers.set(key, fn);
  }

  /** Tank-style driving keys: W/↑ throttle, S/↓ brake-then-reverse, A/← steer left (+), D/→ right. */
  driveAxis(): { throttle: number; steer: number } {
    const d = (a: string, b: string) => this.down.has(a) || this.down.has(b);
    const keys = d('w', 'arrowup') || d('s', 'arrowdown') || d('a', 'arrowleft') || d('d', 'arrowright');
    if (!keys && (this.stick.x || this.stick.z)) {
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - 0.15) / 0.75));
      return { throttle: dz(-this.stick.z), steer: dz(-this.stick.x) };
    }
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
      return { x, z };
    }
    return { x: this.stick.x, z: this.stick.z };
  }
}
