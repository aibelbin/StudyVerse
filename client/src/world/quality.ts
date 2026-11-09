export type Quality = 'high' | 'lite';
export const QUALITY_KEY = 'sv-quality';

/** ?lite forces Lite; otherwise the saved choice; otherwise High (Lite on touch devices, to spare phones). */
export function initialQuality(search: string, stored: string | null, touch = false): Quality {
  if (new URLSearchParams(search).has('lite')) return 'lite';
  if (stored === 'lite' || stored === 'high') return stored;
  return touch ? 'lite' : 'high';
}

/** Watches frame times on High and says once (per session) if Lite would be smoother. */
export class SlowFrames {
  private sum = 0;
  private n = 0;
  private since = 0;
  private told = false;

  /** dt in seconds; returns true the one time it's worth suggesting Lite. */
  update(dt: number, now: number, quality: Quality): boolean {
    if (this.told || quality !== 'high') return false;
    if (!this.since) this.since = now;
    this.sum += dt;
    this.n++;
    if (now - this.since < 5000) return false;
    const fps = this.n / this.sum;
    this.sum = 0;
    this.n = 0;
    this.since = now;
    if (fps >= 40) return false;
    this.told = true;
    return true;
  }
}
