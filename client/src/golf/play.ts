import * as THREE from 'three';
import { GOLF_BALL_GAP_MS, GOLF_MAX_STROKES, GOLF_PICKUP_SCORE } from '../../../shared/constants';
import { BALL_R, FELT, HOLES, scoreName, type Hole } from '../../../shared/golf';
import type { ClientMsg, ServerMsg } from '../../../shared/protocol';
import { loadRapier } from '../drive/physics';
import { h } from '../hud/dom';
import type { Hud } from '../hud/hud';
import { Interp } from '../net/interp';
import { ballMesh } from './course';
import { aimFromDrag, GolfSim, type Vec3 } from './sim';

interface Active {
  hole: Hole;
  sim: GolfSim | null; // null while the physics engine loads
  ball: THREE.Mesh;
  rest: Vec3;
  strokes: number;
  lastSent: number;
  holedAt: number | null;
}

interface Remote {
  mesh: THREE.Mesh;
  interp: Interp;
  y: number;
  hole: number;
  dropAt: number | null;
}

export interface GolfHost {
  scene(): THREE.Scene | null;
  camera(): THREE.Camera;
  canvas: HTMLCanvasElement;
  hud: Hud;
  send(m: ClientMsg): void;
  myColor(): string;
  colorOf(id: string): string;
  myId(): string | null;
  /** Put your character next to the ball (after it stops). */
  standAt(x: number, z: number): void;
  sound(kind: 'plop' | 'splash' | 'coin', x: number, z: number): void;
  pop(x: number, y: number, z: number, text: string): void;
}

/**
 * Your mini-golf: the hole you're on (its physics, your ball, drag-to-putt), your scorecard, and
 * everyone else's balls as they roll.
 */
export class GolfPlay {
  active: Active | null = null;
  card: (number | null)[] = Array(HOLES.length).fill(null);
  private remotes = new Map<string, Remote>();
  private drag: { sx: number; sy: number; start: THREE.Vector3 } | null = null;
  private aimLine: THREE.Line;
  private power = h('div', { className: 'golf-power' }, h('span'));
  private cardEl = h('div', { className: 'glass golf-card' });
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();

  constructor(private host: GolfHost) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.aimLine = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.12, gapSize: 0.08 }));
    this.aimLine.visible = false;
    this.power.hidden = true;
    this.cardEl.hidden = true;
    document.body.append(this.power, this.cardEl);
    const c = host.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
      this.cancelDrag();
    });
  }

  /** Where the camera should look while you play: your ball. */
  focus(): { x: number; z: number } | null {
    const a = this.active;
    if (!a) return null;
    const p = a.sim ? a.sim.ballPos() : a.rest;
    return { x: p.x, z: p.z };
  }

  /** E on a tee: ask the server; the hole starts when it agrees (golfCard). */
  tee(n: number): void {
    void loadRapier(); // warm the engine while the server answers
    this.host.send({ t: 'golfTee', hole: n });
  }

  quit(): void {
    if (this.active) this.host.send({ t: 'golfQuit' });
  }

  prompt(): string | null {
    const a = this.active;
    if (!a) return null;
    if (a.holedAt !== null) return null;
    if (!a.sim) return 'Getting the course ready…';
    if (a.sim.moving) return `Hole ${a.hole.n} · ${a.hole.name} · par ${a.hole.par} · stroke ${a.strokes}`;
    return `⛳ Hole ${a.hole.n} · par ${a.hole.par} · strokes ${a.strokes}  —  drag back from anywhere and let go to putt · [Q] leave the hole`;
  }

  onMessage(m: ServerMsg): void {
    switch (m.t) {
      case 'golfCard': {
        this.card = m.card;
        if (m.hole !== null && (!this.active || this.active.hole.n !== m.hole)) this.begin(m.hole);
        else if (m.hole === null && this.active && this.active.holedAt === null) this.end();
        if (this.active && m.hole === this.active.hole.n) this.active.strokes = m.strokes;
        this.renderCard();
        break;
      }
      case 'golfBall': {
        if (m.id === this.host.myId()) break;
        let r = this.remotes.get(m.id);
        if (!r || r.hole !== m.hole) {
          if (r) r.mesh.removeFromParent();
          r = { mesh: ballMesh(this.host.colorOf(m.id)), interp: new Interp(3), y: m.y, hole: m.hole, dropAt: null };
          this.host.scene()?.add(r.mesh);
          this.remotes.set(m.id, r);
        }
        r.interp.push({ x: m.x, z: m.z, facing: 0 }, performance.now());
        r.y = m.y;
        break;
      }
      case 'golfDone': {
        const hole = HOLES[m.hole - 1];
        if (m.holeInOne) {
          this.host.pop(hole.cup.x, hole.cup.y + 0.6, hole.cup.z, '🎉');
          this.host.sound('coin', hole.cup.x, hole.cup.z);
        }
        const r = this.remotes.get(m.id);
        if (r) r.dropAt = performance.now();
        if (m.id === this.host.myId()) this.finishMine(m.strokes);
        break;
      }
      case 'golfGone': {
        const r = this.remotes.get(m.id);
        r?.mesh.removeFromParent();
        this.remotes.delete(m.id);
        break;
      }
    }
  }

  /** Call every frame. */
  update(dt: number, serverNow: number): void {
    const nowP = performance.now();
    for (const [id, r] of this.remotes) {
      const p = r.interp.sample(nowP);
      if (r.dropAt !== null) {
        const k = (nowP - r.dropAt) / 500;
        if (k >= 1) {
          r.mesh.removeFromParent();
          this.remotes.delete(id);
          continue;
        }
        r.mesh.position.set(p.x, r.y - k * 0.3, p.z);
      } else {
        r.mesh.position.set(p.x, r.y, p.z);
      }
    }
    const a = this.active;
    if (!a) return;
    if (a.holedAt !== null) {
      const k = (nowP - a.holedAt) / 500;
      a.ball.position.set(a.hole.cup.x, a.hole.cup.y + BALL_R - Math.min(1, k) * 0.3, a.hole.cup.z);
      if (k > 1.2) this.end();
      return;
    }
    if (!a.sim) return;
    const ev = a.sim.step(dt, serverNow);
    const p = a.sim.ballPos();
    a.ball.position.set(p.x, p.y, p.z);
    if (a.sim.moving && nowP - a.lastSent >= GOLF_BALL_GAP_MS) {
      a.lastSent = nowP;
      this.host.send({ t: 'golfBall', x: p.x, y: p.y, z: p.z });
    }
    if (ev === 'rest') {
      a.rest = { ...p };
      this.host.send({ t: 'golfBall', x: p.x, y: p.y, z: p.z });
      this.host.standAt(p.x, p.z);
      if (a.strokes >= GOLF_MAX_STROKES) {
        this.host.send({ t: 'golfPickUp', hole: a.hole.n });
        this.host.hud.toast(`Picked up (${GOLF_PICKUP_SCORE})`, 2500);
      }
    } else if (ev === 'penalty') {
      const splash = p.y < 0;
      this.host.sound('splash', p.x, p.z);
      a.sim.resetTo(a.rest);
      a.ball.position.set(a.rest.x, a.rest.y, a.rest.z);
      this.host.send({ t: 'golfShot', hole: a.hole.n, penalty: true });
      this.host.send({ t: 'golfBall', ...a.rest });
      a.strokes++;
      this.host.hud.toast(splash ? 'Splash! Back you go (+1)' : 'Out of bounds (+1)', 2200);
      if (a.strokes >= GOLF_MAX_STROKES) {
        this.host.send({ t: 'golfPickUp', hole: a.hole.n });
        this.host.hud.toast(`Picked up (${GOLF_PICKUP_SCORE})`, 2500);
      }
    } else if (ev === 'holed') {
      const c = a.hole.cup;
      this.host.send({ t: 'golfBall', x: c.x, y: c.y + BALL_R, z: c.z });
      this.host.send({ t: 'golfHoled', hole: a.hole.n });
      this.host.sound('plop', c.x, c.z);
      a.holedAt = nowP;
      this.host.standAt(c.x, c.z);
    }
  }

  private async begin(n: number): Promise<void> {
    this.end();
    const hole = HOLES[n - 1];
    const start = { x: hole.tee.x, y: FELT + BALL_R, z: hole.tee.z };
    const ball = ballMesh(this.host.myColor());
    ball.position.set(start.x, start.y, start.z);
    this.host.scene()?.add(ball);
    this.host.scene()?.add(this.aimLine);
    this.host.standAt(start.x, start.z);
    const a: Active = { hole, sim: null, ball, rest: start, strokes: 0, lastSent: 0, holedAt: null };
    this.active = a;
    this.renderCard();
    const R = await loadRapier();
    if (this.active !== a) return; // left the hole while loading
    a.sim = new GolfSim(R, hole, start);
  }

  private end(): void {
    const a = this.active;
    if (!a) return;
    a.sim?.dispose();
    a.ball.removeFromParent();
    this.active = null;
    this.cancelDrag();
    this.renderCard();
  }

  private finishMine(strokes: number): void {
    const a = this.active;
    const hole = a?.hole;
    if (!hole) return;
    const name = scoreName(strokes, hole.par, strokes >= GOLF_PICKUP_SCORE);
    this.host.hud.toast(`${name} (${strokes}${strokes >= GOLF_PICKUP_SCORE ? '' : ` on a par ${hole.par}`})`, 3000);
    if (a!.holedAt === null) this.end(); // picked up: no drop animation
    const next = HOLES.find((x) => this.card[x.n - 1] === null && x.n !== hole.n);
    if (next) setTimeout(() => this.host.hud.toast(`Next: hole ${next.n} · ${next.name} ⛳`, 2500), 1600);
  }

  private renderCard(): void {
    const a = this.active;
    const played = this.card.some((c) => c !== null);
    this.cardEl.hidden = !a && !played;
    const cells = HOLES.map((x) => {
      const c = this.card[x.n - 1];
      const on = a?.hole.n === x.n;
      return h('div', { className: `golf-cell${on ? ' on' : ''}` }, h('b', { textContent: String(x.n) }), h('span', { textContent: c === null ? (on ? '…' : '–') : String(c) }));
    });
    const total = this.card.reduce<number>((s, c) => s + (c ?? 0), 0);
    this.cardEl.replaceChildren(h('div', { className: 'golf-title', textContent: `⛳ Mini-golf${played ? ` · ${total}` : ''}` }), h('div', { className: 'golf-cells' }, ...cells));
  }

  // ---------- drag to putt ----------

  private groundAt(e: PointerEvent, y: number): THREE.Vector3 | null {
    const r = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.host.camera());
    this.plane.constant = -y;
    return this.ray.ray.intersectPlane(this.plane, this.hit) ? this.hit.clone() : null;
  }

  private canPutt(): boolean {
    const a = this.active;
    return !!a && !!a.sim && !a.sim.moving && a.holedAt === null && !this.host.hud.modalOpen() && a.strokes < GOLF_MAX_STROKES;
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || !this.canPutt()) return;
    const start = this.groundAt(e, this.active!.ball.position.y);
    if (!start) return;
    this.drag = { sx: e.clientX, sy: e.clientY, start };
    e.preventDefault();
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    const a = this.active;
    if (!d || !a) return;
    const cur = this.groundAt(e, a.ball.position.y);
    if (!cur) return;
    const aim = aimFromDrag(cur.x - d.start.x, cur.z - d.start.z, Math.hypot(e.clientX - d.sx, e.clientY - d.sy));
    if (!aim) {
      this.aimLine.visible = false;
      this.power.hidden = true;
      return;
    }
    const b = a.ball.position;
    const len = 0.5 + aim.power * 3;
    const pts = [new THREE.Vector3(b.x, b.y, b.z), new THREE.Vector3(b.x + aim.dirX * len, b.y, b.z + aim.dirZ * len)];
    this.aimLine.geometry.setFromPoints(pts);
    this.aimLine.computeLineDistances();
    this.aimLine.visible = true;
    this.power.hidden = false;
    (this.power.firstChild as HTMLElement).style.width = `${Math.round(aim.power * 100)}%`;
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    const a = this.active;
    this.cancelDrag();
    if (!d || !a?.sim || e.button !== 0) return;
    const cur = this.groundAt(e, a.ball.position.y);
    if (!cur) return;
    const aim = aimFromDrag(cur.x - d.start.x, cur.z - d.start.z, Math.hypot(e.clientX - d.sx, e.clientY - d.sy));
    if (!aim || !this.canPutt()) return;
    this.host.send({ t: 'golfShot', hole: a.hole.n });
    a.strokes++;
    a.sim.putt(aim.dirX, aim.dirZ, aim.power);
  }

  cancelDrag(): void {
    this.drag = null;
    this.aimLine.visible = false;
    this.power.hidden = true;
  }
}
