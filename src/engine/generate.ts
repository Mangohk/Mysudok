import { countSolutions, generate as ozGenerate } from "openzeloku";
import {
  analyze,
  flatToRows,
  isAdvancedTechnique,
  isIntroTechnique,
  sameFlat,
  type AppliedTechnique,
} from "./techniques";

/**
 * Technique band for `generate`. Ids are openzeloku `TechniqueName` values.
 *
 * | 難度 | maxTechnique | 含義 |
 * | ---- | ------------ | ---- |
 * | 入門 | naked_single, hidden_single | 只用顯式／隱式唯一就可解完 |
 * | 進階 | naked_pair, hidden_pair, pointing_pair, box_line_reduction | 至少要用到數對、區塊指向或宮線排除其中一種，而且用這些技巧就解得完 |
 *
 * Rejected (never returned): puzzles that still need a triple, x_wing,
 * swordfish, or guess after those techniques. openzeloku `rate()` records
 * `guess` as soon as singles stall, because its pair checks do not eliminate
 * candidates — see the comment in `techniques.ts`.
 *
 * Each attempt asks openzeloku for a unique puzzle, then `countSolutions`
 * confirms uniqueness. 進階 may also remove or restore clues from that
 * puzzle while uniqueness holds, and keeps the grid only when the hardest
 * applied technique sits in the 進階 band. At most {@link MAX_ATTEMPTS}
 * attempts.
 */

export type Difficulty = "入門" | "進階";

export interface Puzzle {
  /** 0 = empty. */
  givens: number[][];
  solution: number[][];
  maxTechnique: string;
  unique: true;
}

export const MAX_ATTEMPTS = 40;

export class GenerationFailedError extends Error {
  readonly difficulty: Difficulty;
  readonly attempts: number;

  constructor(difficulty: Difficulty, attempts: number) {
    super(`無法生成「${difficulty}」題目（已嘗試 ${attempts} 次）。`);
    this.name = "GenerationFailedError";
    this.difficulty = difficulty;
    this.attempts = attempts;
  }
}

function shuffle(indexes: number[]): number[] {
  const copy = indexes.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface Rated {
  technique: AppliedTechnique;
  solution: number[];
}

/** Unique solution via openzeloku, and solvable inside the technique list we apply. */
function rateUnique(grid: readonly number[]): Rated | null {
  const counted = countSolutions(grid.slice(), 9, 2);
  if (!counted.unique || !counted.solution) return null;
  const analysis = analyze(grid);
  if (!analysis.solved || !analysis.maxTechnique) return null;
  if (!sameFlat(analysis.values, counted.solution)) return null;
  return { technique: analysis.maxTechnique, solution: counted.solution };
}

function toPuzzle(grid: readonly number[], solution: readonly number[], technique: AppliedTechnique): Puzzle {
  return {
    givens: flatToRows(grid),
    solution: flatToRows(solution),
    maxTechnique: technique,
    unique: true,
  };
}

function tryIntro(): Puzzle | null {
  const raw = ozGenerate({ size: 9, difficulty: "easy" });
  const rated = rateUnique(raw.grid);
  if (!rated || !isIntroTechnique(rated.technique)) return null;
  if (!sameFlat(rated.solution, raw.solution)) return null;
  return toPuzzle(raw.grid, rated.solution, rated.technique);
}

/**
 * Remove clues while the grid stays unique and solvable without triples / fish / guess.
 * Stop at the first grid whose hardest technique is in the 進階 band.
 */
function digToAdvanced(grid: number[], solution: readonly number[]): Puzzle | null {
  const clues = shuffle(grid.flatMap((value, index) => (value !== 0 ? [index] : [])));
  for (const index of clues) {
    if (grid[index] === 0) continue;
    const backup = grid[index];
    grid[index] = 0;
    const rated = rateUnique(grid);
    if (!rated || !sameFlat(rated.solution, solution)) {
      grid[index] = backup;
      continue;
    }
    if (isIntroTechnique(rated.technique)) continue;
    return toPuzzle(grid, rated.solution, rated.technique);
  }
  return null;
}

function tryAdvanced(): Puzzle | null {
  const raw = ozGenerate({ size: 9, difficulty: "hard" });
  const solution = raw.solution;
  const grid = raw.grid.slice();
  const direct = rateUnique(grid);

  if (direct && sameFlat(direct.solution, solution) && isAdvancedTechnique(direct.technique)) {
    return toPuzzle(grid, direct.solution, direct.technique);
  }

  if (!direct) {
    const holes = shuffle(grid.flatMap((value, index) => (value === 0 ? [index] : [])));
    let softened = false;
    for (const index of holes) {
      grid[index] = solution[index];
      const rated = rateUnique(grid);
      if (!rated || !sameFlat(rated.solution, solution)) continue;
      if (isAdvancedTechnique(rated.technique)) return toPuzzle(grid, rated.solution, rated.technique);
      if (isIntroTechnique(rated.technique)) {
        softened = true;
        break;
      }
    }
    if (!softened) return null;
  } else if (!sameFlat(direct.solution, solution) || !isIntroTechnique(direct.technique)) {
    return null;
  }

  return digToAdvanced(grid, solution);
}

export async function generate(difficulty: Difficulty): Promise<Puzzle> {
  await yieldToUi();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const puzzle = difficulty === "入門" ? tryIntro() : tryAdvanced();
    if (puzzle) return puzzle;
    await yieldToUi();
  }
  throw new GenerationFailedError(difficulty, MAX_ATTEMPTS);
}
