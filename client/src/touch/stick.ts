/** The joystick's push as a vector of length 0..1 (screen x right, z down), with a dead zone. */
export function stickVector(dx: number, dy: number, radius: number, dead = 0.12): { x: number; z: number } {
  const len = Math.hypot(dx, dy) / radius;
  if (len <= dead) return { x: 0, z: 0 };
  const k = Math.min(1, (len - dead) / (1 - dead)) / len;
  return { x: (dx / radius) * k, z: (dy / radius) * k };
}

/** A floating joystick: a thumb on the left of the screen puts it there; push to steer. */
export class Joystick {
  enabled = true;
  private id: number | null = null;
  private cx = 0;
  private cy = 0;
  private base = document.createElement('div');
  private knob = document.createElement('div');

  constructor(private area: HTMLElement, private onMove: (v: { x: number; z: number }) => void, private radius = 60) {
    this.base.className = 'stick-base';
    this.knob.className = 'stick-knob';
    this.base.append(this.knob);
    this.base.hidden = true;
    document.body.append(this.base);
    area.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.up(e));
  }

  private down(e: PointerEvent): void {
    if (!this.enabled || this.id !== null || e.pointerType === 'mouse' || e.clientX > innerWidth * 0.45) return;
    this.id = e.pointerId;
    this.cx = e.clientX;
    this.cy = e.clientY;
    this.base.style.left = `${this.cx}px`;
    this.base.style.top = `${this.cy}px`;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.base.hidden = false;
    e.preventDefault();
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.id) return;
    const dx = e.clientX - this.cx;
    const dy = e.clientY - this.cy;
    const len = Math.hypot(dx, dy);
    const k = len > this.radius ? this.radius / len : 1;
    this.knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    this.onMove(stickVector(dx, dy, this.radius));
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.id) return;
    this.release();
  }

  release(): void {
    this.id = null;
    this.base.hidden = true;
    this.onMove({ x: 0, z: 0 });
  }
}
