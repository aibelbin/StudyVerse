import * as THREE from 'three';
import type { EmoteKind, Session } from '../../../shared/types';
import { textSprite } from './text';
import { toonMat } from './materials';

const EMOJI: Record<EmoteKind, string> = { wave: '👋', clap: '👏', flex: '💪', coffee: '☕' };
const EMOTE_MS = 1600;

/** Everything floating above a character: session ring, rain cloud, emotes. */
export class Overhead {
  readonly group = new THREE.Group();
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private ring: THREE.Sprite;
  private ringKey = '';
  private cloud = new THREE.Group();
  private drops: THREE.Mesh[] = [];
  private emotes: { s: THREE.Sprite; born: number }[] = [];
  private bubbleSprite: THREE.Sprite | null = null;
  private bubbleAt = 0;

  constructor() {
    this.canvas.width = this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true }));
    this.ring.scale.set(0.62, 0.62, 1);
    this.ring.renderOrder = 11;
    this.ring.visible = false;
    this.group.add(this.ring);

    const cm = toonMat({ color: '#9aa3b5', roughness: 1 });
    for (const [x, y, r] of [[0, 0, 0.22], [0.22, -0.03, 0.17], [-0.22, -0.03, 0.17], [0.08, 0.1, 0.16]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), cm);
      m.position.set(x, y, 0);
      this.cloud.add(m);
    }
    const dm = new THREE.MeshBasicMaterial({ color: '#7fb8ff' });
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.06, 2, 6), dm);
      d.position.set(-0.2 + i * 0.1, -0.25, 0);
      d.userData.off = i * 0.37;
      this.drops.push(d);
      this.cloud.add(d);
    }
    this.cloud.visible = false;
    this.group.add(this.cloud);
  }

  setSession(s: Session | null, now: number): void {
    if (!s) {
      this.ring.visible = false;
      this.ringKey = '';
      return;
    }
    const len = (s.phase === 'focus' ? s.focusMin : s.breakMin) * 60_000;
    const p = Math.min(1, Math.max(0, (now - s.phaseStartedAt) / len));
    this.ring.visible = true;
    const key = `${s.phase}:${Math.round(p * 200)}`;
    if (key === this.ringKey) return;
    this.ringKey = key;
    this.draw(s.phase, p);
  }

  private draw(phase: Session['phase'], p: number): void {
    const g = this.ctx;
    g.clearRect(0, 0, 128, 128);
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.fill();
    g.lineWidth = 10;
    g.lineCap = 'round';
    g.strokeStyle = '#ece4ef';
    g.beginPath();
    g.arc(64, 64, 47, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = phase === 'focus' ? '#f29e4c' : '#6cc785';
    g.beginPath();
    g.arc(64, 64, 47, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(p, 0.001));
    g.stroke();
    g.font = '46px "Apple Color Emoji", "Segoe UI Emoji", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(phase === 'focus' ? '📖' : '☕', 64, 68);
    this.tex.needsUpdate = true;
  }

  setRain(on: boolean): void {
    this.cloud.visible = on;
  }

  private badge: THREE.Sprite | null = null;
  private badgeText = '';

  /** A small steady icon next to the name (🔕 do not disturb, 🎙️ on voice). Empty string hides it. */
  setBadge(text: string): void {
    if (text === this.badgeText) return;
    this.badgeText = text;
    if (this.badge) {
      this.badge.removeFromParent();
      this.badge.material.map?.dispose();
      this.badge.material.dispose();
      this.badge = null;
    }
    if (!text) return;
    this.badge = textSprite(text, 0.3, { bg: '#ffffffdd', font: 44, pad: 8 });
    this.badge.position.set(0, -0.12, 0);
    this.badge.renderOrder = 12;
    this.group.add(this.badge);
  }

  private statusSprite: THREE.Sprite | null = null;
  private statusKey = '';

  /** "🍜 Eating" as a soft pill above the head; empty hides it. */
  setStatus(text: string): void {
    if (text === this.statusKey) return;
    this.statusKey = text;
    if (this.statusSprite) {
      this.statusSprite.removeFromParent();
      this.statusSprite.material.map?.dispose();
      this.statusSprite.material.dispose();
      this.statusSprite = null;
    }
    if (!text) return;
    this.statusSprite = textSprite(text.length > 28 ? `${text.slice(0, 27)}…` : text, 0.24, { bg: '#fff4d6ee', font: 38, pad: 12 });
    this.statusSprite.position.set(0, 0.32, 0);
    this.statusSprite.renderOrder = 12;
    this.group.add(this.statusSprite);
  }

  emote(kind: EmoteKind, now: number): void {
    this.float(textSprite(EMOJI[kind], 0.5, { bg: null, font: 64, pad: 6 }), now);
  }

  /** A chat speech bubble that sits above the head for 6 s; a newer one replaces it. */
  bubble(text: string, now: number): void {
    this.clearBubble();
    const short = text.length > 60 ? `${text.slice(0, 57)}…` : text;
    const s = textSprite(short, 0.3, { bg: '#ffffffee', font: 40, pad: 14 });
    s.position.y = 0.55;
    s.renderOrder = 14;
    this.group.add(s);
    this.bubbleSprite = s;
    this.bubbleAt = now;
  }

  /** An emoji that pops up and floats away (emote wheel). */
  pop(emoji: string, now: number, size = 0.5): void {
    this.float(textSprite(emoji, size, { bg: null, font: 64, pad: 6 }), now);
  }

  private clearBubble(): void {
    if (!this.bubbleSprite) return;
    this.bubbleSprite.removeFromParent();
    this.bubbleSprite.material.map?.dispose();
    this.bubbleSprite.material.dispose();
    this.bubbleSprite = null;
  }

  /** A short text bubble that floats up and fades, e.g. "4 skips!". */
  say(text: string, now: number): void {
    this.float(textSprite(text, 0.32, { bg: '#ffffffee', font: 40, pad: 12 }), now);
  }

  private float(s: THREE.Sprite, now: number): void {
    s.position.y = -0.2;
    this.group.add(s);
    this.emotes.push({ s, born: now });
  }

  update(_dt: number, now: number): void {
    if (this.bubbleSprite) {
      const age = (now - this.bubbleAt) / 6000;
      if (age >= 1) this.clearBubble();
      else this.bubbleSprite.material.opacity = age > 0.85 ? (1 - age) / 0.15 : 1;
    }
    if (this.cloud.visible) {
      this.cloud.position.set(Math.sin(now * 0.002) * 0.05, this.ring.visible ? 0.55 : 0.1, 0);
      for (const d of this.drops) {
        const k = (now / 700 + (d.userData.off as number)) % 1;
        d.position.y = -0.2 - k * 0.45;
      }
    }
    this.emotes = this.emotes.filter(({ s, born }) => {
      const age = (now - born) / EMOTE_MS;
      if (age >= 1) {
        s.removeFromParent();
        s.material.map?.dispose();
        s.material.dispose();
        return false;
      }
      s.position.y = -0.2 + age * 0.9;
      s.material.opacity = 1 - age * age;
      return true;
    });
  }
}
