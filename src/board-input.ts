/** Digit-first board edits. Givens are never written and never undo entries. */

import {
  findLastFreeCell,
  findLastPossibleNumber,
  findLastRemainingCell,
  peersOf,
} from "./engine/techniques";

export interface CellSnapshot {
  index: number;
  value: number;
  notes: number;
}

/** One undo restores every cell touched by a single edit, including peer note clears. */
export interface UndoStep {
  cells: CellSnapshot[];
}

export interface BoardInput {
  values: number[];
  notes: number[];
  /** Initial clue grid. 0 = empty. Used by 重開. */
  clues: number[];
  givens: boolean[];
  solution: number[];
  selectedDigit: number | null;
  selectedCell: number | null;
  pencilMode: boolean;
  undo: UndoStep[];
}

export function createBoard(clues: readonly number[], solution: readonly number[]): BoardInput {
  return {
    values: clues.slice(),
    notes: Array(81).fill(0),
    clues: clues.slice(),
    givens: clues.map((value) => value !== 0),
    solution: solution.slice(),
    selectedDigit: null,
    selectedCell: null,
    pencilMode: false,
    undo: [],
  };
}

export function restartBoard(board: BoardInput): void {
  board.values = board.clues.slice();
  board.notes = Array(81).fill(0);
  board.undo = [];
  board.selectedDigit = null;
  board.selectedCell = null;
  board.pencilMode = false;
}

export function conflictMask(values: readonly number[]): boolean[] {
  const bad = Array<boolean>(81).fill(false);
  const mark = (cells: number[]) => {
    const where = new Map<number, number[]>();
    for (const index of cells) {
      const value = values[index];
      if (!value) continue;
      const list = where.get(value);
      if (list) list.push(index);
      else where.set(value, [index]);
    }
    for (const list of where.values()) {
      if (list.length < 2) continue;
      for (const index of list) bad[index] = true;
    }
  };
  for (let row = 0; row < 9; row++) mark(Array.from({ length: 9 }, (_, col) => row * 9 + col));
  for (let col = 0; col < 9; col++) mark(Array.from({ length: 9 }, (_, row) => row * 9 + col));
  for (let box = 0; box < 9; box++) {
    const row0 = Math.floor(box / 3) * 3;
    const col0 = (box % 3) * 3;
    const cells: number[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) cells.push((row0 + row) * 9 + (col0 + col));
    }
    mark(cells);
  }
  return bad;
}

export function digitCount(values: readonly number[], digit: number): number {
  let count = 0;
  for (const value of values) if (value === digit) count++;
  return count;
}

/** 9 − how many times this digit is filled (givens + player fills). Notes are ignored. */
export function remainingCount(values: readonly number[], digit: number): number {
  return 9 - digitCount(values, digit);
}

/**
 * True when this digit is filled in all 9 solution cells and none of those
 * filled cells are in a row/column/box conflict. A full count of 9 with a
 * duplicate still returns false.
 */
export function isDigitDone(board: BoardInput, digit: number): boolean {
  const conflicts = conflictMask(board.values);
  let correct = 0;
  let conflict = false;
  for (let index = 0; index < 81; index++) {
    if (board.solution[index] === digit && board.values[index] === digit) correct++;
    if (board.values[index] === digit && conflicts[index]) conflict = true;
  }
  return correct === 9 && !conflict;
}

export function armDigit(board: BoardInput, digit: number): void {
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) return;
  if (isDigitDone(board, digit)) {
    if (board.selectedDigit === digit) board.selectedDigit = null;
    return;
  }
  board.selectedDigit = board.selectedDigit === digit ? null : digit;
  board.selectedCell = null;
}

function snapshot(board: BoardInput, index: number): CellSnapshot {
  return { index, value: board.values[index] ?? 0, notes: board.notes[index] ?? 0 };
}

function pushUndo(board: BoardInput, cells: CellSnapshot[]): void {
  if (cells.length === 0) return;
  board.undo.push({ cells });
  if (board.undo.length > 200) board.undo.shift();
}

function pushCell(board: BoardInput, index: number): void {
  if (board.givens[index]) return;
  pushUndo(board, [snapshot(board, index)]);
}

/**
 * Filled cells in the same row, column, or box whose value is not `digit`.
 * Empty cells and pencil notes are ignored. Givens and player fills both count.
 */
export function evidencePeers(values: readonly number[], index: number, digit: number): number[] {
  if (!Number.isInteger(index) || index < 0 || index >= 81) return [];
  const peers: number[] = [];
  for (const peer of peersOf(index)) {
    const value = values[peer] ?? 0;
    if (value !== 0 && value !== digit) peers.push(peer);
  }
  return peers;
}

export interface HiddenSingleHouse {
  kind: "row" | "col" | "box";
  cells: number[];
}

function rowCells(index: number): number[] {
  const row = Math.floor(index / 9);
  return Array.from({ length: 9 }, (_, col) => row * 9 + col);
}

function colCells(index: number): number[] {
  const col = index % 9;
  return Array.from({ length: 9 }, (_, row) => row * 9 + col);
}

function boxCells(index: number): number[] {
  const row0 = Math.floor(Math.floor(index / 9) / 3) * 3;
  const col0 = Math.floor((index % 9) / 3) * 3;
  const cells: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) cells.push((row0 + row) * 9 + (col0 + col));
  }
  return cells;
}

function cellCanHoldDigit(values: readonly number[], index: number, digit: number): boolean {
  if ((values[index] ?? 0) !== 0) return false;
  return (legalCandidateMask(values, index) & (1 << digit)) !== 0;
}

/**
 * First unit where `digit` fits only in `target` among that unit's empty cells.
 * Scan order is the target's row, then its column, then its box.
 */
export function hiddenSingleHouse(
  values: readonly number[],
  target: number,
  digit: number,
): HiddenSingleHouse | null {
  if (!Number.isInteger(target) || target < 0 || target >= 81) return null;
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) return null;
  if (!cellCanHoldDigit(values, target, digit)) return null;
  const units: HiddenSingleHouse[] = [
    { kind: "row", cells: rowCells(target) },
    { kind: "col", cells: colCells(target) },
    { kind: "box", cells: boxCells(target) },
  ];
  for (const unit of units) {
    const holders = unit.cells.filter((index) => cellCanHoldDigit(values, index, digit));
    if (holders.length === 1 && holders[0] === target) return unit;
  }
  return null;
}

/**
 * Filled cells of the unit that makes `target` a Last Free Cell.
 * Empty when `target` is not that cell.
 */
export function lastFreeEvidence(values: readonly number[], target: number): number[] {
  const hit = findLastFreeCell(values);
  if (!hit || hit.index !== target) return [];
  return hit.evidence;
}

/**
 * Cells that already show `digit` and explain a Last Remaining Cell.
 * Empty when this target/digit is not the current hit.
 */
export function lastRemainingEvidence(values: readonly number[], target: number, digit: number): number[] {
  const hit = findLastRemainingCell(values);
  if (!hit || hit.index !== target || hit.digit !== digit) return [];
  return hit.evidence;
}

/** Filled cells in the target's row, column, and box for Last Possible Number. */
export function lastPossibleEvidence(values: readonly number[], target: number): number[] {
  const hit = findLastPossibleNumber(values);
  if (!hit || hit.index !== target) return [];
  return hit.evidence;
}

/**
 * Clear `digits` from pencil notes on `indexes`. One undo step. Does not write a value.
 * Returns false when nothing on the board changes.
 */
export function clearCandidateDigits(
  board: BoardInput,
  indexes: readonly number[],
  digits: readonly number[],
): boolean {
  let bit = 0;
  for (const digit of digits) {
    if (digit >= 1 && digit <= 9) bit |= 1 << digit;
  }
  if (bit === 0) return false;
  const cells: CellSnapshot[] = [];
  const seen = new Set<number>();
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0 || index >= 81 || seen.has(index)) continue;
    seen.add(index);
    if (board.givens[index] || (board.values[index] ?? 0) !== 0) continue;
    if (((board.notes[index] ?? 0) & bit) === 0) continue;
    cells.push(snapshot(board, index));
  }
  if (cells.length === 0) return false;
  pushUndo(board, cells);
  for (const cell of cells) board.notes[cell.index] &= ~bit;
  return true;
}

/** Drop `digit` from pencil notes in the same row, column, and box. */
function clearPeerNotes(board: BoardInput, index: number, digit: number): void {
  const bit = 1 << digit;
  const peers: CellSnapshot[] = [];
  for (const peer of peersOf(index)) {
    if (board.givens[peer] || board.values[peer] !== 0) continue;
    if ((board.notes[peer] & bit) === 0) continue;
    peers.push(snapshot(board, peer));
  }
  pushUndo(board, [snapshot(board, index), ...peers]);
  board.values[index] = digit;
  board.notes[index] = 0;
  for (const peer of peers) board.notes[peer.index] &= ~bit;
}

/**
 * Write `digit` into an empty cell. Clears that digit from peer notes and
 * pushes one undo step. Pencil mode does not turn this into a note toggle.
 */
export function writeDigit(board: BoardInput, index: number, digit: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= 81) return false;
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) return false;
  if (board.givens[index] || (board.values[index] ?? 0) !== 0) return false;
  clearPeerNotes(board, index, digit);
  board.selectedCell = null;
  if (isDigitDone(board, digit)) board.selectedDigit = null;
  return true;
}

/** Tap a cell while a digit may be armed. Givens are ignored. */
export function tapCell(board: BoardInput, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= 81) return;
  if (board.givens[index]) return;
  const digit = board.selectedDigit;
  if (digit === null || isDigitDone(board, digit)) return;

  if (board.values[index] !== 0) {
    pushCell(board, index);
    board.values[index] = 0;
    board.notes[index] = 0;
    board.selectedCell = null;
    return;
  }

  if (board.pencilMode) {
    const next = board.notes[index] ^ (1 << digit);
    pushCell(board, index);
    board.notes[index] = next;
    board.selectedCell = null;
    return;
  }

  writeDigit(board, index, digit);
}

export function emptyCellCount(board: BoardInput): number {
  let count = 0;
  for (let index = 0; index < board.values.length; index++) {
    if (!board.givens[index] && board.values[index] === 0) count++;
  }
  return count;
}

/** Player fills that disagree with the solution. Givens and empty cells are skipped. */
export function wrongFillIndexes(board: BoardInput): number[] {
  const wrong: number[] = [];
  for (let index = 0; index < board.values.length; index++) {
    if (board.givens[index] || board.values[index] === 0) continue;
    if (board.values[index] !== board.solution[index]) wrong.push(index);
  }
  return wrong;
}

/** Digits not already present in this cell's row, column, or box. Empty cells only. */
export function legalCandidateMask(values: readonly number[], index: number): number {
  if (values[index] !== 0) return 0;
  const used = new Set<number>();
  const row = Math.floor(index / 9);
  const col = index % 9;
  for (let c = 0; c < 9; c++) used.add(values[row * 9 + c] ?? 0);
  for (let r = 0; r < 9; r++) used.add(values[r * 9 + col] ?? 0);
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) used.add(values[(boxRow + r) * 9 + (boxCol + c)] ?? 0);
  }
  used.delete(0);
  let mask = 0;
  for (let digit = 1; digit <= 9; digit++) {
    if (!used.has(digit)) mask |= 1 << digit;
  }
  return mask;
}

export function maskDigits(mask: number): number[] {
  const digits: number[] = [];
  for (let digit = 1; digit <= 9; digit++) if ((mask & (1 << digit)) !== 0) digits.push(digit);
  return digits;
}

/**
 * Replace pencil notes on every empty non-given cell with the legal candidates.
 * Givens and filled cells are left alone. One undo step restores the notes.
 */
export function fillAllCandidates(board: BoardInput): void {
  const cells: CellSnapshot[] = [];
  for (let index = 0; index < board.values.length; index++) {
    if (board.givens[index] || board.values[index] !== 0) continue;
    const next = legalCandidateMask(board.values, index);
    if ((board.notes[index] ?? 0) === next) continue;
    cells.push(snapshot(board, index));
  }
  if (cells.length === 0) return;
  pushUndo(board, cells);
  for (const cell of cells) board.notes[cell.index] = legalCandidateMask(board.values, cell.index);
}

/** True when a digit was written into a cell that was empty. */
export function placedADigit(before: readonly number[], after: readonly number[]): boolean {
  return after.some((value, index) => before[index] === 0 && value !== 0);
}

export function undoCell(board: BoardInput): void {
  const step = board.undo.pop();
  if (!step) return;
  for (const previous of step.cells) {
    if (board.givens[previous.index]) continue;
    board.values[previous.index] = previous.value;
    board.notes[previous.index] = previous.notes;
  }
  board.selectedCell = null;
  if (board.selectedDigit !== null && isDigitDone(board, board.selectedDigit)) {
    board.selectedDigit = null;
  }
}
