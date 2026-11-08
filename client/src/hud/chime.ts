let ctx: AudioContext | null = null;

function unlock(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // ignore
  }
}
if (typeof window !== 'undefined') {
  for (const ev of ['keydown', 'pointerdown'] as const) window.addEventListener(ev, unlock, { once: true });
}

/** Soft two-note chime for phase changes. Browsers allow it after the first keypress. */
export function chime(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    for (const [freq, delay] of [[880, 0], [1318.5, 0.18]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(0.16, t + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 1.2);
      o.connect(g).connect(ctx.destination);
      o.start(t + delay);
      o.stop(t + delay + 1.3);
    }
  } catch {
    // audio is a nicety; never break the game over it
  }
}
