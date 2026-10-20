/**
 * Deal-time Sudoku isomorphism (B2).
 *
 * Allowed: permute digits 1–9; permute the three bands and the rows inside a
 * band; permute the three stacks and the columns inside a stack.
 * Transpose is not represented: a cell (r, c) moves to (row[r], col[c]),
 * never to (c, r).
 *
 * One map is applied to both givens and the solution. Callers keep the
 * technique label they already have — this does not analyze the grid.
 */

export interface SudokuMorph {
  /** `digit[0]` is 0. `digit[1]`–`digit[9]` is a permutation of 1–9. */
  digit: readonly number[];
  /** `row[sourceRow]` is the destination row. */
  row: readonly number[];
  /** `col[sourceCol]` is the destination column. */
  col: readonly number[];
}

export interface MorphedGrids {
  givens: number[][];
  solution: number[][];
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** Bands (or stacks) move as blocks. Inside a block the three lines are shuffled. */
function axisMap(rng: () => number): number[] {
  const blocks = shuffle([0, 1, 2], rng);
  const map = new Array<number>(9);
  for (let block = 0; block < 3; block++) {
    const within = shuffle([0, 1, 2], rng);
    for (let offset = 0; offset < 3; offset++) {
      map[block * 3 + offset] = blocks[block] * 3 + within[offset];
    }
  }
  return map;
}

export function randomMorph(rng: () => number = Math.random): SudokuMorph {
  return {
    digit: [0, ...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)],
    row: axisMap(rng),
    col: axisMap(rng),
  };
}

function isPermutation(values: readonly number[], expected: readonly number[]): boolean {
  if (values.length !== expected.length) return false;
  const seen = new Set(values);
  if (seen.size !== expected.length) return false;
  return expected.every((item) => seen.has(item));
}

/** True when a line map only swaps bands/stacks and the lines inside them. */
function isBandAxis(map: readonly number[]): boolean {
  if (map.length !== 9 || !isPermutation(map, [0, 1, 2, 3, 4, 5, 6, 7, 8])) return false;
  const destBlocks: number[] = [];
  for (let block = 0; block < 3; block++) {
    const dests = [0, 1, 2].map((offset) => map[block * 3 + offset] ?? -1);
    const blocks = new Set(dests.map((line) => Math.floor(line / 3)));
    if (blocks.size !== 1) return false;
    const offsets = new Set(dests.map((line) => line % 3));
    if (offsets.size !== 3) return false;
    destBlocks.push(Math.floor(dests[0] / 3));
  }
  return new Set(destBlocks).size === 3;
}

/** Digit, band, and stack moves only. A transpose or a reflection is rejected. */
export function isDealMorph(morph: SudokuMorph): boolean {
  if (morph.digit.length !== 10 || morph.digit[0] !== 0) return false;
  if (!isPermutation(morph.digit.slice(1), [1, 2, 3, 4, 5, 6, 7, 8, 9])) return false;
  return isBandAxis(morph.row) && isBandAxis(morph.col);
}

export function applyMorphGrid(grid: readonly (readonly number[])[], morph: SudokuMorph): number[][] {
  const next = Array.from({ length: 9 }, () => Array<number>(9).fill(0));
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const digit = grid[row]?.[col] ?? 0;
      const mapped = digit === 0 ? 0 : (morph.digit[digit] ?? 0);
      const destRow = morph.row[row] ?? 0;
      const destCol = morph.col[col] ?? 0;
      next[destRow][destCol] = mapped;
    }
  }
  return next;
}

/** Copy every other field, including the technique label, and remap both grids. */
export function morphGrids<T extends MorphedGrids>(source: T, morph: SudokuMorph = randomMorph()): T {
  return {
    ...source,
    givens: applyMorphGrid(source.givens, morph),
    solution: applyMorphGrid(source.solution, morph),
  };
}

/** Random B2 morph. This is the call site for every deal. */
export function applyDealMorph<T extends MorphedGrids>(source: T, rng?: () => number): T {
  return morphGrids(source, randomMorph(rng));
}
