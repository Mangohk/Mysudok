import { nextHint } from "openzeloku";

/**
 * Level-1 hint: the next cell openzeloku can fill with a naked or hidden single.
 * Returns a flat index, or null when the next deduction is not a single
 * (pairs and harder steps are left to the player).
 */
export function nextSingleCell(flat: readonly number[]): number | null {
  const hint = nextHint(flat.slice(), 9);
  if (!hint) return null;
  return hint.row * 9 + hint.col;
}
