import assert from "node:assert/strict";
import test from "node:test";
import { nextHint } from "openzeloku";
import {
  HINT_UNAVAILABLE,
  findSingleHint,
  hintLevel1Text,
  hintLevel2FillText,
  hintLevel2NotesText,
  isSingleTechnique,
} from "../src/engine/hint.ts";

const SOLUTION = [
  6, 5, 4, 3, 1, 2, 9, 8, 7, 7, 8, 9, 5, 4, 6, 1, 3, 2, 3, 2, 1, 8, 9, 7, 5, 6, 4, 8, 4, 7, 6, 5, 3, 2, 1, 9, 2, 9,
  3, 7, 8, 1, 6, 4, 5, 5, 1, 6, 9, 2, 4, 3, 7, 8, 4, 6, 2, 1, 7, 5, 8, 9, 3, 9, 3, 5, 4, 6, 8, 7, 2, 1, 1, 7, 8, 2,
  3, 9, 4, 5, 6,
];

test("a full grid has no single-cell hint", () => {
  assert.equal(findSingleHint(SOLUTION), null);
});

test("findSingleHint returns the nextHint cell and its value, not a second lookup", () => {
  const grid = SOLUTION.slice();
  grid[40] = 0;
  const hint = findSingleHint(grid);
  const library = nextHint(grid, 9);
  assert.ok(hint);
  assert.ok(library);
  assert.equal(hint.index, library.row * 9 + library.col);
  assert.equal(hint.value, library.value);
  assert.equal(hint.technique, library.technique);
  assert.equal(isSingleTechnique(hint.technique), true);
  assert.equal(hint.value, SOLUTION[40]);

  const level1 = hintLevel1Text(hint);
  assert.match(level1, /這一格可用〔.+〕：〔.+〕。再撳提示睇要填咩／改筆記。/);
  assert.equal(level1.includes(String(hint.value)), false);
  assert.equal(hintLevel2FillText(hint.value), `填入 〔${hint.value}〕。`);
});

test("note advice and the unavailable line use the fixed copy", () => {
  assert.equal(hintLevel2NotesText([2, 7, 9]), "清／改呢啲候選：〔2、7、9〕。");
  assert.equal(HINT_UNAVAILABLE, "暫時未有可用唯一候選格。");
  assert.equal(isSingleTechnique("naked_pair"), false);
  assert.equal(isSingleTechnique("pointing_pair"), false);
});
