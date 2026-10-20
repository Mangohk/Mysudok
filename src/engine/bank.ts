import type { Puzzle } from "./generate";
import { flatToRows, TECHNIQUE_LABEL, TECHNIQUE_ORDER, type AppliedTechnique } from "./techniques";

/**
 * Static puzzle bank. One JSONL row per puzzle, shipped at
 * `public/bank-by-hardest.jsonl` and requested with the Vite base
 * (`/Mysudok/`). Filtering is by `hardest`, not by membership in `techniques`.
 * 專家 draws rows whose `hardest` is `y_wing` or `swordfish`. The technique
 * picker is not part of the product; notes and obvious singles stay closed.
 */

export const BANK_FILENAME = "bank-by-hardest.jsonl";
export const PRACTICE_TARGET = 100;

/** Closed for practice. Absent from the picker even if a future bank has rows. */
export const PRACTICE_CLOSED = ["notes", "obvious_singles"] as const;

const CLOSED: ReadonlySet<string> = new Set(PRACTICE_CLOSED);
const GRID = /^[0-9]{81}$/;

export interface BankEntry {
  id: string;
  givens: string;
  solution: string;
  techniques: string[];
  technique_names: string[];
  hardest: string;
  band: string;
  clue_count: number;
}

export interface PracticeChoice {
  id: AppliedTechnique;
  title: string;
  count: number;
  empty: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    names.push(item);
  }
  return names;
}

function parseEntry(value: unknown, lineNo: number): BankEntry {
  if (!isRecord(value)) throw new Error(`題庫第 ${lineNo} 行唔係物件`);
  const { id, givens, solution, techniques, technique_names, hardest, band, clue_count } = value;
  const techniqueIds = stringList(techniques);
  const techniqueNames = stringList(technique_names);
  if (typeof id !== "string" || id.length === 0) throw new Error(`題庫第 ${lineNo} 行缺 id`);
  if (typeof givens !== "string" || !GRID.test(givens)) throw new Error(`題庫第 ${lineNo} 行 givens 無效`);
  if (typeof solution !== "string" || !GRID.test(solution)) throw new Error(`題庫第 ${lineNo} 行 solution 無效`);
  if (!techniqueIds || !techniqueNames) throw new Error(`題庫第 ${lineNo} 行技巧清單無效`);
  if (typeof hardest !== "string" || hardest.length === 0) throw new Error(`題庫第 ${lineNo} 行缺 hardest`);
  if (typeof band !== "string" || band.length === 0) throw new Error(`題庫第 ${lineNo} 行缺 band`);
  if (typeof clue_count !== "number" || !Number.isInteger(clue_count)) throw new Error(`題庫第 ${lineNo} 行缺 clue_count`);
  return {
    id,
    givens,
    solution,
    techniques: techniqueIds,
    technique_names: techniqueNames,
    hardest,
    band,
    clue_count,
  };
}

/** Parse JSONL. Blank lines are skipped. Morphs are not part of the file. */
export function parseBank(text: string): BankEntry[] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const entries: BankEntry[] = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]?.trim() ?? "";
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`題庫第 ${index + 1} 行唔係 JSON`);
    }
    entries.push(parseEntry(parsed, index + 1));
  }
  return entries;
}

/** Pool for one technique. Key is `hardest`, not “techniques includes this id”. */
export function filterByHardest(entries: readonly BankEntry[], hardest: string): BankEntry[] {
  return entries.filter((entry) => entry.hardest === hardest);
}

export function practiceChoices(entries: readonly BankEntry[]): PracticeChoice[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.hardest, (counts.get(entry.hardest) ?? 0) + 1);
  const choices: PracticeChoice[] = [];
  for (const id of TECHNIQUE_ORDER) {
    if (CLOSED.has(id)) continue;
    const count = counts.get(id) ?? 0;
    choices.push({
      id,
      title: TECHNIQUE_LABEL[id],
      count,
      empty: count === 0,
    });
  }
  return choices;
}

/**
 * Draw one row. When the pool has another id, skip `avoidId` so a new game
 * is a different bank puzzle before the deal-time morph.
 */
export function drawEntry(
  pool: readonly BankEntry[],
  avoidId?: string | null,
  rng: () => number = Math.random,
): BankEntry | null {
  if (pool.length === 0) return null;
  let choices: readonly BankEntry[] = pool;
  if (avoidId && pool.length > 1) {
    const others = pool.filter((entry) => entry.id !== avoidId);
    if (others.length > 0) choices = others;
  }
  const index = Math.min(choices.length - 1, Math.floor(rng() * choices.length));
  return choices[index] ?? null;
}

function gridDigits(grid: string): number[] {
  const cells = new Array<number>(81);
  for (let index = 0; index < 81; index++) cells[index] = grid.charCodeAt(index) - 48;
  return cells;
}

/** Bank row → existing `Puzzle`. `maxTechnique` stays the `hardest` id. */
export function entryToPuzzle(entry: BankEntry): Puzzle {
  return {
    givens: flatToRows(gridDigits(entry.givens)),
    solution: flatToRows(gridDigits(entry.solution)),
    maxTechnique: entry.hardest,
    unique: true,
  };
}

export function bankAssetUrl(base?: string): string {
  const root = normalizeBase(base ?? readBase());
  return `${root}${BANK_FILENAME}`;
}

function normalizeBase(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

function readBase(): string {
  try {
    const base = import.meta.env.BASE_URL;
    if (typeof base === "string" && base.length > 0) return base;
  } catch {
    /* The node test runner has no Vite env. The Pages base is still /Mysudok/. */
  }
  return "/Mysudok/";
}

let loaded: BankEntry[] | null = null;
let pending: Promise<BankEntry[]> | null = null;

export function peekPracticeBank(): BankEntry[] | null {
  return loaded;
}

export function resetPracticeBankCache(): void {
  loaded = null;
  pending = null;
}

/** Bound the asset fetch so a stuck request cannot sit on the loading screen. */
const BANK_LOAD_MS = 8_000;

async function fetchBankText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BANK_LOAD_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`題庫載入失敗（${response.status}）`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load the static bank once. Pass `loader` in tests. The browser fetches the
 * Pages asset; it does not run Python or download a remote puzzle API.
 */
export function loadPracticeBank(loader: (url: string) => Promise<string> = fetchBankText): Promise<BankEntry[]> {
  if (loaded) return Promise.resolve(loaded);
  if (!pending) {
    const url = bankAssetUrl();
    pending = loader(url)
      .then((text) => {
        const entries = parseBank(text);
        loaded = entries;
        return entries;
      })
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}
