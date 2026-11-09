import { DRINKS, type Drink } from '../../../shared/types';
import { h } from '../hud/dom';
import type { Hud } from '../hud/hud';
import { artScore, Crank, Fill, guideShape, Heat, Pour, RECIPES, starsFor, STEPS, Tamp, type Pt, type StepKind } from './steps';

const LABELS: Record<Drink, string> = { espresso: '☕ Espresso', latte: '🥛 Latte', matcha: '🍵 Matcha', cocoa: '🍫 Hot cocoa' };
const W = 440;
const H = 290;
const INK = '#5a3e36';
const CREAM = '#fbf3ea';
const GREEN = '#9fd49a';
const LIQUID: Record<Drink, string> = { espresso: '#6b3f26', latte: '#c99a6e', matcha: '#8cc56b', cocoa: '#7a4a32' };

interface StepRun {
  /** Advances the model; returns a score once the step has finished. */
  tick(dt: number, held: boolean): number | null;
  draw(g: CanvasRenderingContext2D): void;
  /** Pointer position in canvas pixels while it's down, null when up. */
  pointer?(p: Pt | null): void;
  /** The Done button (crank, tamp, art). Null means "skipped". */
  finish?(): number | null;
}

/** The café's barista panel: pick a drink, then do each of its hands-on steps. */
export function openBarista(hud: Hud, onDone: (drink: Drink, stars: number) => void): void {
  const body = h('div', { className: 'coffee barista' });
  let raf = 0;
  let held = false;
  const keys = (e: KeyboardEvent) => {
    if (e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) held = e.type === 'keydown';
  };
  addEventListener('keydown', keys, true);
  addEventListener('keyup', keys, true);
  const cleanup = () => {
    cancelAnimationFrame(raf);
    removeEventListener('keydown', keys, true);
    removeEventListener('keyup', keys, true);
  };
  hud.openModal(h('div', {}, h('h2', { textContent: '☕ Barista' }), body), cleanup);

  const choose = () => {
    body.replaceChildren(
      h('p', { className: 'sub', textContent: 'What are we making?' }),
      h('div', { className: 'drinks' }, ...DRINKS.map((d) => h('button', {
        type: 'button',
        textContent: `${LABELS[d]} · ${RECIPES[d].length} steps`,
        onclick: () => step(d, 0, []),
      }))),
    );
  };

  let artPicture = '';

  const step = (drink: Drink, i: number, scores: (number | null)[]) => {
    const kinds = RECIPES[drink];
    if (i >= kinds.length) return result(drink, kinds, scores);
    const kind = kinds[i];
    const info = STEPS[kind];
    const canvas = h('canvas', { width: W * devicePixelRatio, height: H * devicePixelRatio, className: 'stage' });
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const g = canvas.getContext('2d')!;
    g.scale(devicePixelRatio, devicePixelRatio);
    const run = makeStep(kind, drink);
    const verdict = h('p', { className: 'verdict' });
    const buttons = h('div', { className: 'actions' });
    let over = false;
    const end = (score: number | null) => {
      if (over) return;
      over = true;
      held = false;
      if (kind === 'art' && score !== null) artPicture = canvas.toDataURL();
      verdict.textContent = score === null ? 'Skipped' : score >= 0.8 ? 'Perfect! ✨' : score >= 0.5 ? 'Nice 🙂' : 'Oops… 😅';
      verdict.className = `verdict show ${score === null ? '' : score >= 0.8 ? 'good' : score >= 0.5 ? 'ok' : 'bad'}`;
      setTimeout(() => {
        cancelAnimationFrame(raf);
        step(drink, i + 1, [...scores, score]);
      }, 750);
    };
    if (run.finish) buttons.append(h('button', { className: 'primary', type: 'button', textContent: kind === 'art' ? 'Done' : 'Done ✓', onclick: () => end(run.finish!()) }));
    if (kind === 'art') buttons.append(h('button', { type: 'button', textContent: 'Skip', onclick: () => end(null) }));
    const pos = (e: PointerEvent): Pt => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      held = true;
      run.pointer?.(pos(e));
    });
    canvas.addEventListener('pointermove', (e) => {
      if (held) run.pointer?.(pos(e));
    });
    const up = () => {
      held = false;
      run.pointer?.(null);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    body.replaceChildren(
      h('div', { className: 'steps-dots' }, ...kinds.map((k, j) => h('span', { className: j < i ? 'done' : j === i ? 'now' : '', title: STEPS[k].label }))),
      h('p', { className: 'step-title', textContent: `${i + 1}/${kinds.length} · ${info.label}` }),
      h('p', { className: 'sub', textContent: info.hint + (info.type === 'crank' || info.type === 'art' ? '' : ' (or hold Space)') }),
      h('div', { className: 'stage-wrap' }, canvas, verdict),
      buttons,
    );
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!over) {
        const s = run.tick(dt, held);
        if (s !== null) end(s);
      }
      g.fillStyle = CREAM;
      g.fillRect(0, 0, W, H);
      run.draw(g);
      raf = requestAnimationFrame(loop);
    };
    loop();
  };

  const result = (drink: Drink, kinds: StepKind[], scores: (number | null)[]) => {
    const stars = starsFor(scores);
    body.replaceChildren(
      h('p', { className: 'result', textContent: `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}` }),
      h('p', { textContent: stars === 3 ? `A perfect ${drink}! ✨` : stars === 2 ? `A lovely ${drink}.` : `A… rustic ${drink}. Still warm!` }),
      artPicture && kinds.includes('art') && scores.at(-1) !== null ? h('img', { className: 'art-pic', src: artPicture, alt: 'Your latte art' }) : '',
      h('div', { className: 'score-bars' }, ...kinds.map((k, j) => {
        const v = scores[j];
        const bar = h('span', { className: 'fill' });
        bar.style.width = `${Math.round((v ?? 0) * 100)}%`;
        return h('div', { className: 'score-row' }, h('span', { className: 'name', textContent: STEPS[k].label }), h('span', { className: 'track' }, bar), h('span', { className: 'pct', textContent: v === null ? '—' : `${Math.round(v * 100)}` }));
      })),
      h('div', { className: 'actions' }, h('button', {
        className: 'primary',
        type: 'button',
        textContent: 'Take it ☕',
        onclick: () => {
          cleanup();
          hud.finishModal();
          onDone(drink, stars);
        },
      })),
    );
  };

  choose();
}

// ---------- drawing helpers ----------

function cupShape(g: CanvasRenderingContext2D, cx: number, top: number, w: number, hgt: number): void {
  g.beginPath();
  g.moveTo(cx - w / 2, top);
  g.lineTo(cx + w / 2, top);
  g.lineTo(cx + w * 0.36, top + hgt);
  g.lineTo(cx - w * 0.36, top + hgt);
  g.closePath();
}

/** A cup with liquid filled to `level` of `full` (0..1 of the cup), plus optional fill marks. */
function drawCup(g: CanvasRenderingContext2D, cx: number, top: number, w: number, hgt: number, level: number, color: string, marks: number[] = []): void {
  g.save();
  cupShape(g, cx, top, w, hgt);
  g.fillStyle = '#fffaf3';
  g.fill();
  g.clip();
  const y = top + hgt * (1 - Math.min(1.05, level));
  g.fillStyle = color;
  g.fillRect(cx - w, y, w * 2, hgt * 2);
  g.restore();
  g.lineWidth = 3;
  g.strokeStyle = INK;
  cupShape(g, cx, top, w, hgt);
  g.stroke();
  g.beginPath(); // handle
  g.arc(cx + w * 0.47, top + hgt * 0.42, hgt * 0.2, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  g.setLineDash([6, 5]);
  g.lineWidth = 2;
  for (const m of marks) {
    const my = top + hgt * (1 - m);
    g.beginPath();
    g.moveTo(cx - w / 2 - 14, my);
    g.lineTo(cx + w / 2 + 14, my);
    g.stroke();
  }
  g.setLineDash([]);
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color = INK, size = 14, align: CanvasTextAlign = 'center'): void {
  g.fillStyle = color;
  g.font = `600 ${size}px system-ui, sans-serif`;
  g.textAlign = align;
  g.fillText(text, x, y);
}

/** A vertical gauge from 0..max with a green band and the current value. */
function vGauge(g: CanvasRenderingContext2D, x: number, top: number, hgt: number, v: number, max: number, lo: number, hi: number, color: string, line?: number): void {
  const y = (val: number) => top + hgt * (1 - Math.min(val, max) / max);
  g.fillStyle = '#f0e2d6';
  g.beginPath();
  g.roundRect(x - 14, top, 28, hgt, 14);
  g.fill();
  g.fillStyle = GREEN;
  g.fillRect(x - 14, y(hi), 28, y(lo) - y(hi));
  g.save();
  g.beginPath();
  g.roundRect(x - 9, top + 4, 18, hgt - 8, 9);
  g.clip();
  g.fillStyle = color;
  g.fillRect(x - 9, y(v), 18, top + hgt - y(v));
  g.restore();
  if (line !== undefined) {
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x - 20, y(line));
    g.lineTo(x + 20, y(line));
    g.stroke();
  }
}

// ---------- steps ----------

function makeStep(kind: StepKind, drink: Drink): StepRun {
  const info = STEPS[kind];
  const color = LIQUID[drink];
  switch (info.type) {
    case 'crank': {
      const m = new Crank(info.turns ?? 3);
      const cx = 170;
      const cy = 150;
      let angle = -Math.PI / 2;
      let idle = 0;
      let lastFill = 0;
      const powder = kind === 'sift' || kind === 'whisk' ? '#8cc56b' : kind === 'melt' ? '#7a4a32' : '#7b4b2a';
      return {
        pointer(p) {
          if (!p) return m.drag(null);
          angle = Math.atan2(p[1] - cy, p[0] - cx);
          m.drag(angle);
        },
        tick(dt) {
          idle = m.fill === lastFill ? idle + dt : 0;
          lastFill = m.fill;
          return m.fill > 0.7 && idle > 0.8 ? m.score() : null; // a pause to re-grip early on doesn't end it
        },
        finish: () => m.score(),
        draw(g) {
          // bowl / grinder seen from above, the handle following your pointer
          g.fillStyle = kind === 'grind' ? '#d9b48a' : '#f3e6d6';
          g.beginPath();
          g.arc(cx, cy, 88, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = INK;
          g.lineWidth = 3;
          g.stroke();
          g.fillStyle = powder;
          g.globalAlpha = 0.25 + 0.6 * Math.min(1, m.fill);
          g.beginPath();
          g.arc(cx, cy, 64, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 1;
          for (let k = 0; k < 6; k++) { // swirl marks that turn with the handle
            const a = angle + (k / 6) * Math.PI * 2;
            g.strokeStyle = 'rgba(255,255,255,0.35)';
            g.beginPath();
            g.arc(cx, cy, 30 + k * 5, a, a + 0.8);
            g.stroke();
          }
          const hx = cx + Math.cos(angle) * 70;
          const hy = cy + Math.sin(angle) * 70;
          g.strokeStyle = INK;
          g.lineWidth = 7;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(hx, hy);
          g.stroke();
          g.fillStyle = '#e2765a';
          g.beginPath();
          g.arc(hx, hy, 14, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = INK;
          g.beginPath();
          g.arc(cx, cy, 9, 0, Math.PI * 2);
          g.fill();
          vGauge(g, 360, 40, 210, m.fill, 1.4, 0.88, 1.12, powder, 1);
          label(g, 'stop on the line', 360, 272, INK, 12);
        },
      };
    }
    case 'tamp': {
      const m = new Tamp();
      return {
        tick(dt, held) {
          m.step(dt, held);
          return m.done ? m.score() : null;
        },
        finish: () => m.score(),
        draw(g) {
          const press = Math.min(1, m.pressure) * 26;
          g.fillStyle = '#6b6f7a'; // portafilter
          g.fillRect(70, 200, 200, 26);
          g.fillRect(260, 206, 90, 14);
          g.fillStyle = '#7b4b2a';
          g.fillRect(84, 192, 172, 10);
          g.fillStyle = '#b9bdc6'; // tamper
          g.fillRect(96, 150 + press, 148, 22);
          g.fillStyle = '#c98a5a';
          g.beginPath();
          g.roundRect(150, 70 + press, 40, 84, 14);
          g.fill();
          const gx = 360;
          const gy = 150;
          const ang = (v: number) => Math.PI + (Math.min(v, 1.1) / 1.1) * Math.PI;
          g.lineWidth = 14;
          g.strokeStyle = '#f0e2d6';
          g.beginPath();
          g.arc(gx, gy, 54, Math.PI, Math.PI * 2);
          g.stroke();
          g.strokeStyle = GREEN;
          g.beginPath();
          g.arc(gx, gy, 54, ang(Tamp.LO), ang(Tamp.HI));
          g.stroke();
          g.strokeStyle = '#e85a6a';
          g.beginPath();
          g.arc(gx, gy, 54, ang(0.95), ang(1.1));
          g.stroke();
          const a = ang(m.pressure);
          g.strokeStyle = INK;
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(gx, gy);
          g.lineTo(gx + Math.cos(a) * 48, gy + Math.sin(a) * 48);
          g.stroke();
          label(g, `in the green ${Math.min(1, m.inZone).toFixed(1)} / 1.0 s`, gx, gy + 34, INK, 12);
          if (m.over) label(g, 'too hard!', gx, gy + 54, '#e85a6a', 13);
        },
      };
    }
    case 'fill': {
      const m = new Fill();
      let started = false;
      let heldNow = false;
      return {
        tick(dt, held) {
          heldNow = held;
          m.step(dt, held);
          if (held) started = true;
          return started && !held && m.level > 0.05 ? m.score() : null;
        },
        draw(g) {
          g.fillStyle = '#8a8f99'; // group head
          g.fillRect(150, 18, 140, 44);
          g.fillStyle = '#6b6f7a';
          g.fillRect(200, 62, 40, 16);
          if (heldNow) { // two thin streams of espresso
            g.strokeStyle = LIQUID.espresso;
            g.lineWidth = 3;
            for (const dx of [-8, 8]) {
              g.beginPath();
              g.moveTo(220 + dx, 78);
              g.lineTo(220 + dx * 0.6, 150 + 110 * (1 - m.level / 1.2));
              g.stroke();
            }
          }
          drawCup(g, 220, 150, 130, 110, m.level / 1.2, LIQUID.espresso, [0.8 / 1.2, 1.0 / 1.2]);
          label(g, 'let go between the marks', 220, 282, INK, 12);
        },
      };
    }
    case 'heat': {
      const m = new Heat();
      let started = false;
      let heldNow = false;
      return {
        tick(dt, held) {
          heldNow = held;
          m.step(dt, held);
          if (held) started = true;
          return started && !held && m.base > 30 ? m.score() : null;
        },
        draw(g) {
          g.fillStyle = '#c9ced8'; // jug
          g.beginPath();
          g.moveTo(110, 110);
          g.lineTo(230, 110);
          g.lineTo(240, 250);
          g.lineTo(100, 250);
          g.closePath();
          g.fill();
          g.strokeStyle = INK;
          g.lineWidth = 3;
          g.stroke();
          g.fillStyle = '#fffaf3';
          g.fillRect(108, 150, 126, 96);
          g.strokeStyle = '#8a8f99'; // wand
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(170, 20);
          g.lineTo(170, 200);
          g.stroke();
          if (heldNow) {
            for (let k = 0; k < 5; k++) {
              const t = (performance.now() / 400 + k / 5) % 1;
              g.fillStyle = `rgba(255,255,255,${0.8 * (1 - t)})`;
              g.beginPath();
              g.arc(150 + k * 10, 100 - t * 80, 8 + t * 12, 0, Math.PI * 2);
              g.fill();
            }
          }
          const tx = 340;
          g.fillStyle = '#f0e2d6';
          g.beginPath();
          g.roundRect(tx - 12, 30, 24, 210, 12);
          g.fill();
          const y = (v: number) => 236 - ((Math.min(90, v) - 20) / 70) * 200;
          g.fillStyle = GREEN;
          g.fillRect(tx - 12, y(Heat.HI), 24, y(Heat.LO) - y(Heat.HI));
          g.fillStyle = '#f5b5b5';
          g.fillRect(tx - 12, y(90), 24, y(75) - y(90));
          g.fillStyle = '#e85a6a';
          g.fillRect(tx - 5, y(m.temp), 10, 236 - y(m.temp));
          g.beginPath();
          g.arc(tx, 248, 16, 0, Math.PI * 2);
          g.fill();
          label(g, `${Math.round(m.temp)}°`, tx + 26, y(m.temp) + 5, INK, 14, 'left');
          label(g, '60–65°', tx - 24, y(62.5) + 4, '#3f9e5a', 12, 'right');
        },
      };
    }
    case 'pour': {
      const m = new Pour();
      const milk = drink === 'espresso' ? '#fff' : drink === 'matcha' ? '#cfe9b8' : drink === 'cocoa' ? '#a87454' : '#d8b48c';
      return {
        tick(dt, held) {
          m.step(dt, held);
          return m.done ? m.score() : null;
        },
        draw(g) {
          const cx = 250;
          const top = 150;
          const tilt = m.tilt * 1.2;
          const spout: Pt = [120 + Math.cos(tilt) * 78 - Math.sin(tilt) * -50, 90 + Math.sin(tilt) * 78 + Math.cos(tilt) * -50];
          if (m.flow > 0 || m.streaming) {
            g.strokeStyle = milk;
            g.lineWidth = 3 + m.flow * 10;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(spout[0], spout[1]);
            g.quadraticCurveTo(spout[0] + 40, spout[1] + 10, cx - 6, top + 6);
            g.stroke();
          }
          drawCup(g, cx, top, 130, 110, m.level, milk, [0.85]);
          if (m.spilled) {
            g.fillStyle = milk;
            g.beginPath();
            g.ellipse(cx, top + 118, 90, 8, 0, 0, Math.PI * 2);
            g.fill();
            label(g, 'spilled!', cx, 282, '#e85a6a', 13);
          } else label(g, 'stop at the line', cx, 282, INK, 12);
          g.save(); // the jug, tilting toward the cup
          g.translate(120, 90);
          g.rotate(tilt);
          g.strokeStyle = INK; // handle
          g.lineWidth = 6;
          g.beginPath();
          g.arc(-48, 0, 24, Math.PI / 2, Math.PI * 1.5);
          g.stroke();
          g.fillStyle = '#d5dae3'; // steel jug with a pointed spout
          g.beginPath();
          g.moveTo(-40, -40);
          g.lineTo(44, -40);
          g.lineTo(78, -50);
          g.lineTo(50, -24);
          g.lineTo(42, 40);
          g.quadraticCurveTo(0, 50, -44, 40);
          g.closePath();
          g.fill();
          g.lineWidth = 3;
          g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.5)';
          g.fillRect(-30, -30, 8, 56);
          g.restore();
        },
      };
    }
    case 'art': {
      const shapes = ['heart', 'tulip', 'swirl'] as const;
      const shape = shapes[Math.floor(Date.now() / 1000) % 3];
      const cx = W / 2;
      const cy = H / 2;
      const guide: Pt[] = guideShape(shape).map(([x, y]) => [cx + x * 95, cy + y * 95]);
      const stroke: Pt[] = [];
      const strokes: Pt[][] = [];
      let current: Pt[] | null = null;
      const crema = LIQUID[drink];
      return {
        pointer(p) {
          if (!p) {
            current = null;
            return;
          }
          if (!current) {
            current = [];
            strokes.push(current);
          }
          const prev = current.at(-1);
          if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 3) {
            current.push(p);
            stroke.push(p);
          }
        },
        tick: () => null,
        finish: () => artScore(guide, stroke),
        draw(g) {
          g.fillStyle = '#fffaf3';
          g.beginPath();
          g.arc(cx, cy, 132, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = INK;
          g.lineWidth = 3;
          g.stroke();
          g.fillStyle = crema;
          g.beginPath();
          g.arc(cx, cy, 118, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.35)';
          for (const [x, y] of guide) {
            g.beginPath();
            g.arc(x, y, 3, 0, Math.PI * 2);
            g.fill();
          }
          g.strokeStyle = '#fdf6ea';
          g.lineWidth = 10;
          g.lineCap = 'round';
          g.lineJoin = 'round';
          for (const s of strokes) {
            g.beginPath();
            s.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
            g.stroke();
          }
          label(g, `trace the ${shape}`, cx, H - 6, INK, 12);
        },
      };
    }
  }
}
