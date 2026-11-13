import * as THREE from 'three';
import { TITLE_MAX } from '../../../shared/art';
import { BOOTH_CAM } from '../../../shared/scenes/studio';
import { h } from '../hud/dom';
import type { Hud } from '../hud/hud';

export type BoothStep = 3 | 2 | 1 | 'shoot';
const STEPS: BoothStep[] = [3, 2, 1, 'shoot'];
export const BOOTH_GAP_MS = 10_000;
const PHOTO = 256;

/** The booth's 3-2-1 countdown (1 s steps) and its one-use-per-10-s guard. */
export class BoothTimer {
  private t0: number | null = null;
  private shown = 0;

  canUse(now: number): boolean {
    return this.t0 === null || now - this.t0 >= BOOTH_GAP_MS;
  }

  start(now: number): void {
    this.t0 = now;
    this.shown = 0;
  }

  /** The next step once it's due (each step once, in order), else null. */
  tick(now: number): BoothStep | null {
    if (this.t0 === null || this.shown >= STEPS.length) return null;
    if (now - this.t0 < this.shown * 1000) return null;
    return STEPS[this.shown++];
  }
}

/** Linear byte → sRGB byte. */
const SRGB = Uint8Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
});

/** Renders the scene from the booth camera into a 256×256 JPEG data URL (world only, no HUD). */
export function capturePhoto(renderer: THREE.WebGLRenderer, scene: THREE.Scene, pose = BOOTH_CAM): string {
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  cam.position.set(pose.x, pose.y, pose.z);
  cam.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  const rt = new THREE.WebGLRenderTarget(PHOTO, PHOTO, { samples: 4 });
  const prev = renderer.getRenderTarget();
  const px = new Uint8Array(PHOTO * PHOTO * 4);
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, PHOTO, PHOTO, px);
  renderer.setRenderTarget(prev);
  rt.dispose();
  // shortcut: render targets stay linear and skip tone mapping, so we only sRGB-encode here (8-bit, slight shadow banding); a float target + ACES if photos look off
  const canvas = h('canvas', { width: PHOTO, height: PHOTO });
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(PHOTO, PHOTO);
  const row = PHOTO * 4;
  for (let y = 0; y < PHOTO; y++) {
    const src = (PHOTO - 1 - y) * row; // GL rows are bottom-up
    for (let i = 0; i < row; i += 4) {
      img.data[y * row + i] = SRGB[px[src + i]];
      img.data[y * row + i + 1] = SRGB[px[src + i + 1]];
      img.data[y * row + i + 2] = SRGB[px[src + i + 2]];
      img.data[y * row + i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/** A white flash over the screen, faded out by CSS. */
export function flash(): void {
  const el = h('div', { className: 'flash' });
  el.addEventListener('animationend', () => el.remove());
  document.body.append(el);
}

/** Shows the photo with a caption box: Keep sends it on, Discard drops it. */
export function openPhotoPreview(hud: Hud, dataUrl: string, onKeep: (title: string, done: (ok: boolean) => void) => void, onDiscard: () => void): void {
  const caption = h('input', { type: 'text', maxLength: TITLE_MAX, placeholder: 'Caption', value: 'Photo booth' });
  const keep = () => {
    const title = caption.value.trim();
    if (!title) return hud.toast('Give your photo a caption first');
    keepBtn.disabled = true;
    // stays open until the server saves it, so a refused photo (e.g. too soon after the last) isn't lost
    onKeep(title, (ok) => (ok ? hud.finishModal() : (keepBtn.disabled = false)));
  };
  const keepBtn = h('button', { type: 'button', className: 'primary', textContent: 'Keep', onclick: keep });
  hud.openModal(h('div', { className: 'photo-preview' },
    h('h2', { textContent: '📸 Your photo' }),
    h('img', { src: dataUrl, alt: 'Your photo' }),
    caption,
    h('div', { className: 'actions' },
      h('button', { type: 'button', textContent: 'Discard', onclick: () => { hud.finishModal(); onDiscard(); } }),
      keepBtn),
  ), onDiscard);
}

/** Runs a started timer, calling onStep for each step until the shot. */
export function runCountdown(timer: BoothTimer, onStep: (s: BoothStep) => void): void {
  const iv = setInterval(() => {
    const s = timer.tick(performance.now());
    if (s === 'shoot') clearInterval(iv);
    if (s !== null) onStep(s);
  }, 50);
}
