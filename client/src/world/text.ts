import * as THREE from 'three';

export interface LabelOpts {
  font?: number;
  fg?: string;
  bg?: string | null;
  pad?: number;
  weight?: number;
}

const FONT_FAMILY = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif';

export function labelTexture(text: string, o: LabelOpts = {}): { tex: THREE.CanvasTexture; aspect: number } {
  const font = o.font ?? 48;
  const pad = o.pad ?? 16;
  const f = `${o.weight ?? 700} ${font}px ${FONT_FAMILY}`;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = f;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  const h = font + pad * 2;
  c.width = w;
  c.height = h;
  g.font = f; // resizing the canvas resets the context
  if (o.bg) {
    g.fillStyle = o.bg;
    g.beginPath();
    g.roundRect(0, 0, w, h, h / 2);
    g.fill();
  }
  g.fillStyle = o.fg ?? '#4a4058';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + font * 0.05);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: w / h };
}

/** Camera-facing label that always draws on top (name tags, emotes). */
export function textSprite(text: string, height: number, o: LabelOpts = {}): THREE.Sprite {
  const { tex, aspect } = labelTexture(text, o);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(height * aspect, height, 1);
  s.renderOrder = 10;
  return s;
}
