import assert from "node:assert/strict";
import test from "node:test";
import { legalCandidateMask } from "../src/board-input.ts";
import {
  HINT_NOTES,
  HINT_STUCK,
  emptyHintView,
  findHint,
  hintBeginnerReveal,
  hintButtonLabel,
  hintCellClasses,
  hintClearReveal,
  hintHiddenSingleText,
  hintLastPossibleText,
  hintLastRemainingText,
  hintLevel2FillText,
  hintNakedMissingText,
  notesReady,
  pressHint,
  techniqueTitle,
  type HintView,
} from "../src/engine/hint.ts";
import {
  findHiddenSet,
  findLastFreeCell,
  findLastPossibleNumber,
  findLastRemainingCell,
  findObviousSet,
} from "../src/engine/techniques.ts";

const SOLUTION = [
  6, 5, 4, 3, 1, 2, 9, 8, 7, 7, 8, 9, 5, 4, 6, 1, 3, 2, 3, 2, 1, 8, 9, 7, 5, 6, 4, 8, 4, 7, 6, 5, 3, 2, 1, 9, 2, 9,
  3, 7, 8, 1, 6, 4, 5, 5, 1, 6, 9, 2, 4, 3, 7, 8, 4, 6, 2, 1, 7, 5, 8, 9, 3, 9, 3, 5, 4, 6, 8, 7, 2, 1, 1, 7, 8, 2,
  3, 9, 4, 5, 6,
];

const REMAINING = [
  6, 1, 0, 2, 0, 9, 0, 0, 7, 0, 8, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 3, 0, 0, 0, 0, 8, 0, 0, 9, 0, 7, 0, 0, 5, 2, 0, 0,
  1, 9, 4, 0, 7, 8, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 1, 0, 0, 5, 0, 0, 5, 0, 0, 2, 0, 0, 0, 0, 0, 4, 0,
  0, 7, 0, 6, 3,
];

const POSSIBLE = [
  0, 0, 9, 0, 1, 3, 0, 0, 0, 5, 8, 0, 0, 0, 4, 3, 0, 0, 0, 0, 2, 8, 0, 9, 0, 4, 0, 0, 0, 0, 6, 8, 5, 0, 0, 0, 6, 5,
  8, 9, 3, 7, 1, 2, 4, 0, 0, 0, 1, 4, 2, 5, 0, 0, 8, 0, 5, 3, 0, 0, 4, 0, 7, 9, 0, 4, 0, 0, 0, 0, 0, 3, 0, 0, 0, 4,
  0, 0, 0, 5, 0,
];

const HINT_IDS = [
  "last_free_cell",
  "last_remaining_cell",
  "last_possible_number",
  "notes",
  "obvious_singles",
  "obvious_pairs",
  "obvious_triples",
  "hidden_singles",
  "hidden_pairs",
  "hidden_triples",
];

function fullNotes(values: readonly number[]): number[] {
  return values.map((value, index) => (value === 0 ? legalCandidateMask(values, index) : 0));
}

test("titles are Title Case and a full grid is stuck", () => {
  assert.equal(techniqueTitle("last_free_cell"), "Last Free Cell");
  assert.equal(techniqueTitle("notes"), "Notes In Sudoku");
  assert.equal(techniqueTitle("obvious_singles"), "Obvious Singles");
  assert.equal(techniqueTitle("hidden_singles"), "Hidden Singles");
  assert.equal(techniqueTitle("obvious_pairs"), "Obvious Pairs");
  assert.equal(techniqueTitle("pointing_pairs"), "Pointing Pairs");
  assert.equal(techniqueTitle("x_wing"), "X-Wing");
  assert.equal(techniqueTitle("y_wing"), "Y-Wing");
  assert.equal(techniqueTitle("swordfish"), "Swordfish");
  assert.equal(findHint(SOLUTION), null);
  assert.equal(HINT_STUCK, "解唔落。");
  const stuck = pressHint(emptyHintView(), SOLUTION);
  assert.equal(stuck.view.note, HINT_STUCK);
  assert.equal(stuck.write, null);
  assert.equal(stuck.clearNotes, null);
  assert.equal(stuck.fillCandidates, false);
});

test("scan order is #1 then #2 then #3, before notes and before #5", () => {
  const hole = SOLUTION.slice();
  hole[40] = 0;
  assert.equal(findHint(hole)?.technique, "last_free_cell");

  const remaining = findHint(REMAINING);
  assert.equal(remaining?.technique, "last_remaining_cell");
  assert.equal(findLastFreeCell(REMAINING), null);
  assert.notEqual(findLastPossibleNumber(REMAINING), null);

  const possible = findHint(POSSIBLE);
  assert.equal(possible?.technique, "last_possible_number");
  assert.equal(findLastFreeCell(POSSIBLE), null);
  assert.equal(findLastRemainingCell(POSSIBLE), null);

  const empty = Array<number>(81).fill(0);
  assert.equal(findHint(empty)?.technique, "notes");
  assert.equal(notesReady(empty, undefined), false);
  const noted = fullNotes(empty);
  assert.equal(notesReady(empty, noted), true);
  assert.equal(findHint(empty, noted), null);
  const hinted = findHint(empty, noted);
  assert.equal(hinted, null);
  assert.equal(HINT_IDS.includes("pointing_pairs"), false);
});

test("#1 Last Free Cell writes on the third press", () => {
  const grid = SOLUTION.slice();
  grid[40] = 0;
  const digit = 8;
  const first = pressHint(emptyHintView(), grid);
  assert.equal(first.write, null);
  assert.equal(first.view.step, 1);
  assert.equal(first.view.technique, "last_free_cell");
  assert.deepEqual(first.view.indexes, [40]);
  assert.equal(first.view.note?.includes("Last Free Cell"), true);
  assert.equal(first.view.note?.includes("只剩這一格空白"), true);
  assert.equal(first.view.note?.includes(`〔${digit}〕`), false);
  assert.equal(hintButtonLabel(1, "last_free_cell"), "再提示");

  const second = pressHint(first.view, grid);
  assert.equal(second.write, null);
  assert.equal(second.view.step, 2);
  assert.equal(second.view.note, hintBeginnerReveal(digit));
  assert.equal(second.view.note, `填入 〔${digit}〕。`);
  assert.deepEqual(second.view.indexes, [40, 36, 37, 38, 39, 41, 42, 43, 44]);
  assert.deepEqual(hintCellClasses("last_free_cell", 2, second.view.indexes, 40, 0), ["hint"]);
  assert.deepEqual(hintCellClasses("last_free_cell", 2, second.view.indexes, 36, grid[36]), ["hint-evidence"]);
  assert.equal(hintButtonLabel(2, "last_free_cell"), "填入");

  const fill = pressHint(second.view, grid);
  assert.deepEqual(fill.write, { index: 40, digit });
  assert.equal(fill.view.step, 0);
  assert.equal(fill.view.technique, null);
  assert.equal(fill.clearNotes, null);
});

test("#2 Last Remaining Cell names the house and paints that house plus the digit", () => {
  const hit = findLastRemainingCell(REMAINING);
  assert.ok(hit);
  assert.equal(hit.unit, "row");
  const first = pressHint(emptyHintView(), REMAINING);
  assert.equal(first.write, null);
  assert.equal(first.view.technique, "last_remaining_cell");
  assert.equal(first.view.note?.includes("呢行"), true);
  assert.equal(first.view.note?.includes("呢個單位"), false);
  assert.equal(first.view.note?.includes(`〔${hit.digit}〕`), false);
  const second = pressHint(first.view, REMAINING);
  assert.equal(second.write, null);
  assert.equal(second.view.note, hintLastRemainingText(hit.digit, "row"));
  assert.equal(second.view.note, `〔${hit.digit}〕喺呢行只剩這一格。`);
  assert.equal(second.view.indexes[0], hit.index);
  const house = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (const cell of house) assert.equal(second.view.indexes.includes(cell), true);
  assert.deepEqual(second.view.indexes.slice(0, 9), [hit.index, ...house.filter((cell) => cell !== hit.index)]);
  assert.deepEqual(hintCellClasses("last_remaining_cell", 2, second.view.indexes, hit.index, 0), ["hint-house", "hint"]);
  const other = house.find((cell) => cell !== hit.index);
  assert.ok(other !== undefined);
  assert.deepEqual(hintCellClasses("last_remaining_cell", 2, second.view.indexes, other, REMAINING[other]), ["hint-house"]);
  assert.ok(hit.evidence.length > 0);
  for (const cell of hit.evidence) {
    assert.equal(house.includes(cell), false);
    assert.equal(second.view.indexes.includes(cell), true);
    assert.equal(REMAINING[cell], hit.digit);
    assert.deepEqual(hintCellClasses("last_remaining_cell", 2, second.view.indexes, cell, REMAINING[cell]), ["hint-evidence"]);
  }
  const fill = pressHint(second.view, REMAINING);
  assert.deepEqual(fill.write, { index: hit.index, digit: hit.digit });
});

test("#3 Last Possible Number names the three houses and marks used digits", () => {
  const hit = findLastPossibleNumber(POSSIBLE);
  assert.ok(hit);
  const first = pressHint(emptyHintView(), POSSIBLE);
  assert.equal(first.view.technique, "last_possible_number");
  assert.equal(first.view.note?.includes("呢行、列、宮合埋會剩低一個數"), true);
  assert.equal(first.view.note?.includes("Last Possible Number"), true);
  assert.equal(first.view.note?.includes("呢個單位"), false);
  assert.equal(first.view.note?.includes(`〔${hit.digit}〕`), false);
  const second = pressHint(first.view, POSSIBLE);
  assert.equal(second.write, null);
  assert.equal(second.view.note, hintLastPossibleText(hit.digit));
  assert.equal(second.view.note, `呢行、列、宮合埋只剩〔${hit.digit}〕。`);
  assert.equal(second.view.indexes[0], hit.index);
  assert.ok(second.view.indexes.length > 1);
  assert.deepEqual(hintCellClasses("last_possible_number", 2, second.view.indexes, hit.index, 0), ["hint"]);
  for (const cell of second.view.indexes.slice(1)) {
    assert.notEqual(POSSIBLE[cell], 0);
    assert.deepEqual(hintCellClasses("last_possible_number", 2, second.view.indexes, cell, POSSIBLE[cell]), ["hint-evidence"]);
  }
  const fill = pressHint(second.view, POSSIBLE);
  assert.deepEqual(fill.write, { index: hit.index, digit: hit.digit });
  assert.equal(hintButtonLabel(2, "last_possible_number"), "填入");
});

test("#4 Notes is the gate after #1–#3 miss and never fills a digit", () => {
  const empty = Array<number>(81).fill(0);
  const first = pressHint(emptyHintView(), empty);
  assert.equal(first.write, null);
  assert.equal(first.fillCandidates, false);
  assert.equal(first.view.technique, "notes");
  assert.equal(first.view.note, HINT_NOTES);
  assert.equal(first.view.note?.includes("Notes In Sudoku"), true);
  assert.equal(hintButtonLabel(1, "notes"), "填滿候選");
  const second = pressHint(first.view, empty);
  assert.equal(second.fillCandidates, true);
  assert.equal(second.write, null);
  assert.equal(second.clearNotes, null);
  assert.equal(second.view.technique, null);
  assert.equal(second.view.step, 0);
});

test("#5 Obvious Singles keeps the four-press fill", () => {
  const grid = Array<number>(81).fill(0);
  const notes = Array<number>(81).fill(0x3fe);
  notes[0] = 1 << 5;
  const first = pressHint(emptyHintView(), grid, notes);
  assert.equal(first.write, null);
  assert.equal(first.view.step, 1);
  assert.equal(first.view.technique, "obvious_singles");
  assert.deepEqual(first.view.indexes, [0]);
  assert.equal(first.view.note?.includes("Obvious Singles"), true);
  assert.equal(first.view.note?.includes("呢一格只剩一個候選"), true);
  assert.equal(first.view.note?.includes("〔5〕"), false);
  assert.equal(hintButtonLabel(1, "obvious_singles"), "提示");

  const second = pressHint(first.view, grid, notes);
  assert.equal(second.write, null);
  assert.equal(second.view.step, 2);
  assert.equal(second.view.note, hintNakedMissingText(5));
  assert.equal(hintButtonLabel(2, "obvious_singles"), "再提示");

  const third = pressHint(second.view, grid, notes);
  assert.equal(third.write, null);
  assert.equal(third.view.step, 3);
  assert.equal(third.view.note, hintLevel2FillText(5));
  assert.deepEqual(third.view.indexes, [0]);
  assert.equal(hintButtonLabel(3, "obvious_singles"), "填入");

  const fill = pressHint(third.view, grid, notes);
  assert.deepEqual(fill.write, { index: 0, digit: 5 });
  assert.equal(fill.view.step, 0);
  assert.equal(fill.clearNotes, null);
});

test("#8 Hidden Singles keeps the four-press house mark", () => {
  const grid = Array<number>(81).fill(0);
  const notes = Array<number>(81).fill(0x3fe);
  for (let index = 1; index < 9; index++) notes[index] &= ~(1 << 4);
  const first = pressHint(emptyHintView(), grid, notes);
  assert.equal(first.view.technique, "hidden_singles");
  assert.deepEqual(first.view.indexes, [0]);
  assert.equal(first.view.note?.includes("Hidden Singles"), true);
  assert.equal(first.view.note?.includes("再撳提示睇下一步。"), true);
  assert.equal(first.view.note?.includes("改筆記"), false);
  assert.equal(first.view.note?.includes("〔4〕"), false);
  assert.equal(hintButtonLabel(1, "hidden_singles"), "提示");

  const second = pressHint(first.view, grid, notes);
  assert.equal(second.write, null);
  assert.equal(second.view.step, 2);
  assert.equal(second.view.note, hintHiddenSingleText(4, "row"));
  assert.deepEqual(second.view.indexes, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(hintCellClasses("hidden_singles", 2, second.view.indexes, 0, 0), ["hint-house", "hint"]);
  assert.deepEqual(hintCellClasses("hidden_singles", 2, second.view.indexes, 3, 0), ["hint-house", "hint-evidence"]);
  assert.equal(hintButtonLabel(2, "hidden_singles"), "再提示");

  const third = pressHint(second.view, grid, notes);
  assert.equal(third.write, null);
  assert.equal(third.view.step, 3);
  assert.equal(third.view.note, "填入 〔4〕。");
  assert.equal(hintButtonLabel(3, "hidden_singles"), "填入");
  assert.deepEqual(hintCellClasses("hidden_singles", 3, third.view.indexes, 0, 0), ["hint"]);

  const fill = pressHint(third.view, grid, notes);
  assert.deepEqual(fill.write, { index: 0, digit: 4 });
  assert.equal(fill.view.technique, null);
});

test("#6/#9 clear candidates on the third press and never write a digit", () => {
  const grid = Array<number>(81).fill(0);
  const pairNotes = Array<number>(81).fill(0x3fe);
  pairNotes[0] = (1 << 1) | (1 << 2);
  pairNotes[1] = (1 << 1) | (1 << 2);
  const pair = findObviousSet(grid, pairNotes, 2);
  assert.ok(pair);
  assert.deepEqual(pair.digits, [1, 2]);
  const first = pressHint(emptyHintView(), grid, pairNotes);
  assert.equal(first.view.technique, "obvious_pairs");
  assert.deepEqual(first.view.indexes, pair.cells);
  assert.equal(first.view.note?.includes("Obvious Pairs"), true);
  assert.equal(first.view.note?.includes("再撳提示睇下一步。"), true);
  assert.equal(first.view.note?.includes("改筆記"), false);
  assert.equal(first.view.note?.includes("〔1"), false);
  assert.equal(hintButtonLabel(1, "obvious_pairs"), "再提示");
  const second = pressHint(first.view, grid, pairNotes);
  assert.equal(second.write, null);
  assert.equal(second.view.step, 2);
  assert.equal(second.view.note, hintClearReveal("obvious_pairs", [1, 2], [1, 2]));
  assert.equal(second.view.note, "同單位其他格刪走 〔1、2〕。");
  assert.equal(hintButtonLabel(2, "obvious_pairs"), "清候選");
  assert.notEqual(hintButtonLabel(2, "obvious_pairs"), "填入");
  assert.equal(second.view.indexes.includes(2), true);
  const clear = pressHint(second.view, grid, pairNotes);
  assert.equal(clear.write, null);
  assert.equal(clear.fillCandidates, false);
  assert.deepEqual(clear.clearNotes?.digits, [1, 2]);
  assert.equal(clear.clearNotes?.indexes.includes(0), false);
  assert.equal(clear.clearNotes?.indexes.includes(2), true);
  assert.equal(clear.view.step, 0);

  const hiddenNotes = Array<number>(81).fill(0x3fe);
  for (let index = 2; index < 9; index++) hiddenNotes[index] &= ~((1 << 1) | (1 << 2));
  hiddenNotes[0] = (1 << 1) | (1 << 2) | (1 << 3);
  hiddenNotes[1] = (1 << 1) | (1 << 2) | (1 << 4);
  const hidden = findHiddenSet(grid, hiddenNotes, 2);
  assert.ok(hidden);
  const hiddenFirst = pressHint(emptyHintView(), grid, hiddenNotes);
  assert.equal(hiddenFirst.view.technique, "hidden_pairs");
  const hiddenSecond = pressHint(hiddenFirst.view, grid, hiddenNotes);
  assert.equal(hiddenSecond.view.note, "呢兩格刪走其他候選，只留 〔1、2〕。");
  assert.equal(hintButtonLabel(2, "hidden_pairs"), "清候選");
  const hiddenClear = pressHint(hiddenSecond.view, grid, hiddenNotes);
  assert.equal(hiddenClear.write, null);
  assert.deepEqual(hiddenClear.clearNotes?.indexes, hidden.cells);
  assert.equal(hintButtonLabel(3, "obvious_triples"), "清候選");
  assert.equal(hintButtonLabel(3, "hidden_triples"), "清候選");
});

test("elimination hints can be stepped from a prepared triple view", () => {
  const view: HintView = {
    step: 1,
    indexes: [0, 1, 2],
    technique: "obvious_triples",
    action: { kind: "clear", digits: [2, 5, 7], indexes: [3, 4], keep: [2, 5, 7] },
    note: null,
  };
  const second = pressHint(view, SOLUTION);
  assert.equal(second.write, null);
  assert.equal(second.view.note, "同單位其他格刪走 〔2、5、7〕。");
  assert.deepEqual(hintCellClasses("obvious_triples", 2, second.view.indexes, 0, 0), ["hint"]);
  assert.deepEqual(hintCellClasses("obvious_triples", 2, second.view.indexes, 3, 0), ["hint-evidence"]);
  const clear = pressHint(second.view, SOLUTION);
  assert.equal(clear.write, null);
  assert.deepEqual(clear.clearNotes, { indexes: [3, 4], digits: [2, 5, 7] });
});
