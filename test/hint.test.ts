import assert from "node:assert/strict";
import test from "node:test";
import { nextHint } from "openzeloku";
import { evidencePeers, hiddenSingleHouse } from "../src/board-input.ts";
import {
  HINT_STUCK,
  emptyHintView,
  findHint,
  hintButtonLabel,
  hintCellClasses,
  hintFromStep,
  hintHiddenSingleText,
  hintLevel1Text,
  hintLevel2FillText,
  hintLevel2NotesText,
  hintLevel2Text,
  hintNakedMissingText,
  pressHint,
  techniqueTitle,
  type HintView,
} from "../src/engine/hint.ts";

const SOLUTION = [
  6, 5, 4, 3, 1, 2, 9, 8, 7, 7, 8, 9, 5, 4, 6, 1, 3, 2, 3, 2, 1, 8, 9, 7, 5, 6, 4, 8, 4, 7, 6, 5, 3, 2, 1, 9, 2, 9,
  3, 7, 8, 1, 6, 4, 5, 5, 1, 6, 9, 2, 4, 3, 7, 8, 4, 6, 2, 1, 7, 5, 8, 9, 3, 9, 3, 5, 4, 6, 8, 7, 2, 1, 1, 7, 8, 2,
  3, 9, 4, 5, 6,
];

test("a full grid has no hint step", () => {
  assert.equal(findHint(SOLUTION), null);
  assert.equal(HINT_STUCK, "解唔落。");
});

test("findHint teaches the nextHint step and its value, not a second lookup", () => {
  const grid = SOLUTION.slice();
  grid[40] = 0;
  const hint = findHint(grid);
  const library = nextHint(grid, 9);
  assert.ok(hint);
  assert.ok(library);
  assert.deepEqual(hint.indexes, [library.row * 9 + library.col]);
  assert.equal(hint.technique, library.technique);
  assert.equal(hint.action.kind, "fill");
  if (hint.action.kind !== "fill") return;
  assert.equal(hint.action.value, library.value);

  const level1 = hintLevel1Text(hint);
  assert.equal(hint.technique, "naked_single");
  assert.equal(level1, "這一格可用〔Naked Single〕：〔呢一格只剩一個候選〕。再撳提示睇下一步。");
  assert.equal(level1.includes(String(hint.action.value)), false);
  assert.equal(hintLevel2Text(hint.action), `填入 〔${library.value}〕。`);
  assert.equal(hintLevel2FillText(library.value), `填入 〔${library.value}〕。`);
  assert.equal(hintNakedMissingText(library.value), `得 〔${library.value}〕 未出現喺呢行／列／宮。`);
});

test("an elimination step uses the hint's own candidate list", () => {
  const hint = hintFromStep({
    row: 0,
    col: 0,
    value: 9,
    technique: "naked_pair",
    cells: [0, 1, 0],
    clear: [7, 4, 7],
  });
  assert.ok(hint);
  if (!hint || hint.action.kind !== "notes") {
    assert.fail("expected a note hint");
    return;
  }
  assert.deepEqual(hint.indexes, [0, 1]);
  assert.deepEqual(hint.action.digits, [4, 7]);
  const level1 = hintLevel1Text(hint);
  assert.match(level1, /^呢幾格可用〔Naked Pair〕：〔.+〕。再撳提示睇要填咩／改筆記。$/);
  assert.equal(level1.includes("4"), false);
  assert.equal(level1.includes("7"), false);
  assert.equal(level1.includes("9"), false);
  assert.equal(hintLevel2Text(hint.action), "清／改呢啲候選：〔4、7〕。");
  assert.equal(hintLevel2NotesText([4, 7]), "清／改呢啲候選：〔4、7〕。");
});

test("an elimination step without a candidate list is not turned into a fill", () => {
  assert.equal(
    hintFromStep({ row: 2, col: 2, value: 5, technique: "pointing_pair", explanation: "Digit 5." }),
    null,
  );
  assert.equal(hintFromStep({ row: 0, col: 0, value: 1, technique: "guess" }), null);
});

test("hidden pair and box-line names stay on the technique map", () => {
  const hidden = hintFromStep({
    row: 3,
    col: 4,
    value: 0,
    technique: "hidden_pair",
    cells: [31, 32],
    clear: [2, 6],
  });
  const boxLine = hintFromStep({
    row: 1,
    col: 1,
    value: 0,
    technique: "box_line_reduction",
    cells: [10],
    clear: [8],
  });
  assert.match(hintLevel1Text(hidden!), /〔Hidden Pair〕/);
  assert.match(hintLevel1Text(boxLine!), /〔Box\/Line Reduction〕/);
  assert.equal(hintLevel1Text(hidden!).includes("2"), false);
  assert.equal(hintLevel1Text(boxLine!).includes("8"), false);
});

test("player-facing technique titles are Title Case English", () => {
  assert.equal(techniqueTitle("naked_single"), "Naked Single");
  assert.equal(techniqueTitle("hidden_single"), "Hidden Single");
  assert.equal(techniqueTitle("naked_pair"), "Naked Pair");
  assert.equal(techniqueTitle("hidden_pair"), "Hidden Pair");
  assert.equal(techniqueTitle("pointing_pair"), "Pointing Pair");
  assert.equal(techniqueTitle("box_line_reduction"), "Box/Line Reduction");
  assert.equal(techniqueTitle("x_wing"), "X-Wing");
  assert.equal(techniqueTitle("swordfish"), "Swordfish");
  assert.equal(techniqueTitle("guess"), "Guess");
});

test("other techniques stay on two hint levels and never write", () => {
  const fill = hintFromStep({ row: 4, col: 4, value: 8, technique: "other_fill" });
  assert.ok(fill);
  const level1 = hintLevel1Text(fill!);
  assert.match(level1, /再撳提示睇要填咩／改筆記。$/);
  assert.equal(level1.includes("8"), false);

  let view: HintView = {
    step: 1,
    indexes: fill!.indexes,
    technique: fill!.technique,
    action: fill!.action,
    note: level1,
  };
  assert.equal(hintButtonLabel(view.step, view.technique), "再提示");
  assert.equal(hintButtonLabel(1, "naked_pair"), "再提示");
  const second = pressHint(view, SOLUTION);
  assert.equal(second.write, null);
  assert.equal(second.view.step, 2);
  assert.equal(second.view.note, "填入 〔8〕。");
  assert.equal(hintButtonLabel(second.view.step, second.view.technique), "再提示");
  const third = pressHint(second.view, SOLUTION);
  assert.equal(third.write, null);
  assert.equal(third.view.step, 2);
  assert.equal(third.view.note, "填入 〔8〕。");

  const pair = hintFromStep({
    row: 0,
    col: 0,
    value: 9,
    technique: "x_wing",
    cells: [0, 8],
    clear: [9],
  });
  assert.match(hintLevel1Text(pair!), /〔X-Wing〕：〔呢個數字喺兩行兩列交叉鎖定〕/);
  view = { step: 1, indexes: pair!.indexes, technique: pair!.technique, action: pair!.action, note: hintLevel1Text(pair!) };
  const notes = pressHint(view, SOLUTION);
  assert.equal(notes.write, null);
  assert.equal(notes.view.step, 2);
  assert.equal(notes.view.note, "清／改呢啲候選：〔9〕。");
  assert.equal(hintButtonLabel(4, "x_wing"), "再提示");
  assert.equal(hintButtonLabel(1, "pointing_pair"), "再提示");
});

test("evidence peers are filled row, column, and box cells with a different digit", () => {
  const values = Array<number>(81).fill(0);
  values[1] = 2;
  values[9] = 3;
  values[10] = 5;
  values[80] = 4;
  const evidence = evidencePeers(values, 0, 5);
  assert.deepEqual(evidence, [1, 9]);
});

test("naked single writes on the fourth press, when the button is already 填入", () => {
  const grid = SOLUTION.slice();
  grid[40] = 0;
  const digit = SOLUTION[40];
  const view = emptyHintView();
  const first = pressHint(view, grid);
  assert.equal(first.write, null);
  assert.equal(first.view.step, 1);
  assert.equal(first.view.technique, "naked_single");
  assert.deepEqual(first.view.indexes, [40]);
  assert.equal(first.view.note, "這一格可用〔Naked Single〕：〔呢一格只剩一個候選〕。再撳提示睇下一步。");
  assert.equal(first.view.note?.includes(String(digit)), false);
  assert.equal(hintButtonLabel(1, "naked_single"), "提示");

  const evidence = evidencePeers(grid, 40, digit);
  assert.equal(evidence.includes(40), false);
  assert.ok(evidence.length > 0);
  for (const index of evidence) {
    assert.notEqual(grid[index], 0);
    assert.notEqual(grid[index], digit);
  }

  const second = pressHint(first.view, grid);
  assert.equal(second.write, null);
  assert.equal(second.view.step, 2);
  assert.equal(second.view.note, `得 〔${digit}〕 未出現喺呢行／列／宮。`);
  assert.deepEqual(second.view.indexes, [40, ...evidence]);
  assert.equal(hintButtonLabel(2, "naked_single"), "再提示");

  const third = pressHint(second.view, grid);
  assert.equal(third.write, null);
  assert.equal(third.view.step, 3);
  assert.deepEqual(third.view.indexes, [40]);
  assert.equal(third.view.note, `填入 〔${digit}〕。`);
  assert.equal(hintButtonLabel(3, "naked_single"), "填入");

  const fill = pressHint(third.view, grid);
  assert.deepEqual(fill.write, { index: 40, digit });
  assert.equal(fill.view.step, 0);
  assert.equal(fill.view.technique, null);
  assert.equal(fill.view.note, null);
  assert.deepEqual(fill.view.indexes, []);
  assert.equal(hintButtonLabel(0, "naked_single"), "提示");
});

test("hidden single house prefers row, then column, then box", () => {
  const rowOnly = Array<number>(81).fill(1);
  rowOnly[40] = 0;
  const row = hiddenSingleHouse(rowOnly, 40, 9);
  assert.ok(row);
  assert.equal(row.kind, "row");
  assert.deepEqual(row.cells, [36, 37, 38, 39, 40, 41, 42, 43, 44]);

  const column = Array<number>(81).fill(1);
  column[40] = 0;
  column[44] = 0;
  const col = hiddenSingleHouse(column, 40, 9);
  assert.ok(col);
  assert.equal(col.kind, "col");
  assert.deepEqual(col.cells, [4, 13, 22, 31, 40, 49, 58, 67, 76]);

  const box = Array<number>(81).fill(1);
  box[40] = 0;
  box[44] = 0;
  box[4] = 0;
  const boxed = hiddenSingleHouse(box, 40, 9);
  assert.ok(boxed);
  assert.equal(boxed.kind, "box");
  assert.deepEqual(boxed.cells, [30, 31, 32, 39, 40, 41, 48, 49, 50]);

  assert.equal(hiddenSingleHouse(Array<number>(81).fill(0), 40, 9), null);
  const filled = Array<number>(81).fill(0);
  filled[40] = 9;
  assert.equal(hiddenSingleHouse(filled, 40, 9), null);
  assert.equal(hiddenSingleHouse(rowOnly, -1, 9), null);
  assert.equal(hiddenSingleHouse(rowOnly, 40, 0), null);
});

const HIDDEN_SINGLE_GRID = [
  0, 0, 2, 0, 0, 0, 0, 0, 0, 7, 0, 1, 2, 0, 0, 3, 9, 4, 3, 0, 0, 0, 1, 7, 0, 0, 0, 0, 2, 0, 0, 0, 0, 7, 0, 0, 0, 0,
  6, 0, 3, 1, 8, 2, 5, 5, 0, 0, 7, 6, 0, 4, 0, 9, 1, 4, 9, 6, 7, 3, 2, 5, 8, 8, 0, 0, 1, 2, 0, 0, 0, 0, 2, 0, 0, 0,
  0, 4, 0, 0, 1,
];

test("hidden single writes on the fourth press and marks the house on the second", () => {
  const target = 3;
  const digit = 3;
  const house = hiddenSingleHouse(HIDDEN_SINGLE_GRID, target, digit);
  assert.ok(house);
  assert.equal(house.kind, "row");
  assert.deepEqual(house.cells, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const evidence = house.cells.filter((index) => HIDDEN_SINGLE_GRID[index] === 0 && index !== target);
  const filled = house.cells.filter((index) => HIDDEN_SINGLE_GRID[index] !== 0);
  assert.deepEqual(evidence, [0, 1, 4, 5, 6, 7, 8]);
  assert.deepEqual(filled, [2]);

  const first = pressHint(emptyHintView(), HIDDEN_SINGLE_GRID);
  assert.equal(first.write, null);
  assert.equal(first.view.step, 1);
  assert.equal(first.view.technique, "hidden_single");
  assert.deepEqual(first.view.indexes, [target]);
  assert.equal(
    first.view.note,
    "這一格可用〔Hidden Single〕：〔呢個數字喺呢一區只可以放喺呢一格〕。再撳提示睇要填咩／改筆記。",
  );
  assert.equal(first.view.note?.includes(String(digit)), false);
  assert.equal(hintButtonLabel(1, "hidden_single"), "提示");
  assert.deepEqual(hintCellClasses("hidden_single", 1, first.view.indexes, target, 0), ["hint"]);

  const second = pressHint(first.view, HIDDEN_SINGLE_GRID);
  assert.equal(second.write, null);
  assert.equal(second.view.step, 2);
  assert.equal(second.view.note, hintHiddenSingleText(digit, "row"));
  assert.equal(second.view.note, "得 〔3〕 喺呢行只得這一格。");
  assert.deepEqual(second.view.indexes, [target, 0, 1, 2, 4, 5, 6, 7, 8]);
  assert.equal(hintButtonLabel(2, "hidden_single"), "再提示");
  assert.deepEqual(hintCellClasses("hidden_single", 2, second.view.indexes, target, 0), ["hint-house", "hint"]);
  for (const index of evidence) {
    assert.equal(HIDDEN_SINGLE_GRID[index], 0);
    assert.deepEqual(hintCellClasses("hidden_single", 2, second.view.indexes, index, 0), [
      "hint-house",
      "hint-evidence",
    ]);
  }
  for (const index of filled) {
    assert.notEqual(HIDDEN_SINGLE_GRID[index], 0);
    assert.deepEqual(
      hintCellClasses("hidden_single", 2, second.view.indexes, index, HIDDEN_SINGLE_GRID[index]),
      ["hint-house"],
    );
  }

  const third = pressHint(second.view, HIDDEN_SINGLE_GRID);
  assert.equal(third.write, null);
  assert.equal(third.view.step, 3);
  assert.deepEqual(third.view.indexes, [target]);
  assert.equal(third.view.note, `填入 〔${digit}〕。`);
  assert.equal(hintButtonLabel(3, "hidden_single"), "填入");
  assert.deepEqual(hintCellClasses("hidden_single", 3, third.view.indexes, target, 0), ["hint"]);
  assert.deepEqual(hintCellClasses("hidden_single", 3, third.view.indexes, 0, 0), []);
  assert.deepEqual(hintCellClasses("hidden_single", 3, third.view.indexes, 2, 2), []);

  const fill = pressHint(third.view, HIDDEN_SINGLE_GRID);
  assert.deepEqual(fill.write, { index: target, digit });
  assert.equal(fill.view.step, 0);
  assert.equal(fill.view.technique, null);
  assert.equal(fill.view.note, null);
  assert.deepEqual(fill.view.indexes, []);
  assert.equal(hintButtonLabel(0, "hidden_single"), "提示");
});

test("hidden single beat 2 names the column or box when that unit is the first unique one", () => {
  const column = Array<number>(81).fill(1);
  column[40] = 0;
  column[44] = 0;
  const colView: HintView = {
    step: 1,
    indexes: [40],
    technique: "hidden_single",
    action: { kind: "fill", value: 9 },
    note: null,
  };
  const colBeat = pressHint(colView, column);
  assert.equal(colBeat.write, null);
  assert.equal(colBeat.view.note, "得 〔9〕 喺呢列只得這一格。");
  assert.equal(colBeat.view.indexes[0], 40);
  assert.equal(colBeat.view.indexes.includes(44), false);
  assert.deepEqual(hintCellClasses("hidden_single", 2, colBeat.view.indexes, 44, 0), []);
  assert.deepEqual(hintCellClasses("hidden_single", 2, colBeat.view.indexes, 4, 1), ["hint-house"]);

  const box = Array<number>(81).fill(1);
  box[40] = 0;
  box[44] = 0;
  box[4] = 0;
  const boxBeat = pressHint({ ...colView }, box);
  assert.equal(boxBeat.view.note, "得 〔9〕 喺呢宮只得這一格。");
  assert.equal(hintHiddenSingleText(9, "box"), "得 〔9〕 喺呢宮只得這一格。");
  const boxCells = [30, 31, 32, 39, 40, 41, 48, 49, 50];
  assert.deepEqual(
    boxBeat.view.indexes.filter((index) => !boxCells.includes(index)),
    [],
  );
  assert.equal(boxBeat.view.indexes.includes(44), false);
  assert.equal(boxBeat.view.indexes.includes(4), false);
});
