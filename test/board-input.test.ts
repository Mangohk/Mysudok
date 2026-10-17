import assert from "node:assert/strict";
import test from "node:test";
import {
  armDigit,
  conflictMask,
  createBoard,
  digitCount,
  emptyCellCount,
  fillAllCandidates,
  isDigitDone,
  legalCandidateMask,
  maskDigits,
  placedADigit,
  remainingCount,
  restartBoard,
  tapCell,
  undoCell,
  writeDigit,
  wrongFillIndexes,
} from "../src/board-input.ts";

const SOLUTION = [
  6, 5, 4, 3, 1, 2, 9, 8, 7, 7, 8, 9, 5, 4, 6, 1, 3, 2, 3, 2, 1, 8, 9, 7, 5, 6, 4, 8, 4, 7, 6, 5, 3, 2, 1, 9, 2, 9,
  3, 7, 8, 1, 6, 4, 5, 5, 1, 6, 9, 2, 4, 3, 7, 8, 4, 6, 2, 1, 7, 5, 8, 9, 3, 9, 3, 5, 4, 6, 8, 7, 2, 1, 1, 7, 8, 2,
  3, 9, 4, 5, 6,
];

test("arming a digit does not write, and tapping it again disarms", () => {
  const board = createBoard(SOLUTION.map((value, index) => (index < 20 ? value : 0)), SOLUTION);
  const before = board.values.slice();
  armDigit(board, 4);
  assert.equal(board.selectedDigit, 4);
  assert.deepEqual(board.values, before);
  assert.equal(board.undo.length, 0);
  armDigit(board, 4);
  assert.equal(board.selectedDigit, null);
});

test("digit-first fill keeps the digit armed and clears the cell selection", () => {
  const board = createBoard(SOLUTION.map((value, index) => (index < 20 ? value : 0)), SOLUTION);
  const index = board.values.findIndex((value) => value === 0);
  armDigit(board, SOLUTION[index]);
  tapCell(board, index);
  assert.equal(board.values[index], SOLUTION[index]);
  assert.equal(board.selectedCell, null);
  assert.equal(board.selectedDigit, SOLUTION[index]);
  assert.equal(board.undo.length, 1);
});

test("tapping a filled player cell erases it", () => {
  const board = createBoard(SOLUTION.map((value, index) => (index < 20 ? value : 0)), SOLUTION);
  const index = board.values.findIndex((value) => value === 0);
  armDigit(board, 3);
  tapCell(board, index);
  assert.equal(board.values[index], 3);
  tapCell(board, index);
  assert.equal(board.values[index], 0);
  assert.equal(board.selectedDigit, 3);
  assert.equal(board.selectedCell, null);
});

test("givens are not editable and do not enter the undo stack", () => {
  const board = createBoard(SOLUTION.map((value, index) => (index < 20 ? value : 0)), SOLUTION);
  const given = board.givens.findIndex(Boolean);
  const value = board.values[given];
  armDigit(board, 9);
  tapCell(board, given);
  assert.equal(board.values[given], value);
  assert.equal(board.undo.length, 0);
});

test("pencil mode toggles only the armed digit's note", () => {
  const board = createBoard(SOLUTION.map(() => 0), SOLUTION);
  board.pencilMode = true;
  armDigit(board, 2);
  tapCell(board, 0);
  assert.equal(board.values[0], 0);
  assert.equal(board.notes[0] & (1 << 2), 1 << 2);
  tapCell(board, 0);
  assert.equal(board.notes[0] & (1 << 2), 0);
  assert.equal(board.selectedCell, null);
});

test("undo restores one cell and does not touch another", () => {
  const board = createBoard(SOLUTION.map(() => 0), SOLUTION);
  armDigit(board, 8);
  tapCell(board, 10);
  tapCell(board, 11);
  assert.equal(board.values[10], 8);
  assert.equal(board.values[11], 8);
  undoCell(board);
  assert.equal(board.values[11], 0);
  assert.equal(board.values[10], 8);
  undoCell(board);
  assert.equal(board.values[10], 0);
});

test("remaining count is 9 minus givens and fills", () => {
  const clues = SOLUTION.map((value, index) => (value === 1 && index < 40 ? value : 0));
  const board = createBoard(clues, SOLUTION);
  const givens = digitCount(board.values, 1);
  assert.equal(remainingCount(board.values, 1), 9 - givens);
  const empty = board.values.findIndex((value) => value === 0);
  armDigit(board, 1);
  tapCell(board, empty);
  assert.equal(remainingCount(board.values, 1), 9 - givens - 1);
});

test("digitDone is green only when all 9 solution cells are correct and conflict-free", () => {
  const board = createBoard(SOLUTION, SOLUTION);
  assert.equal(isDigitDone(board, 1), true);
  assert.equal(remainingCount(board.values, 1), 0);

  const ones = SOLUTION.flatMap((value, index) => (value === 1 ? [index] : []));
  const other = SOLUTION.findIndex((value) => value !== 1);
  board.values[ones[0]] = SOLUTION[other];
  board.values[other] = 1;
  assert.equal(digitCount(board.values, 1), 9);
  assert.equal(remainingCount(board.values, 1), 0);
  assert.equal(conflictMask(board.values)[other] || conflictMask(board.values)[ones[0]], true);
  assert.equal(isDigitDone(board, 1), false);
  armDigit(board, 1);
  assert.equal(board.selectedDigit, 1);
});

test("a finished digit cannot be armed", () => {
  const board = createBoard(SOLUTION, SOLUTION);
  armDigit(board, 6);
  assert.equal(board.selectedDigit, null);
});

test("filling clears that digit from pencil notes in the row, column, and box", () => {
  const board = createBoard(SOLUTION.map(() => 0), SOLUTION);
  const cell = 0;
  const rowPeer = 1;
  const colPeer = 9;
  const boxPeer = 10;
  const nonPeer = 80;
  board.notes[cell] = (1 << 5) | (1 << 7);
  board.notes[rowPeer] = (1 << 5) | (1 << 3);
  board.notes[colPeer] = 1 << 5;
  board.notes[boxPeer] = (1 << 5) | (1 << 2);
  board.notes[nonPeer] = 1 << 5;

  armDigit(board, 5);
  tapCell(board, cell);

  assert.equal(board.values[cell], 5);
  assert.equal(board.notes[cell], 0);
  assert.equal(board.notes[rowPeer], 1 << 3);
  assert.equal(board.notes[colPeer], 0);
  assert.equal(board.notes[boxPeer], 1 << 2);
  assert.equal(board.notes[nonPeer], 1 << 5);
  assert.equal(board.undo.length, 1);

  undoCell(board);
  assert.equal(board.values[cell], 0);
  assert.equal(board.notes[cell], (1 << 5) | (1 << 7));
  assert.equal(board.notes[rowPeer], (1 << 5) | (1 << 3));
  assert.equal(board.notes[colPeer], 1 << 5);
  assert.equal(board.notes[boxPeer], (1 << 5) | (1 << 2));
  assert.equal(board.notes[nonPeer], 1 << 5);
});

test("pencil marks do not clear peer notes", () => {
  const board = createBoard(SOLUTION.map(() => 0), SOLUTION);
  board.notes[1] = 1 << 4;
  board.pencilMode = true;
  armDigit(board, 4);
  tapCell(board, 0);
  assert.equal(board.values[0], 0);
  assert.equal(board.notes[0] & (1 << 4), 1 << 4);
  assert.equal(board.notes[1], 1 << 4);
});

test("erasing a fill does not clear peer notes", () => {
  const board = createBoard(SOLUTION.map(() => 0), SOLUTION);
  board.values[0] = 4;
  board.notes[1] = 1 << 4;
  armDigit(board, 4);
  tapCell(board, 0);
  assert.equal(board.values[0], 0);
  assert.equal(board.notes[1], 1 << 4);
});

test("peer note clearing skips givens", () => {
  const clues = SOLUTION.map((value, index) => (index === 1 ? value : 0));
  const board = createBoard(clues, SOLUTION);
  board.notes[1] = 1 << 6;
  armDigit(board, 6);
  tapCell(board, 0);
  assert.equal(board.values[0], 6);
  assert.equal(board.notes[1], 1 << 6);
  assert.equal(board.values[1], clues[1]);
});

test("empty cell count is the unfilled non-givens", () => {
  const clues = SOLUTION.map((value, index) => (index < 10 ? value : 0));
  const board = createBoard(clues, SOLUTION);
  assert.equal(emptyCellCount(board), 71);
  armDigit(board, SOLUTION[10]);
  tapCell(board, 10);
  assert.equal(emptyCellCount(board), 70);
});

test("wrong fills are player cells that disagree with the solution", () => {
  const clues = SOLUTION.map((value, index) => (index < 10 ? value : 0));
  const board = createBoard(clues, SOLUTION);
  board.values[0] = board.values[0] === 1 ? 2 : 1;
  const wrongDigit = SOLUTION[20] === 9 ? 8 : 9;
  armDigit(board, wrongDigit);
  tapCell(board, 20);
  board.selectedDigit = null;
  armDigit(board, SOLUTION[21]);
  tapCell(board, 21);
  assert.equal(board.values[21], SOLUTION[21]);
  const wrong = wrongFillIndexes(board);
  assert.deepEqual(wrong, [20]);
  assert.equal(wrong.includes(0), false);
});

test("填滿候選 writes legal notes on empty cells in one undo step", () => {
  const clues = SOLUTION.map((value, index) => (index < 8 ? value : 0));
  const board = createBoard(clues, SOLUTION);
  board.values[20] = 4;
  board.notes[20] = 1 << 9;
  board.notes[1] = 1 << 2;
  board.notes[8] = 1 << 1;
  const givenNotes = board.notes[0];
  const filledNotes = board.notes[20];
  const valuesBefore = board.values.slice();

  fillAllCandidates(board);

  assert.deepEqual(board.values, valuesBefore);
  assert.equal(board.notes[0], givenNotes);
  assert.equal(board.notes[1], 1 << 2);
  assert.equal(board.notes[20], filledNotes);
  assert.deepEqual(maskDigits(board.notes[8]), [7]);
  assert.deepEqual(maskDigits(board.notes[8]), maskDigits(legalCandidateMask(board.values, 8)));
  assert.equal(board.undo.length, 1);
  assert.ok(board.undo[0]?.cells.some((cell) => cell.index === 8));
  assert.equal(board.undo[0]?.cells.some((cell) => cell.index === 0 || cell.index === 20), false);

  const written = board.notes.slice();
  undoCell(board);
  assert.equal(board.notes[8], 1 << 1);
  assert.equal(board.notes[20], filledNotes);
  assert.notDeepEqual(board.notes, written);
  assert.equal(board.undo.length, 0);
});

test("a second 填滿候選 does not add an undo step when notes already match", () => {
  const board = createBoard(SOLUTION.map((value, index) => (index % 4 === 0 ? value : 0)), SOLUTION);
  fillAllCandidates(board);
  assert.equal(board.undo.length, 1);
  fillAllCandidates(board);
  assert.equal(board.undo.length, 1);
});

test("writeDigit places a digit even in pencil mode and undo restores peer notes", () => {
  const board = createBoard(SOLUTION.map(() => 0), SOLUTION);
  board.pencilMode = true;
  board.selectedDigit = 2;
  board.notes[0] = (1 << 5) | (1 << 7);
  board.notes[1] = (1 << 5) | (1 << 3);
  board.notes[80] = 1 << 5;
  assert.equal(writeDigit(board, 0, 5), true);
  assert.equal(board.values[0], 5);
  assert.equal(board.notes[0], 0);
  assert.equal(board.notes[1], 1 << 3);
  assert.equal(board.notes[80], 1 << 5);
  assert.equal(board.pencilMode, true);
  assert.equal(board.selectedDigit, 2);
  assert.equal(board.undo.length, 1);
  undoCell(board);
  assert.equal(board.values[0], 0);
  assert.equal(board.notes[0], (1 << 5) | (1 << 7));
  assert.equal(board.notes[1], (1 << 5) | (1 << 3));
});

test("writeDigit does not overwrite a given or a filled cell", () => {
  const clues = SOLUTION.map((value, index) => (index === 0 ? value : 0));
  const board = createBoard(clues, SOLUTION);
  assert.equal(writeDigit(board, 0, 5), false);
  assert.equal(board.values[0], clues[0]);
  assert.equal(board.undo.length, 0);
  board.values[8] = 4;
  assert.equal(writeDigit(board, 8, 5), false);
  assert.equal(board.values[8], 4);
});

test("placedADigit is only a new fill", () => {
  const before = [1, 0, 2];
  assert.equal(placedADigit(before, [1, 4, 2]), true);
  assert.equal(placedADigit(before, [1, 0, 0]), false);
  assert.equal(placedADigit(before, [1, 0, 2]), false);
});

test("重開 clears fills and the undo stack but keeps givens", () => {
  const clues = SOLUTION.map((value, index) => (index % 5 === 0 ? value : 0));
  const board = createBoard(clues, SOLUTION);
  armDigit(board, 4);
  const empty = board.values.findIndex((value) => value === 0);
  tapCell(board, empty);
  restartBoard(board);
  assert.deepEqual(board.values, clues);
  assert.equal(board.undo.length, 0);
  assert.equal(board.selectedDigit, null);
  assert.ok(board.notes.every((note) => note === 0));
});
