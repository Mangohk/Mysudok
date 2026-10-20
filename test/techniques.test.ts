import assert from "node:assert/strict";
import test from "node:test";
import { countSolutions, generate as ozGenerate } from "openzeloku";
import { scanOrderFromPuzzle } from "../src/engine/scan-order.ts";
import {
  TECHNIQUE_LABEL,
  TECHNIQUE_ORDER,
  analyze,
  findLastFreeCell,
  findLastPossibleNumber,
  findLastRemainingCell,
  isAdvancedTechnique,
  isBeginnerTechnique,
  isIntermediateTechnique,
  techniqueBand,
  techniqueRank,
} from "../src/engine/techniques.ts";

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

test("technique ids, labels, and bands follow §11", () => {
  assert.deepEqual(TECHNIQUE_ORDER, [
    "last_free_cell",
    "last_remaining_cell",
    "last_possible_number",
    "obvious_singles",
    "obvious_pairs",
    "obvious_triples",
    "hidden_singles",
    "hidden_pairs",
    "hidden_triples",
    "pointing_pairs",
    "pointing_triples",
    "x_wing",
    "y_wing",
    "swordfish",
  ]);
  assert.equal(TECHNIQUE_ORDER.includes("notes" as never), false);
  assert.equal(TECHNIQUE_LABEL.last_free_cell, "Last Free Cell");
  assert.equal(TECHNIQUE_LABEL.last_remaining_cell, "Last Remaining Cell");
  assert.equal(TECHNIQUE_LABEL.last_possible_number, "Last Possible Number");
  assert.equal(TECHNIQUE_LABEL.obvious_singles, "Obvious Singles");
  assert.equal(TECHNIQUE_LABEL.obvious_pairs, "Obvious Pairs");
  assert.equal(TECHNIQUE_LABEL.obvious_triples, "Obvious Triples");
  assert.equal(TECHNIQUE_LABEL.hidden_singles, "Hidden Singles");
  assert.equal(TECHNIQUE_LABEL.hidden_pairs, "Hidden Pairs");
  assert.equal(TECHNIQUE_LABEL.hidden_triples, "Hidden Triples");
  assert.equal(TECHNIQUE_LABEL.pointing_pairs, "Pointing Pairs");
  assert.equal(TECHNIQUE_LABEL.pointing_triples, "Pointing Triples");
  assert.equal(TECHNIQUE_LABEL.x_wing, "X-Wing");
  assert.equal(TECHNIQUE_LABEL.y_wing, "Y-Wing");
  assert.equal(TECHNIQUE_LABEL.swordfish, "Swordfish");
  assert.equal(techniqueRank("last_free_cell"), 1);
  assert.equal(techniqueRank("obvious_singles"), 5);
  assert.equal(techniqueRank("hidden_singles"), 8);
  assert.equal(techniqueRank("swordfish"), 15);
  assert.equal(techniqueBand("last_possible_number"), "初級");
  assert.equal(techniqueBand("hidden_triples"), "中級");
  assert.equal(techniqueBand("pointing_pairs"), "高級");
  for (const id of TECHNIQUE_ORDER) {
    if (techniqueRank(id) <= 3) assert.equal(isBeginnerTechnique(id), true);
    else if (techniqueRank(id) <= 10) assert.equal(isIntermediateTechnique(id), true);
    else assert.equal(isAdvancedTechnique(id), true);
  }
});

test("a single blank is Last Free Cell, not an obvious single", () => {
  const grid = SOLUTION.slice();
  grid[40] = 0;
  const hit = findLastFreeCell(grid);
  assert.ok(hit);
  assert.equal(hit.index, 40);
  assert.equal(hit.digit, 8);
  assert.equal(hit.unit, "row");
  const analysis = analyze(grid);
  assert.equal(analysis.solved, true);
  assert.equal(analysis.maxTechnique, "last_free_cell");
  assert.deepEqual(analysis.techniques, ["last_free_cell"]);
  assert.deepEqual(analysis.values, SOLUTION);
});

test("Last Remaining Cell is a real detector and outranks Last Possible Number", () => {
  assert.equal(findLastFreeCell(REMAINING), null);
  const hit = findLastRemainingCell(REMAINING);
  assert.ok(hit);
  assert.equal(hit.index, 4);
  assert.equal(hit.digit, 8);
  assert.equal(hit.unit, "row");
  assert.ok(hit.evidence.length > 0);
  assert.ok(hit.evidence.every((index) => REMAINING[index] === 8));
  const possible = findLastPossibleNumber(REMAINING);
  assert.ok(possible);
  assert.notEqual(possible.index, hit.index);
});

test("#2 scans digit then cell, #3 scans cell then digit", () => {
  const grid = Array<number>(81).fill(0);
  grid[2] = 3;
  grid[3] = 4;
  grid[4] = 5;
  grid[5] = 6;
  grid[6] = 7;
  grid[7] = 8;
  grid[8] = 9;
  grid[27] = 1;
  grid[28] = 2;
  const remaining = findLastRemainingCell(grid);
  assert.ok(remaining);
  assert.equal(remaining.digit, 1);
  assert.equal(remaining.index, 1);
  assert.equal(remaining.unit, "row");

  const naked = SOLUTION.slice();
  naked[0] = 0;
  naked[4] = 0;
  const possible = findLastPossibleNumber(naked);
  assert.ok(possible);
  assert.equal(possible.index, 0);
  assert.equal(possible.digit, SOLUTION[0]);
  assert.notEqual(SOLUTION[4], SOLUTION[0]);
  assert.ok(SOLUTION[4] < SOLUTION[0]);
});

test("Last Possible Number is the naked single left after #1 and #2 miss", () => {
  assert.equal(findLastFreeCell(POSSIBLE), null);
  assert.equal(findLastRemainingCell(POSSIBLE), null);
  const hit = findLastPossibleNumber(POSSIBLE);
  assert.ok(hit);
  assert.equal(hit.index, 35);
  assert.equal(hit.digit, 9);
  assert.ok(hit.evidence.length > 0);
});

test("beginner fixture solves with #1–#3 only and matches the unique solution", () => {
  const counted = countSolutions(INTRO, 9, 2);
  assert.equal(counted.unique, true);
  const analysis = analyze(INTRO);
  assert.equal(analysis.solved, true);
  assert.equal(analysis.maxTechnique, "last_remaining_cell");
  assert.ok(analysis.maxTechnique && isBeginnerTechnique(analysis.maxTechnique));
  assert.deepEqual(analysis.techniques, ["last_free_cell", "last_remaining_cell"]);
  assert.equal(analysis.techniques.includes("obvious_singles" as never), false);
  assert.equal(analysis.techniques.includes("notes" as never), false);
  assert.deepEqual(analysis.values, counted.solution);
});

test("pair fixture needs obvious pairs and still matches the unique solution", () => {
  const counted = countSolutions(NAKED_PAIR, 9, 2);
  assert.equal(counted.unique, true);
  const analysis = analyze(NAKED_PAIR);
  assert.equal(analysis.solved, true);
  assert.equal(analysis.maxTechnique, "obvious_pairs");
  assert.ok(analysis.maxTechnique && isIntermediateTechnique(analysis.maxTechnique));
  assert.equal(analysis.techniques.includes("obvious_pairs"), true);
  assert.equal(analysis.techniques.some((id) => isAdvancedTechnique(id)), false);
  assert.deepEqual(analysis.values, counted.solution);
});

test("a unique puzzle beyond swordfish is rejected", () => {
  const counted = countSolutions(TOO_HARD, 9, 2);
  assert.equal(counted.unique, true);
  const analysis = analyze(TOO_HARD);
  assert.equal(analysis.solved, false);
  assert.equal(analysis.maxTechnique, null);
});

test("scan order is a per-puzzle permutation and only tie-breaks equal hits", () => {
  const base = Array<number>(81).fill(0);
  const first = scanOrderFromPuzzle(base);
  const again = scanOrderFromPuzzle(base);
  assert.deepEqual(again, first);
  assert.equal(first.length, 81);
  assert.deepEqual([...first].sort((a, b) => a - b), Array.from({ length: 81 }, (_, index) => index));
  const changed = base.slice();
  changed[40] = 4;
  assert.notDeepEqual(scanOrderFromPuzzle(changed), first);

  const two = SOLUTION.slice();
  two[0] = 0;
  two[80] = 0;
  assert.equal(findLastFreeCell(two)?.index, 0);
  const reversed = Array.from({ length: 81 }, (_, index) => 80 - index);
  assert.equal(findLastFreeCell(two, reversed)?.index, 80);
  const ordered = findLastFreeCell(two, scanOrderFromPuzzle(two));
  assert.ok(ordered);
  assert.equal(ordered.index, scanOrderFromPuzzle(two).find((cell) => cell === 0 || cell === 80));
  const solved = analyze(two);
  assert.equal(solved.solved, true);
  assert.equal(solved.maxTechnique, "last_free_cell");
  assert.deepEqual(solved.values, SOLUTION);
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
      assert.equal(analysis.techniques.includes("notes" as never), false);
    }
  }
});
