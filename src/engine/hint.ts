import { lastFreeEvidence, lastPossibleEvidence, lastRemainingEvidence } from "../board-input";
import { scanOrderFromPuzzle } from "./scan-order";
import {
  findHiddenSet,
  findHiddenSingle,
  findLastFreeCell,
  findLastPossibleNumber,
  findLastRemainingCell,
  findObviousSet,
  findObviousSingle,
  TECHNIQUE_LABEL,
  unitCells,
  type AppliedTechnique,
  type ClearSpot,
  type FillSpot,
  type UnitKind,
} from "./techniques";

/**
 * One teaching step from the local scan.
 * Placements carry `value`. Eliminations carry the digits to clear.
 * Neither path reads the solution or openzeloku `nextHint`.
 */
export type HintAction =
  | { kind: "fill"; value: number; evidence: number[]; unit: UnitKind | null }
  | { kind: "clear"; digits: number[]; indexes: number[]; keep: number[]; unit: UnitKind }
  | { kind: "notes" };

export interface StepHint {
  indexes: number[];
  technique: string;
  action: HintAction;
}

const FILL3 = new Set(["last_free_cell", "last_remaining_cell", "last_possible_number"]);
const FILL4 = new Set(["obvious_singles", "hidden_singles"]);
const CLEAR4 = new Set(["obvious_pairs", "obvious_triples", "hidden_pairs", "hidden_triples"]);

const REASONS: Record<string, string> = {
  last_free_cell: "只剩這一格空白",
  last_remaining_cell: "所屬行、列或宮仲有空位，呢個數只可以放喺呢一格",
  last_possible_number: "呢行、列、宮合埋會剩低一個數",
  obvious_singles: "呢一格只剩一個候選",
  obvious_pairs: "兩格一齊只剩兩個候選",
  obvious_triples: "三格合共只剩三個候選",
  hidden_singles: "呢個數字喺呢一區只可以放喺呢一格",
  hidden_pairs: "兩個數字喺呢一區只可以放喺兩格",
  hidden_triples: "三個數字喺呢一區只可以放喺三格",
};

/** Shown when #1–#10 have no usable step. Advanced hints stay out of scope. */
export const HINT_STUCK = "解唔落。";

export const HINT_NOTES =
  "可用〔Notes In Sudoku〕：〔初級招用盡，先加筆記先可以睇下一步〕。撳「填滿候選」寫低每格候選，或者「稍後」。";

export function techniqueTitle(id: string): string {
  if (id === "notes") return "Notes In Sudoku";
  return TECHNIQUE_LABEL[id as AppliedTechnique] ?? id;
}

/** True once any empty cell carries a pencil mark. The notes gate is only for a blank pad. */
export function notesReady(values: readonly number[], notes: readonly number[] | undefined): boolean {
  if (!notes) return false;
  for (let index = 0; index < values.length; index++) {
    if (values[index] !== 0) continue;
    if ((notes[index] ?? 0) !== 0) return true;
  }
  return false;
}

function fillHint(technique: string, spot: FillSpot): StepHint {
  return {
    indexes: [spot.index],
    technique,
    action: {
      kind: "fill",
      value: spot.digit,
      evidence: spot.evidence.filter((index) => index !== spot.index),
      unit: spot.unit,
    },
  };
}

function clearHint(technique: string, spot: ClearSpot): StepHint {
  return {
    indexes: spot.cells.slice(),
    technique,
    action: {
      kind: "clear",
      digits: spot.digits.slice(),
      indexes: spot.clearIndexes.slice(),
      keep: spot.keep.slice(),
      unit: spot.unit,
    },
  };
}

function puzzleOrder(flat: readonly number[], givensFlat?: readonly number[]): readonly number[] {
  const source = givensFlat && givensFlat.length === flat.length ? givensFlat : flat;
  return scanOrderFromPuzzle(source);
}

/**
 * Local hint scan. #1 → #2 → #3, then the Notes gate, then #5 → #10.
 * Does not call openzeloku `nextHint`. #11–#15 are generation thresholds only.
 */
export function findHint(flat: readonly number[], notes?: readonly number[], givensFlat?: readonly number[]): StepHint | null {
  if (flat.length !== 81 || flat.every((value) => value !== 0)) return null;

  const order = puzzleOrder(flat, givensFlat);
  const free = findLastFreeCell(flat, order);
  if (free) return fillHint("last_free_cell", free);
  const remaining = findLastRemainingCell(flat, order);
  if (remaining) return fillHint("last_remaining_cell", remaining);
  const possible = findLastPossibleNumber(flat, order);
  if (possible) return fillHint("last_possible_number", possible);

  if (!notesReady(flat, notes)) {
    return { indexes: [], technique: "notes", action: { kind: "notes" } };
  }

  const masks = notes ?? [];
  const obvious = findObviousSingle(flat, masks, order);
  if (obvious) return fillHint("obvious_singles", obvious);
  const pair = findObviousSet(flat, masks, 2, order);
  if (pair) return clearHint("obvious_pairs", pair);
  const triple = findObviousSet(flat, masks, 3, order);
  if (triple) return clearHint("obvious_triples", triple);
  const hidden = findHiddenSingle(flat, masks, order);
  if (hidden) return fillHint("hidden_singles", hidden);
  const hiddenPair = findHiddenSet(flat, masks, 2, order);
  if (hiddenPair) return clearHint("hidden_pairs", hiddenPair);
  const hiddenTriple = findHiddenSet(flat, masks, 3, order);
  if (hiddenTriple) return clearHint("hidden_triples", hiddenTriple);
  return null;
}

const HOUSE_WORD: Record<UnitKind, string> = {
  row: "行",
  col: "列",
  box: "宮",
};

function reasonFor(hint: StepHint): string {
  if (hint.technique === "last_remaining_cell" && hint.action.kind === "fill" && hint.action.unit) {
    return `呢${HOUSE_WORD[hint.action.unit]}仲有空位，呢個數只可以放喺呢一格`;
  }
  return REASONS[hint.technique] ?? "可以跟呢個技巧睇下一步";
}

/** L1 names the technique and the reason. It does not reveal a digit or a clear-list. */
export function hintLevel1Text(hint: StepHint): string {
  if (hint.technique === "notes") return HINT_NOTES;
  const name = techniqueTitle(hint.technique);
  const reason = reasonFor(hint);
  const where = hint.indexes.length <= 1 ? "這一格" : "呢幾格";
  const body = `${where}可用〔${name}〕：〔${reason}〕。`;
  if (CLEAR4.has(hint.technique)) return body;
  return `${body}再撳提示睇下一步。`;
}

/** Obvious Singles beat 2: the missing digit, without listing peer cells. */
export function hintNakedMissingText(value: number): string {
  return `得 〔${value}〕 未出現喺呢行／列／宮。`;
}

/** Hidden Singles beat 2: the digit is the only place it fits in the inferred house. */
export function hintHiddenSingleText(value: number, kind: UnitKind): string {
  return `得 〔${value}〕 喺呢${HOUSE_WORD[kind]}只得這一格。`;
}

/** #2 beat 2: this digit has one cell left in the named house. */
export function hintLastRemainingText(value: number, kind: UnitKind): string {
  return `〔${value}〕喺呢${HOUSE_WORD[kind]}只剩這一格。`;
}

/** #3 beat 2: row, column, and box together leave one digit. */
export function hintLastPossibleText(value: number): string {
  return `呢行、列、宮合埋只剩〔${value}〕。`;
}

export function fillRevealText(technique: string, digit: number, unit: UnitKind | null): string {
  if (technique === "last_remaining_cell" && unit) return hintLastRemainingText(digit, unit);
  if (technique === "last_possible_number") return hintLastPossibleText(digit);
  return hintBeginnerReveal(digit);
}

/** Status on the press before a #1–#3 write. Same line Obvious Singles shows before filling. */
export function hintBeginnerReveal(digit: number): string {
  return hintLevel2FillText(digit);
}

function bracketDigits(digits: readonly number[]): string {
  return digits.map((digit) => `〔${digit}〕`).join("、");
}

/** L2 for #6/#7/#9/#10: the locked digits and the house. Numbers appear here first. */
export function hintClearLockedText(technique: string, digits: readonly number[], unit: UnitKind): string {
  const house = HOUSE_WORD[unit];
  const [a, b, c] = digits;
  if (technique === "obvious_pairs") return `〔${a}〕同〔${b}〕一定分別落喺呢兩格（標呢〔${house}〕）。`;
  if (technique === "obvious_triples") return `〔${a}〕、〔${b}〕、〔${c}〕一定落喺呢三格（標呢〔${house}〕）。`;
  if (technique === "hidden_pairs") return `〔${a}〕同〔${b}〕喺呢〔${house}〕只得呢兩格。`;
  return `〔${a}〕、〔${b}〕、〔${c}〕喺呢〔${house}〕只得呢三格。`;
}

/** L3 for an elimination: what to clear or keep. Each digit sits in its own brackets. */
export function hintClearReveal(technique: string, digits: readonly number[], keep: readonly number[]): string {
  if (technique === "hidden_pairs") return `呢兩格刪走其他候選只留 ${bracketDigits(keep)}。`;
  if (technique === "hidden_triples") return `呢三格刪走其他候選只留 ${bracketDigits(keep)}。`;
  return `同單位其他格刪走 ${bracketDigits(digits)}。`;
}

export type HintStepIndex = 0 | 1 | 2 | 3 | 4;

/** Button label for the current hint step. */
export function hintButtonLabel(step: number, technique: string | null): string {
  if (technique === "notes") return step >= 1 ? "填滿候選" : "提示";
  if (technique && FILL3.has(technique)) {
    if (step >= 2) return "填入";
    if (step === 1) return "再提示";
    return "提示";
  }
  if (technique && FILL4.has(technique)) {
    if (step <= 1) return "提示";
    if (step >= 3) return "填入";
    return "再提示";
  }
  if (technique && CLEAR4.has(technique)) {
    if (step <= 1) return "提示";
    if (step === 2) return "再提示";
    return "清候選";
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
  /** Set when a fill technique's last press writes. The view is already cleared. */
  write: { index: number; digit: number } | null;
  /** Set when a 「否」 technique's last press clears notes. No digit is written. */
  clearNotes: { indexes: number[]; digits: number[] } | null;
  /** Set when the Notes gate's main button fills every legal candidate. */
  fillCandidates: boolean;
}

export function emptyHintView(note: string | null = null): HintView {
  return { step: 0, indexes: [], technique: null, action: null, note };
}

function idle(view: HintView): HintPress {
  return { view, write: null, clearNotes: null, fillCandidates: false };
}

function stuck(): HintPress {
  return idle(emptyHintView(HINT_STUCK));
}

/**
 * One press of the hint control.
 * #1–#3 write on the third press. #5 and #8 keep the four-press fill.
 * #6/#7/#9/#10 clear notes on the fourth press. Notes fills candidates, never a digit.
 */
export function pressHint(
  view: HintView,
  values: readonly number[],
  notes?: readonly number[],
  givensFlat?: readonly number[],
): HintPress {
  const order = puzzleOrder(values, givensFlat);
  if (view.technique === "notes" && view.step >= 1) {
    return { view: emptyHintView(null), write: null, clearNotes: null, fillCandidates: true };
  }
  if (view.technique && FILL3.has(view.technique) && view.action?.kind === "fill" && view.step >= 1) {
    return pressFill3(view, values, view.action.value, order);
  }
  if (view.technique === "obvious_singles" && view.action?.kind === "fill" && view.step >= 1) {
    return pressObviousSingle(view, view.action);
  }
  if (view.technique === "hidden_singles" && view.action?.kind === "fill" && view.step >= 1) {
    return pressHiddenSingle(view, view.action);
  }
  if (view.technique && CLEAR4.has(view.technique) && view.action?.kind === "clear" && view.step >= 1) {
    return pressClear4(view, view.action);
  }
  if (view.step >= 1) return idle(view);

  const hint = findHint(values, notes, givensFlat);
  if (!hint) return stuck();
  return idle({
    step: 1,
    indexes: hint.indexes.slice(),
    technique: hint.technique,
    action: hint.action,
    note: hintLevel1Text(hint),
  });
}

function beginnerEvidence(
  technique: string,
  values: readonly number[],
  target: number,
  digit: number,
  fallback: readonly number[],
  order: readonly number[],
): number[] {
  if (technique === "last_free_cell") {
    const found = lastFreeEvidence(values, target, order);
    if (found.length > 0) return found;
  } else if (technique === "last_remaining_cell") {
    const found = lastRemainingEvidence(values, target, digit, order);
    if (found.length > 0) return found;
  } else if (technique === "last_possible_number") {
    const found = lastPossibleEvidence(values, target, order);
    if (found.length > 0) return found;
  }
  return fallback.filter((index) => index !== target);
}

function pressFill3(view: HintView, values: readonly number[], digit: number, order: readonly number[]): HintPress {
  const target = view.indexes[0];
  if (target === undefined || view.action?.kind !== "fill") return stuck();
  if (view.step >= 2) {
    return { view: emptyHintView(null), write: { index: target, digit }, clearNotes: null, fillCandidates: false };
  }
  const evidence = beginnerEvidence(view.technique ?? "", values, target, digit, view.action.evidence, order);
  const indexes = [target];
  if (view.technique === "last_remaining_cell" && view.action.unit) {
    for (const cell of unitCells(target, view.action.unit)) {
      if (!indexes.includes(cell)) indexes.push(cell);
    }
  }
  for (const cell of evidence) if (cell !== target && !indexes.includes(cell)) indexes.push(cell);
  return idle({
    step: 2,
    indexes,
    technique: view.technique,
    action: view.action,
    note: fillRevealText(view.technique ?? "", digit, view.action.unit),
  });
}

function pressObviousSingle(view: HintView, action: Extract<HintAction, { kind: "fill" }>): HintPress {
  const target = view.indexes[0];
  if (target === undefined) return stuck();
  if (view.step >= 3) {
    return { view: emptyHintView(null), write: { index: target, digit: action.value }, clearNotes: null, fillCandidates: false };
  }
  const next = (view.step + 1) as 2 | 3;
  if (next === 2) {
    const indexes = [target];
    for (const cell of action.evidence) if (cell !== target && !indexes.includes(cell)) indexes.push(cell);
    return idle({
      step: 2,
      indexes,
      technique: "obvious_singles",
      action,
      note: hintNakedMissingText(action.value),
    });
  }
  return idle({
    step: 3,
    indexes: [target],
    technique: "obvious_singles",
    action,
    note: hintLevel2FillText(action.value),
  });
}

function pressHiddenSingle(view: HintView, action: Extract<HintAction, { kind: "fill" }>): HintPress {
  const target = view.indexes[0];
  if (target === undefined) return stuck();
  if (view.step >= 3) {
    return { view: emptyHintView(null), write: { index: target, digit: action.value }, clearNotes: null, fillCandidates: false };
  }
  const next = (view.step + 1) as 2 | 3;
  if (next === 2) {
    const indexes = [target];
    for (const cell of action.evidence) if (!indexes.includes(cell)) indexes.push(cell);
    const kind = action.unit ?? "row";
    return idle({
      step: 2,
      indexes,
      technique: "hidden_singles",
      action,
      note: hintHiddenSingleText(action.value, kind),
    });
  }
  return idle({
    step: 3,
    indexes: [target],
    technique: "hidden_singles",
    action,
    note: hintLevel2FillText(action.value),
  });
}

function patternCells(technique: string | null, indexes: readonly number[]): number[] {
  const group = technique ? GROUP_SIZE[technique] : undefined;
  if (!group) return indexes.slice();
  return indexes.slice(0, group);
}

function withExtra(pattern: readonly number[], extra: readonly number[]): number[] {
  const indexes = pattern.slice();
  for (const cell of extra) if (!indexes.includes(cell)) indexes.push(cell);
  return indexes;
}

/** L2 paints the whole house. Pattern cells stay at the front so classes can find them. */
function houseViewIndexes(pattern: readonly number[], unit: UnitKind): number[] {
  const anchor = pattern[0];
  if (anchor === undefined) return pattern.slice();
  return withExtra(pattern, unitCells(anchor, unit));
}

function pressClear4(view: HintView, action: Extract<HintAction, { kind: "clear" }>): HintPress {
  if (view.step >= 3) {
    return {
      view: emptyHintView(null),
      write: null,
      clearNotes: { indexes: action.indexes.slice(), digits: action.digits.slice() },
      fillCandidates: false,
    };
  }
  const pattern = patternCells(view.technique, view.indexes);
  if (view.step === 1) {
    return idle({
      step: 2,
      indexes: houseViewIndexes(pattern, action.unit),
      technique: view.technique,
      action,
      note: hintClearLockedText(view.technique ?? "", action.keep, action.unit),
    });
  }
  return idle({
    step: 3,
    indexes: withExtra(pattern, action.indexes),
    technique: view.technique,
    action,
    note: hintClearReveal(view.technique ?? "", action.digits, action.keep),
  });
}

const GROUP_SIZE: Record<string, number> = {
  obvious_pairs: 2,
  hidden_pairs: 2,
  obvious_triples: 3,
  hidden_triples: 3,
};

const HIDDEN_CLEAR = new Set(["hidden_pairs", "hidden_triples"]);

/**
 * Classes for one cell in the current hint.
 * Hidden Singles beat 2 paints the whole house. Beginner and obvious-single
 * beat 2 mark evidence beside the target.
 * #6/#7/#9/#10 L2 paints the house and the pattern. L3 keeps the pattern and
 * marks the cells whose notes will be cleared. Filled cells never get evidence.
 */
export function hintCellClasses(
  technique: string | null,
  step: number,
  indexes: readonly number[],
  index: number,
  value: number,
): string[] {
  if (step < 1 || !indexes.includes(index)) return [];
  if (technique === "last_remaining_cell" && step === 2) {
    const at = indexes.indexOf(index);
    if (at < 0) return [];
    if (at === 0) return ["hint-house", "hint"];
    if (at < 9) return ["hint-house"];
    return ["hint-evidence"];
  }
  if (technique === "hidden_singles" && step === 2) {
    const classes = ["hint-house"];
    if (index === indexes[0]) classes.push("hint");
    else if (value === 0) classes.push("hint-evidence");
    return classes;
  }
  const group = technique ? GROUP_SIZE[technique] : undefined;
  if (group && (step === 2 || step === 3)) {
    const position = indexes.indexOf(index);
    if (position < 0) return [];
    const isPattern = position < group;
    if (step === 2) return isPattern ? ["hint-house", "hint"] : ["hint-house"];
    const hidden = technique !== null && HIDDEN_CLEAR.has(technique);
    const isClear = hidden ? isPattern : !isPattern;
    const classes: string[] = [];
    if (isPattern) classes.push("hint-house", "hint");
    if (isClear && value === 0) classes.push("hint-evidence");
    return classes;
  }
  const reveal =
    step === 2 &&
    index !== indexes[0] &&
    (technique === "last_free_cell" ||
      technique === "last_remaining_cell" ||
      technique === "last_possible_number" ||
      technique === "obvious_singles");
  if (reveal) return ["hint-evidence"];
  return ["hint"];
}

/** L3 / fill line for a placement technique. */
export function hintLevel2FillText(value: number): string {
  return `填入 〔${value}〕。`;
}

/** L2 for an elimination: the candidate list from that step. */
export function hintLevel2NotesText(digits: readonly number[]): string {
  return `清／改呢啲候選：〔${digits.join("、")}〕。`;
}

export function hintLevel2Text(action: HintAction): string {
  if (action.kind === "notes") return HINT_NOTES;
  if (action.kind === "clear") return hintClearReveal("obvious_pairs", action.digits, action.keep);
  return hintLevel2FillText(action.value);
}

/** @deprecated Use findHint. Kept so older imports still compile. */
export function nextSingleCell(flat: readonly number[]): number | null {
  return findHint(flat)?.indexes[0] ?? null;
}
