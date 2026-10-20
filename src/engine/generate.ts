import { countSolutions, generate as ozGenerate } from "openzeloku";
import {
  analyze,
  flatToRows,
  isAdvancedTechnique,
  isBeginnerTechnique,
  isExpertTechnique,
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
 * | 高級 | #11–#13 | hardest 係 Pointing Pairs／Pointing Triples／X-Wing；拒 #14+ |
 * | 專家 | #14–#15 | hardest 係 Y-Wing 或 Swordfish |
 *
 * openzeloku supplies a unique seed. Each attempt may add or remove clues
 * while uniqueness holds, and keeps the grid only when `maxTechnique` sits
 * in the requested band. At most {@link MAX_ATTEMPTS} seeds.
 *
 * 初級 soft quota: easy seeds land on #1 or #2, so #3 would otherwise never
 * appear. After {@link BEGINNER_LPN_STREAK} consecutive 初級 puzzles whose
 * highest technique is not Last Possible Number, the next 初級 search carves
 * toward exactly that technique. If the carve misses, any #1–#3 puzzle is
 * still accepted. 中級, 高級, and 專家 are not biased.
 *
 * 專家 product deals are bank-first. This generator is only the short
 * fallback: pass `{ maxAttempts }` below {@link MAX_ATTEMPTS}. It never
 * loops past that cap.
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

/** Consecutive 初級 puzzles that are not #3 before the next one prefers #3. */
export const BEGINNER_LPN_STREAK = 3;
const QUOTA_KEY = "mysudok.beginnerNonLpnStreak";

export interface BeginnerQuota {
  streak(): number;
  prefersLastPossible(): boolean;
  note(technique: AppliedTechnique): void;
  reset(): void;
}

function readStoredStreak(storage: Pick<Storage, "getItem" | "setItem"> | null): number {
  if (!storage) return 0;
  try {
    const value = Number(storage.getItem(QUOTA_KEY));
    if (!Number.isInteger(value) || value < 0) return 0;
    return value;
  } catch {
    return 0;
  }
}

/** In-memory streak, optionally mirrored to `storage` (the browser uses localStorage). */
export function createBeginnerQuota(storage: Pick<Storage, "getItem" | "setItem"> | null = null): BeginnerQuota {
  let streak = readStoredStreak(storage);
  const write = (value: number) => {
    streak = value;
    try {
      storage?.setItem(QUOTA_KEY, String(value));
    } catch {
      /* ignore persistence failures; the in-memory streak still applies */
    }
  };
  return {
    streak: () => streak,
    prefersLastPossible: () => streak >= BEGINNER_LPN_STREAK,
    note(technique: AppliedTechnique) {
      write(technique === "last_possible_number" ? 0 : streak + 1);
    },
    reset() {
      write(0);
    },
  };
}

function browserStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

const sessionQuota = createBeginnerQuota(browserStorage());

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

interface Band {
  min: number;
  max: number;
}

const BAND: Record<Difficulty, Band> = {
  初級: { min: 1, max: 3 },
  中級: { min: 5, max: 10 },
  高級: { min: 11, max: 13 },
  專家: { min: 14, max: 15 },
};

/** Exact #3. Used only when the 初級 soft quota is asking for Last Possible Number. */
const LAST_POSSIBLE_BAND: Band = { min: 3, max: 3 };

function inBand(id: AppliedTechnique, band: Band): boolean {
  const rank = techniqueRank(id);
  return rank >= band.min && rank <= band.max;
}

function easierThan(id: AppliedTechnique, band: Band): boolean {
  return techniqueRank(id) < band.min;
}

function harderThan(id: AppliedTechnique, band: Band): boolean {
  return techniqueRank(id) > band.max;
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

async function carve(grid: number[], solution: readonly number[], band: Band): Promise<Puzzle | null> {
  let rates = 0;
  let budgetHit = false;
  /** Local analyze plus uniqueness. Not openzeloku `rate()`. */
  const localRate = async (): Promise<Rated | null> => {
    if (budgetHit) return null;
    rates++;
    if (rates > MAX_RATES) {
      budgetHit = true;
      return null;
    }
    if (rates % 5 === 0) await yieldToUi();
    return rateUnique(grid);
  };

  let rated = await localRate();
  if (!rated) {
    for (const index of shuffle(grid.flatMap((value, index) => (value === 0 ? [index] : [])))) {
      if (budgetHit) return null;
      grid[index] = solution[index];
      const next = await localRate();
      if (budgetHit) return null;
      if (!next) continue;
      rated = next;
      break;
    }
  }
  if (!rated || emptyCount(grid) === 0) return null;
  if (inBand(rated.technique, band)) return toPuzzle(grid, rated.solution, rated.technique);

  if (harderThan(rated.technique, band)) {
    for (const index of shuffle(grid.flatMap((value, cell) => (value === 0 ? [cell] : [])))) {
      if (emptyCount(grid) <= 1 || budgetHit) break;
      grid[index] = solution[index];
      const next = await localRate();
      if (!next) {
        grid[index] = 0;
        if (budgetHit) return null;
        continue;
      }
      if (inBand(next.technique, band)) return toPuzzle(grid, next.solution, next.technique);
      if (easierThan(next.technique, band)) {
        grid[index] = 0;
        continue;
      }
      rated = next;
    }
  }

  const refreshed = await localRate();
  if (budgetHit) return null;
  if (refreshed) rated = refreshed;
  if (inBand(rated.technique, band)) return toPuzzle(grid, rated.solution, rated.technique);
  if (!easierThan(rated.technique, band)) return null;

  for (const index of shuffle(grid.flatMap((value, cell) => (value !== 0 ? [cell] : [])))) {
    if (grid[index] === 0) continue;
    const backup = grid[index];
    grid[index] = 0;
    const next = await localRate();
    if (!next || harderThan(next.technique, band)) {
      grid[index] = backup;
      if (budgetHit) return null;
      continue;
    }
    if (inBand(next.technique, band)) return toPuzzle(grid, next.solution, next.technique);
    rated = next;
  }
  return null;
}

const SEED: Record<Difficulty, "easy" | "medium" | "hard" | "expert"> = {
  初級: "easy",
  中級: "medium",
  高級: "expert",
  專家: "expert",
};

function matchesDifficulty(technique: AppliedTechnique, difficulty: Difficulty): boolean {
  if (difficulty === "初級") return isBeginnerTechnique(technique);
  if (difficulty === "中級") return isIntermediateTechnique(technique);
  if (difficulty === "高級") return isAdvancedTechnique(technique);
  return isExpertTechnique(technique);
}

/** True when `technique` is the hardest step this difficulty is allowed to keep. */
export function acceptsDifficulty(difficulty: Difficulty, technique: AppliedTechnique): boolean {
  return matchesDifficulty(technique, difficulty) && inBand(technique, BAND[difficulty]);
}

async function tryDifficulty(difficulty: Difficulty, band: Band): Promise<Puzzle | null> {
  const raw = ozGenerate({ size: 9, difficulty: SEED[difficulty] });
  const counted = countSolutions(raw.grid.slice(), 9, 2);
  if (!counted.unique || !counted.solution) return null;
  return carve(raw.grid.slice(), counted.solution, band);
}

async function search(difficulty: Difficulty, band: Band, maxAttempts: number): Promise<Puzzle | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const puzzle = await tryDifficulty(difficulty, band);
    if (puzzle && matchesDifficulty(puzzle.maxTechnique as AppliedTechnique, difficulty)) return puzzle;
    await yieldToUi();
  }
  return null;
}

export async function generate(
  difficulty: Difficulty,
  quota: BeginnerQuota = sessionQuota,
  options: { maxAttempts?: number } = {},
): Promise<Puzzle> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  await yieldToUi();
  const preferLastPossible = difficulty === "初級" && quota.prefersLastPossible();
  if (preferLastPossible) {
    const exact = await search(difficulty, LAST_POSSIBLE_BAND, maxAttempts);
    if (exact) {
      quota.note(exact.maxTechnique as AppliedTechnique);
      return exact;
    }
  }
  const puzzle = await search(difficulty, BAND[difficulty], maxAttempts);
  if (puzzle) {
    if (difficulty === "初級") quota.note(puzzle.maxTechnique as AppliedTechnique);
    return puzzle;
  }
  throw new GenerationFailedError(difficulty, maxAttempts);
}
