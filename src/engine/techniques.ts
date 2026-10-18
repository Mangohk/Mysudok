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
 * |   14 | y_wing                | Y-Wing                | 高級 |
 * |   15 | swordfish             | Swordfish             | 高級 |
 *
 * #1–#3 read placed digits only (no pencil marks). #5–#10 read the candidate
 * mask, which starts as those placements and shrinks when a later technique
 * eliminates. Obvious / hidden singles therefore fire only after an
 * elimination has removed candidates a player could not see from the ink.
 *
 * Legacy ids map forward: naked_single → obvious_singles, hidden_single →
 * hidden_singles, naked_pair → obvious_pairs, hidden_pair → hidden_pairs.
 * Pointing and box-line reduction are advanced-band thresholds. Box-line
 * (claiming) is applied and recorded as Pointing Pairs or Pointing Triples.
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

export type TechniqueBand = "初級" | "中級" | "高級";

export function techniqueRank(id: AppliedTechnique): number {
  return RANK[id];
}

export function techniqueBand(id: AppliedTechnique): TechniqueBand {
  const rank = RANK[id];
  if (rank <= 3) return "初級";
  if (rank <= 10) return "中級";
  return "高級";
}

export function isBeginnerTechnique(id: AppliedTechnique): boolean {
  return RANK[id] <= 3;
}

export function isIntermediateTechnique(id: AppliedTechnique): boolean {
  return RANK[id] >= 5 && RANK[id] <= 10;
}

export function isAdvancedTechnique(id: AppliedTechnique): boolean {
  return RANK[id] >= 11;
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

/** #1 Last Free Cell. A unit with a single blank. */
export function findLastFreeCell(values: readonly number[]): FillSpot | null {
  if (values.length !== CELLS) return null;
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
    return { index: empty, digit, unit: unitKind(u), evidence: unit.filter((index) => index !== empty) };
  }
  return null;
}

/** #2 Last Remaining Cell. One slot left for a digit, and the unit still has another blank. */
export function findLastRemainingCell(values: readonly number[]): FillSpot | null {
  if (values.length !== CELLS) return null;
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u];
    const empty = unit.filter((index) => (values[index] ?? 0) === 0);
    if (empty.length < 2) continue;
    for (let digit = 1; digit <= 9; digit++) {
      if (unit.some((index) => values[index] === digit)) continue;
      const bit = 1 << digit;
      const slots = empty.filter((index) => (placementMask(values, index) & bit) !== 0);
      if (slots.length !== 1) continue;
      return {
        index: slots[0],
        digit,
        unit: unitKind(u),
        evidence: blockers(values, unit, digit),
      };
    }
  }
  return null;
}

/** #3 Last Possible Number. A cell with one digit left from its row, column, and box. */
export function findLastPossibleNumber(values: readonly number[]): FillSpot | null {
  if (values.length !== CELLS) return null;
  for (let index = 0; index < CELLS; index++) {
    if ((values[index] ?? 0) !== 0) continue;
    const mask = placementMask(values, index);
    if (popcount(mask) !== 1) continue;
    const digit = digitOfSingle(mask);
    if (digit === 0) continue;
    return { index, digit, unit: null, evidence: filledHouses(values, index) };
  }
  return null;
}

/**
 * #5 Obvious Singles. One remaining candidate that placements alone do not force.
 * `cand` is the player's notes, or the solver mask after eliminations.
 */
export function findObviousSingle(values: readonly number[], cand: ArrayLike<number>): FillSpot | null {
  if (values.length !== CELLS) return null;
  for (let index = 0; index < CELLS; index++) {
    if ((values[index] ?? 0) !== 0) continue;
    const mask = cand[index] ?? 0;
    if (popcount(mask) !== 1) continue;
    const legal = placementMask(values, index);
    if (popcount(legal) <= 1) continue;
    const digit = digitOfSingle(mask);
    if (digit === 0 || (legal & (1 << digit)) === 0) continue;
    return { index, digit, unit: null, evidence: filledDifferentPeers(values, index, digit) };
  }
  return null;
}

/** #8 Hidden Singles on a candidate mask, ignoring singles already visible from placements. */
export function findHiddenSingle(values: readonly number[], cand: ArrayLike<number>): FillSpot | null {
  if (values.length !== CELLS) return null;
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
      return { index: found, digit, unit: unitKind(u), evidence: unit.slice() };
    }
  }
  return null;
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
export function findObviousSet(values: readonly number[], cand: ArrayLike<number>, size: 2 | 3): ClearSpot | null {
  if (values.length !== CELLS) return null;
  for (const unit of UNITS) {
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
      return { cells: chosen, digits, clearIndexes, keep: digits };
    }
  }
  return null;
}

/** #9 / #10 Hidden pairs and triples. */
export function findHiddenSet(values: readonly number[], cand: ArrayLike<number>, size: 2 | 3): ClearSpot | null {
  if (values.length !== CELLS) return null;
  for (const unit of UNITS) {
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
      return {
        cells: cellList,
        digits: [...extras].sort((a, b) => a - b),
        clearIndexes: cellList,
        keep: group.slice().sort((a, b) => a - b),
      };
    }
  }
  return null;
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

function eliminateDigitOutside(
  values: number[],
  cand: Uint16Array,
  hosts: readonly number[],
  line: readonly number[],
  bit: number,
): StepResult {
  const host = new Set(hosts);
  let changed = false;
  for (const index of line) {
    if (host.has(index) || values[index] !== 0) continue;
    if ((cand[index] & bit) === 0) continue;
    cand[index] &= ~bit;
    changed = true;
    if (cand[index] === 0) return "contradiction";
  }
  return changed ? "progress" : "stuck";
}

function applyPointing(values: number[], cand: Uint16Array, size: 2 | 3): StepResult {
  let changed = false;
  for (const box of BOXES) {
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << digit;
      const cells = box.filter((index) => values[index] === 0 && (cand[index] & bit) !== 0);
      if (cells.length !== size) continue;
      const row = rowOf(cells[0]);
      const col = colOf(cells[0]);
      if (cells.every((index) => rowOf(index) === row)) {
        const step = eliminateDigitOutside(values, cand, box, ROWS[row], bit);
        if (step === "contradiction") return step;
        if (step === "progress") changed = true;
      } else if (cells.every((index) => colOf(index) === col)) {
        const step = eliminateDigitOutside(values, cand, box, COLS[col], bit);
        if (step === "contradiction") return step;
        if (step === "progress") changed = true;
      }
    }
  }
  return changed ? "progress" : "stuck";
}

/** Box-line reduction. Recorded by the caller as pointing pairs or triples. */
function applyClaiming(values: number[], cand: Uint16Array, size: 2 | 3): StepResult {
  let changed = false;
  const lines = [...ROWS, ...COLS];
  for (const line of lines) {
    for (let digit = 1; digit <= 9; digit++) {
      const bit = 1 << digit;
      const cells = line.filter((index) => values[index] === 0 && (cand[index] & bit) !== 0);
      if (cells.length !== size) continue;
      const box = boxOf(cells[0]);
      if (!cells.every((index) => boxOf(index) === box)) continue;
      const step = eliminateDigitOutside(values, cand, line, BOXES[box], bit);
      if (step === "contradiction") return step;
      if (step === "progress") changed = true;
    }
  }
  return changed ? "progress" : "stuck";
}

function applyFish(values: number[], cand: Uint16Array, size: 2 | 3): StepResult {
  let changed = false;
  const strike = (base: number[], cover: number[], digitBit: number, byRow: boolean) => {
    for (let other = 0; other < N; other++) {
      if (base.includes(other)) continue;
      for (const cross of cover) {
        const index = byRow ? other * N + cross : cross * N + other;
        if (values[index] !== 0 || (cand[index] & digitBit) === 0) continue;
        cand[index] &= ~digitBit;
        changed = true;
        if (cand[index] === 0) return "contradiction" as const;
      }
    }
    return "progress" as const;
  };

  for (let digit = 1; digit <= 9; digit++) {
    const bit = 1 << digit;
    const rowCols: number[][] = [];
    const colRows: number[][] = [];
    for (let row = 0; row < N; row++) {
      const cols: number[] = [];
      for (let col = 0; col < N; col++) {
        const index = row * N + col;
        if (values[index] === 0 && (cand[index] & bit) !== 0) cols.push(col);
      }
      rowCols.push(cols);
    }
    for (let col = 0; col < N; col++) {
      const rows: number[] = [];
      for (let row = 0; row < N; row++) {
        const index = row * N + col;
        if (values[index] === 0 && (cand[index] & bit) !== 0) rows.push(row);
      }
      colRows.push(rows);
    }
    const usableRows = rowCols.map((cols, row) => (cols.length >= 2 && cols.length <= size ? row : -1)).filter((row) => row >= 0);
    for (const pick of combinations(usableRows.length, size)) {
      const rows = pick.map((index) => usableRows[index]);
      const cover = new Set<number>();
      for (const row of rows) for (const col of rowCols[row]) cover.add(col);
      if (cover.size !== size) continue;
      const step = strike(rows, [...cover], bit, true);
      if (step === "contradiction") return step;
    }
    const usableCols = colRows.map((rows, col) => (rows.length >= 2 && rows.length <= size ? col : -1)).filter((col) => col >= 0);
    for (const pick of combinations(usableCols.length, size)) {
      const cols = pick.map((index) => usableCols[index]);
      const cover = new Set<number>();
      for (const col of cols) for (const row of colRows[col]) cover.add(row);
      if (cover.size !== size) continue;
      const step = strike(cols, [...cover], bit, false);
      if (step === "contradiction") return step;
    }
  }
  return changed ? "progress" : "stuck";
}

function applyYWing(values: number[], cand: Uint16Array): StepResult {
  const cells: number[] = [];
  for (let index = 0; index < CELLS; index++) {
    if (values[index] === 0 && popcount(cand[index]) === 2) cells.push(index);
  }
  let changed = false;
  for (const pivot of cells) {
    const pivotDigits = maskDigits(cand[pivot]);
    if (pivotDigits.length !== 2) continue;
    const [a, b] = pivotDigits;
    for (const first of PEERS[pivot] ?? []) {
      if (values[first] !== 0 || popcount(cand[first]) !== 2) continue;
      const firstDigits = maskDigits(cand[first]);
      const shared = firstDigits.filter((digit) => digit === a || digit === b);
      if (shared.length !== 1) continue;
      const extra = firstDigits.find((digit) => digit !== a && digit !== b);
      if (extra === undefined) continue;
      const other = shared[0] === a ? b : a;
      const wing = (1 << other) | (1 << extra);
      for (const second of PEERS[pivot] ?? []) {
        if (second === first || values[second] !== 0 || cand[second] !== wing) continue;
        const seen = new Set(PEERS[first] ?? []);
        for (const target of PEERS[second] ?? []) {
          if (target === pivot || target === first || target === second || !seen.has(target)) continue;
          if (values[target] !== 0 || (cand[target] & (1 << extra)) === 0) continue;
          cand[target] &= ~(1 << extra);
          changed = true;
          if (cand[target] === 0) return "contradiction";
        }
      }
    }
  }
  return changed ? "progress" : "stuck";
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
  if (flat.length !== CELLS) return empty;

  const values = flat.slice();
  if (values.every((value) => value !== 0)) {
    return { solved: true, maxTechnique: null, techniques: [], values };
  }

  const cand = initCandidates(values);
  if (!cand) return empty;

  const used = new Set<AppliedTechnique>();
  const steps: { id: AppliedTechnique; apply: () => StepResult }[] = [
    { id: "last_free_cell", apply: () => applyFill(values, cand, findLastFreeCell(values)) },
    { id: "last_remaining_cell", apply: () => applyFill(values, cand, findLastRemainingCell(values)) },
    { id: "last_possible_number", apply: () => applyFill(values, cand, findLastPossibleNumber(values)) },
    { id: "obvious_singles", apply: () => applyFill(values, cand, findObviousSingle(values, cand)) },
    { id: "obvious_pairs", apply: () => applyClear(cand, findObviousSet(values, cand, 2)) },
    { id: "obvious_triples", apply: () => applyClear(cand, findObviousSet(values, cand, 3)) },
    { id: "hidden_singles", apply: () => applyFill(values, cand, findHiddenSingle(values, cand)) },
    { id: "hidden_pairs", apply: () => applyClear(cand, findHiddenSet(values, cand, 2)) },
    { id: "hidden_triples", apply: () => applyClear(cand, findHiddenSet(values, cand, 3)) },
    { id: "pointing_pairs", apply: () => applyPointing(values, cand, 2) },
    { id: "pointing_triples", apply: () => applyPointing(values, cand, 3) },
    { id: "pointing_pairs", apply: () => applyClaiming(values, cand, 2) },
    { id: "pointing_triples", apply: () => applyClaiming(values, cand, 3) },
    { id: "x_wing", apply: () => applyFish(values, cand, 2) },
    { id: "y_wing", apply: () => applyYWing(values, cand) },
    { id: "swordfish", apply: () => applyFish(values, cand, 3) },
  ];

  for (let guard = 0; guard < 900; guard++) {
    if (values.every((value) => value !== 0)) break;
    let acted = false;
    for (const step of steps) {
      const result = step.apply();
      if (result === "contradiction") return { ...empty, values };
      if (result === "stuck") continue;
      used.add(step.id);
      acted = true;
      break;
    }
    if (!acted) break;
    if (contradictory(values, cand)) return { ...empty, values };
  }

  const solved = values.every((value) => value !== 0);
  if (!solved) return { ...empty, values };

  const techniques = TECHNIQUE_ORDER.filter((id) => used.has(id));
  const maxTechnique = techniques.length > 0 ? techniques[techniques.length - 1] : null;
  return { solved: true, maxTechnique, techniques, values };
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
