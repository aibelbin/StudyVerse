import type { Bounds } from '../../../shared/geometry';
import type { SceneDef } from '../../../shared/scenes/types';
import type { ToyKind } from '../../../shared/toys';

/** World (x, z) to minimap pixels; north (-z) is up. */
export function worldToMap(x: number, z: number, size: Bounds, w: number, h: number): { u: number; v: number } {
  return { u: (x / size.w + 0.5) * w, v: (z / size.d + 0.5) * h };
}

const ICONS: Partial<Record<ToyKind, string>> = {
  piano: '🎹', jukebox: '🎵', fountain: '⛲', bell: '🔔', chimes: '🎐', campfire: '🔥', telescope: '🔭',
  ducks: '🦆', swing: '🛝', merryGoRound: '🎠', stones: '🪨', slide: '🛝', seesaw: '⚖️',
  shop: '👕', board: '📌', quotes: '📖', coffee: '☕', koi: '🎏', cushions: '🧘', drums: '🎤',
};

export interface MapDot {
  x: number;
  z: number;
  color: string;
}

export interface MapVehicle {
  x: number;
  z: number;
  heading: number;
  icon: string;
}

/** A small map in the corner (M for a big one): terrain drawn once per scene, people and vehicles every frame. */
export class Minimap {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private layer = document.createElement('canvas');
  private def: SceneDef | null = null;
  private big = false;
  private last = 0;

  constructor(parent: HTMLElement) {
    this.canvas.id = 'minimap';
    this.canvas.className = 'glass';
    this.canvas.title = 'Map (M to enlarge)';
    this.canvas.addEventListener('click', () => this.toggle());
    parent.append(this.canvas);
    this.resize();
  }

  toggle(): void {
    this.big = !this.big;
    this.canvas.classList.toggle('big', this.big);
    this.resize();
    if (this.def) this.setScene(this.def);
  }

  private resize(): void {
    const dpr = Math.min(devicePixelRatio, 2);
    const [w, h] = this.big ? [640, 480] : [200, 150];
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  setScene(def: SceneDef): void {
    this.def = def;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.layer.width = W;
    this.layer.height = H;
    const g = this.layer.getContext('2d')!;
    const m = (x: number, z: number) => worldToMap(x, z, def.size, W, H);
    const k = W / def.size.w; // pixels per metre
    g.fillStyle = def.theme.indoor ? def.theme.floor : '#a8d898';
    g.fillRect(0, 0, W, H);
    const rect = (x: number, z: number, w: number, d: number, color: string) => {
      const p = m(x - w / 2, z - d / 2);
      g.fillStyle = color;
      g.fillRect(p.u, p.v, w * k, d * k);
    };
    for (const d of def.decor) if (d.kind === 'path') rect(d.x, d.z, d.w ?? 1, d.d ?? 1, '#efdcb6');
    for (const d of def.decor) if (d.kind === 'parking') rect(d.x, d.z, d.w ?? 1, d.d ?? 1, '#8e9097');
    for (const b of def.parking ?? []) rect(b.x - 1.6, b.z, 0.25, 5, '#f4f1e8'); // bay lines
    if (def.water) {
      g.fillStyle = '#8fd0e8';
      g.beginPath();
      def.water.outline.forEach(([x, z], i) => {
        const p = m(x, z);
        if (i) g.lineTo(p.u, p.v);
        else g.moveTo(p.u, p.v);
      });
      g.fill();
    }
    for (const d of def.decor) {
      if (d.kind === 'dock') rect(d.x, d.z, d.w ?? 2, d.d ?? 8, '#c99a6e');
      else if (d.kind === 'stage') rect(d.x, d.z, d.w ?? 8, d.d ?? 5, '#c99a6e');
      else if (d.kind === 'gravel') rect(d.x, d.z, d.w ?? 2, d.d ?? 2, '#ece4d4');
      else if (d.kind === 'pond') {
        const p = m(d.x, d.z);
        g.fillStyle = '#8fd0e8';
        g.beginPath();
        g.ellipse(p.u, p.v, ((d.w ?? 4) / 2) * k, ((d.d ?? 3) / 2) * k, 0, 0, Math.PI * 2);
        g.fill();
      }
      else if (d.kind === 'hedge') rect(d.x, d.z, d.w ?? 1, d.d ?? 1, '#4f9e6a');
      else if (d.kind === 'building') rect(d.x, d.z, d.w ?? 6, d.d ?? 5, d.accent ?? '#9c6f4c');
      else if (d.kind === 'desk' || d.kind === 'counter') rect(d.x, d.z, d.w ?? 1.4, d.d ?? 0.8, '#b58860');
      else if (d.kind === 'bookshelf') rect(d.x, d.z, d.rot && Math.abs(Math.sin(d.rot)) > 0.5 ? 0.45 : d.w ?? 2.2, d.rot && Math.abs(Math.sin(d.rot)) > 0.5 ? d.w ?? 2.2 : 0.45, '#8a5a3c');
      else if (d.kind === 'cafeTable') {
        const p = m(d.x, d.z);
        g.fillStyle = '#d8b48a';
        g.beginPath();
        g.arc(p.u, p.v, 0.45 * k, 0, Math.PI * 2);
        g.fill();
      }
      else if (d.kind === 'tree' || d.kind === 'pine') {
        if (Math.abs(d.x) > def.size.w / 2 || Math.abs(d.z) > def.size.d / 2) continue;
        const p = m(d.x, d.z);
        g.fillStyle = d.kind === 'pine' ? '#4f9e6a' : '#6cbf6a';
        g.beginPath();
        g.arc(p.u, p.v, Math.max(1.5, 0.7 * k * (d.h ?? 1)), 0, Math.PI * 2);
        g.fill();
      }
    }
    if (def.theme.indoor) {
      g.strokeStyle = '#9c6f4c';
      g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, W - 3, H - 3);
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round((this.big ? 20 : 11) * (W / (this.big ? 640 : 200)))}px system-ui`;
    const seen = new Set<string>();
    for (const t of def.toys) {
      const icon = ICONS[t.kind];
      if (!icon || seen.has(`${t.kind}${Math.round(t.x / 6)}${Math.round(t.z / 6)}`)) continue;
      seen.add(`${t.kind}${Math.round(t.x / 6)}${Math.round(t.z / 6)}`);
      const p = m(t.x, t.z);
      g.fillText(icon, p.u, p.v);
    }
    for (const d of def.doors) {
      const p = m(d.box.x, d.box.z);
      g.fillText('🚪', p.u, p.v);
    }
  }

  draw(now: number, me: { x: number; z: number; facing: number; color: string }, others: MapDot[], vehicles: MapVehicle[]): void {
    if (!this.def || now - this.last < 100) return;
    this.last = now;
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = W / (this.big ? 640 : 200);
    g.drawImage(this.layer, 0, 0);
    const m = (x: number, z: number) => worldToMap(x, z, this.def!.size, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(13 * s * (this.big ? 1.4 : 1))}px system-ui`;
    for (const v of vehicles) {
      const p = m(v.x, v.z);
      g.fillText(v.icon, p.u, p.v);
    }
    for (const o of others) {
      const p = m(o.x, o.z);
      g.fillStyle = o.color;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.5 * s;
      g.beginPath();
      g.arc(p.u, p.v, 3.5 * s, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    const p = m(me.x, me.z);
    g.save();
    g.translate(p.u, p.v);
    g.rotate(Math.PI - me.facing); // facing 0 = +z = down the map
    g.fillStyle = me.color;
    g.strokeStyle = '#3b3346';
    g.lineWidth = 1.5 * s;
    g.beginPath();
    g.moveTo(0, -7 * s);
    g.lineTo(5 * s, 5 * s);
    g.lineTo(0, 2.5 * s);
    g.lineTo(-5 * s, 5 * s);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
