import assert from "node:assert/strict";
import test from "node:test";
import { countSolutions } from "openzeloku";
import {
  acceptsDifficulty,
  BEGINNER_LPN_STREAK,
  createBeginnerQuota,
  generate,
  type BeginnerQuota,
  type Difficulty,
} from "../src/engine/generate.ts";
import {
  analyze,
  isAdvancedTechnique,
  isBeginnerTechnique,
  isExpertTechnique,
  isIntermediateTechnique,
  rowsToFlat,
  TECHNIQUE_ORDER,
  techniqueRank,
  type AppliedTechnique,
} from "../src/engine/techniques.ts";

function assertUnique(difficulty: Difficulty, maxTechnique: string) {
  assert.equal(typeof maxTechnique, "string");
  const technique = maxTechnique as AppliedTechnique;
  assert.equal(acceptsDifficulty(difficulty, technique), true);
  if (difficulty === "初級") assert.equal(isBeginnerTechnique(technique), true);
  else if (difficulty === "中級") assert.equal(isIntermediateTechnique(technique), true);
  else if (difficulty === "高級") {
    assert.equal(isAdvancedTechnique(technique), true);
    assert.equal(isExpertTechnique(technique), false);
  } else {
    assert.equal(isExpertTechnique(technique), true);
    assert.equal(isAdvancedTechnique(technique), false);
  }
}

async function assertPuzzle(difficulty: Difficulty, quota?: BeginnerQuota) {
  const puzzle = await generate(difficulty, quota);
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
    assert.ok(analysis.techniques.every((id) => !isExpertTechnique(id)));
  } else if (difficulty === "高級") {
    assert.ok(analysis.techniques.some((id) => isAdvancedTechnique(id)));
    assert.ok(analysis.techniques.every((id) => !isExpertTechnique(id)));
    assert.equal(["y_wing", "swordfish"].includes(puzzle.maxTechnique), false);
  } else {
    assert.ok(isExpertTechnique(puzzle.maxTechnique as AppliedTechnique));
    assert.equal(["y_wing", "swordfish"].includes(puzzle.maxTechnique), true);
  }
}

test("generate 初級 returns a unique #1–#3 puzzle", { timeout: 20_000 }, async () => {
  await assertPuzzle("初級", createBeginnerQuota());
});

test("初級 soft quota prefers Last Possible Number after three misses", { timeout: 60_000 }, async () => {
  const quota = createBeginnerQuota();
  const techniques: string[] = [];
  for (let game = 0; game < 12; game++) {
    const puzzle = await generate("初級", quota);
    techniques.push(puzzle.maxTechnique);
    assert.equal(isBeginnerTechnique(puzzle.maxTechnique as AppliedTechnique), true);
    const analysis = analyze(rowsToFlat(puzzle.givens));
    assert.equal(analysis.maxTechnique, puzzle.maxTechnique);
  }
  const hits = techniques.filter((id) => id === "last_possible_number").length;
  assert.ok(hits >= 2, techniques.join(","));
  assert.equal(BEGINNER_LPN_STREAK, 3);
});

test("beginner quota persists and does not move for 中級", { timeout: 40_000 }, async () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  const quota = createBeginnerQuota(storage);
  quota.note("last_remaining_cell");
  quota.note("last_free_cell");
  quota.note("last_remaining_cell");
  assert.equal(quota.prefersLastPossible(), true);
  const restored = createBeginnerQuota(storage);
  assert.equal(restored.streak(), 3);
  assert.equal(restored.prefersLastPossible(), true);
  await assertPuzzle("中級", restored);
  assert.equal(restored.streak(), 3);
  assert.equal(restored.prefersLastPossible(), true);
  restored.note("last_possible_number");
  assert.equal(createBeginnerQuota(storage).streak(), 0);
});

test("generate 中級 returns a unique #5–#10 puzzle", { timeout: 40_000 }, async () => {
  await assertPuzzle("中級", createBeginnerQuota());
});

test("generate 高級 returns a unique #11–#13 puzzle and rejects #14+", { timeout: 60_000 }, async () => {
  await assertPuzzle("高級");
});

test("高級 accepts only #11–#13 and 專家 accepts only #14–#15", () => {
  for (const id of TECHNIQUE_ORDER) {
    const rank = techniqueRank(id);
    assert.equal(acceptsDifficulty("初級", id), rank <= 3);
    assert.equal(acceptsDifficulty("中級", id), rank >= 5 && rank <= 10);
    assert.equal(acceptsDifficulty("高級", id), rank >= 11 && rank <= 13);
    assert.equal(acceptsDifficulty("專家", id), id === "y_wing" || id === "swordfish");
  }
  assert.equal(acceptsDifficulty("高級", "y_wing"), false);
  assert.equal(acceptsDifficulty("高級", "swordfish"), false);
  assert.equal(acceptsDifficulty("專家", "x_wing"), false);
  assert.equal(acceptsDifficulty("專家", "pointing_pairs"), false);
  assert.equal(acceptsDifficulty("專家", "pointing_triples"), false);
});
