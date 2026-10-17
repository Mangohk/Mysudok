import { nextHint, type TechniqueName } from "openzeloku";
import { TECHNIQUE_LABEL, type AppliedTechnique } from "./techniques";

/**
 * A single-cell hint from openzeloku `nextHint`.
 * `value` is the library's candidate, never a lookup into the solution grid.
 */
export interface SingleHint {
  index: number;
  technique: "naked_single" | "hidden_single";
  value: number;
}

const SINGLE_REASONS: Record<SingleHint["technique"], string> = {
  naked_single: "呢一格只剩一個候選",
  hidden_single: "呢個數字喺呢一區只可以放喺呢一格",
};

export const HINT_UNAVAILABLE = "暫時未有可用唯一候選格。";

export function techniqueTitle(id: string): string {
  return TECHNIQUE_LABEL[id as AppliedTechnique] ?? id;
}

export function findSingleHint(flat: readonly number[]): SingleHint | null {
  const hint = nextHint(flat.slice(), 9);
  if (!hint) return null;
  if (!isSingleTechnique(hint.technique)) return null;
  return { index: hint.row * 9 + hint.col, technique: hint.technique, value: hint.value };
}

export function isSingleTechnique(id: TechniqueName | string): id is SingleHint["technique"] {
  return id === "naked_single" || id === "hidden_single";
}

/** L1: name the technique. Do not include the digit. */
export function hintLevel1Text(hint: SingleHint): string {
  const name = techniqueTitle(hint.technique);
  const reason = SINGLE_REASONS[hint.technique];
  return `這一格可用〔${name}〕：〔${reason}〕。再撳提示睇要填咩／改筆記。`;
}

/** L2 for a single: reveal the digit `nextHint` already returned. */
export function hintLevel2FillText(value: number): string {
  return `填入 〔${value}〕。`;
}

/** L2 when the hint is note advice rather than a placement. */
export function hintLevel2NotesText(digits: readonly number[]): string {
  const list = digits.join("、");
  return `清／改呢啲候選：〔${list}〕。`;
}

/** @deprecated Use findSingleHint. Kept so older imports still compile. */
export function nextSingleCell(flat: readonly number[]): number | null {
  return findSingleHint(flat)?.index ?? null;
}
