import * as THREE from 'three';
import { PALETTE } from '../../../shared/art';
import { DEFAULT_MUG, MUG_PRICE, MUG_SHAPES, type Mug } from '../../../shared/mug';
import type { Wallet } from '../../../shared/types';
import { h } from '../hud/dom';
import type { Hud } from '../hud/hud';
import { mugMesh } from '../world/items';
import { disposeTree } from '../world/materials';

/** Pottery wheel: pick a shape and two colours, watch it spin, fire it for MUG_PRICE KP. */
export function openPottery(hud: Hud, wallet: () => Wallet | null, current: Mug | null, onFire: (mug: Mug) => void): void {
  const mug: Mug = { ...(current ?? DEFAULT_MUG) };
  const canvas = h('canvas', {});
  canvas.style.cssText = 'width:160px;height:160px;border-radius:16px;background:radial-gradient(circle at 50% 40%,#fff8ee,#f2e2f0)';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(160, 160, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff3e0', '#b0a0c0', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(2, 3, 3);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  cam.position.set(0, 0.25, 1.1);
  cam.lookAt(0, 0.06, 0);
  let spin: THREE.Group | null = null;
  let raf = 0;
  let live = true;
  const loop = () => {
    if (spin) spin.rotation.y += 0.02;
    renderer.render(scene, cam);
    raf = requestAnimationFrame(loop);
  };
  const dispose = () => {
    if (!live) return;
    live = false;
    cancelAnimationFrame(raf);
    disposeTree(scene);
    renderer.dispose();
  };
  const rebuild = () => {
    if (spin) {
      scene.remove(spin);
      disposeTree(spin);
    }
    spin = mugMesh(mug);
    scene.add(spin);
  };

  const shapes = h('div', { className: 'hats' });
  const swatchRow = (key: 'glaze' | 'accent') => {
    const row = h('div', { className: 'swatches' });
    const btns = PALETTE.map((hex) => {
      const b = h('button', { type: 'button', className: 'swatch', title: hex, onclick: () => { mug[key] = hex; render(); } });
      b.style.background = hex;
      return b;
    });
    row.append(...btns);
    return { row, btns, key };
  };
  const rows = [swatchRow('glaze'), swatchRow('accent')];
  const fire = h('button', { type: 'button', className: 'primary' });
  const render = () => {
    shapes.replaceChildren(...MUG_SHAPES.map((s) =>
      h('button', { type: 'button', className: mug.shape === s ? 'on' : '', textContent: s, onclick: () => { mug.shape = s; render(); } })));
    rows.forEach((r) => r.btns.forEach((b, i) => b.classList.toggle('on', PALETTE[i] === mug[r.key])));
    const w = wallet();
    const free = !!w?.admin;
    fire.textContent = `Fire it · ${free ? 'free' : `${MUG_PRICE} ✨`}`;
    fire.disabled = !free && (w?.kp ?? 0) < MUG_PRICE;
    rebuild();
  };
  fire.onclick = () => {
    onFire({ ...mug });
    hud.finishModal();
    dispose();
  };
  render();
  hud.openModal(h('div', {},
    h('h2', { textContent: '🏺 Pottery wheel' }),
    h('div', { className: 'wardrobe-body' }, canvas, h('div', { className: 'wardrobe-side' },
      h('label', { className: 'field' }, 'Shape', shapes),
      h('label', { className: 'field' }, 'Glaze', rows[0].row),
      h('label', { className: 'field' }, 'Accent', rows[1].row))),
    h('div', { className: 'wardrobe-footer' },
      h('button', { type: 'button', textContent: 'Cancel', onclick: () => hud.closeModals() }), fire)), dispose);
  raf = requestAnimationFrame(loop);
}
