import { nextHint, type TechniqueName } from "openzeloku";
import { evidencePeers } from "../board-input";
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
  x_wing: "X-Wing",
  swordfish: "Swordfish",
  guess: "Guess",
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
  const where = hint.technique === "naked_single" || hint.indexes.length <= 1 ? "這一格" : "呢幾格";
  const next =
    hint.technique === "naked_single" ? "再撳提示睇下一步。" : "再撳提示睇要填咩／改筆記。";
  return `${where}可用〔${name}〕：〔${reason}〕。${next}`;
}

/** Naked Single beat 2: the missing digit, without listing peer cells. */
export function hintNakedMissingText(value: number): string {
  return `得 〔${value}〕 未出現喺呢行／列／宮。`;
}

export type HintStepIndex = 0 | 1 | 2 | 3 | 4;

/** Button label for the current hint step. Naked Single stays on 「提示」 through step 1 and ends on 「填入」. */
export function hintButtonLabel(step: number, technique: string | null): string {
  if (technique === "naked_single") {
    if (step <= 1) return "提示";
    if (step >= 4) return "填入";
    return "再提示";
  }
  return step >= 1 ? "再提示" : "提示";
}

export interface HintView {
  step: HintStepIndex;
  indexes: number[];
  technique: string | null;
  action: HintAction | null;
  note: string | null;
}

export interface HintPress {
  view: HintView;
  /** Set only when the player presses 「填入」 on a Naked Single. The view is already cleared. */
  write: { index: number; digit: number } | null;
}

export function emptyHintView(note: string | null = null): HintView {
  return { step: 0, indexes: [], technique: null, action: null, note };
}

/**
 * One press of the hint control.
 * Other techniques stop at step 2. Naked Single walks four visible beats;
 * the press while the button reads 「填入」 (step 4) is the one that writes.
 */
export function pressHint(view: HintView, values: readonly number[]): HintPress {
  if (view.technique === "naked_single" && view.action?.kind === "fill" && view.step >= 1) {
    return pressNakedSingle(view, values, view.action.value);
  }
  if (view.step === 1 && view.action) {
    return { view: { ...view, step: 2, note: hintLevel2Text(view.action) }, write: null };
  }
  if (view.step >= 2) return { view, write: null };

  const hint = findHint(values);
  if (!hint) return { view: emptyHintView(HINT_STUCK), write: null };
  if (hint.technique === "naked_single" && hint.action.kind === "fill") {
    const beat = nakedSingleBeat(1, hint.indexes[0], hint.action.value, []);
    return {
      view: {
        step: 1,
        indexes: beat.indexes,
        technique: hint.technique,
        action: hint.action,
        note: beat.note,
      },
      write: null,
    };
  }
  return {
    view: {
      step: 1,
      indexes: hint.indexes.slice(),
      technique: hint.technique,
      action: hint.action,
      note: hintLevel1Text(hint),
    },
    write: null,
  };
}

interface NakedBeat {
  step: 1 | 2 | 3 | 4;
  indexes: number[];
  note: string;
}

function nakedSingleBeat(step: 1 | 2 | 3 | 4, target: number, digit: number, evidence: readonly number[]): NakedBeat {
  if (step === 1) {
    return {
      step,
      indexes: [target],
      note: hintLevel1Text({ indexes: [target], technique: "naked_single", action: { kind: "fill", value: digit } }),
    };
  }
  if (step === 2) {
    const indexes = [target];
    for (const peer of evidence) if (peer !== target && !indexes.includes(peer)) indexes.push(peer);
    return { step, indexes, note: hintNakedMissingText(digit) };
  }
  return { step, indexes: [target], note: hintLevel2FillText(digit) };
}

function pressNakedSingle(view: HintView, values: readonly number[], digit: number): HintPress {
  const target = view.indexes[0];
  if (target === undefined) return { view: emptyHintView(HINT_STUCK), write: null };
  if (view.step >= 4) {
    return { view: emptyHintView(null), write: { index: target, digit } };
  }
  const next = (view.step + 1) as 2 | 3 | 4;
  const beat = nakedSingleBeat(next, target, digit, evidencePeers(values, target, digit));
  return {
    view: {
      step: beat.step,
      indexes: beat.indexes,
      technique: "naked_single",
      action: view.action,
      note: beat.note,
    },
    write: null,
  };
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
