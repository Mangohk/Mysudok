/** Digit-first board edits. Givens are never written and never undo entries. */

import { geometryFromLength, geometryOf, type Geometry } from "./engine/geometry";
import {
  boxOf,
  findLastFreeCell,
  findLastPossibleNumber,
  findLastRemainingCell,
  peersOf,
} from "./engine/techniques";

function geoOf(values: readonly number[]): Geometry {
  return geometryFromLength(values.length) ?? geometryOf(9);
}

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
    notes: Array(clues.length).fill(0),
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
  board.notes = Array(board.clues.length).fill(0);
  board.undo = [];
  board.selectedDigit = null;
  board.selectedCell = null;
  board.pencilMode = false;
}

export function conflictMask(values: readonly number[]): boolean[] {
  const g = geoOf(values);
  const bad = Array<boolean>(g.cellCount).fill(false);
  const mark = (cells: readonly number[]) => {
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
  for (const cells of g.rows) mark(cells);
  for (const cells of g.cols) mark(cells);
  for (const cells of g.boxes) mark(cells);
  return bad;
}

export function digitCount(values: readonly number[], digit: number): number {
  let count = 0;
  for (const value of values) if (value === digit) count++;
  return count;
}

/** How many copies of this digit are still missing (givens + player fills). Notes are ignored. */
export function remainingCount(values: readonly number[], digit: number): number {
  return geoOf(values).size - digitCount(values, digit);
}

/**
 * True when this digit is filled in all 9 solution cells and none of those
 * filled cells are in a row/column/box conflict. A full count of 9 with a
 * duplicate still returns false.
 */
export function isDigitDone(board: BoardInput, digit: number): boolean {
  const g = geoOf(board.values);
  const conflicts = conflictMask(board.values);
  let correct = 0;
  let conflict = false;
  for (let index = 0; index < g.cellCount; index++) {
    if (board.solution[index] === digit && board.values[index] === digit) correct++;
    if (board.values[index] === digit && conflicts[index]) conflict = true;
  }
  return correct === g.size && !conflict;
}

export function armDigit(board: BoardInput, digit: number): void {
  const size = geoOf(board.values).size;
  if (!Number.isInteger(digit) || digit < 1 || digit > size) return;
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
  const g = geoOf(values);
  if (!Number.isInteger(index) || index < 0 || index >= g.cellCount) return [];
  const peers: number[] = [];
  for (const peer of peersOf(index, g.size)) {
    const value = values[peer] ?? 0;
    if (value !== 0 && value !== digit) peers.push(peer);
  }
  return peers;
}

export interface HiddenSingleHouse {
  kind: "row" | "col" | "box";
  cells: number[];
}

function rowCells(values: readonly number[], index: number): number[] {
  const g = geoOf(values);
  return [...(g.rows[Math.floor(index / g.size)] ?? [])];
}

function colCells(values: readonly number[], index: number): number[] {
  const g = geoOf(values);
  return [...(g.cols[index % g.size] ?? [])];
}

function boxCells(values: readonly number[], index: number): number[] {
  const g = geoOf(values);
  return [...(g.boxes[boxOf(index, g.size)] ?? [])];
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
  const g = geoOf(values);
  if (!Number.isInteger(target) || target < 0 || target >= g.cellCount) return null;
  if (!Number.isInteger(digit) || digit < 1 || digit > g.size) return null;
  if (!cellCanHoldDigit(values, target, digit)) return null;
  const units: HiddenSingleHouse[] = [
    { kind: "row", cells: rowCells(values, target) },
    { kind: "col", cells: colCells(values, target) },
    { kind: "box", cells: boxCells(values, target) },
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
export function lastFreeEvidence(values: readonly number[], target: number, order?: readonly number[]): number[] {
  const hit = findLastFreeCell(values, order);
  if (!hit || hit.index !== target) return [];
  return hit.evidence;
}

/**
 * Cells that already show `digit` and explain a Last Remaining Cell.
 * Empty when this target/digit is not the current hit.
 */
export function lastRemainingEvidence(
  values: readonly number[],
  target: number,
  digit: number,
  order?: readonly number[],
): number[] {
  const hit = findLastRemainingCell(values, order);
  if (!hit || hit.index !== target || hit.digit !== digit) return [];
  return hit.evidence;
}

/** Filled cells in the target's row, column, and box for Last Possible Number. */
export function lastPossibleEvidence(values: readonly number[], target: number, order?: readonly number[]): number[] {
  const hit = findLastPossibleNumber(values, order);
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
  const g = geoOf(board.values);
  for (const digit of digits) {
    if (digit >= 1 && digit <= g.size) bit |= 1 << digit;
  }
  if (bit === 0) return false;
  const cells: CellSnapshot[] = [];
  const seen = new Set<number>();
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0 || index >= g.cellCount || seen.has(index)) continue;
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
  for (const peer of peersOf(index, geoOf(board.values).size)) {
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
  const g = geoOf(board.values);
  if (!Number.isInteger(index) || index < 0 || index >= g.cellCount) return false;
  if (!Number.isInteger(digit) || digit < 1 || digit > g.size) return false;
  if (board.givens[index] || (board.values[index] ?? 0) !== 0) return false;
  clearPeerNotes(board, index, digit);
  board.selectedCell = null;
  if (isDigitDone(board, digit)) board.selectedDigit = null;
  return true;
}

/** Tap a cell while a digit may be armed. Givens are ignored. */
export function tapCell(board: BoardInput, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= geoOf(board.values).cellCount) return;
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
  const g = geoOf(values);
  if (index < 0 || index >= g.cellCount || values[index] !== 0) return 0;
  const used = new Set<number>();
  const row = Math.floor(index / g.size);
  const col = index % g.size;
  for (const cell of g.rows[row] ?? []) used.add(values[cell] ?? 0);
  for (const cell of g.cols[col] ?? []) used.add(values[cell] ?? 0);
  for (const cell of g.boxes[boxOf(index, g.size)] ?? []) used.add(values[cell] ?? 0);
  used.delete(0);
  let mask = 0;
  for (let digit = 1; digit <= g.size; digit++) {
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
