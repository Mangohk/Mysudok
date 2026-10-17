/**
 * Human-style technique rater for 9×9 Sudoku.
 *
 * Technique ids are openzeloku's `TechniqueName` strings
 * (https://github.com/mr-girff/openzeloku, MIT):
 *
 * | Rank | id                   | Label              | Band |
 * | ---: | -------------------- | ------------------ | ---- |
 * |    1 | naked_single         | Naked Single       | 入門 |
 * |    2 | hidden_single        | Hidden Single      | 入門 |
 * |    3 | naked_pair           | Naked Pair         | 進階 |
 * |    4 | hidden_pair          | Hidden Pair        | 進階 |
 * |    5 | pointing_pair        | Pointing Pair      | 進階 |
 * |    6 | box_line_reduction   | Box/Line Reduction | 進階 |
 *
 * Not applied (a puzzle that still has empty cells after the list above is
 * rejected — it would need a triple, x_wing, swordfish, or guess):
 * naked/hidden triple, x_wing, swordfish, guess.
 *
 * openzeloku's own `rate()` only *detects* naked_pair / pointing_pair and then
 * labels the puzzle `guess`, because those branches do not eliminate
 * candidates. Singles placed here follow the same definitions as `nextHint`.
 * Pair, pointing, and box-line steps are real eliminations so the hardest
 * id is one the player would actually need.
 */

export const TECHNIQUE_ORDER = [
  "naked_single",
  "hidden_single",
  "naked_pair",
  "hidden_pair",
  "pointing_pair",
  "box_line_reduction",
] as const;

export type AppliedTechnique = (typeof TECHNIQUE_ORDER)[number];

export const TECHNIQUE_LABEL: Record<AppliedTechnique, string> = {
  naked_single: "Naked Single",
  hidden_single: "Hidden Single",
  naked_pair: "Naked Pair",
  hidden_pair: "Hidden Pair",
  pointing_pair: "Pointing Pair",
  box_line_reduction: "Box/Line Reduction",
};

const RANK: Record<AppliedTechnique, number> = {
  naked_single: 1,
  hidden_single: 2,
  naked_pair: 3,
  hidden_pair: 4,
  pointing_pair: 5,
  box_line_reduction: 6,
};

export function techniqueRank(id: AppliedTechnique): number {
  return RANK[id];
}

export function isIntroTechnique(id: AppliedTechnique): boolean {
  return RANK[id] <= RANK.hidden_single;
}

export function isAdvancedTechnique(id: AppliedTechnique): boolean {
  return RANK[id] >= RANK.naked_pair && RANK[id] <= RANK.box_line_reduction;
}

const N = 9;
const CELLS = 81;

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
  for (const p of PEERS[i]) {
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
    for (const p of PEERS[i]) {
      if (values[p] === v) return null;
    }
  }
  for (let i = 0; i < CELLS; i++) {
    if (values[i] !== 0) continue;
    let mask = 0;
    for (let v = 1; v <= 9; v++) {
      let ok = true;
      for (const p of PEERS[i]) {
        if (values[p] === v) {
          ok = false;
          break;
        }
      }
      if (ok) mask |= 1 << v;
    }
    cand[i] = mask;
    if (mask === 0) return null;
  }
  return cand;
}

function applyNakedSingle(values: number[], cand: Uint16Array): StepResult {
  for (let i = 0; i < CELLS; i++) {
    if (values[i] !== 0 || popcount(cand[i]) !== 1) continue;
    const v = digitOfSingle(cand[i]);
    return place(values, cand, i, v) ? "progress" : "contradiction";
  }
  return "stuck";
}

function applyHiddenSingle(values: number[], cand: Uint16Array): StepResult {
  for (const unit of UNITS) {
    for (let v = 1; v <= 9; v++) {
      const bit = 1 << v;
      let count = 0;
      let found = -1;
      let placed = false;
      for (const i of unit) {
        if (values[i] === v) {
          placed = true;
          break;
        }
        if (values[i] === 0 && (cand[i] & bit) !== 0) {
          count++;
          found = i;
        }
      }
      if (placed || count !== 1 || found < 0) continue;
      // A one-candidate cell is a naked single and is handled earlier.
      if (popcount(cand[found]) === 1) continue;
      return place(values, cand, found, v) ? "progress" : "contradiction";
    }
  }
  return "stuck";
}

function applyNakedPairs(values: number[], cand: Uint16Array): StepResult {
  let changed = false;
  for (const unit of UNITS) {
    const cells = unit.filter((i) => values[i] === 0 && popcount(cand[i]) === 2);
    for (let a = 0; a < cells.length; a++) {
      for (let b = a + 1; b < cells.length; b++) {
        const mask = cand[cells[a]];
        if (mask !== cand[cells[b]]) continue;
        for (const i of unit) {
          if (i === cells[a] || i === cells[b] || values[i] !== 0) continue;
          const next = cand[i] & ~mask;
          if (next !== cand[i]) {
            cand[i] = next;
            changed = true;
            if (next === 0) return "contradiction";
          }
        }
      }
    }
  }
  return changed ? "progress" : "stuck";
}

function applyHiddenPairs(values: number[], cand: Uint16Array): StepResult {
  let changed = false;
  for (const unit of UNITS) {
    const locs: number[][] = Array.from({ length: 10 }, () => []);
    for (const i of unit) {
      if (values[i] !== 0) continue;
      for (let v = 1; v <= 9; v++) {
        if ((cand[i] & (1 << v)) !== 0) locs[v].push(i);
      }
    }
    for (let a = 1; a <= 9; a++) {
      if (locs[a].length !== 2) continue;
      for (let b = a + 1; b <= 9; b++) {
        if (locs[b].length !== 2) continue;
        if (locs[a][0] !== locs[b][0] || locs[a][1] !== locs[b][1]) continue;
        const keep = (1 << a) | (1 << b);
        for (const cell of locs[a]) {
          const next = cand[cell] & keep;
          if (next !== cand[cell]) {
            cand[cell] = next;
            changed = true;
            if (next === 0) return "contradiction";
          }
        }
      }
    }
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
  for (const i of line) {
    if (host.has(i) || values[i] !== 0) continue;
    if ((cand[i] & bit) === 0) continue;
    cand[i] &= ~bit;
    changed = true;
    if (cand[i] === 0) return "contradiction";
  }
  return changed ? "progress" : "stuck";
}

function applyPointing(values: number[], cand: Uint16Array): StepResult {
  let changed = false;
  for (const box of BOXES) {
    for (let v = 1; v <= 9; v++) {
      const bit = 1 << v;
      const cells = box.filter((i) => values[i] === 0 && (cand[i] & bit) !== 0);
      if (cells.length < 2) continue;
      const row = rowOf(cells[0]);
      const col = colOf(cells[0]);
      if (cells.every((i) => rowOf(i) === row)) {
        const step = eliminateDigitOutside(values, cand, box, ROWS[row], bit);
        if (step === "contradiction") return step;
        if (step === "progress") changed = true;
      }
      if (cells.every((i) => colOf(i) === col)) {
        const step = eliminateDigitOutside(values, cand, box, COLS[col], bit);
        if (step === "contradiction") return step;
        if (step === "progress") changed = true;
      }
    }
  }
  return changed ? "progress" : "stuck";
}

function applyBoxLine(values: number[], cand: Uint16Array): StepResult {
  let changed = false;
  const lines = [...ROWS, ...COLS];
  for (const line of lines) {
    for (let v = 1; v <= 9; v++) {
      const bit = 1 << v;
      const cells = line.filter((i) => values[i] === 0 && (cand[i] & bit) !== 0);
      if (cells.length < 2) continue;
      const b = boxOf(cells[0]);
      if (!cells.every((i) => boxOf(i) === b)) continue;
      const step = eliminateDigitOutside(values, cand, line, BOXES[b], bit);
      if (step === "contradiction") return step;
      if (step === "progress") changed = true;
    }
  }
  return changed ? "progress" : "stuck";
}

const ELIMINATORS: { id: AppliedTechnique; apply: typeof applyNakedPairs }[] = [
  { id: "naked_pair", apply: applyNakedPairs },
  { id: "hidden_pair", apply: applyHiddenPairs },
  { id: "pointing_pair", apply: applyPointing },
  { id: "box_line_reduction", apply: applyBoxLine },
];

/**
 * Solve `flat` using only singles, pairs, pointing, and box-line reduction.
 * Returns `solved: false` when a harder technique or a guess would be required.
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
  if (values.every((v) => v !== 0)) {
    return { solved: true, maxTechnique: null, techniques: [], values };
  }

  const cand = initCandidates(values);
  if (!cand) return empty;

  const used = new Set<AppliedTechnique>();
  for (let guard = 0; guard < 400; guard++) {
    if (values.every((v) => v !== 0)) break;

    const naked = applyNakedSingle(values, cand);
    if (naked === "contradiction") return { ...empty, values };
    if (naked === "progress") {
      used.add("naked_single");
      continue;
    }

    const hidden = applyHiddenSingle(values, cand);
    if (hidden === "contradiction") return { ...empty, values };
    if (hidden === "progress") {
      used.add("hidden_single");
      continue;
    }

    let eliminated = false;
    for (const step of ELIMINATORS) {
      const result = step.apply(values, cand);
      if (result === "contradiction") return { ...empty, values };
      if (result === "progress") {
        used.add(step.id);
        eliminated = true;
        break;
      }
    }
    if (!eliminated) break;
    if (contradictory(values, cand)) return { ...empty, values };
  }

  const solved = values.every((v) => v !== 0);
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
