import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boardHtml, type BoardMarkup } from "../src/app.ts";
import { createBoard, type BoardInput } from "../src/board-input.ts";

const SOLUTION = [
  6, 5, 4, 3, 1, 2, 9, 8, 7, 7, 8, 9, 5, 4, 6, 1, 3, 2, 3, 2, 1, 8, 9, 7, 5, 6, 4, 8, 4, 7, 6, 5, 3, 2, 1, 9, 2, 9,
  3, 7, 8, 1, 6, 4, 5, 5, 1, 6, 9, 2, 4, 3, 7, 8, 4, 6, 2, 1, 7, 5, 8, 9, 3, 9, 3, 5, 4, 6, 8, 7, 2, 1, 1, 7, 8, 2,
  3, 9, 4, 5, 6,
];

const FILLED = 1;
const NOTE = 70;
const NOTE_MIXED = 71;
const OTHER_NOTE = 72;
const EMPTY = 73;

function openBoard(): BoardInput {
  const board = createBoard(Array(81).fill(0), SOLUTION);
  board.givens[FILLED] = true;
  board.values[FILLED] = 5;
  board.notes[NOTE] = 1 << 5;
  board.notes[NOTE_MIXED] = (1 << 5) | (1 << 2);
  board.notes[OTHER_NOTE] = 1 << 3;
  return board;
}

function markup(board: BoardInput, patch: Partial<BoardMarkup> = {}): string {
  return boardHtml({
    values: board.values,
    notes: board.notes,
    givens: board.givens,
    solution: board.solution,
    selectedDigit: board.selectedDigit,
    selectedCell: board.selectedCell,
    pencilMode: board.pencilMode,
    wrongMarks: null,
    hintStep: 0,
    hintIndexes: [],
    hintTechnique: null,
    ...patch,
  });
}

function classesOf(html: string, index: number): string[] {
  const match = html.match(new RegExp(`class="([^"]*)"[^>]*data-index="${index}"`));
  assert.ok(match, `missing cell ${index}`);
  return (match[1] ?? "").split(/\s+/).filter(Boolean);
}

function indexesWith(html: string, className: string): number[] {
  const found: number[] = [];
  for (let index = 0; index < 81; index++) {
    if (classesOf(html, index).includes(className)) found.push(index);
  }
  return found;
}

test("U1–U2 pencil on marks empty note cells same-note and filled cells same", () => {
  const board = openBoard();
  board.pencilMode = true;
  board.selectedDigit = 5;
  board.selectedCell = NOTE;
  const html = markup(board);

  assert.deepEqual(indexesWith(html, "same-note"), [NOTE, NOTE_MIXED]);
  assert.deepEqual(indexesWith(html, "same"), [FILLED]);

  const filled = classesOf(html, FILLED);
  assert.equal(filled.includes("same"), true);
  assert.equal(filled.includes("same-note"), false);
  assert.equal(filled.includes("given"), true);

  const noted = classesOf(html, NOTE);
  assert.equal(noted.includes("same-note"), true);
  assert.equal(noted.includes("same"), false);
  assert.equal(noted.includes("selected"), true);
  const notedHtml = html.match(new RegExp(`data-index="${NOTE}"[^>]*>([\\s\\S]*?)</button>`));
  assert.match(notedHtml?.[1] ?? "", /<i>5<\/i>/);
  assert.doesNotMatch(notedHtml?.[1] ?? "", /<b>|font-weight|<strong>/);
  assert.equal(html.includes("<b>"), false);
  assert.equal(html.includes("font-weight"), false);

  assert.equal(classesOf(html, OTHER_NOTE).includes("same-note"), false);
  assert.equal(classesOf(html, EMPTY).includes("same-note"), false);
  assert.equal(classesOf(html, EMPTY).includes("same"), false);
});

test("U3 pencil off keeps filled same and does not mark note cells", () => {
  const board = openBoard();
  board.pencilMode = false;
  board.selectedDigit = 5;
  const html = markup(board);

  assert.deepEqual(indexesWith(html, "same-note"), []);
  assert.deepEqual(indexesWith(html, "same"), [FILLED]);
  assert.equal(classesOf(html, NOTE).includes("same"), false);
  assert.equal(classesOf(html, NOTE_MIXED).includes("same-note"), false);
});

test("same-note is pale pink and selected gold still wins", () => {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  const root = css.match(/:root\s*\{([^}]*)\}/);
  assert.ok(root);
  assert.match(root[1] ?? "", /--same:\s*#f6e0bf/);
  assert.match(root[1] ?? "", /--same-note:\s*#edd8e4/);
  assert.match(root[1] ?? "", /--select:\s*#ffd89a/);

  const portrait = css.split("@media")[0] ?? "";
  const sameNote = portrait.match(/\.cell\.same-note\s*\{([^}]*)\}/);
  assert.ok(sameNote);
  assert.match(sameNote[1] ?? "", /background:\s*var\(--same-note\)/);
  assert.doesNotMatch(sameNote[1] ?? "", /font-weight/);
  assert.doesNotMatch(sameNote[1] ?? "", /bold/);

  const sameNoteAt = portrait.indexOf(".cell.same-note");
  const selectedAt = portrait.indexOf(".cell.selected");
  assert.ok(sameNoteAt >= 0 && selectedAt > sameNoteAt);

  const notes = portrait.match(/\.notes\s*\{([^}]*)\}/);
  assert.match(notes?.[1] ?? "", /font-weight:\s*650/);
  const noteSlot = portrait.match(/\.notes i\s*\{([^}]*)\}/);
  assert.doesNotMatch(noteSlot?.[1] ?? "", /font-weight/);
});

test("hint classes and wrong or conflict cells skip same and same-note", () => {
  const hinted = openBoard();
  hinted.pencilMode = true;
  hinted.selectedDigit = 5;
  const hintHtml = markup(hinted, {
    hintStep: 1,
    hintTechnique: "last_free_cell",
    hintIndexes: [NOTE],
  });
  const hintCell = classesOf(hintHtml, NOTE);
  assert.equal(hintCell.includes("hint"), true);
  assert.equal(hintCell.includes("same-note"), false);
  assert.equal(hintCell.includes("same"), false);
  assert.deepEqual(indexesWith(hintHtml, "same"), [FILLED]);
  assert.deepEqual(indexesWith(hintHtml, "same-note"), [NOTE_MIXED]);

  const wrong = openBoard();
  wrong.pencilMode = true;
  wrong.selectedDigit = 5;
  const wrongHtml = markup(wrong, { wrongMarks: [NOTE] });
  const wrongCell = classesOf(wrongHtml, NOTE);
  assert.equal(wrongCell.includes("wrong"), true);
  assert.equal(wrongCell.includes("same-note"), false);
  assert.equal(wrongCell.includes("same"), false);

  const conflict = openBoard();
  conflict.pencilMode = true;
  conflict.selectedDigit = 5;
  conflict.values[0] = 5;
  conflict.values[2] = 5;
  const conflictHtml = markup(conflict);
  assert.equal(classesOf(conflictHtml, 0).includes("bad"), true);
  assert.equal(classesOf(conflictHtml, 0).includes("same"), false);
  assert.equal(classesOf(conflictHtml, 0).includes("same-note"), false);
  assert.equal(classesOf(conflictHtml, 2).includes("same"), false);
  assert.equal(classesOf(conflictHtml, NOTE).includes("same-note"), true);
});

test("a finished digit does not highlight fills or note cells", () => {
  const board = createBoard(SOLUTION, SOLUTION);
  const empty = SOLUTION.findIndex((value) => value !== 5);
  board.values[empty] = 0;
  board.givens[empty] = false;
  board.notes[empty] = 1 << 5;
  board.pencilMode = true;
  board.selectedDigit = 5;
  const html = markup(board);
  assert.deepEqual(indexesWith(html, "same"), []);
  assert.deepEqual(indexesWith(html, "same-note"), []);
});

test("pencil on with no armed digit does not mark note cells", () => {
  const board = openBoard();
  board.pencilMode = true;
  board.selectedDigit = null;
  const html = markup(board);
  assert.deepEqual(indexesWith(html, "same-note"), []);
  assert.deepEqual(indexesWith(html, "same"), []);
});
