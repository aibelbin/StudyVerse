/** Deterministic PRNG, so every client draws identical scenery. */
export function rng(seed: number): () => number {
  let s = Math.imul(Math.round(seed) | 0, 2654435761) >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
}
