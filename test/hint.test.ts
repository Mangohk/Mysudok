import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { legalCandidateMask } from "../src/board-input.ts";
import { filterByHardest, parseBank } from "../src/engine/bank.ts";
import {
  HINT_NOTES,
  HINT_STUCK,
  emptyHintView,
  findHint,
  hintBeginnerReveal,
  hintButtonLabel,
  hintCellClasses,
  hintClearLockedText,
  hintClearReveal,
  hintHiddenSingleText,
  hintLastPossibleText,
  hintLastRemainingText,
  hintLevel1Text,
  hintLevel2FillText,
  hintNakedMissingText,
  notesReady,
  pressHint,
  techniqueTitle,
  type HintView,
} from "../src/engine/hint.ts";
import { scanOrderFromPuzzle } from "../src/engine/scan-order.ts";
import { snapshotBeforeTechnique, type AppliedTechnique } from "../src/engine/techniques.ts";
import {
  findHiddenSet,
  findLastFreeCell,
  findLastPossibleNumber,
  findLastRemainingCell,
  findObviousSet,
  findObviousSingle,
  unitCells,
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
  const order = scanOrderFromPuzzle(REMAINING);
  const hit = findLastRemainingCell(REMAINING, order);
  assert.ok(hit);
  assert.ok(hit.unit);
  const houseWord = hit.unit === "row" ? "行" : hit.unit === "col" ? "列" : "宮";
  const first = pressHint(emptyHintView(), REMAINING);
  assert.equal(first.write, null);
  assert.equal(first.view.technique, "last_remaining_cell");
  assert.equal(first.view.indexes[0], hit.index);
  assert.equal(first.view.note?.includes(`呢${houseWord}`), true);
  assert.equal(first.view.note?.includes("呢個單位"), false);
  assert.equal(first.view.note?.includes(`〔${hit.digit}〕`), false);
  const second = pressHint(first.view, REMAINING);
  assert.equal(second.write, null);
  assert.equal(second.view.note, hintLastRemainingText(hit.digit, hit.unit));
  assert.equal(second.view.note, `〔${hit.digit}〕喺呢${houseWord}只剩這一格。`);
  assert.equal(second.view.indexes[0], hit.index);
  const house = [...unitCells(hit.index, hit.unit)];
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
  const hit = findLastPossibleNumber(POSSIBLE, scanOrderFromPuzzle(POSSIBLE));
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

test("#6/#7/#9/#10 copy follows the four-press templates and never says 填入", () => {
  const clear = (technique: string, indexes: number[], unit: "row" | "col" | "box", digits: number[], keep: number[]) =>
    hintLevel1Text({
      indexes,
      technique,
      action: { kind: "clear", digits, indexes: [], keep, unit },
    });
  assert.equal(clear("obvious_pairs", [0, 1], "row", [1, 2], [1, 2]), "呢幾格可用〔Obvious Pairs〕：〔兩格一齊只剩兩個候選〕。");
  assert.equal(clear("obvious_triples", [0, 1, 2], "col", [2, 5, 7], [2, 5, 7]), "呢幾格可用〔Obvious Triples〕：〔三格合共只剩三個候選〕。");
  assert.equal(clear("hidden_pairs", [0, 1], "box", [3, 4], [1, 2]), "呢幾格可用〔Hidden Pairs〕：〔兩個數字喺呢一區只可以放喺兩格〕。");
  assert.equal(clear("hidden_triples", [0, 1, 2], "row", [6], [1, 2, 3]), "呢幾格可用〔Hidden Triples〕：〔三個數字喺呢一區只可以放喺三格〕。");
  assert.equal(hintClearLockedText("obvious_pairs", [1, 2], "row"), "〔1〕同〔2〕一定分別落喺呢兩格（標呢〔行〕）。");
  assert.equal(hintClearLockedText("obvious_triples", [2, 5, 7], "col"), "〔2〕、〔5〕、〔7〕一定落喺呢三格（標呢〔列〕）。");
  assert.equal(hintClearLockedText("hidden_pairs", [4, 8], "box"), "〔4〕同〔8〕喺呢〔宮〕只得呢兩格。");
  assert.equal(hintClearLockedText("hidden_triples", [1, 2, 3], "row"), "〔1〕、〔2〕、〔3〕喺呢〔行〕只得呢三格。");
  assert.equal(hintClearReveal("obvious_pairs", [1, 2], [1, 2]), "同單位其他格刪走 〔1〕、〔2〕。");
  assert.equal(hintClearReveal("obvious_triples", [2, 5, 7], [2, 5, 7]), "同單位其他格刪走 〔2〕、〔5〕、〔7〕。");
  assert.equal(hintClearReveal("hidden_pairs", [9], [4, 8]), "呢兩格刪走其他候選只留 〔4〕、〔8〕。");
  assert.equal(hintClearReveal("hidden_triples", [9], [1, 2, 3]), "呢三格刪走其他候選只留 〔1〕、〔2〕、〔3〕。");
  for (const id of ["obvious_pairs", "obvious_triples", "hidden_pairs", "hidden_triples"]) {
    for (let step = 0; step <= 4; step++) assert.notEqual(hintButtonLabel(step, id), "填入");
    assert.equal(hintButtonLabel(1, id), "提示");
    assert.equal(hintButtonLabel(2, id), "再提示");
    assert.equal(hintButtonLabel(3, id), "清候選");
  }
});

test("#6/#9 clear candidates on the fourth press and never write a digit", () => {
  const grid = Array<number>(81).fill(0);
  grid[8] = 9;
  const pairNotes = Array<number>(81).fill(0x3fe);
  pairNotes[0] = (1 << 1) | (1 << 2);
  pairNotes[1] = (1 << 1) | (1 << 2);
  const pair = findObviousSet(grid, pairNotes, 2, scanOrderFromPuzzle(grid));
  assert.ok(pair);
  assert.equal(pair.unit, "row");
  assert.deepEqual(pair.digits, [1, 2]);
  const first = pressHint(emptyHintView(), grid, pairNotes);
  assert.equal(first.view.technique, "obvious_pairs");
  assert.deepEqual(first.view.indexes, pair.cells);
  assert.equal(first.view.note, "呢幾格可用〔Obvious Pairs〕：〔兩格一齊只剩兩個候選〕。");
  assert.equal(first.view.note?.includes("〔1"), false);
  assert.equal(hintButtonLabel(1, "obvious_pairs"), "提示");
  assert.deepEqual(hintCellClasses("obvious_pairs", 1, first.view.indexes, 0, 0), ["hint"]);
  assert.deepEqual(hintCellClasses("obvious_pairs", 1, first.view.indexes, 8, 9), []);

  const second = pressHint(first.view, grid, pairNotes);
  assert.equal(second.write, null);
  assert.equal(second.clearNotes, null);
  assert.equal(second.view.step, 2);
  assert.equal(second.view.note, "〔1〕同〔2〕一定分別落喺呢兩格（標呢〔行〕）。");
  assert.equal(hintButtonLabel(2, "obvious_pairs"), "再提示");
  assert.notEqual(hintButtonLabel(2, "obvious_pairs"), "填入");
  for (const cell of unitCells(0, "row")) assert.equal(second.view.indexes.includes(cell), true);
  assert.deepEqual(hintCellClasses("obvious_pairs", 2, second.view.indexes, 0, 0), ["hint-house", "hint"]);
  assert.deepEqual(hintCellClasses("obvious_pairs", 2, second.view.indexes, 2, 0), ["hint-house"]);
  assert.deepEqual(hintCellClasses("obvious_pairs", 2, second.view.indexes, 8, grid[8]), ["hint-house"]);
  assert.equal(hintCellClasses("obvious_pairs", 2, second.view.indexes, 8, grid[8]).includes("hint-evidence"), false);

  const third = pressHint(second.view, grid, pairNotes);
  assert.equal(third.write, null);
  assert.equal(third.clearNotes, null);
  assert.equal(third.view.step, 3);
  assert.equal(third.view.note, hintClearReveal("obvious_pairs", [1, 2], [1, 2]));
  assert.equal(third.view.note, "同單位其他格刪走 〔1〕、〔2〕。");
  assert.equal(hintButtonLabel(3, "obvious_pairs"), "清候選");
  assert.deepEqual(hintCellClasses("obvious_pairs", 3, third.view.indexes, 0, 0), ["hint-house", "hint"]);
  assert.deepEqual(hintCellClasses("obvious_pairs", 3, third.view.indexes, 2, 0), ["hint-evidence"]);
  assert.equal(third.view.indexes.includes(8), false);
  assert.deepEqual(hintCellClasses("obvious_pairs", 3, third.view.indexes, 8, grid[8]), []);

  const clear = pressHint(third.view, grid, pairNotes);
  assert.equal(clear.write, null);
  assert.equal(clear.fillCandidates, false);
  assert.deepEqual(clear.clearNotes?.digits, [1, 2]);
  assert.equal(clear.clearNotes?.indexes.includes(0), false);
  assert.equal(clear.clearNotes?.indexes.includes(2), true);
  assert.equal(clear.clearNotes?.indexes.includes(8), false);
  assert.equal(clear.view.step, 0);

  const hiddenNotes = Array<number>(81).fill(0x3fe);
  for (let index = 2; index < 9; index++) hiddenNotes[index] &= ~((1 << 1) | (1 << 2));
  hiddenNotes[0] = (1 << 1) | (1 << 2) | (1 << 3);
  hiddenNotes[1] = (1 << 1) | (1 << 2) | (1 << 4);
  const hidden = findHiddenSet(grid, hiddenNotes, 2, scanOrderFromPuzzle(grid));
  assert.ok(hidden);
  const hiddenFirst = pressHint(emptyHintView(), grid, hiddenNotes);
  assert.equal(hiddenFirst.view.technique, "hidden_pairs");
  assert.equal(hiddenFirst.view.note, "呢幾格可用〔Hidden Pairs〕：〔兩個數字喺呢一區只可以放喺兩格〕。");
  const hiddenSecond = pressHint(hiddenFirst.view, grid, hiddenNotes);
  assert.equal(hiddenSecond.clearNotes, null);
  assert.equal(hiddenSecond.view.step, 2);
  assert.equal(hiddenSecond.view.note, "〔1〕同〔2〕喺呢〔行〕只得呢兩格。");
  assert.equal(hintButtonLabel(2, "hidden_pairs"), "再提示");
  assert.deepEqual(hintCellClasses("hidden_pairs", 2, hiddenSecond.view.indexes, hidden.cells[0], 0), ["hint-house", "hint"]);
  assert.equal(hintCellClasses("hidden_pairs", 2, hiddenSecond.view.indexes, 8, grid[8]).includes("hint-evidence"), false);
  const hiddenThird = pressHint(hiddenSecond.view, grid, hiddenNotes);
  assert.equal(hiddenThird.clearNotes, null);
  assert.equal(hiddenThird.view.step, 3);
  assert.equal(hiddenThird.view.note, "呢兩格刪走其他候選只留 〔1〕、〔2〕。");
  assert.deepEqual(hintCellClasses("hidden_pairs", 3, hiddenThird.view.indexes, hidden.cells[0], 0), [
    "hint-house",
    "hint",
    "hint-evidence",
  ]);
  const hiddenClear = pressHint(hiddenThird.view, grid, hiddenNotes);
  assert.equal(hiddenClear.write, null);
  assert.deepEqual(hiddenClear.clearNotes?.indexes, hidden.cells);
});

test("elimination hints can be stepped from a prepared triple view", () => {
  const view: HintView = {
    step: 1,
    indexes: [0, 1, 2],
    technique: "obvious_triples",
    action: { kind: "clear", digits: [2, 5, 7], indexes: [3, 4], keep: [2, 5, 7], unit: "row" },
    note: null,
  };
  const second = pressHint(view, SOLUTION);
  assert.equal(second.write, null);
  assert.equal(second.clearNotes, null);
  assert.equal(second.view.note, "〔2〕、〔5〕、〔7〕一定落喺呢三格（標呢〔行〕）。");
  assert.deepEqual(hintCellClasses("obvious_triples", 2, second.view.indexes, 0, 0), ["hint-house", "hint"]);
  assert.deepEqual(hintCellClasses("obvious_triples", 2, second.view.indexes, 3, 0), ["hint-house"]);
  assert.equal(hintCellClasses("obvious_triples", 2, second.view.indexes, 3, SOLUTION[3]).includes("hint-evidence"), false);
  const third = pressHint(second.view, SOLUTION);
  assert.equal(third.clearNotes, null);
  assert.equal(third.view.note, "同單位其他格刪走 〔2〕、〔5〕、〔7〕。");
  assert.deepEqual(hintCellClasses("obvious_triples", 3, third.view.indexes, 0, 0), ["hint-house", "hint"]);
  assert.deepEqual(hintCellClasses("obvious_triples", 3, third.view.indexes, 3, 0), ["hint-evidence"]);
  const clear = pressHint(third.view, SOLUTION);
  assert.equal(clear.write, null);
  assert.deepEqual(clear.clearNotes, { indexes: [3, 4], digits: [2, 5, 7] });

  const hidden: HintView = {
    step: 1,
    indexes: [0, 1, 2],
    technique: "hidden_triples",
    action: { kind: "clear", digits: [4, 6], indexes: [0, 1, 2], keep: [1, 2, 3], unit: "box" },
    note: null,
  };
  const hiddenHouse = pressHint(hidden, SOLUTION);
  assert.equal(hiddenHouse.clearNotes, null);
  assert.equal(hiddenHouse.view.note, "〔1〕、〔2〕、〔3〕喺呢〔宮〕只得呢三格。");
  assert.deepEqual(hintCellClasses("hidden_triples", 2, hiddenHouse.view.indexes, 0, 0), ["hint-house", "hint"]);
  const filled = unitCells(0, "box").find((cell) => cell !== 0 && cell !== 1 && cell !== 2);
  assert.ok(filled !== undefined);
  assert.equal(hintCellClasses("hidden_triples", 2, hiddenHouse.view.indexes, filled, 5).includes("hint-evidence"), false);
  const hiddenList = pressHint(hiddenHouse.view, SOLUTION);
  assert.equal(hiddenList.clearNotes, null);
  assert.equal(hiddenList.view.step, 3);
  assert.equal(hiddenList.view.note, "呢三格刪走其他候選只留 〔1〕、〔2〕、〔3〕。");
  assert.deepEqual(hintCellClasses("hidden_triples", 3, hiddenList.view.indexes, 0, 0), ["hint-house", "hint", "hint-evidence"]);
  assert.equal(hintButtonLabel(hiddenList.view.step, "hidden_triples"), "清候選");
  const hiddenClear = pressHint(hiddenList.view, SOLUTION);
  assert.equal(hiddenClear.write, null);
  assert.deepEqual(hiddenClear.clearNotes, { indexes: [0, 1, 2], digits: [4, 6] });
});

test("the same givens always scan to the same hint, and equal hits are not stuck on the minimum index", () => {
  const hits = [20, 60];
  let grid = Array<number>(81).fill(0);
  const notes = Array<number>(81).fill(0);
  notes[20] = 1 << 2;
  notes[60] = 1 << 6;
  let order = scanOrderFromPuzzle(grid);
  let first = order.find((cell) => hits.includes(cell));
  if (first === Math.min(...hits)) {
    let found = false;
    for (let index = 0; index < 81 && !found; index++) {
      if (hits.includes(index)) continue;
      for (let digit = 1; digit <= 9; digit++) {
        const next = grid.slice();
        next[index] = digit;
        const nextOrder = scanOrderFromPuzzle(next);
        const nextFirst = nextOrder.find((cell) => hits.includes(cell));
        if (nextFirst === undefined || nextFirst === Math.min(...hits)) continue;
        if (findLastFreeCell(next) || findLastRemainingCell(next) || findLastPossibleNumber(next)) continue;
        grid = next;
        order = nextOrder;
        first = nextFirst;
        found = true;
        break;
      }
    }
    assert.equal(found, true);
  }
  assert.ok(first !== undefined);
  assert.notEqual(first, Math.min(...hits));
  const hinted = findHint(grid, notes);
  const again = findHint(grid, notes);
  assert.equal(hinted?.technique, "obvious_singles");
  assert.equal(hinted?.indexes[0], first);
  assert.deepEqual(again?.indexes, hinted?.indexes);
  assert.equal(findObviousSingle(grid, notes, order)?.index, hinted?.indexes[0]);

  const givens = Array<number>(81).fill(0);
  const values = givens.slice();
  values[4] = 9;
  const stableNotes = notes.slice();
  const fromGivens = scanOrderFromPuzzle(givens);
  assert.notDeepEqual(fromGivens, scanOrderFromPuzzle(values));
  const stable = findHint(values, stableNotes, givens);
  assert.equal(stable?.indexes[0], fromGivens.find((cell) => hits.includes(cell)));
  assert.deepEqual(findHint(values, stableNotes, givens)?.indexes, stable?.indexes);
});

const ALL_CANDIDATES = 0x3fe;
const BOX0 = [0, 1, 2, 9, 10, 11, 18, 19, 20];
const HINT_CLASSES = new Set(["hint", "hint-house", "hint-evidence"]);
const ADVANCED = ["pointing_pairs", "pointing_triples", "x_wing", "y_wing", "swordfish"];

function quietBoard(): { values: number[]; notes: number[] } {
  return { values: Array<number>(81).fill(0), notes: Array<number>(81).fill(ALL_CANDIDATES) };
}

function wipe(notes: number[], indexes: readonly number[], digit: number): void {
  const bit = 1 << digit;
  for (const index of indexes) notes[index] &= ~bit;
}

function onlyDigits(notes: number[], index: number, digits: readonly number[]): void {
  let mask = 0;
  for (const digit of digits) mask |= 1 << digit;
  notes[index] = mask;
}

function classNames(technique: string, step: number, indexes: readonly number[], values: readonly number[], index: number): string[] {
  return hintCellClasses(technique, step, indexes, index, values[index] ?? 0);
}

function assertOnlyHintClasses(technique: string, step: number, indexes: readonly number[], values: readonly number[]): void {
  for (let index = 0; index < 81; index++) {
    for (const name of classNames(technique, step, indexes, values, index)) {
      assert.equal(HINT_CLASSES.has(name), true);
    }
    if ((values[index] ?? 0) !== 0) {
      assert.equal(classNames(technique, step, indexes, values, index).includes("hint-evidence"), false);
    }
  }
}

function evidenceIndexes(technique: string, step: number, indexes: readonly number[], values: readonly number[]): number[] {
  const found: number[] = [];
  for (let index = 0; index < 81; index++) {
    if (classNames(technique, step, indexes, values, index).includes("hint-evidence")) found.push(index);
  }
  return found;
}

test("#11–#15 stay on the clear pipeline and never offer 填入", () => {
  for (const id of ADVANCED) {
    for (let step = 0; step <= 4; step++) assert.notEqual(hintButtonLabel(step, id), "填入");
    assert.equal(hintButtonLabel(1, id), "提示");
    assert.equal(hintButtonLabel(2, id), "再提示");
    assert.equal(hintButtonLabel(3, id), "清候選");
  }
  assert.equal(
    hintClearReveal("pointing_pairs", [4], [4], "box", "col"),
    "呢〔列〕其餘格刪走 〔4〕。",
  );
  assert.equal(hintClearReveal("pointing_pairs", [4], [4], "row"), "呢〔宮〕其餘格刪走 〔4〕。");
  assert.equal(
    hintClearLockedText("pointing_pairs", [4], "col"),
    "〔4〕喺呢〔列〕只可以落喺呢兩格（兩格同宮）。",
  );
  assert.equal(
    hintClearLockedText("x_wing", [6], "col"),
    "〔6〕喺呢兩〔列〕只得呢四格，一定佔對角鎖定。",
  );
  assert.equal(
    hintClearReveal("swordfish", [7], [7], "col"),
    "呢三〔行〕其餘格刪走 〔7〕。",
  );
});

test("#11 Pointing Pairs teaches box → line, then clears on the fourth press", () => {
  const { values, notes } = quietBoard();
  wipe(notes, BOX0.filter((index) => index !== 0 && index !== 1), 1);
  assert.equal(findHint(values)?.technique, "notes");
  const singled = notes.slice();
  singled[40] = 1 << 4;
  assert.equal(findHint(values, singled)?.technique, "obvious_singles");

  const first = pressHint(emptyHintView(), values, notes);
  assert.equal(first.write, null);
  assert.equal(first.clearNotes, null);
  assert.equal(first.view.technique, "pointing_pairs");
  assert.equal(first.view.action?.kind, "clear");
  assert.equal(first.view.note, "呢幾格可用〔Pointing Pairs〕：〔同一宮兩格候選對齊一行／列〕。");
  assert.equal(first.view.note?.includes("〔1〕"), false);
  assert.deepEqual(first.view.indexes, [0, 1]);
  assert.deepEqual(classNames("pointing_pairs", 1, first.view.indexes, values, 0), ["hint"]);
  assert.deepEqual(classNames("pointing_pairs", 1, first.view.indexes, values, 3), []);
  assert.equal(evidenceIndexes("pointing_pairs", 1, first.view.indexes, values).length, 0);

  const second = pressHint(first.view, values, notes);
  assert.equal(second.clearNotes, null);
  assert.equal(second.view.step, 2);
  assert.equal(second.view.note, "〔1〕喺呢〔宮〕只可以落喺呢兩格（兩格同行／列）。");
  assert.equal(hintButtonLabel(2, "pointing_pairs"), "再提示");
  assert.deepEqual(classNames("pointing_pairs", 2, second.view.indexes, values, 0), ["hint-house", "hint"]);
  assert.deepEqual(classNames("pointing_pairs", 2, second.view.indexes, values, 2), ["hint-house"]);
  assert.deepEqual(classNames("pointing_pairs", 2, second.view.indexes, values, 3), ["hint-house"]);
  assert.equal(evidenceIndexes("pointing_pairs", 2, second.view.indexes, values).length, 0);

  const third = pressHint(second.view, values, notes);
  assert.equal(third.clearNotes, null);
  assert.equal(third.view.step, 3);
  assert.equal(third.view.note, "呢〔行〕其餘格刪走 〔1〕。");
  assert.equal(hintButtonLabel(3, "pointing_pairs"), "清候選");
  assert.deepEqual(classNames("pointing_pairs", 3, third.view.indexes, values, 0), ["hint-house", "hint"]);
  assert.deepEqual(classNames("pointing_pairs", 3, third.view.indexes, values, 3), ["hint-evidence"]);
  assert.equal(third.view.indexes.includes(2), false);

  const cleared = pressHint(third.view, values, notes);
  assert.equal(cleared.write, null);
  assert.equal(cleared.fillCandidates, false);
  assert.deepEqual(cleared.clearNotes, { indexes: [3, 4, 5, 6, 7, 8], digits: [1] });
  assert.equal(cleared.view.step, 0);
  assert.equal(cleared.view.technique, null);
});

test("#11 claiming teaches line → box under the Pointing Pairs name", () => {
  const { values, notes } = quietBoard();
  wipe(notes, [2, 3, 4, 5, 6, 7, 8], 1);
  const first = pressHint(emptyHintView(), values, notes);
  assert.equal(first.view.technique, "pointing_pairs");
  assert.equal(first.view.action?.kind, "clear");
  assert.equal(first.view.note, "呢幾格可用〔Pointing Pairs〕：〔同一行／列兩格候選對齊一宮〕。");
  assert.equal(first.view.note?.includes("〔1〕"), false);
  assert.equal(first.view.note?.includes("同一宮兩格"), false);
  assert.deepEqual(first.view.indexes, [0, 1]);

  const second = pressHint(first.view, values, notes);
  assert.equal(second.view.note, "〔1〕喺呢〔行〕只可以落喺呢兩格（兩格同宮）。");
  assert.deepEqual(classNames("pointing_pairs", 2, second.view.indexes, values, 0), ["hint-house", "hint"]);
  assert.deepEqual(classNames("pointing_pairs", 2, second.view.indexes, values, 2), ["hint-house"]);
  assert.deepEqual(classNames("pointing_pairs", 2, second.view.indexes, values, 9), ["hint-house"]);
  assert.equal(evidenceIndexes("pointing_pairs", 2, second.view.indexes, values).length, 0);

  const third = pressHint(second.view, values, notes);
  assert.equal(third.view.note, "呢〔宮〕其餘格刪走 〔1〕。");
  assert.equal(hintButtonLabel(3, "pointing_pairs"), "清候選");
  assert.deepEqual(classNames("pointing_pairs", 3, third.view.indexes, values, 9), ["hint-evidence"]);
  assert.equal(third.view.indexes.includes(2), false);
  const cleared = pressHint(third.view, values, notes);
  assert.equal(cleared.write, null);
  assert.deepEqual(cleared.clearNotes?.digits, [1]);
  assert.deepEqual(cleared.clearNotes?.indexes, [9, 10, 11, 18, 19, 20]);
});

test("#12 Pointing Triples and its claiming form clear on the fourth press", () => {
  const pointing = quietBoard();
  wipe(pointing.notes, BOX0.filter((index) => index > 2), 2);
  const first = pressHint(emptyHintView(), pointing.values, pointing.notes);
  assert.equal(first.view.technique, "pointing_triples");
  assert.equal(first.view.note, "呢幾格可用〔Pointing Triples〕：〔同一宮三格候選對齊一行／列〕。");
  assert.equal(first.view.note?.includes("〔2〕"), false);
  assert.deepEqual(first.view.indexes, [0, 1, 2]);
  const second = pressHint(first.view, pointing.values, pointing.notes);
  assert.equal(second.view.note, "〔2〕喺呢〔宮〕只可以落喺呢三格（三格同行／列）。");
  assert.deepEqual(classNames("pointing_triples", 2, second.view.indexes, pointing.values, 0), ["hint-house", "hint"]);
  assert.equal(evidenceIndexes("pointing_triples", 2, second.view.indexes, pointing.values).length, 0);
  const third = pressHint(second.view, pointing.values, pointing.notes);
  assert.equal(third.view.note, "呢〔行〕其餘格刪走 〔2〕。");
  assert.deepEqual(classNames("pointing_triples", 3, third.view.indexes, pointing.values, 3), ["hint-evidence"]);
  const cleared = pressHint(third.view, pointing.values, pointing.notes);
  assert.equal(cleared.write, null);
  assert.deepEqual(cleared.clearNotes?.digits, [2]);
  assert.equal(cleared.clearNotes?.indexes.includes(0), false);
  assert.equal(cleared.clearNotes?.indexes.includes(3), true);

  const claiming = quietBoard();
  for (let row = 3; row < 9; row++) wipe(claiming.notes, [row * 9], 3);
  const claim = pressHint(emptyHintView(), claiming.values, claiming.notes);
  assert.equal(claim.view.technique, "pointing_triples");
  assert.equal(claim.view.note, "呢幾格可用〔Pointing Triples〕：〔同一行／列三格候選對齊一宮〕。");
  assert.deepEqual(claim.view.indexes, [0, 9, 18]);
  const claimLocked = pressHint(claim.view, claiming.values, claiming.notes);
  assert.equal(claimLocked.view.note, "〔3〕喺呢〔列〕只可以落喺呢三格（三格同宮）。");
  const claimList = pressHint(claimLocked.view, claiming.values, claiming.notes);
  assert.equal(claimList.view.note, "呢〔宮〕其餘格刪走 〔3〕。");
  assert.equal(hintButtonLabel(claimList.view.step, "pointing_triples"), "清候選");
  const claimClear = pressHint(claimList.view, claiming.values, claiming.notes);
  assert.equal(claimClear.write, null);
  assert.deepEqual(claimClear.clearNotes?.digits, [3]);
  assert.deepEqual(claimClear.clearNotes?.indexes, [1, 2, 10, 11, 19, 20]);
});

test("#13 X-Wing marks the four corners, then clears the cover", () => {
  const { values, notes } = quietBoard();
  for (const row of [0, 3]) {
    for (let col = 0; col < 9; col++) if (col !== 0 && col !== 5) wipe(notes, [row * 9 + col], 5);
  }
  const first = pressHint(emptyHintView(), values, notes);
  assert.equal(first.view.technique, "x_wing");
  assert.equal(first.view.action?.kind, "clear");
  assert.equal(first.view.note, "呢幾格可用〔X-Wing〕：〔兩行／列嘅候選對齊成 X〕。");
  assert.equal(first.view.note?.includes("〔5〕"), false);
  assert.deepEqual(first.view.indexes, [0, 5, 27, 32]);
  assert.deepEqual(classNames("x_wing", 1, first.view.indexes, values, 0), ["hint"]);
  const second = pressHint(first.view, values, notes);
  assert.equal(second.clearNotes, null);
  assert.equal(second.view.note, "〔5〕喺呢兩〔行〕只得呢四格，一定佔對角鎖定。");
  assert.deepEqual(classNames("x_wing", 2, second.view.indexes, values, 0), ["hint-house", "hint"]);
  assert.deepEqual(classNames("x_wing", 2, second.view.indexes, values, 1), ["hint-house"]);
  assert.deepEqual(classNames("x_wing", 2, second.view.indexes, values, 9), ["hint-house"]);
  assert.equal(evidenceIndexes("x_wing", 2, second.view.indexes, values).length, 0);
  const third = pressHint(second.view, values, notes);
  assert.equal(third.view.note, "呢兩〔列〕其餘格刪走 〔5〕。");
  assert.equal(hintButtonLabel(3, "x_wing"), "清候選");
  assert.deepEqual(classNames("x_wing", 3, third.view.indexes, values, 0), ["hint-house", "hint"]);
  assert.deepEqual(classNames("x_wing", 3, third.view.indexes, values, 9), ["hint-evidence"]);
  assert.equal(classNames("x_wing", 3, third.view.indexes, values, 0).includes("hint-evidence"), false);
  const cleared = pressHint(third.view, values, notes);
  assert.equal(cleared.write, null);
  assert.deepEqual(cleared.clearNotes?.digits, [5]);
  assert.equal(cleared.clearNotes?.indexes.includes(0), false);
  assert.equal(cleared.clearNotes?.indexes.includes(9), true);
  assertOnlyHintClasses("x_wing", 2, second.view.indexes, values);
  assertOnlyHintClasses("x_wing", 3, third.view.indexes, values);
});

test("#14 Y-Wing teaches the pivot and clears the shared candidate", () => {
  const { values, notes } = quietBoard();
  onlyDigits(notes, 0, [1, 2]);
  onlyDigits(notes, 5, [1, 3]);
  onlyDigits(notes, 45, [2, 3]);
  const first = pressHint(emptyHintView(), values, notes);
  assert.equal(first.view.technique, "y_wing");
  assert.equal(first.view.action?.kind, "clear");
  assert.equal(first.view.note, "呢幾格可用〔Y-Wing〕：〔一格樞紐加兩格夾擊〕。");
  assert.equal(first.view.note?.includes("〔1〕"), false);
  assert.equal(first.view.note?.includes("〔3〕"), false);
  assert.deepEqual(first.view.indexes, [0, 5, 45]);
  const second = pressHint(first.view, values, notes);
  assert.equal(second.clearNotes, null);
  assert.equal(second.view.note, "樞紐 〔1〕、〔2〕；夾擊共有 〔3〕——無論邊邊真，相交位都唔可以留 〔3〕。");
  assert.deepEqual(second.view.indexes, [0, 5, 45]);
  assert.deepEqual(classNames("y_wing", 2, second.view.indexes, values, 0), ["hint-house", "hint"]);
  assert.deepEqual(classNames("y_wing", 2, second.view.indexes, values, 5), ["hint-house", "hint"]);
  assert.deepEqual(classNames("y_wing", 2, second.view.indexes, values, 45), ["hint-house", "hint"]);
  assert.equal(evidenceIndexes("y_wing", 2, second.view.indexes, values).length, 0);
  const third = pressHint(second.view, values, notes);
  assert.equal(third.view.note, "相交格刪走 〔3〕。");
  assert.equal(hintButtonLabel(3, "y_wing"), "清候選");
  assert.deepEqual(classNames("y_wing", 3, third.view.indexes, values, 50), ["hint-evidence"]);
  assert.equal(classNames("y_wing", 3, third.view.indexes, values, 0).includes("hint-evidence"), false);
  const cleared = pressHint(third.view, values, notes);
  assert.equal(cleared.write, null);
  assert.deepEqual(cleared.clearNotes, { indexes: [50], digits: [3] });
});

test("#15 Swordfish marks the fish, then clears the cover", () => {
  const { values, notes } = quietBoard();
  for (const row of [0, 3, 6]) {
    for (let col = 0; col < 9; col++) if (![0, 4, 8].includes(col)) wipe(notes, [row * 9 + col], 7);
  }
  const first = pressHint(emptyHintView(), values, notes);
  assert.equal(first.view.technique, "swordfish");
  assert.equal(first.view.action?.kind, "clear");
  assert.equal(first.view.note, "呢幾格可用〔Swordfish〕：〔三行／列嘅候選對齊成魚〕。");
  assert.equal(first.view.note?.includes("〔7〕"), false);
  assert.equal(first.view.indexes.length, 9);
  assert.equal(first.view.indexes.includes(0), true);
  const second = pressHint(first.view, values, notes);
  assert.equal(second.clearNotes, null);
  assert.equal(second.view.note, "〔7〕喺呢三〔行〕對齊三個〔列〕，無論點擺都會蓋住。");
  assert.deepEqual(classNames("swordfish", 2, second.view.indexes, values, 0), ["hint-house", "hint"]);
  assert.deepEqual(classNames("swordfish", 2, second.view.indexes, values, 1), ["hint-house"]);
  assert.equal(classNames("swordfish", 2, second.view.indexes, values, 1).includes("hint"), false);
  assert.equal(evidenceIndexes("swordfish", 2, second.view.indexes, values).length, 0);
  const third = pressHint(second.view, values, notes);
  assert.equal(third.view.note, "呢三〔列〕其餘格刪走 〔7〕。");
  assert.equal(hintButtonLabel(3, "swordfish"), "清候選");
  assert.deepEqual(classNames("swordfish", 3, third.view.indexes, values, 0), ["hint-house", "hint"]);
  assert.deepEqual(classNames("swordfish", 3, third.view.indexes, values, 9), ["hint-evidence"]);
  assert.equal(classNames("swordfish", 3, third.view.indexes, values, 0).includes("hint-evidence"), false);
  const cleared = pressHint(third.view, values, notes);
  assert.equal(cleared.write, null);
  assert.deepEqual(cleared.clearNotes?.digits, [7]);
  assert.equal(cleared.clearNotes?.indexes.includes(0), false);
  assert.equal(cleared.clearNotes?.indexes.includes(9), true);
  assertOnlyHintClasses("swordfish", 3, third.view.indexes, values);
});

test("解唔落 only after #1–#15 all miss, not while an advanced clear remains", () => {
  const empty = Array<number>(81).fill(0);
  const noted = fullNotes(empty);
  assert.equal(findHint(empty, noted), null);
  const stuck = pressHint(emptyHintView(), empty, noted);
  assert.equal(stuck.view.note, HINT_STUCK);
  assert.equal(stuck.write, null);
  assert.equal(stuck.clearNotes, null);

  const { values, notes } = quietBoard();
  for (const row of [0, 3, 6]) {
    for (let col = 0; col < 9; col++) if (![0, 4, 8].includes(col)) wipe(notes, [row * 9 + col], 7);
  }
  const hint = findHint(values, notes);
  assert.equal(hint?.technique, "swordfish");
  assert.notEqual(pressHint(emptyHintView(), values, notes).view.note, HINT_STUCK);
});

test("each advanced bank hardest reaches clearNotes from the notes at that step", () => {
  const text = readFileSync(new URL("../public/bank-by-hardest.jsonl", import.meta.url), "utf8");
  const entries = parseBank(text);
  for (const id of ADVANCED) {
    const pool = filterByHardest(entries, id);
    assert.equal(pool.length > 0, true, id);
    let taught = false;
    for (const entry of pool) {
      const givens = [...entry.givens].map((digit) => digit.charCodeAt(0) - 48);
      const shot = snapshotBeforeTechnique(givens, id as AppliedTechnique);
      if (!shot) continue;
      const first = pressHint(emptyHintView(), shot.values, shot.candidates, givens);
      assert.equal(first.view.technique, id);
      assert.equal(first.view.action?.kind, "clear");
      assert.equal(first.write, null);
      assert.equal(first.view.note?.includes("填入"), false);
      const digits = first.view.action?.kind === "clear" ? first.view.action.digits : [];
      for (const digit of digits) assert.equal(first.view.note?.includes(`〔${digit}〕`), false);
      assert.equal(evidenceIndexes(id, 1, first.view.indexes, shot.values).length, 0);
      const second = pressHint(first.view, shot.values, shot.candidates, givens);
      assert.equal(second.clearNotes, null);
      assert.equal(second.view.step, 2);
      assert.equal(evidenceIndexes(id, 2, second.view.indexes, shot.values).length, 0);
      assertOnlyHintClasses(id, 2, second.view.indexes, shot.values);
      for (const digit of digits) assert.equal(second.view.note?.includes(`〔${digit}〕`), true);
      const third = pressHint(second.view, shot.values, shot.candidates, givens);
      assert.equal(third.clearNotes, null);
      assert.equal(hintButtonLabel(third.view.step, id), "清候選");
      assert.equal(third.view.note?.includes("填入"), false);
      assert.equal(evidenceIndexes(id, 3, third.view.indexes, shot.values).length > 0, true);
      assertOnlyHintClasses(id, 3, third.view.indexes, shot.values);
      const cleared = pressHint(third.view, shot.values, shot.candidates, givens);
      assert.equal(cleared.write, null);
      assert.ok(cleared.clearNotes);
      assert.equal(cleared.clearNotes.indexes.length > 0, true);
      assert.deepEqual(cleared.clearNotes.digits, digits);
      assert.equal(cleared.view.step, 0);
      taught = true;
      break;
    }
    assert.equal(taught, true, id);
  }
});
