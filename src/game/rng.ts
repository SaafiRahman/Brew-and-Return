/** Small seeded RNG (mulberry32) so game logic is deterministic and testable. */
export function nextRandom(state: { rngState: number }): number {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function pick<T>(state: { rngState: number }, items: readonly T[]): T {
  return items[Math.floor(nextRandom(state) * items.length)];
}

export function randInt(state: { rngState: number }, min: number, max: number): number {
  return min + Math.floor(nextRandom(state) * (max - min + 1));
}
