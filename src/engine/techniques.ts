import { scanOrderFromPuzzle, scanRanks } from "./scan-order";

/**
 * Human-style technique rater for 9×9 Sudoku (§11).
 *
 * Solving ids, in scan / apply order. Notes is a hint gate, not a rated step,
 * so it is omitted here and sits between #3 and #5 in the hint scan.
 *
 * | Rank | id                    | Label                 | Band |
 * | ---: | --------------------- | --------------------- | ---- |
 * |    1 | last_free_cell        | Last Free Cell        | 初級 |
 * |    2 | last_remaining_cell   | Last Remaining Cell   | 初級 |
 * |    3 | last_possible_number  | Last Possible Number  | 初級 |
 * |    5 | obvious_singles       | Obvious Singles       | 中級 |
 * |    6 | obvious_pairs         | Obvious Pairs         | 中級 |
 * |    7 | obvious_triples       | Obvious Triples       | 中級 |
 * |    8 | hidden_singles        | Hidden Singles        | 中級 |
 * |    9 | hidden_pairs          | Hidden Pairs          | 中級 |
 * |   10 | hidden_triples        | Hidden Triples        | 中級 |
 * |   11 | pointing_pairs        | Pointing Pairs        | 高級 |
 * |   12 | pointing_triples      | Pointing Triples      | 高級 |
 * |   13 | x_wing                | X-Wing                | 高級 |
 * |   14 | y_wing                | Y-Wing                | 專家 |
 * |   15 | swordfish             | Swordfish             | 專家 |
 *
 * #1–#3 read placed digits only (no pencil marks). #5–#10 read the candidate
 * mask, which starts as those placements and shrinks when a later technique
 * eliminates. Obvious / hidden singles therefore fire only after an
 * elimination has removed candidates a player could not see from the ink.
 *
 * Legacy ids map forward: naked_single → obvious_singles, hidden_single →
 * hidden_singles, naked_pair → obvious_pairs, hidden_pair → hidden_pairs.
 * Pointing and box-line reduction are the advanced band (#11–#13). Y-Wing and
 * Swordfish are the expert band (#14–#15). Box-line (claiming) is applied and
 * recorded as Pointing Pairs or Pointing Triples.
 * `findPointing` / `findClaiming` / `findFish` / `findYWing` are the detectors
 * `analyze` applies and `findHint` teaches. Hints do not keep a second copy.
 *
 * Seeds still come from openzeloku. This rater does not call `rate()`.
 */

export const TECHNIQUE_ORDER = [
  "last_free_cell",
  "last_remaining_cell",
  "last_possible_number",
  "obvious_singles",
  "obvious_pairs",
  "obvious_triples",
  "hidden_singles",
  "hidden_pairs",
  "hidden_triples",
  "pointing_pairs",
  "pointing_triples",
  "x_wing",
  "y_wing",
  "swordfish",
] as const;

export type AppliedTechnique = (typeof TECHNIQUE_ORDER)[number];

export type UnitKind = "row" | "col" | "box";

export const TECHNIQUE_LABEL: Record<AppliedTechnique, string> = {
  last_free_cell: "Last Free Cell",
  last_remaining_cell: "Last Remaining Cell",
  last_possible_number: "Last Possible Number",
  obvious_singles: "Obvious Singles",
  obvious_pairs: "Obvious Pairs",
  obvious_triples: "Obvious Triples",
  hidden_singles: "Hidden Singles",
  hidden_pairs: "Hidden Pairs",
  hidden_triples: "Hidden Triples",
  pointing_pairs: "Pointing Pairs",
  pointing_triples: "Pointing Triples",
  x_wing: "X-Wing",
  y_wing: "Y-Wing",
  swordfish: "Swordfish",
};

const RANK: Record<AppliedTechnique, number> = {
  last_free_cell: 1,
  last_remaining_cell: 2,
  last_possible_number: 3,
  obvious_singles: 5,
  obvious_pairs: 6,
  obvious_triples: 7,
  hidden_singles: 8,
  hidden_pairs: 9,
  hidden_triples: 10,
  pointing_pairs: 11,
  pointing_triples: 12,
  x_wing: 13,
  y_wing: 14,
  swordfish: 15,
};

export type TechniqueBand = "初級" | "中級" | "高級" | "專家";

export function techniqueRank(id: AppliedTechnique): number {
  return RANK[id];
}

export function techniqueBand(id: AppliedTechnique): TechniqueBand {
  const rank = RANK[id];
  if (rank <= 3) return "初級";
  if (rank <= 10) return "中級";
  if (rank <= 13) return "高級";
  return "專家";
}

export function isBeginnerTechnique(id: AppliedTechnique): boolean {
  return RANK[id] <= 3;
}

export function isIntermediateTechnique(id: AppliedTechnique): boolean {
  return RANK[id] >= 5 && RANK[id] <= 10;
}

/** #11–#13. Y-Wing and Swordfish are {@link isExpertTechnique}, not advanced. */
export function isAdvancedTechnique(id: AppliedTechnique): boolean {
  const rank = RANK[id];
  return rank >= 11 && rank <= 13;
}

/** #14–#15: Y-Wing and Swordfish. */
export function isExpertTechnique(id: AppliedTechnique): boolean {
  return RANK[id] >= 14;
}

const N = 9;
const CELLS = 81;
const ALL_DIGITS = 0x3fe;

export function rowOf(i: number): number {
  return Math.floor(i / N);
}

export function colOf(i: number): number {
  return i % N;
}

export function boxOf(i: number): number {
  return Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);
}

const ROWS: number[][] = Array.from({ length: N }, (_, r) =>
  Array.from({ length: N }, (_, c) => r * N + c),
);
const COLS: number[][] = Array.from({ length: N }, (_, c) =>
  Array.from({ length: N }, (_, r) => r * N + c),
);
const BOXES: number[][] = Array.from({ length: N }, (_, b) => {
  const br = Math.floor(b / 3) * 3;
  const bc = (b % 3) * 3;
  const cells: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) cells.push((br + r) * N + (bc + c));
  }
  return cells;
});
const UNITS: number[][] = [...ROWS, ...COLS, ...BOXES];

const PEERS: number[][] = Array.from({ length: CELLS }, (_, i) => {
  const set = new Set<number>();
  for (const j of ROWS[rowOf(i)]) if (j !== i) set.add(j);
  for (const j of COLS[colOf(i)]) if (j !== i) set.add(j);
  for (const j of BOXES[boxOf(i)]) if (j !== i) set.add(j);
  return [...set];
});

export function peersOf(index: number): readonly number[] {
  return PEERS[index] ?? [];
}

/** The row, column, or box that contains `index`. */
export function unitCells(index: number, kind: UnitKind): readonly number[] {
  if (kind === "row") return ROWS[rowOf(index)] ?? [];
  if (kind === "col") return COLS[colOf(index)] ?? [];
  return BOXES[boxOf(index)] ?? [];
}

function popcount(mask: number): number {
  let n = 0;
  let m = mask;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

function digitOfSingle(mask: number): number {
  for (let v = 1; v <= 9; v++) {
    if (mask === 1 << v) return v;
  }
  return 0;
}

export function maskDigits(mask: number): number[] {
  const digits: number[] = [];
  for (let digit = 1; digit <= 9; digit++) if ((mask & (1 << digit)) !== 0) digits.push(digit);
  return digits;
}

function unitKind(unitIndex: number): UnitKind {
  if (unitIndex < 9) return "row";
  if (unitIndex < 18) return "col";
  return "box";
}

function placementMask(values: readonly number[], index: number): number {
  let used = 0;
  for (const peer of PEERS[index] ?? []) {
    const value = values[peer] ?? 0;
    if (value >= 1 && value <= 9) used |= 1 << value;
  }
  return ALL_DIGITS & ~used;
}

function filledDifferentPeers(values: readonly number[], index: number, digit: number): number[] {
  const evidence: number[] = [];
  for (const peer of PEERS[index] ?? []) {
    const value = values[peer] ?? 0;
    if (value !== 0 && value !== digit) evidence.push(peer);
  }
  return evidence;
}

function filledHouses(values: readonly number[], index: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (cells: readonly number[]) => {
    for (const cell of cells) {
      if (cell === index || seen.has(cell)) continue;
      seen.add(cell);
      if ((values[cell] ?? 0) !== 0) out.push(cell);
    }
  };
  add(ROWS[rowOf(index)] ?? []);
  add(COLS[colOf(index)] ?? []);
  add(BOXES[boxOf(index)] ?? []);
  return out;
}

function blockers(values: readonly number[], unit: readonly number[], digit: number): number[] {
  const seen = new Set<number>();
  const evidence: number[] = [];
  for (const cell of unit) {
    if ((values[cell] ?? 0) !== 0) continue;
    for (const peer of PEERS[cell] ?? []) {
      if ((values[peer] ?? 0) !== digit || seen.has(peer)) continue;
      seen.add(peer);
      evidence.push(peer);
    }
  }
  return evidence;
}

export interface FillSpot {
  index: number;
  digit: number;
  unit: UnitKind | null;
  evidence: number[];
}

export interface ClearSpot {
  cells: number[];
  digits: number[];
  clearIndexes: number[];
  keep: number[];
  /** House the pattern was found in. Detection rules are unchanged. */
  unit: UnitKind;
}

export interface Analysis {
  solved: boolean;
  /** Hardest technique that had to be used. Null when the grid is already full or unsolved. */
  maxTechnique: AppliedTechnique | null;
  techniques: AppliedTechnique[];
  /** Filled grid when solved; a working copy otherwise. */
  values: number[];
}

type StepResult = "progress" | "stuck" | "contradiction";

function contradictory(values: number[], cand: Uint16Array): boolean {
  for (let i = 0; i < CELLS; i++) {
    if (values[i] === 0 && cand[i] === 0) return true;
  }
  return false;
}

function place(values: number[], cand: Uint16Array, i: number, v: number): boolean {
  if (values[i] !== 0 || v < 1 || v > 9) return false;
  if ((cand[i] & (1 << v)) === 0) return false;
  values[i] = v;
  cand[i] = 0;
  const bit = 1 << v;
  for (const p of PEERS[i] ?? []) {
    if (values[p] === v) return false;
    if ((cand[p] & bit) === 0) continue;
    cand[p] &= ~bit;
    if (values[p] === 0 && cand[p] === 0) return false;
  }
  return true;
}

function initCandidates(values: number[]): Uint16Array | null {
  const cand = new Uint16Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    const v = values[i];
    if (v === 0) continue;
    if (v < 1 || v > 9) return null;
    for (const p of PEERS[i] ?? []) {
      if (values[p] === v) return null;
    }
  }
  for (let i = 0; i < CELLS; i++) {
    if (values[i] !== 0) continue;
    const mask = placementMask(values, i);
    cand[i] = mask;
    if (mask === 0) return null;
  }
  return cand;
}

/**
 * First hit in historical scan order, or the equal hit earliest in `order`.
 * A missing or invalid `order` keeps the old short-circuit (row-major units).
 */
function takeHit<T>(rank: Uint8Array | null, best: { hit: T; rank: number } | null, hit: T, cellRank: number): { hit: T; rank: number } | null {
  if (!rank) return { hit, rank: cellRank };
  if (!best || cellRank < best.rank) return { hit, rank: cellRank };
  return best;
}

function patternCellRank(rank: Uint8Array, cells: readonly number[]): number {
  let best = CELLS;
  for (const cell of cells) if (rank[cell] < best) best = rank[cell];
  return best;
}

/** #1 Last Free Cell. A unit with a single blank. */
export function findLastFreeCell(values: readonly number[], order?: readonly number[]): FillSpot | null {
  if (values.length !== CELLS) return null;
  const rank = scanRanks(order);
  let best: { hit: FillSpot; rank: number } | null = null;
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u];
    let empty = -1;
    let emptyCount = 0;
    let seen = 0;
    for (const index of unit) {
      const value = values[index] ?? 0;
      if (value === 0) {
        emptyCount++;
        empty = index;
      } else if (value >= 1 && value <= 9) {
        seen |= 1 << value;
      }
    }
    if (emptyCount !== 1 || empty < 0) continue;
    const digit = digitOfSingle(ALL_DIGITS & ~seen);
    if (digit === 0) continue;
    const hit = { index: empty, digit, unit: unitKind(u), evidence: unit.filter((index) => index !== empty) };
    if (!rank) return hit;
    best = takeHit(rank, best, hit, rank[empty]);
  }
  return best?.hit ?? null;
}

/**
 * #2 Last Remaining Cell. One slot left for a digit, and the unit still has another blank.
 * Scan order inside each house is digit → cell (sudoku.com).
 */
export function findLastRemainingCell(values: readonly number[], order?: readonly number[]): FillSpot | null {
  if (values.length !== CELLS) return null;
  const rank = scanRanks(order);
  let best: { hit: FillSpot; rank: number } | null = null;
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u];
    const empty = unit.filter((index) => (values[index] ?? 0) === 0);
    if (empty.length < 2) continue;
    for (let digit = 1; digit <= 9; digit++) {
      if (unit.some((index) => values[index] === digit)) continue;
      const bit = 1 << digit;
      const slots = empty.filter((index) => (placementMask(values, index) & bit) !== 0);
      if (slots.length !== 1) continue;
      const index = slots[0];
      const hit = {
        index,
        digit,
        unit: unitKind(u),
        evidence: blockers(values, unit, digit),
      };
      if (!rank) return hit;
      best = takeHit(rank, best, hit, rank[index]);
    }
  }
  return best?.hit ?? null;
}

/**
 * #3 Last Possible Number. A cell with one digit left from its row, column, and box.
 * Scan order is cell → digit (sudoku.com).
 */
export function findLastPossibleNumber(values: readonly number[], order?: readonly number[]): FillSpot | null {
  if (values.length !== CELLS) return null;
  const rank = scanRanks(order);
  let best: { hit: FillSpot; rank: number } | null = null;
  for (let index = 0; index < CELLS; index++) {
    if ((values[index] ?? 0) !== 0) continue;
    const mask = placementMask(values, index);
    if (popcount(mask) !== 1) continue;
    const digit = digitOfSingle(mask);
    if (digit === 0) continue;
    const hit = { index, digit, unit: null, evidence: filledHouses(values, index) };
    if (!rank) return hit;
    best = takeHit(rank, best, hit, rank[index]);
  }
  return best?.hit ?? null;
}

/**
 * #5 Obvious Singles. One remaining candidate that placements alone do not force.
 * `cand` is the player's notes, or the solver mask after eliminations.
 */
export function findObviousSingle(values: readonly number[], cand: ArrayLike<number>, order?: readonly number[]): FillSpot | null {
  if (values.length !== CELLS) return null;
  const rank = scanRanks(order);
  let best: { hit: FillSpot; rank: number } | null = null;
  for (let index = 0; index < CELLS; index++) {
    if ((values[index] ?? 0) !== 0) continue;
    const mask = cand[index] ?? 0;
    if (popcount(mask) !== 1) continue;
    const legal = placementMask(values, index);
    if (popcount(legal) <= 1) continue;
    const digit = digitOfSingle(mask);
    if (digit === 0 || (legal & (1 << digit)) === 0) continue;
    const hit = { index, digit, unit: null, evidence: filledDifferentPeers(values, index, digit) };
    if (!rank) return hit;
    best = takeHit(rank, best, hit, rank[index]);
  }
  return best?.hit ?? null;
}

/** #8 Hidden Singles on a candidate mask, ignoring singles already visible from placements. */
export function findHiddenSingle(values: readonly number[], cand: ArrayLike<number>, order?: readonly number[]): FillSpot | null {
  if (values.length !== CELLS) return null;
  const rank = scanRanks(order);
  let best: { hit: FillSpot; rank: number } | null = null;
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u];
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << digit;
      let count = 0;
      let found = -1;
      let placed = false;
      for (const index of unit) {
        if ((values[index] ?? 0) === digit) {
          placed = true;
          break;
        }
        if ((values[index] ?? 0) === 0 && ((cand[index] ?? 0) & bit) !== 0) {
          count++;
          found = index;
        }
      }
      if (placed || count !== 1 || found < 0) continue;
      if (popcount(cand[found] ?? 0) <= 1) continue;
      if ((placementMask(values, found) & bit) === 0) continue;
      const slots = unit.filter(
        (index) => (values[index] ?? 0) === 0 && (placementMask(values, index) & bit) !== 0,
      );
      if (slots.length <= 1) continue;
      const hit = { index: found, digit, unit: unitKind(u), evidence: unit.slice() };
      if (!rank) return hit;
      best = takeHit(rank, best, hit, rank[found]);
    }
  }
  return best?.hit ?? null;
}

function combinations(length: number, size: number): number[][] {
  const out: number[][] = [];
  const current: number[] = [];
  const walk = (start: number) => {
    if (current.length === size) {
      out.push(current.slice());
      return;
    }
    for (let index = start; index < length; index++) {
      current.push(index);
      walk(index + 1);
      current.pop();
    }
  };
  if (size > 0 && length >= size) walk(0);
  return out;
}

/** #6 / #7 Obvious pairs and triples. */
export function findObviousSet(
  values: readonly number[],
  cand: ArrayLike<number>,
  size: 2 | 3,
  order?: readonly number[],
): ClearSpot | null {
  if (values.length !== CELLS) return null;
  const rank = scanRanks(order);
  let best: { hit: ClearSpot; rank: number } | null = null;
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u];
    const cells = unit.filter((index) => {
      if ((values[index] ?? 0) !== 0) return false;
      const count = popcount(cand[index] ?? 0);
      return count >= 2 && count <= size;
    });
    if (cells.length < size) continue;
    for (const pick of combinations(cells.length, size)) {
      const chosen = pick.map((index) => cells[index]);
      let union = 0;
      for (const index of chosen) union |= cand[index] ?? 0;
      if (popcount(union) !== size) continue;
      const clearIndexes: number[] = [];
      for (const index of unit) {
        if (chosen.includes(index) || (values[index] ?? 0) !== 0) continue;
        if (((cand[index] ?? 0) & union) !== 0) clearIndexes.push(index);
      }
      if (clearIndexes.length === 0) continue;
      const digits = maskDigits(union);
      const hit = { cells: chosen, digits, clearIndexes, keep: digits, unit: unitKind(u) };
      if (!rank) return hit;
      best = takeHit(rank, best, hit, patternCellRank(rank, chosen));
    }
  }
  return best?.hit ?? null;
}

/** #9 / #10 Hidden pairs and triples. */
export function findHiddenSet(
  values: readonly number[],
  cand: ArrayLike<number>,
  size: 2 | 3,
  order?: readonly number[],
): ClearSpot | null {
  if (values.length !== CELLS) return null;
  const rank = scanRanks(order);
  let best: { hit: ClearSpot; rank: number } | null = null;
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u];
    const locs: number[][] = Array.from({ length: 10 }, () => []);
    for (const index of unit) {
      if ((values[index] ?? 0) !== 0) continue;
      const mask = cand[index] ?? 0;
      for (let digit = 1; digit <= 9; digit++) if ((mask & (1 << digit)) !== 0) locs[digit].push(index);
    }
    const digits: number[] = [];
    for (let digit = 1; digit <= 9; digit++) {
      if (locs[digit].length >= 2 && locs[digit].length <= size) digits.push(digit);
    }
    if (digits.length < size) continue;
    for (const pick of combinations(digits.length, size)) {
      const group = pick.map((index) => digits[index]);
      const cells = new Set<number>();
      for (const digit of group) for (const index of locs[digit]) cells.add(index);
      if (cells.size !== size) continue;
      const cellList = [...cells].sort((a, b) => a - b);
      const keepMask = group.reduce((mask, digit) => mask | (1 << digit), 0);
      const extras = new Set<number>();
      let dirty = false;
      for (const index of cellList) {
        const remove = (cand[index] ?? 0) & ~keepMask;
        if (remove === 0) continue;
        dirty = true;
        for (let digit = 1; digit <= 9; digit++) if ((remove & (1 << digit)) !== 0) extras.add(digit);
      }
      if (!dirty) continue;
      const hit = {
        cells: cellList,
        digits: [...extras].sort((a, b) => a - b),
        clearIndexes: cellList,
        keep: group.slice().sort((a, b) => a - b),
        unit: unitKind(u),
      };
      if (!rank) return hit;
      best = takeHit(rank, best, hit, patternCellRank(rank, cellList));
    }
  }
  return best?.hit ?? null;
}

function applyFill(values: number[], cand: Uint16Array, spot: FillSpot | null): StepResult {
  if (!spot) return "stuck";
  return place(values, cand, spot.index, spot.digit) ? "progress" : "contradiction";
}

function applyClear(cand: Uint16Array, spot: ClearSpot | null): StepResult {
  if (!spot) return "stuck";
  let mask = 0;
  for (const digit of spot.digits) mask |= 1 << digit;
  if (mask === 0) return "stuck";
  let changed = false;
  for (const index of spot.clearIndexes) {
    if ((cand[index] & mask) === 0) continue;
    cand[index] &= ~mask;
    changed = true;
    if (cand[index] === 0) return "contradiction";
  }
  return changed ? "progress" : "stuck";
}

function openCells(values: readonly number[], cand: ArrayLike<number>, cells: readonly number[], bit: number): number[] {
  const open: number[] = [];
  for (const index of cells) {
    if ((values[index] ?? 0) !== 0) continue;
    if (((cand[index] ?? 0) & bit) === 0) continue;
    open.push(index);
  }
  return open;
}

function clearsOutside(
  values: readonly number[],
  cand: ArrayLike<number>,
  hosts: readonly number[],
  line: readonly number[],
  bit: number,
): number[] {
  const host = new Set(hosts);
  return line.filter((index) => !host.has(index) && (values[index] ?? 0) === 0 && ((cand[index] ?? 0) & bit) !== 0);
}

/**
 * #11 / #12 box → line. `unit` is the box. Pattern cells are the aligned
 * candidates; `clearIndexes` are the same line outside that box.
 */
export function findPointing(
  values: readonly number[],
  cand: ArrayLike<number>,
  size: 2 | 3,
): ClearSpot | null {
  if (values.length !== CELLS) return null;
  for (const box of BOXES) {
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << digit;
      const cells = openCells(values, cand, box, bit);
      if (cells.length !== size) continue;
      const row = rowOf(cells[0] ?? 0);
      const col = colOf(cells[0] ?? 0);
      const line = cells.every((index) => rowOf(index) === row)
        ? ROWS[row]
        : cells.every((index) => colOf(index) === col)
          ? COLS[col]
          : null;
      if (!line) continue;
      const clearIndexes = clearsOutside(values, cand, box, line, bit);
      if (clearIndexes.length === 0) continue;
      return { cells: cells.slice(), digits: [digit], clearIndexes, keep: [digit], unit: "box" };
    }
  }
  return null;
}

/**
 * #11 / #12 line → box (claiming). Recorded as Pointing Pairs or Pointing
 * Triples. `unit` is the line, so teaching copy can say line → box.
 */
export function findClaiming(
  values: readonly number[],
  cand: ArrayLike<number>,
  size: 2 | 3,
): ClearSpot | null {
  if (values.length !== CELLS) return null;
  const lines: { cells: readonly number[]; kind: "row" | "col" }[] = [
    ...ROWS.map((cells) => ({ cells, kind: "row" as const })),
    ...COLS.map((cells) => ({ cells, kind: "col" as const })),
  ];
  for (const line of lines) {
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << digit;
      const cells = openCells(values, cand, line.cells, bit);
      if (cells.length !== size) continue;
      const box = boxOf(cells[0] ?? 0);
      if (!cells.every((index) => boxOf(index) === box)) continue;
      const clearIndexes = clearsOutside(values, cand, line.cells, BOXES[box] ?? [], bit);
      if (clearIndexes.length === 0) continue;
      return { cells: cells.slice(), digits: [digit], clearIndexes, keep: [digit], unit: line.kind };
    }
  }
  return null;
}

function fishGeometry(
  values: readonly number[],
  cand: ArrayLike<number>,
  base: readonly number[],
  cover: readonly number[],
  bit: number,
  byRow: boolean,
): { cells: number[]; clearIndexes: number[] } {
  const cells: number[] = [];
  for (const unit of base) {
    for (const cross of cover) {
      const index = byRow ? unit * N + cross : cross * N + unit;
      if ((values[index] ?? 0) !== 0 || ((cand[index] ?? 0) & bit) === 0) continue;
      cells.push(index);
    }
  }
  const clearIndexes: number[] = [];
  for (let other = 0; other < N; other++) {
    if (base.includes(other)) continue;
    for (const cross of cover) {
      const index = byRow ? other * N + cross : cross * N + other;
      if ((values[index] ?? 0) !== 0 || ((cand[index] ?? 0) & bit) === 0) continue;
      clearIndexes.push(index);
    }
  }
  return { cells, clearIndexes };
}

/** #13 X-Wing (`size` 2) and #15 Swordfish (`size` 3). `unit` is the base line. */
export function findFish(values: readonly number[], cand: ArrayLike<number>, size: 2 | 3): ClearSpot | null {
  if (values.length !== CELLS) return null;
  for (let digit = 1; digit <= 9; digit++) {
    const bit = 1 << digit;
    const rowCols: number[][] = [];
    const colRows: number[][] = [];
    for (let row = 0; row < N; row++) {
      const cols: number[] = [];
      for (let col = 0; col < N; col++) {
        const index = row * N + col;
        if ((values[index] ?? 0) === 0 && ((cand[index] ?? 0) & bit) !== 0) cols.push(col);
      }
      rowCols.push(cols);
    }
    for (let col = 0; col < N; col++) {
      const rows: number[] = [];
      for (let row = 0; row < N; row++) {
        const index = row * N + col;
        if ((values[index] ?? 0) === 0 && ((cand[index] ?? 0) & bit) !== 0) rows.push(row);
      }
      colRows.push(rows);
    }
    const usableRows = rowCols
      .map((cols, row) => (cols.length >= 2 && cols.length <= size ? row : -1))
      .filter((row) => row >= 0);
    for (const pick of combinations(usableRows.length, size)) {
      const rows = pick.map((index) => usableRows[index] ?? -1);
      const cover = new Set<number>();
      for (const row of rows) for (const col of rowCols[row] ?? []) cover.add(col);
      if (cover.size !== size) continue;
      const geometry = fishGeometry(values, cand, rows, [...cover].sort((a, b) => a - b), bit, true);
      if (geometry.clearIndexes.length === 0) continue;
      return { ...geometry, digits: [digit], keep: [digit], unit: "row" };
    }
    const usableCols = colRows
      .map((rows, col) => (rows.length >= 2 && rows.length <= size ? col : -1))
      .filter((col) => col >= 0);
    for (const pick of combinations(usableCols.length, size)) {
      const cols = pick.map((index) => usableCols[index] ?? -1);
      const cover = new Set<number>();
      for (const col of cols) for (const row of colRows[col] ?? []) cover.add(row);
      if (cover.size !== size) continue;
      const geometry = fishGeometry(values, cand, cols, [...cover].sort((a, b) => a - b), bit, false);
      if (geometry.clearIndexes.length === 0) continue;
      return { ...geometry, digits: [digit], keep: [digit], unit: "col" };
    }
  }
  return null;
}

/**
 * #14 Y-Wing. `cells` is pivot, then the two pincers.
 * `digits` is the shared pincer candidate to clear. `keep` is the pivot pair.
 * `unit` is unused for the house; the triangle is the three pattern cells.
 */
export function findYWing(values: readonly number[], cand: ArrayLike<number>): ClearSpot | null {
  if (values.length !== CELLS) return null;
  const cells: number[] = [];
  for (let index = 0; index < CELLS; index++) {
    if ((values[index] ?? 0) === 0 && popcount(cand[index] ?? 0) === 2) cells.push(index);
  }
  for (const pivot of cells) {
    const pivotDigits = maskDigits(cand[pivot] ?? 0);
    if (pivotDigits.length !== 2) continue;
    const a = pivotDigits[0] ?? 0;
    const b = pivotDigits[1] ?? 0;
    for (const first of PEERS[pivot] ?? []) {
      if ((values[first] ?? 0) !== 0 || popcount(cand[first] ?? 0) !== 2) continue;
      const firstDigits = maskDigits(cand[first] ?? 0);
      const shared = firstDigits.filter((digit) => digit === a || digit === b);
      if (shared.length !== 1) continue;
      const extra = firstDigits.find((digit) => digit !== a && digit !== b);
      if (extra === undefined) continue;
      const other = shared[0] === a ? b : a;
      const wing = (1 << other) | (1 << extra);
      for (const second of PEERS[pivot] ?? []) {
        if (second === first || (values[second] ?? 0) !== 0 || (cand[second] ?? 0) !== wing) continue;
        const seen = new Set(PEERS[first] ?? []);
        const clearIndexes: number[] = [];
        for (const target of PEERS[second] ?? []) {
          if (target === pivot || target === first || target === second || !seen.has(target)) continue;
          if ((values[target] ?? 0) !== 0 || ((cand[target] ?? 0) & (1 << extra)) === 0) continue;
          clearIndexes.push(target);
        }
        if (clearIndexes.length === 0) continue;
        clearIndexes.sort((left, right) => left - right);
        return {
          cells: [pivot, first, second],
          digits: [extra],
          clearIndexes,
          keep: [a, b],
          unit: "row",
        };
      }
    }
  }
  return null;
}

type FoundStep =
  | { id: AppliedTechnique; kind: "fill"; spot: FillSpot }
  | { id: AppliedTechnique; kind: "clear"; spot: ClearSpot };

interface SolverStep {
  id: AppliedTechnique;
  find: () => FoundStep | null;
}

function asFill(id: AppliedTechnique, spot: FillSpot | null): FoundStep | null {
  return spot ? { id, kind: "fill", spot } : null;
}

function asClear(id: AppliedTechnique, spot: ClearSpot | null): FoundStep | null {
  return spot ? { id, kind: "clear", spot } : null;
}

/** Same order `findHint` uses after the notes gate. #11 is pointing, then claiming. */
function solverSteps(values: number[], cand: ArrayLike<number>, order: readonly number[]): SolverStep[] {
  return [
    { id: "last_free_cell", find: () => asFill("last_free_cell", findLastFreeCell(values, order)) },
    { id: "last_remaining_cell", find: () => asFill("last_remaining_cell", findLastRemainingCell(values, order)) },
    { id: "last_possible_number", find: () => asFill("last_possible_number", findLastPossibleNumber(values, order)) },
    { id: "obvious_singles", find: () => asFill("obvious_singles", findObviousSingle(values, cand, order)) },
    { id: "obvious_pairs", find: () => asClear("obvious_pairs", findObviousSet(values, cand, 2, order)) },
    { id: "obvious_triples", find: () => asClear("obvious_triples", findObviousSet(values, cand, 3, order)) },
    { id: "hidden_singles", find: () => asFill("hidden_singles", findHiddenSingle(values, cand, order)) },
    { id: "hidden_pairs", find: () => asClear("hidden_pairs", findHiddenSet(values, cand, 2, order)) },
    { id: "hidden_triples", find: () => asClear("hidden_triples", findHiddenSet(values, cand, 3, order)) },
    { id: "pointing_pairs", find: () => asClear("pointing_pairs", findPointing(values, cand, 2)) },
    { id: "pointing_pairs", find: () => asClear("pointing_pairs", findClaiming(values, cand, 2)) },
    { id: "pointing_triples", find: () => asClear("pointing_triples", findPointing(values, cand, 3)) },
    { id: "pointing_triples", find: () => asClear("pointing_triples", findClaiming(values, cand, 3)) },
    { id: "x_wing", find: () => asClear("x_wing", findFish(values, cand, 2)) },
    { id: "y_wing", find: () => asClear("y_wing", findYWing(values, cand)) },
    { id: "swordfish", find: () => asClear("swordfish", findFish(values, cand, 3)) },
  ];
}

type WalkResult =
  | { status: "done"; values: number[]; used: Set<AppliedTechnique> }
  | { status: "fail"; values: number[] }
  | { status: "snapshot"; values: number[]; candidates: number[] };

function walkSolver(flat: readonly number[], stopAt: AppliedTechnique | null): WalkResult {
  const values = flat.slice();
  if (flat.length !== CELLS) return { status: "fail", values };
  if (values.every((value) => value !== 0)) return { status: "done", values, used: new Set() };
  const cand = initCandidates(values);
  if (!cand) return { status: "fail", values };
  // Same permutation findHint uses for #1–#10. #11+ keep their geometric scans.
  const order = scanOrderFromPuzzle(flat);
  const steps = solverSteps(values, cand, order);
  const used = new Set<AppliedTechnique>();
  for (let guard = 0; guard < 900; guard++) {
    if (values.every((value) => value !== 0)) break;
    let acted = false;
    for (const step of steps) {
      const found = step.find();
      if (!found) continue;
      if (stopAt !== null && found.id === stopAt) {
        return { status: "snapshot", values: values.slice(), candidates: Array.from(cand) };
      }
      const result = found.kind === "fill" ? applyFill(values, cand, found.spot) : applyClear(cand, found.spot);
      if (result === "contradiction") return { status: "fail", values };
      if (result === "stuck") continue;
      used.add(found.id);
      acted = true;
      break;
    }
    if (!acted) break;
    if (contradictory(values, cand)) return { status: "fail", values };
  }
  if (!values.every((value) => value !== 0)) return { status: "fail", values };
  return { status: "done", values, used };
}

/**
 * Grid and candidate mask at the moment `id` is the next §11 step.
 * Null when the solve never reaches that technique.
 */
export function snapshotBeforeTechnique(
  flat: readonly number[],
  id: AppliedTechnique,
): { values: number[]; candidates: number[] } | null {
  const walk = walkSolver(flat, id);
  if (walk.status !== "snapshot") return null;
  return { values: walk.values, candidates: walk.candidates };
}

/**
 * Solve `flat` with §11 techniques through Swordfish.
 * Returns `solved: false` when a harder technique or a guess would be required.
 * Beginner steps are the #1–#3 detectors, never the old singles aliases.
 */
export function analyze(flat: readonly number[]): Analysis {
  const empty: Analysis = {
    solved: false,
    maxTechnique: null,
    techniques: [],
    values: flat.slice(),
  };
  const walk = walkSolver(flat, null);
  if (walk.status !== "done") return { ...empty, values: walk.values };
  const techniques = TECHNIQUE_ORDER.filter((id) => walk.used.has(id));
  const maxTechnique = techniques.length > 0 ? techniques[techniques.length - 1] : null;
  return { solved: true, maxTechnique, techniques, values: walk.values };
}

export function flatToRows(flat: readonly number[]): number[][] {
  const rows: number[][] = [];
  for (let r = 0; r < N; r++) rows.push(flat.slice(r * N, r * N + N));
  return rows;
}

export function rowsToFlat(rows: readonly (readonly number[])[]): number[] {
  return rows.flatMap((row) => [...row]);
}

export function sameFlat(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
