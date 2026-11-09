type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

const doc = () => document as FsDoc;

/** The browser lets pages go full screen (iPhone Safari doesn't). */
export function canFullscreen(): boolean {
  return !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  return !!(doc().fullscreenElement || doc().webkitFullscreenElement);
}

/** Opened from the home screen, so there are no browser bars anyway. */
export function isStandalone(): boolean {
  return matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** An iPhone (or iPod): no full screen API, only Add to Home Screen. */
export function isIPhone(ua: string, platform: string, touchPoints: number): boolean {
  return /iPhone|iPod/.test(ua) || (/iPhone/.test(platform) && touchPoints > 1);
}

/** Full screen with no browser UI, then landscape if the phone allows it. Must run from a tap or key press. */
export async function enterFullscreen(): Promise<void> {
  if (isFullscreen() || !canFullscreen()) return;
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else el.webkitRequestFullscreen?.();
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o?.lock?.('landscape').catch(() => {});
  } catch { /* the browser said no; the next tap tries again */ }
}

export function exitFullscreen(): void {
  if (!isFullscreen()) return;
  if (document.exitFullscreen) void document.exitFullscreen().catch(() => {});
  else doc().webkitExitFullscreen?.();
}

export function toggleFullscreen(): void {
  if (isFullscreen()) exitFullscreen();
  else void enterFullscreen();
}
