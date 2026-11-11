import { PAINT_SIZE, PAINTING_MAX_BYTES, PRICE_RANGE, TITLE_MAX, type PaintMode } from '../../../shared/art';
import { h } from '../hud/dom';
import type { Hud } from '../hud/hud';
import { PALETTE, Undo, blank, floodFill, hexToRgba, line, stamp } from './paintCore';

export interface PaintSave {
  title: string;
  price: number;
  forSale: boolean;
  mode: PaintMode;
  /** Base64 PNG, without the data-URL prefix. */
  png: string;
}

type Tool = 'brush' | 'eraser' | 'fill';
const TOOLS: [Tool, string][] = [['brush', '🖌️ Brush'], ['eraser', '🧽 Eraser'], ['fill', '🪣 Fill']];
const FREE_RADII = [3, 7, 14];
const SIZE_LABELS = ['S', 'M', 'L'];
const WHITE = hexToRgba('#ffffff');
const SHRINK = 192;

const b64Of = (c: HTMLCanvasElement) => c.toDataURL('image/png').split(',')[1];
const bytesOf = (b64: string) => (b64.length * 3) / 4;

/** The PNG to save, or null if it's over the size limit even after shrinking (freehand only). */
function exportPng(canvas: HTMLCanvasElement, mode: PaintMode): string | null {
  const b64 = b64Of(canvas);
  if (bytesOf(b64) <= PAINTING_MAX_BYTES) return b64;
  if (mode !== 'free') return null;
  const small = h('canvas', { width: SHRINK, height: SHRINK });
  small.getContext('2d')!.drawImage(canvas, 0, 0, SHRINK, SHRINK);
  const retry = b64Of(small);
  return bytesOf(retry) <= PAINTING_MAX_BYTES ? retry : null;
}

/** Sends the painting; call done(true) once the server has saved it, done(false) if it refused. */
export type OnSave = (p: PaintSave, done: (ok: boolean) => void) => void;

/** The easel: pick pixel art or freehand, paint, then hang it for sale or keep it. */
export function openPaint(hud: Hud, onSave: OnSave): void {
  const choice = (label: string, mode: PaintMode) =>
    h('button', { className: 'choice', type: 'button', onclick: () => openEditor(hud, mode, onSave) }, h('b', { textContent: label }));
  hud.openModal(h('div', {},
    h('h2', { textContent: '🎨 Paint something' }),
    h('div', { className: 'choices paint-modes' },
      choice('Pixel art · 32×32', 'pixel'),
      choice('Freehand · 256×256', 'free')),
  ));
}

function openEditor(hud: Hud, mode: PaintMode, onSave: OnSave): void {
  const n = PAINT_SIZE[mode];
  const canvas = h('canvas', { className: `paint-canvas ${mode}`, width: n, height: n });
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const undo = new Undo();
  let data = blank(n);
  let tool: Tool = 'brush';
  let colour = PALETTE[3];
  let size = 1;

  const draw = () => {
    img.data.set(data);
    ctx.putImageData(img, 0, 0);
  };
  const rgba = () => (tool === 'eraser' ? WHITE : hexToRgba(colour));
  const radius = () => (mode === 'pixel' ? 0 : FREE_RADII[size]);

  // ---- pointer: client coords → canvas pixel ----
  const at = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * n), Math.floor(((e.clientY - r.top) / r.height) * n)];
  };
  let active: number | null = null;
  let last: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (active !== null || e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    undo.push(data);
    const [x, y] = at(e);
    if (tool === 'fill') {
      floodFill(data, n, x, y, rgba());
    } else {
      active = e.pointerId;
      last = [x, y];
      stamp(data, n, x, y, radius(), rgba());
    }
    draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active || !last) return;
    const p = at(e);
    line(data, n, last[0], last[1], p[0], p[1], radius(), rgba());
    last = p;
    draw();
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    active = null;
    last = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // ---- tools, sizes, palette ----
  const toolBtns = TOOLS.map(([t, label]) => h('button', { type: 'button', textContent: label, onclick: () => setTool(t) }));
  const setTool = (t: Tool) => {
    tool = t;
    toolBtns.forEach((b, i) => b.classList.toggle('on', TOOLS[i][0] === t));
  };
  const sizeBtns = SIZE_LABELS.map((label, i) => h('button', { type: 'button', textContent: label, title: `Brush size ${FREE_RADII[i]}`, onclick: () => setSize(i) }));
  const setSize = (i: number) => {
    size = i;
    sizeBtns.forEach((b, k) => b.classList.toggle('on', k === i));
  };
  const swatches = PALETTE.map((hex) => {
    const b = h('button', { type: 'button', className: 'swatch', title: hex, onclick: () => setColour(hex) });
    b.style.background = hex;
    return b;
  });
  const setColour = (hex: string) => {
    colour = hex;
    swatches.forEach((b, i) => b.classList.toggle('on', PALETTE[i] === hex));
    if (tool === 'eraser') setTool('brush');
  };
  setTool('brush');
  setSize(size);
  setColour(colour);

  const undoBtn = h('button', { type: 'button', textContent: '↩️ Undo', onclick: () => {
    const prev = undo.pop();
    if (!prev) return;
    data = prev;
    draw();
  } });
  const clearBtn = h('button', { type: 'button', textContent: '🧹 Clear', onclick: () => {
    undo.push(data);
    data = blank(n);
    draw();
  } });

  // ---- title, price, save ----
  const title = h('input', { maxLength: TITLE_MAX, placeholder: 'Title' });
  const price = h('input', { type: 'number', min: String(PRICE_RANGE[0]), max: String(PRICE_RANGE[1]), value: '10' });
  const save = (forSale: boolean) => {
    const t = title.value.trim();
    if (!t) {
      hud.toast('Give your painting a title first');
      title.focus();
      return;
    }
    const p = Math.min(PRICE_RANGE[1], Math.max(PRICE_RANGE[0], Math.round(Number(price.value)) || 10));
    const png = exportPng(canvas, mode);
    if (!png) {
      hud.toast('Too detailed to save — try fewer colours');
      return;
    }
    // the editor stays open until the server answers, so a refused painting isn't lost
    saveBtns.forEach((b) => (b.disabled = true));
    onSave({ title: t, price: p, forSale, mode, png }, (ok) => {
      if (!canvas.isConnected) return;
      if (ok) hud.finishModal();
      else saveBtns.forEach((b) => (b.disabled = false));
    });
  };
  const saveBtns = [
    h('button', { type: 'button', className: 'primary', textContent: 'Hang for sale', onclick: () => save(true) }),
    h('button', { type: 'button', textContent: 'Keep for myself', onclick: () => save(false) }),
  ];

  draw();
  hud.openModal(h('div', { className: 'paint' },
    h('h2', { textContent: mode === 'pixel' ? '🎨 Pixel art' : '🎨 Freehand' }),
    h('div', { className: 'paint-body' },
      canvas,
      h('div', { className: 'paint-side' },
        h('div', { className: 'paint-tools' }, ...toolBtns, ...(mode === 'free' ? sizeBtns : []), undoBtn, clearBtn),
        h('div', { className: 'paint-tools' }, ...swatches),
        h('div', { className: 'paint-fields' },
          h('label', { className: 'field' }, 'Title', title),
          h('label', { className: 'field price' }, 'Price ✨', price)),
        h('div', { className: 'paint-footer' },
          ...saveBtns,
          h('button', { type: 'button', textContent: 'Cancel', onclick: () => hud.closeModals() })))),
  ), undefined, true);
}
