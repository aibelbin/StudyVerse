/** Moves the loading screen's bar (0..1) and, optionally, replaces the tip. */
export function loadStep(k: number): void {
  const bar = document.getElementById('loader-bar');
  if (bar) bar.style.width = `${Math.round(Math.max(0.08, Math.min(1, k)) * 100)}%`;
}

let gone = false;

/** Fades the loading screen out (the town has drawn, or the join form is up). */
export function loadDone(): void {
  if (gone) return;
  gone = true;
  loadStep(1);
  const el = document.getElementById('loader');
  const w = window as unknown as { __loaderTips?: number; __loaderSlow?: number };
  clearInterval(w.__loaderTips);
  clearTimeout(w.__loaderSlow);
  if (!el) return;
  setTimeout(() => el.classList.add('done'), 250);
  setTimeout(() => el.remove(), 1000);
}
