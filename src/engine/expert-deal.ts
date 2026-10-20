import { drawEntry, entryToPuzzle, type BankEntry } from "./bank";
import type { Puzzle } from "./generate";
import { applyDealMorph } from "./morph";

/**
 * 專家 deals. Draw a bank row whose `hardest` is Y-Wing or Swordfish, then
 * apply the shared B2 morph. An empty or missing pool gets one short
 * regenerate. That call is the whole fallback — it is not retried.
 */

export const EXPERT_HARDEST = ["y_wing", "swordfish"] as const;

/** Cap for the one regenerate after the bank pool is empty. Well under generate's 40-attempt ceiling. */
export const EXPERT_FALLBACK_ATTEMPTS = 4;

/** Shown when the bank pool is empty and the short regenerate also misses. */
export const EXPERT_EMPTY_MESSAGE = "專家題庫暫空。";

const EXPERT_IDS: ReadonlySet<string> = new Set(EXPERT_HARDEST);

export interface ExpertDeal {
  puzzle: Puzzle;
  /** Bank row id, or null when the puzzle came from the short regenerate. */
  bankId: string | null;
}

/** Rows whose hardest step is #14 or #15, including a stale `band: "advanced"`. */
export function expertPool(entries: readonly BankEntry[]): BankEntry[] {
  return entries.filter((entry) => EXPERT_IDS.has(entry.hardest));
}

export async function dealExpert(options: {
  /** `null` means the bank could not be loaded. An empty list is an empty pool. */
  entries: readonly BankEntry[] | null;
  avoidId?: string | null;
  regenerate: (maxAttempts: number) => Promise<Puzzle>;
  morph?: (puzzle: Puzzle) => Puzzle;
  rng?: () => number;
}): Promise<ExpertDeal> {
  const morph = options.morph ?? ((puzzle: Puzzle) => applyDealMorph(puzzle));
  if (options.entries) {
    const entry = drawEntry(expertPool(options.entries), options.avoidId, options.rng);
    if (entry) return { puzzle: morph(entryToPuzzle(entry)), bankId: entry.id };
  }
  try {
    const puzzle = morph(await options.regenerate(EXPERT_FALLBACK_ATTEMPTS));
    return { puzzle, bankId: null };
  } catch {
    throw new Error(EXPERT_EMPTY_MESSAGE);
  }
}
