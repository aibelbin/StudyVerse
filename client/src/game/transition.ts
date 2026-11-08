/** Warm full-screen fade used when walking through doors (CSS transition: 0.35 s). */
export class Fade {
  constructor(private el: HTMLElement) {}

  out(): Promise<void> {
    return this.to(1);
  }

  in(): Promise<void> {
    return this.to(0);
  }

  private to(opacity: number): Promise<void> {
    this.el.style.opacity = String(opacity);
    return new Promise((r) => setTimeout(r, 360));
  }
}
