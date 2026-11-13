import { TITLE_MAX } from '../../../shared/art';
import { CONSTELLATION_EDGES, skyDir, STAR_COUNT, STAR_SEED, starField, type Constellation } from '../../../shared/stars';
import { h } from '../hud/dom';
import type { Hud } from '../hud/hud';

type Edge = [number, number];

const FIELD = starField(STAR_SEED, STAR_COUNT);

/** The star field as the telescope sees it: each star's dome direction (skyDir) through a pinhole camera facing the middle of the band. */
const FLAT = (() => {
  const [, sinE, negCosE] = skyDir(0.5, 0.5);
  const cosE = -negCosE;
  return FIELD.map((s) => {
    const [x, y, z] = skyDir(s.x, s.y);
    const depth = y * sinE - z * cosE;
    return { x: x / depth, y: -(y * cosE + z * sinE) / depth, mag: s.mag };
  });
})();

function segDist(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const k = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - a.x - k * dx, py - a.y - k * dy);
}

/** The observatory: tap a star then another to draw a line (up to CONSTELLATION_EDGES), tap a line to remove it, name it and save. Everyone else's are drawn faintly. */
export function openStars(hud: Hud, all: Constellation[], me: string, onSave: (name: string, edges: Edge[]) => void): void {
  const mine = all.find((c) => c.owner === me);
  const others = all.filter((c) => c.owner !== me);
  let edges: Edge[] = mine ? mine.edges.map(([a, b]) => [a, b]) : [];
  let sel: number | null = null;
  const canvas = h('canvas', {});
  const name = h('input', { type: 'text', maxLength: TITLE_MAX, placeholder: 'Name your constellation', value: mine?.name ?? '' });
  const count = h('small', {});
  const save = () => {
    const n = name.value.trim();
    if (!n || !edges.length) return hud.toast('Draw at least one line and give it a name ✨', 2500);
    onSave(n, edges);
    hud.finishModal();
    hud.toast('✨ Your constellation is up in the night sky', 3500);
  };
  hud.openModal(h('div', { className: 'stars-editor' },
    h('h2', { textContent: '🔭 Draw your constellation' }),
    h('p', { className: 'sub', textContent: 'Tap a star, then another to join them. Tap a line to rub it out.' }),
    canvas,
    h('div', { className: 'row' }, name, count,
      h('button', { type: 'button', textContent: 'Clear', onclick: () => { edges = []; sel = null; draw(); } }),
      h('button', { type: 'button', textContent: 'Cancel', onclick: () => hud.closeModals() }),
      h('button', { className: 'primary', type: 'button', textContent: 'Save', onclick: save })),
  ));
  canvas.closest('.modal')!.classList.add('stars-modal');

  // shortcut: sized once on open, so rotating a phone mid-edit leaves it letterboxed; listen for resize if that bothers anyone.
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const xs = FLAT.map((p) => p.x);
  const ys = FLAT.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const m = 20;
  const k = Math.min((rect.width - 2 * m) / (x1 - x0), (rect.height - 2 * m) / (y1 - y0));
  const pts = FLAT.map((p) => ({
    x: rect.width / 2 + (p.x - (x0 + x1) / 2) * k,
    y: rect.height / 2 + (p.y - (y0 + y1) / 2) * k,
    mag: p.mag,
  }));

  const lines = (es: Edge[], style: string, width: number) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    g.beginPath();
    for (const [a, b] of es) {
      g.moveTo(pts[a].x, pts[a].y);
      g.lineTo(pts[b].x, pts[b].y);
    }
    g.stroke();
  };
  function draw(): void {
    g.clearRect(0, 0, rect.width, rect.height);
    g.font = '12px system-ui, sans-serif';
    g.textAlign = 'center';
    for (const c of others) {
      lines(c.edges, 'rgba(190, 210, 255, 0.28)', 1);
      const ids = [...new Set(c.edges.flat())];
      g.fillStyle = 'rgba(210, 222, 255, 0.5)';
      g.fillText(c.name, ids.reduce((s, i) => s + pts[i].x, 0) / ids.length, ids.reduce((s, i) => s + pts[i].y, 0) / ids.length - 8);
    }
    lines(edges, '#ffe7a0', 2);
    for (const [i, p] of pts.entries()) {
      g.fillStyle = `rgba(255, 255, 255, ${0.45 + 0.55 * p.mag})`;
      g.beginPath();
      g.arc(p.x, p.y, 1.2 + p.mag * 2.2, 0, Math.PI * 2);
      g.fill();
      if (i === sel) {
        g.strokeStyle = '#ffe7a0';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(p.x, p.y, 9, 0, Math.PI * 2);
        g.stroke();
      }
    }
    count.textContent = `${edges.length}/${CONSTELLATION_EDGES} lines`;
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    let star = -1;
    let best = 22; // finger-sized
    for (const [i, p] of pts.entries()) {
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < best) [star, best] = [i, d];
    }
    if (star < 0) {
      const hit = edges.findIndex(([a, b]) => segDist(px, py, pts[a], pts[b]) < 10);
      if (hit >= 0) edges.splice(hit, 1);
      sel = null;
    } else if (sel === null || sel === star) {
      sel = sel === star ? null : star;
    } else if (edges.some(([a, b]) => (a === sel && b === star) || (a === star && b === sel))) {
      sel = star;
    } else if (edges.length >= CONSTELLATION_EDGES) {
      hud.toast(`${CONSTELLATION_EDGES} lines at most: tap one to rub it out`, 2500);
    } else {
      edges.push([sel, star]);
      sel = star; // keep drawing from here
    }
    draw();
  });
  draw();
}
