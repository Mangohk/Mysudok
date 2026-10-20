/**
 * Per-puzzle cell scan order.
 *
 * Equal-strength hints used to follow row-major 0→80, so the top-left hit
 * always won. The order is a pure function of the givens: same puzzle, same
 * permutation; a different puzzle gets a new one. It is not a session RNG
 * and it does not call Math.random.
 *
 * Detectors that omit `order` keep the historical row-major / unit scan so
 * older tests stay put. `analyze` and `findHint` both pass this permutation.
 */

const CELLS = 81;

/** Fisher–Yates over 0…80 from an FNV-1a mix of the givens. */
export function scanOrderFromPuzzle(givensFlat: readonly number[]): readonly number[] {
  let hash = 2166136261;
  const length = givensFlat.length;
  for (let index = 0; index < length; index++) {
    hash ^= (givensFlat[index] ?? 0) & 0xff;
    hash = Math.imul(hash, 16777619);
  }
  hash ^= length;
  hash = Math.imul(hash, 16777619);

  let state = hash >>> 0;
  const order = Array.from({ length: CELLS }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const cell = order[index];
    order[index] = order[swap];
    order[swap] = cell;
  }
  return order;
}

/**
 * Rank of each cell in `order` (0 = visited first).
 * Null when `order` is missing or not a permutation of 0…80.
 * Callers then keep the historical scan.
 */
export function scanRanks(order: readonly number[] | undefined): Uint8Array | null {
  if (!order || order.length !== CELLS) return null;
  const seen = new Uint8Array(CELLS);
  const rank = new Uint8Array(CELLS);
  for (let index = 0; index < CELLS; index++) {
    const cell = order[index];
    if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS || seen[cell]) return null;
    seen[cell] = 1;
    rank[cell] = index;
  }
  return rank;
}
