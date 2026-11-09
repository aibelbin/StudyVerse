import { DRINKS, type Drink } from '../../../shared/types';
import { h } from './dom';
import type { Hud } from './hud';

/** Marker position 0..1, bouncing across the bar once per sweep. */
export function barPos(elapsedMs: number, sweepMs: number): number {
  const u = (elapsedMs / sweepMs) % 2;
  return u <= 1 ? u : 2 - u;
}

export function scoreStep(pos: number, zoneStart: number, zoneWidth: number): boolean {
  return pos >= zoneStart && pos <= zoneStart + zoneWidth;
}

const LABELS: Record<Drink, string> = { espresso: '☕ Espresso', latte: '🥛 Latte', matcha: '🍵 Matcha', cocoa: '🍫 Hot cocoa' };
const STEPS = ['Grind the beans', 'Brew', 'Pour'];
const MATCHA_STEPS = ['Sift the matcha', 'Whisk', 'Pour'];
const COCOA_STEPS = ['Melt the chocolate', 'Steam the milk', 'Pour'];

/** The café's brewing mini-flow: pick a drink, then three stop-in-the-green timing steps. */
export function openCoffee(hud: Hud, onDone: (drink: Drink, stars: number) => void): void {
  const body = h('div', { className: 'coffee' });
  let raf = 0;
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;
  const cleanup = () => {
    cancelAnimationFrame(raf);
    if (keyHandler) removeEventListener('keydown', keyHandler, true);
  };
  hud.openModal(h('div', {}, h('h2', { textContent: '☕ Make a drink' }), body), cleanup);

  const choose = () => {
    body.replaceChildren(
      h('p', { className: 'sub', textContent: 'What are we making?' }),
      h('div', { className: 'drinks' }, ...DRINKS.map((d) => h('button', { type: 'button', textContent: LABELS[d], onclick: () => run(d, 0, 0) }))),
    );
  };

  const run = (drink: Drink, step: number, hits: number) => {
    if (step === 3) {
      const stars = Math.max(1, hits);
      body.replaceChildren(
        h('p', { className: 'result', textContent: `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}` }),
        h('p', { textContent: stars === 3 ? `A perfect ${drink}! ✨` : stars === 2 ? `A lovely ${drink}.` : `A… rustic ${drink}. Still warm!` }),
        h('div', { className: 'actions' }, h('button', { className: 'primary', type: 'button', textContent: 'Take it', onclick: () => { cleanup(); hud.finishModal(); onDone(drink, stars); } })),
      );
      return;
    }
    const steps = drink === 'matcha' ? MATCHA_STEPS : drink === 'cocoa' ? COCOA_STEPS : STEPS;
    const zoneW = 0.22 - step * 0.03;
    const zoneStart = 0.1 + Math.random() * (0.8 - zoneW);
    const zone = h('div', { className: 'zone' });
    zone.style.left = `${zoneStart * 100}%`;
    zone.style.width = `${zoneW * 100}%`;
    const marker = h('div', { className: 'marker' });
    const start = performance.now();
    const sweep = 900 - step * 120;
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      const hit = scoreStep(barPos(performance.now() - start, sweep), zoneStart, zoneW);
      marker.classList.add(hit ? 'hit' : 'miss');
      setTimeout(() => run(drink, step + 1, hits + (hit ? 1 : 0)), 550);
    };
    body.replaceChildren(
      h('p', { textContent: `${step + 1}/3 · ${steps[step]}` }),
      h('div', { className: 'bar' }, zone, marker),
      h('div', { className: 'actions' }, h('button', { className: 'primary', type: 'button', textContent: 'Stop! (Space)', onclick: stop })),
    );
    const tick = () => {
      marker.style.left = `${barPos(performance.now() - start, sweep) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    if (keyHandler) removeEventListener('keydown', keyHandler, true);
    keyHandler = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        stop();
      }
    };
    addEventListener('keydown', keyHandler, true);
  };
  choose();
}
