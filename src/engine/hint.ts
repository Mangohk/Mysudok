import { nextHint, type TechniqueName } from "openzeloku";
import { TECHNIQUE_LABEL, type AppliedTechnique } from "./techniques";

/**
 * One teaching step from openzeloku `nextHint`.
 * A placement uses `value` from that step. An elimination uses only the
 * candidate list the step itself carries. Neither path reads the solution.
 */
export type HintAction = { kind: "fill"; value: number } | { kind: "notes"; digits: number[] };

export interface StepHint {
  indexes: number[];
  technique: string;
  action: HintAction;
}

/** Library steps are placements unless they name an elimination technique. */
const ELIMINATION = new Set<TechniqueName>([
  "naked_pair",
  "hidden_pair",
  "pointing_pair",
  "box_line_reduction",
  "x_wing",
  "swordfish",
]);

const EXTRA_LABEL: Record<string, string> = {
  x_wing: "交叉排除",
  swordfish: "劍魚",
  guess: "試探",
};

const REASONS: Record<string, string> = {
  naked_single: "呢一格只剩一個候選",
  hidden_single: "呢個數字喺呢一區只可以放喺呢一格",
  naked_pair: "兩格一齊只剩兩個候選",
  hidden_pair: "兩個數字喺呢一區只可以放喺兩格",
  pointing_pair: "呢個數字喺宮入面只排成一行或一列",
  box_line_reduction: "呢行或呢列嘅數字都擠喺同一個宮",
  x_wing: "呢個數字喺兩行兩列交叉鎖定",
  swordfish: "呢個數字喺三行三列交叉鎖定",
};

/** Shown when `nextHint` has no usable step. */
export const HINT_STUCK = "解唔落。";

export interface HintPayload {
  row: number;
  col: number;
  value: number;
  technique: string;
  explanation?: string;
  /** Cells involved, in addition to row/col, when the library step lists them. */
  cells?: readonly number[];
  /** Digits a note-type step says to clear. Absent on placement steps. */
  clear?: readonly number[];
}

export function techniqueTitle(id: string): string {
  return TECHNIQUE_LABEL[id as AppliedTechnique] ?? EXTRA_LABEL[id] ?? id;
}

export function findHint(flat: readonly number[]): StepHint | null {
  const hint = nextHint(flat.slice(), 9);
  if (!hint) return null;
  return hintFromStep(hint);
}

/**
 * Turn one library step into L1/L2 content.
 * Elimination techniques never become 「填入 〔n〕」 from `value` alone: the
 * candidate list has to be on the step. `guess` is not a teaching step.
 */
export function hintFromStep(hint: HintPayload): StepHint | null {
  if (hint.technique === "guess") return null;
  const indexes = cellsOf(hint);
  if (indexes.length === 0) return null;
  if (ELIMINATION.has(hint.technique as TechniqueName)) {
    const digits = digitsToClear(hint);
    if (!digits) return null;
    return { indexes, technique: hint.technique, action: { kind: "notes", digits } };
  }
  if (Number.isInteger(hint.value) && hint.value >= 1 && hint.value <= 9) {
    return { indexes, technique: hint.technique, action: { kind: "fill", value: hint.value } };
  }
  const digits = digitsToClear(hint);
  if (!digits) return null;
  return { indexes, technique: hint.technique, action: { kind: "notes", digits } };
}

/** L1 names the technique and the reason. It does not reveal a digit or a clear-list. */
export function hintLevel1Text(hint: StepHint): string {
  const name = techniqueTitle(hint.technique);
  const reason = REASONS[hint.technique] ?? "可以跟呢個技巧睇下一步";
  const where = hint.indexes.length > 1 ? "呢幾格" : "這一格";
  return `${where}可用〔${name}〕：〔${reason}〕。再撳提示睇要填咩／改筆記。`;
}

/** L2 for a placement: the digit `nextHint` already returned. */
export function hintLevel2FillText(value: number): string {
  return `填入 〔${value}〕。`;
}

/** L2 for an elimination: the candidate list from that same step. */
export function hintLevel2NotesText(digits: readonly number[]): string {
  return `清／改呢啲候選：〔${digits.join("、")}〕。`;
}

export function hintLevel2Text(action: HintAction): string {
  return action.kind === "notes" ? hintLevel2NotesText(action.digits) : hintLevel2FillText(action.value);
}

/** @deprecated Use findHint. Kept so older imports still compile. */
export function nextSingleCell(flat: readonly number[]): number | null {
  return findHint(flat)?.indexes[0] ?? null;
}

function cellsOf(hint: HintPayload): number[] {
  const found: number[] = [];
  const add = (index: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= 81) return;
    if (!found.includes(index)) found.push(index);
  };
  if (Number.isInteger(hint.row) && Number.isInteger(hint.col)) add(hint.row * 9 + hint.col);
  if (hint.cells) for (const index of hint.cells) add(index);
  return found;
}

function digitsToClear(hint: HintPayload): number[] | null {
  if (!hint.clear || hint.clear.length === 0) return null;
  const digits: number[] = [];
  for (const digit of hint.clear) {
    if (!Number.isInteger(digit) || digit < 1 || digit > 9 || digits.includes(digit)) continue;
    digits.push(digit);
  }
  digits.sort((a, b) => a - b);
  return digits.length > 0 ? digits : null;
}
