import { ACT_EMOJI, ACTS, type Act } from '../../../shared/types';
import { h } from './dom';

const LABELS: Record<Act, string> = { wave: 'Wave', cheer: 'Cheer', dance: 'Dance', laugh: 'Laugh', love: 'Love', think: 'Think', sleepy: 'Sleepy', clap: 'Clap' };
const RADIUS = 105;
const DEAD = 34;

/**
 * Which of n segments a pointer offset (dx, dy from the wheel's centre, y down) points at:
 * segment 0 is straight up, counting clockwise. −1 inside the dead zone.
 */
export function segmentAt(dx: number, dy: number, n: number): number {
  if (Math.hypot(dx, dy) < DEAD) return -1;
  const a = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2); // 0 = up, clockwise
  return Math.round(a / ((Math.PI * 2) / n)) % n;
}

/** Hold T: a ring of emotes; point at one and let go (or click it) to play it. */
export class EmoteWheel {
  onPick: (a: Act) => void = () => {};
  private el: HTMLElement;
  private items: HTMLElement[];
  private hot = -1;
  private isOpen = false;

  constructor() {
    this.items = ACTS.map((a, i) => {
      const ang = (i / ACTS.length) * Math.PI * 2;
      const b = h('button', { type: 'button', className: 'wheel-item', title: LABELS[a] }, h('span', { className: 'emoji', textContent: ACT_EMOJI[a] }), h('span', { className: 'label', textContent: LABELS[a] }));
      b.style.left = `calc(50% + ${Math.sin(ang) * RADIUS}px)`;
      b.style.top = `calc(50% - ${Math.cos(ang) * RADIUS}px)`;
      b.addEventListener('click', () => this.pick(i));
      b.addEventListener('pointerenter', () => this.setHot(i));
      return b;
    });
    this.el = h('div', { className: 'emote-wheel', hidden: true }, h('div', { className: 'hub', textContent: 'Emotes' }), ...this.items);
    document.body.append(this.el);
    addEventListener('pointermove', (e) => {
      if (!this.isOpen) return;
      const r = this.el.getBoundingClientRect();
      this.setHot(segmentAt(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), ACTS.length));
    });
  }

  get open(): boolean {
    return this.isOpen;
  }

  show(): void {
    this.isOpen = true;
    this.el.hidden = false;
    this.setHot(-1);
  }

  close(): void {
    this.isOpen = false;
    this.el.hidden = true;
  }

  /** T released: play the highlighted emote, or stay open for a click if none is. */
  release(): void {
    if (this.isOpen && this.hot >= 0) this.pick(this.hot);
  }

  private pick(i: number): void {
    this.close();
    this.onPick(ACTS[i]);
  }

  private setHot(i: number): void {
    this.hot = i;
    this.items.forEach((b, j) => b.classList.toggle('hot', j === i));
  }
}
