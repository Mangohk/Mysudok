import assert from "node:assert/strict";
import test from "node:test";
import { countSolutions } from "openzeloku";
import { generate, type Difficulty } from "../src/engine/generate.ts";
import {
  analyze,
  isAdvancedTechnique,
  isBeginnerTechnique,
  isIntermediateTechnique,
  rowsToFlat,
  type AppliedTechnique,
} from "../src/engine/techniques.ts";

function assertUnique(difficulty: Difficulty, maxTechnique: string) {
  assert.equal(typeof maxTechnique, "string");
  const technique = maxTechnique as AppliedTechnique;
  if (difficulty === "初級") assert.equal(isBeginnerTechnique(technique), true);
  else if (difficulty === "中級") assert.equal(isIntermediateTechnique(technique), true);
  else assert.equal(isAdvancedTechnique(technique), true);
}

async function assertPuzzle(difficulty: Difficulty) {
  const puzzle = await generate(difficulty);
  assert.equal(puzzle.unique, true);
  assert.equal(puzzle.givens.length, 9);
  assert.equal(puzzle.solution.length, 9);
  for (const row of puzzle.givens) assert.equal(row.length, 9);
  for (const row of puzzle.solution) assert.equal(row.length, 9);

  const givens = rowsToFlat(puzzle.givens);
  const solution = rowsToFlat(puzzle.solution);
  givens.forEach((value, index) => {
    if (value !== 0) assert.equal(value, solution[index]);
  });
  assert.ok(givens.some((value) => value === 0));

  const counted = countSolutions(givens, 9, 2);
  assert.equal(counted.unique, true);
  assert.deepEqual(counted.solution, solution);
  assertUnique(difficulty, puzzle.maxTechnique);

  const analysis = analyze(givens);
  assert.equal(analysis.solved, true);
  assert.equal(analysis.maxTechnique, puzzle.maxTechnique);
  assert.equal(analysis.techniques.includes("notes" as never), false);
  if (difficulty === "初級") {
    assert.ok(analysis.techniques.every((id) => isBeginnerTechnique(id)));
    assert.equal(analysis.techniques.includes("obvious_singles" as never), false);
  } else if (difficulty === "中級") {
    assert.ok(analysis.techniques.some((id) => isIntermediateTechnique(id)));
    assert.ok(analysis.techniques.every((id) => !isAdvancedTechnique(id)));
  } else {
    assert.ok(analysis.techniques.some((id) => isAdvancedTechnique(id)));
  }
}

test("generate 初級 returns a unique #1–#3 puzzle", { timeout: 20_000 }, async () => {
  await assertPuzzle("初級");
});

test("generate 中級 returns a unique #5–#10 puzzle", { timeout: 40_000 }, async () => {
  await assertPuzzle("中級");
});

test("generate 高級 returns a unique puzzle with an advanced step", { timeout: 60_000 }, async () => {
  await assertPuzzle("高級");
});
