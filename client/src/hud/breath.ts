import { MEDITATE_MS } from '../../../shared/constants';
import { breathAt } from '../toys/parkMath';
import { h } from './dom';

/**
 * The breathing circle shown while you sit on a meditation cushion. Everyone on the ring follows the
 * same rhythm (the ring's shared clock); the countdown is your own five minutes.
 */
export class BreathOverlay {
  private el = h('div', { className: 'breath' });
  private circle = h('div', { className: 'breath-circle' });
  private label = h('div', { className: 'breath-label' });
  private left = h('div', { className: 'breath-left' });
  private shown = false;

  constructor() {
    this.el.append(this.circle, this.label, this.left);
    this.el.hidden = true;
    document.body.append(this.el);
  }

  /** ringStart: the ring's shared clock (server ms); sitAt: when you sat (server ms). */
  update(now: number, ringStart: number, sitAt: number, companions: number): void {
    if (!this.shown) {
      this.shown = true;
      this.el.hidden = false;
    }
    const b = breathAt(now - ringStart);
    this.circle.style.transform = `scale(${b.scale.toFixed(3)})`;
    this.label.textContent = b.label;
    const ms = Math.max(0, MEDITATE_MS - (now - sitAt));
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    this.left.textContent = `${m}:${String(s).padStart(2, '0')}${companions ? ` · breathing with ${companions}` : ''}`;
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.el.hidden = true;
  }
}
