import assert from "node:assert/strict";
import test from "node:test";
import { countSolutions, generate as ozGenerate } from "openzeloku";
import { analyze, isAdvancedTechnique, isIntroTechnique } from "../src/engine/techniques.ts";

const INTRO = [
  6, 5, 0, 0, 0, 0, 0, 8, 7, 7, 8, 9, 5, 4, 0, 0, 3, 2, 3, 0, 0, 0, 9, 7, 0, 6, 4, 8, 0, 7, 0, 0, 0, 2, 0, 0, 2,
  0, 0, 7, 8, 1, 0, 0, 0, 0, 1, 0, 0, 0, 4, 3, 7, 8, 0, 0, 0, 0, 7, 5, 0, 0, 0, 0, 3, 0, 4, 6, 0, 0, 0, 1, 0, 7, 0,
  2, 3, 0, 0, 5, 0,
];

const NAKED_PAIR = [
  3, 0, 0, 6, 0, 0, 0, 7, 4, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 1, 0, 8, 0, 0, 2, 0, 0, 0, 0, 0, 4, 6, 8, 0, 0, 2, 2, 0,
  8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 9, 0, 1, 0, 0, 0, 5, 1, 0, 0, 0, 0, 0, 0, 8, 2, 0, 0, 0, 0, 5, 3, 7, 0, 7, 0, 5,
  0, 4, 6, 0, 0,
];

const TOO_HARD = [
  1, 0, 0, 0, 2, 0, 0, 0, 7, 2, 0, 4, 0, 0, 3, 0, 0, 1, 3, 0, 0, 0, 0, 1, 0, 4, 0, 6, 0, 5, 0, 0, 8, 0, 0, 0, 0, 1,
  0, 0, 7, 0, 0, 8, 5, 0, 0, 2, 5, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 7, 5, 6, 0, 0, 7, 0, 8,
  3, 0, 0, 0, 4,
];

test("入門 fixture solves with singles only and matches the unique solution", () => {
  const counted = countSolutions(INTRO, 9, 2);
  assert.equal(counted.unique, true);
  const analysis = analyze(INTRO);
  assert.equal(analysis.solved, true);
  assert.equal(analysis.maxTechnique, "hidden_single");
  assert.ok(analysis.maxTechnique && isIntroTechnique(analysis.maxTechnique));
  assert.deepEqual(analysis.techniques, ["naked_single", "hidden_single"]);
  assert.deepEqual(analysis.values, counted.solution);
});

test("naked pair fixture needs naked_pair and still matches the unique solution", () => {
  const counted = countSolutions(NAKED_PAIR, 9, 2);
  assert.equal(counted.unique, true);
  const analysis = analyze(NAKED_PAIR);
  assert.equal(analysis.solved, true);
  assert.equal(analysis.maxTechnique, "naked_pair");
  assert.ok(analysis.maxTechnique && isAdvancedTechnique(analysis.maxTechnique));
  assert.deepEqual(analysis.values, counted.solution);
});

test("a unique puzzle beyond pairs is rejected", () => {
  const counted = countSolutions(TOO_HARD, 9, 2);
  assert.equal(counted.unique, true);
  const analysis = analyze(TOO_HARD);
  assert.equal(analysis.solved, false);
  assert.equal(analysis.maxTechnique, null);
});

test("solved ratings never disagree with countSolutions", () => {
  const levels = ["easy", "medium", "hard", "expert"] as const;
  for (const level of levels) {
    for (let n = 0; n < 8; n++) {
      const puzzle = ozGenerate({ size: 9, difficulty: level });
      const counted = countSolutions(puzzle.grid, 9, 2);
      assert.equal(counted.unique, true);
      const analysis = analyze(puzzle.grid);
      if (!analysis.solved) continue;
      assert.deepEqual(analysis.values, counted.solution);
      assert.ok(analysis.maxTechnique);
    }
  }
});
