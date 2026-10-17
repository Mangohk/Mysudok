import assert from "node:assert/strict";
import test from "node:test";
import { nextHint } from "openzeloku";
import {
  HINT_STUCK,
  findHint,
  hintFromStep,
  hintLevel1Text,
  hintLevel2FillText,
  hintLevel2NotesText,
  hintLevel2Text,
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
  assert.match(level1, /^這一格可用〔.+〕：〔.+〕。再撳提示睇要填咩／改筆記。$/);
  assert.equal(level1.includes(String(hint.action.value)), false);
  assert.equal(hintLevel2Text(hint.action), `填入 〔${library.value}〕。`);
  assert.equal(hintLevel2FillText(library.value), `填入 〔${library.value}〕。`);
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
  assert.match(level1, /^呢幾格可用〔顯式數對〕：〔.+〕。再撳提示睇要填咩／改筆記。$/);
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
  assert.match(hintLevel1Text(hidden!), /〔隱式數對〕/);
  assert.match(hintLevel1Text(boxLine!), /〔宮線排除〕/);
  assert.equal(hintLevel1Text(hidden!).includes("2"), false);
  assert.equal(hintLevel1Text(boxLine!).includes("8"), false);
});
