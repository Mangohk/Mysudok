import type { UndoStep } from "./board-input";
import type { Difficulty, Puzzle } from "./engine/generate";
import type { HintAction, HintStepIndex } from "./engine/hint";

/** Single in-progress slot. Distinct from the beginner-quota streak key. */
export const IN_PROGRESS_KEY = "mysudok.inProgress";
export const IN_PROGRESS_VERSION = 1;
export const IN_PROGRESS_DEBOUNCE_MS = 200;

const CELL_COUNT = 81;
const NOTE_MASK_MAX = (1 << 10) - 1;
const MAX_UNDO = 5000;
const MAX_TEXT = 2000;

export interface GameSnapshot {
  difficulty: Difficulty;
  bankId: string | null;
  puzzle: Puzzle;
  values: number[];
  notes: number[];
  clues: number[];
  givens: boolean[];
  solution: number[];
  undo: UndoStep[];
  selectedDigit: number | null;
  selectedCell: number | null;
  pencilMode: boolean;
  hintStep: HintStepIndex;
  hintIndexes: number[];
  hintTechnique: string | null;
  hintAction: HintAction | null;
  hintNote: string | null;
  candidateNote: string | null;
  checkNote: string | null;
  wrongMarks: number[] | null;
}

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ProgressClock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultClock: ProgressClock = {
  setTimeout(fn, ms) {
    return setTimeout(fn, ms);
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function has(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function parseGrid(value: unknown, min: number, max: number): number[][] | null {
  if (!Array.isArray(value) || value.length !== 9) return null;
  const rows: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 9) return null;
    const cells: number[] = [];
    for (const cell of row) {
      if (!isInt(cell) || cell < min || cell > max) return null;
      cells.push(cell);
    }
    rows.push(cells);
  }
  return rows;
}

function parseFlat(value: unknown, min: number, max: number): number[] | null {
  if (!Array.isArray(value) || value.length !== CELL_COUNT) return null;
  const cells: number[] = [];
  for (const cell of value) {
    if (!isInt(cell) || cell < min || cell > max) return null;
    cells.push(cell);
  }
  return cells;
}

function parseIndexes(value: unknown, maxLength: number): number[] | null {
  if (!Array.isArray(value) || value.length > maxLength) return null;
  const indexes: number[] = [];
  for (const index of value) {
    if (!isInt(index) || index < 0 || index >= CELL_COUNT) return null;
    indexes.push(index);
  }
  return indexes;
}

function parseDigits(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > 9) return null;
  const digits: number[] = [];
  for (const digit of value) {
    if (!isInt(digit) || digit < 1 || digit > 9) return null;
    digits.push(digit);
  }
  return digits;
}

function parseUnit(value: unknown): "row" | "col" | "box" | null | undefined {
  if (value === null) return null;
  if (value === "row" || value === "col" || value === "box") return value;
  return undefined;
}

function parseHintAction(value: unknown): HintAction | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (value.kind === "notes") return { kind: "notes" };
  if (value.kind === "fill") {
    if (!isInt(value.value) || value.value < 1 || value.value > 9) return undefined;
    const evidence = parseIndexes(value.evidence, CELL_COUNT);
    const unit = parseUnit(value.unit);
    if (!evidence || unit === undefined) return undefined;
    return { kind: "fill", value: value.value, evidence, unit };
  }
  if (value.kind === "clear") {
    const digits = parseDigits(value.digits);
    const indexes = parseIndexes(value.indexes, CELL_COUNT);
    const keep = parseDigits(value.keep);
    const unit = parseUnit(value.unit);
    if (!digits || !indexes || !keep || unit === undefined || unit === null) return undefined;
    return { kind: "clear", digits, indexes, keep, unit };
  }
  return undefined;
}

function parseText(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > MAX_TEXT) return undefined;
  return value;
}

function parseUndo(value: unknown): UndoStep[] | null {
  if (!Array.isArray(value) || value.length > MAX_UNDO) return null;
  const steps: UndoStep[] = [];
  for (const step of value) {
    if (!isRecord(step) || !Array.isArray(step.cells) || step.cells.length > CELL_COUNT) return null;
    const cells: UndoStep["cells"] = [];
    for (const cell of step.cells) {
      if (!isRecord(cell)) return null;
      if (!isInt(cell.index) || cell.index < 0 || cell.index >= CELL_COUNT) return null;
      if (!isInt(cell.value) || cell.value < 0 || cell.value > 9) return null;
      if (!isInt(cell.notes) || cell.notes < 0 || cell.notes > NOTE_MASK_MAX) return null;
      cells.push({ index: cell.index, value: cell.value, notes: cell.notes });
    }
    steps.push({ cells });
  }
  return steps;
}

function parsePayload(value: unknown): GameSnapshot | null {
  if (!isRecord(value)) return null;
  const required = [
    "difficulty",
    "bankId",
    "puzzle",
    "values",
    "notes",
    "clues",
    "givens",
    "solution",
    "undo",
    "selectedDigit",
    "selectedCell",
    "pencilMode",
    "hintStep",
    "hintIndexes",
    "hintTechnique",
    "hintAction",
    "hintNote",
    "candidateNote",
    "checkNote",
    "wrongMarks",
  ] as const;
  for (const key of required) {
    if (!has(value, key)) return null;
  }

  const difficulty = value.difficulty;
  if (difficulty !== "初級" && difficulty !== "中級" && difficulty !== "高級" && difficulty !== "專家") return null;

  let bankId: string | null;
  if (value.bankId === null) bankId = null;
  else if (typeof value.bankId === "string" && value.bankId.length > 0 && value.bankId.length <= 200) bankId = value.bankId;
  else return null;

  if (!isRecord(value.puzzle)) return null;
  const givensGrid = parseGrid(value.puzzle.givens, 0, 9);
  const solutionGrid = parseGrid(value.puzzle.solution, 1, 9);
  const maxTechnique = value.puzzle.maxTechnique;
  if (!givensGrid || !solutionGrid) return null;
  if (typeof maxTechnique !== "string" || maxTechnique.length === 0 || maxTechnique.length > 80) return null;
  if (value.puzzle.unique !== true) return null;

  const values = parseFlat(value.values, 0, 9);
  const notes = parseFlat(value.notes, 0, NOTE_MASK_MAX);
  const clues = parseFlat(value.clues, 0, 9);
  const solution = parseFlat(value.solution, 1, 9);
  if (!values || !notes || !clues || !solution) return null;
  if (!Array.isArray(value.givens) || value.givens.length !== CELL_COUNT) return null;
  const givens: boolean[] = [];
  for (const flag of value.givens) {
    if (typeof flag !== "boolean") return null;
    givens.push(flag);
  }

  if (!sameNumbers(clues, givensGrid.flat())) return null;
  if (!sameNumbers(solution, solutionGrid.flat())) return null;
  for (let index = 0; index < CELL_COUNT; index++) {
    if (givens[index] !== (clues[index] !== 0)) return null;
    if (givens[index] && values[index] !== clues[index]) return null;
    if (clues[index] !== 0 && clues[index] !== solution[index]) return null;
  }
  if (sameNumbers(values, solution)) return null;

  const undo = parseUndo(value.undo);
  if (!undo) return null;

  let selectedDigit: number | null;
  if (value.selectedDigit === null) selectedDigit = null;
  else if (isInt(value.selectedDigit) && value.selectedDigit >= 1 && value.selectedDigit <= 9) selectedDigit = value.selectedDigit;
  else return null;

  let selectedCell: number | null;
  if (value.selectedCell === null) selectedCell = null;
  else if (isInt(value.selectedCell) && value.selectedCell >= 0 && value.selectedCell < CELL_COUNT) {
    selectedCell = value.selectedCell;
  } else return null;

  if (typeof value.pencilMode !== "boolean") return null;

  const hintStep = value.hintStep;
  if (hintStep !== 0 && hintStep !== 1 && hintStep !== 2 && hintStep !== 3 && hintStep !== 4) return null;
  const hintIndexes = parseIndexes(value.hintIndexes, CELL_COUNT * 2);
  if (!hintIndexes) return null;
  let hintTechnique: string | null;
  if (value.hintTechnique === null) hintTechnique = null;
  else if (typeof value.hintTechnique === "string" && value.hintTechnique.length > 0 && value.hintTechnique.length <= 80) {
    hintTechnique = value.hintTechnique;
  } else return null;
  const hintAction = parseHintAction(value.hintAction);
  if (hintAction === undefined) return null;
  const hintNote = parseText(value.hintNote);
  const candidateNote = parseText(value.candidateNote);
  const checkNote = parseText(value.checkNote);
  if (hintNote === undefined || candidateNote === undefined || checkNote === undefined) return null;

  let wrongMarks: number[] | null;
  if (value.wrongMarks === null) wrongMarks = null;
  else {
    const marks = parseIndexes(value.wrongMarks, CELL_COUNT);
    if (!marks) return null;
    wrongMarks = marks;
  }

  const puzzle: Puzzle = {
    givens: givensGrid,
    solution: solutionGrid,
    maxTechnique,
    unique: true,
  };
  return {
    difficulty,
    bankId,
    puzzle,
    values,
    notes,
    clues,
    givens,
    solution,
    undo,
    selectedDigit,
    selectedCell,
    pencilMode: value.pencilMode,
    hintStep,
    hintIndexes,
    hintTechnique,
    hintAction,
    hintNote,
    candidateNote,
    checkNote,
    wrongMarks,
  };
}

/** `null` means the text is not a restorable in-progress game. */
export function parseInProgress(raw: string): GameSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== IN_PROGRESS_VERSION) return null;
    return parsePayload(parsed.payload);
  } catch {
    return null;
  }
}

/** Read the single slot. A bad or finished payload is removed. */
export function readInProgress(storage: ProgressStorage): GameSnapshot | null {
  let raw: string | null;
  try {
    raw = storage.getItem(IN_PROGRESS_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  const snapshot = parseInProgress(raw);
  if (!snapshot) {
    try {
      storage.removeItem(IN_PROGRESS_KEY);
    } catch {
      /* ignore a storage that rejects the cleanup */
    }
    return null;
  }
  return snapshot;
}

export function writeInProgress(storage: ProgressStorage, snapshot: GameSnapshot): void {
  try {
    storage.setItem(IN_PROGRESS_KEY, JSON.stringify({ version: IN_PROGRESS_VERSION, payload: snapshot }));
  } catch {
    /* quota, private mode, or a thrown driver */
  }
}

export function clearInProgress(storage: ProgressStorage): void {
  try {
    storage.removeItem(IN_PROGRESS_KEY);
  } catch {
    /* ignore */
  }
}

/** Debounced writer. `flush` stores the pending snapshot immediately. `clear` drops it. */
export function createProgressWriter(
  getStorage: () => ProgressStorage | null,
  delayMs: number,
  clock: ProgressClock = defaultClock,
) {
  let timer: unknown = null;
  let pending: GameSnapshot | null = null;
  const currentStorage = (): ProgressStorage | null => {
    try {
      return getStorage();
    } catch {
      return null;
    }
  };
  const cancel = () => {
    if (timer === null) return;
    clock.clearTimeout(timer);
    timer = null;
  };
  return {
    save(snapshot: GameSnapshot) {
      if (!currentStorage()) return;
      pending = snapshot;
      cancel();
      timer = clock.setTimeout(() => {
        timer = null;
        const next = pending;
        pending = null;
        const storage = currentStorage();
        if (storage && next) writeInProgress(storage, next);
      }, delayMs);
    },
    clear() {
      pending = null;
      cancel();
      const storage = currentStorage();
      if (storage) clearInProgress(storage);
    },
    flush() {
      const next = pending;
      pending = null;
      cancel();
      const storage = currentStorage();
      if (storage && next) writeInProgress(storage, next);
    },
  };
}
