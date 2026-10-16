import assert from "node:assert/strict";
import test from "node:test";
import { countSolutions } from "openzeloku";
import { generate } from "../src/engine/generate.ts";
import { isAdvancedTechnique, isIntroTechnique, rowsToFlat, type AppliedTechnique } from "../src/engine/techniques.ts";

function assertShape(difficulty: "入門" | "進階", maxTechnique: string) {
  assert.equal(typeof maxTechnique, "string");
  const technique = maxTechnique as AppliedTechnique;
  if (difficulty === "入門") assert.equal(isIntroTechnique(technique), true);
  else assert.equal(isAdvancedTechnique(technique), true);
}

test("generate 入門 returns a unique singles puzzle", { timeout: 20_000 }, async () => {
  const puzzle = await generate("入門");
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
  assertShape("入門", puzzle.maxTechnique);
});

test("generate 進階 returns a unique pair-or-pointing puzzle", { timeout: 30_000 }, async () => {
  const puzzle = await generate("進階");
  assert.equal(puzzle.unique, true);
  const givens = rowsToFlat(puzzle.givens);
  const solution = rowsToFlat(puzzle.solution);
  givens.forEach((value, index) => {
    if (value !== 0) assert.equal(value, solution[index]);
  });
  const counted = countSolutions(givens, 9, 2);
  assert.equal(counted.unique, true);
  assert.deepEqual(counted.solution, solution);
  assertShape("進階", puzzle.maxTechnique);
  assert.equal(isIntroTechnique(puzzle.maxTechnique as AppliedTechnique), false);
});
