import { countSolutions, generate as ozGenerate } from "openzeloku";
import {
  analyze,
  flatToRows,
  isAdvancedTechnique,
  isBeginnerTechnique,
  isIntermediateTechnique,
  sameFlat,
  techniqueRank,
  type AppliedTechnique,
  type TechniqueBand,
} from "./techniques";

/**
 * Technique band for `generate`. Rating is local `analyze`, not openzeloku `rate()`.
 *
 * | 難度 | maxTechnique | 含義 |
 * | ---- | ------------ | ---- |
 * | 初級 | #1–#3 | 只用 Last Free Cell／Last Remaining Cell／Last Possible Number |
 * | 中級 | #5–#10 | 會用到中級招，而且唔使 #11+ |
 * | 高級 | #11–#15 | 至少一步指向、Wing 或魚形 |
 *
 * openzeloku supplies a unique seed. Each attempt may add or remove clues
 * while uniqueness holds, and keeps the grid only when `maxTechnique` sits
 * in the requested band. At most {@link MAX_ATTEMPTS} seeds.
 */

export type Difficulty = TechniqueBand;

export interface Puzzle {
  /** 0 = empty. */
  givens: number[][];
  solution: number[][];
  maxTechnique: string;
  unique: true;
}

export const MAX_ATTEMPTS = 40;
const MAX_RATES = 80;

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

const BAND: Record<Difficulty, { min: number; max: number }> = {
  初級: { min: 1, max: 3 },
  中級: { min: 5, max: 10 },
  高級: { min: 11, max: 15 },
};

function inBand(id: AppliedTechnique, difficulty: Difficulty): boolean {
  const rank = techniqueRank(id);
  return rank >= BAND[difficulty].min && rank <= BAND[difficulty].max;
}

function easierThan(id: AppliedTechnique, difficulty: Difficulty): boolean {
  return techniqueRank(id) < BAND[difficulty].min;
}

function harderThan(id: AppliedTechnique, difficulty: Difficulty): boolean {
  return techniqueRank(id) > BAND[difficulty].max;
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

function emptyCount(grid: readonly number[]): number {
  let count = 0;
  for (const value of grid) if (value === 0) count++;
  return count;
}

async function carve(grid: number[], solution: readonly number[], difficulty: Difficulty): Promise<Puzzle | null> {
  let rates = 0;
  let budgetHit = false;
  const rate = async (): Promise<Rated | null> => {
    if (budgetHit) return null;
    rates++;
    if (rates > MAX_RATES) {
      budgetHit = true;
      return null;
    }
    if (rates % 5 === 0) await yieldToUi();
    return rateUnique(grid);
  };

  let rated = await rate();
  if (!rated) {
    for (const index of shuffle(grid.flatMap((value, index) => (value === 0 ? [index] : [])))) {
      if (budgetHit) return null;
      grid[index] = solution[index];
      const next = await rate();
      if (budgetHit) return null;
      if (!next) continue;
      rated = next;
      break;
    }
  }
  if (!rated || emptyCount(grid) === 0) return null;
  if (inBand(rated.technique, difficulty)) return toPuzzle(grid, rated.solution, rated.technique);

  if (harderThan(rated.technique, difficulty)) {
    for (const index of shuffle(grid.flatMap((value, cell) => (value === 0 ? [cell] : [])))) {
      if (emptyCount(grid) <= 1 || budgetHit) break;
      grid[index] = solution[index];
      const next = await rate();
      if (!next) {
        grid[index] = 0;
        if (budgetHit) return null;
        continue;
      }
      if (inBand(next.technique, difficulty)) return toPuzzle(grid, next.solution, next.technique);
      if (easierThan(next.technique, difficulty)) {
        grid[index] = 0;
        continue;
      }
      rated = next;
    }
  }

  const refreshed = await rate();
  if (budgetHit) return null;
  if (refreshed) rated = refreshed;
  if (inBand(rated.technique, difficulty)) return toPuzzle(grid, rated.solution, rated.technique);
  if (!easierThan(rated.technique, difficulty)) return null;

  for (const index of shuffle(grid.flatMap((value, cell) => (value !== 0 ? [cell] : [])))) {
    if (grid[index] === 0) continue;
    const backup = grid[index];
    grid[index] = 0;
    const next = await rate();
    if (!next || harderThan(next.technique, difficulty)) {
      grid[index] = backup;
      if (budgetHit) return null;
      continue;
    }
    if (inBand(next.technique, difficulty)) return toPuzzle(grid, next.solution, next.technique);
    rated = next;
  }
  return null;
}

const SEED: Record<Difficulty, "easy" | "medium" | "hard" | "expert"> = {
  初級: "easy",
  中級: "medium",
  高級: "expert",
};

async function tryDifficulty(difficulty: Difficulty): Promise<Puzzle | null> {
  const raw = ozGenerate({ size: 9, difficulty: SEED[difficulty] });
  const counted = countSolutions(raw.grid.slice(), 9, 2);
  if (!counted.unique || !counted.solution) return null;
  return carve(raw.grid.slice(), counted.solution, difficulty);
}

export async function generate(difficulty: Difficulty): Promise<Puzzle> {
  await yieldToUi();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const puzzle = await tryDifficulty(difficulty);
    if (puzzle) {
      const technique = puzzle.maxTechnique as AppliedTechnique;
      if (difficulty === "初級" && isBeginnerTechnique(technique)) return puzzle;
      if (difficulty === "中級" && isIntermediateTechnique(technique)) return puzzle;
      if (difficulty === "高級" && isAdvancedTechnique(technique)) return puzzle;
    }
    await yieldToUi();
  }
  throw new GenerationFailedError(difficulty, MAX_ATTEMPTS);
}
