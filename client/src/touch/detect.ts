/** Touch controls: on for touch-first devices (coarse pointer, no hover); `?touch` forces on, `?touch=0` off. */
export function isTouchDevice(search: string, mm: (q: string) => { matches: boolean }): boolean {
  const p = new URLSearchParams(search);
  if (p.has('touch')) return p.get('touch') !== '0';
  return mm('(pointer: coarse)').matches && !mm('(hover: hover)').matches;
}
