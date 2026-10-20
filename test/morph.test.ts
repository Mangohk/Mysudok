import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { countSolutions } from "openzeloku";
import { entryToPuzzle, filterByHardest, parseBank } from "../src/engine/bank.ts";
import {
  applyDealMorph,
  applyMorphGrid,
  isDealMorph,
  morphGrids,
  randomMorph,
  type SudokuMorph,
} from "../src/engine/morph.ts";
import { rowsToFlat } from "../src/engine/techniques.ts";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function assertSudoku(rows: readonly (readonly number[])[]): void {
  const expect = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const seen = (cells: number[]) => {
    assert.deepEqual([...cells].sort((left, right) => left - right), expect);
  };
  for (let index = 0; index < 9; index++) seen([...rows[index]!]);
  for (let col = 0; col < 9; col++) seen(rows.map((row) => row[col]!));
  for (let box = 0; box < 9; box++) {
    const row0 = Math.floor(box / 3) * 3;
    const col0 = (box % 3) * 3;
    const cells: number[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) cells.push(rows[row0 + row]![col0 + col]!);
    }
    seen(cells);
  }
}

const bandSwap: SudokuMorph = {
  digit: [0, 2, 1, 3, 4, 5, 6, 7, 8, 9],
  row: [3, 4, 5, 0, 1, 2, 6, 7, 8],
  col: [1, 0, 2, 3, 4, 5, 6, 7, 8],
};

test("a fixed morph maps givens and solution with the same digit, row, and column map", () => {
  const grid = Array.from({ length: 9 }, () => Array<number>(9).fill(0));
  grid[0]![0] = 1;
  grid[0]![1] = 2;
  const solution = grid.map((row) => row.slice());
  solution[0]![0] = 1;
  solution[0]![1] = 2;
  solution[3]![4] = 8;
  const puzzle = { givens: grid, solution, maxTechnique: "x_wing", unique: true as const };
  assert.equal(isDealMorph(bandSwap), true);

  const morphed = morphGrids(puzzle, bandSwap);
  assert.equal(morphed.maxTechnique, "x_wing");
  assert.equal(morphed.unique, true);
  assert.equal(morphed.givens[3]![1], 2);
  assert.equal(morphed.givens[3]![0], 1);
  assert.equal(morphed.solution[3]![1], 2);
  assert.equal(morphed.solution[3]![0], 1);
  assert.equal(morphed.solution[0]![4], 8);
  assert.deepEqual(morphed.givens, applyMorphGrid(puzzle.givens, bandSwap));
  assert.deepEqual(morphed.solution, applyMorphGrid(puzzle.solution, bandSwap));

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const given = puzzle.givens[row]![col]!;
      const solved = puzzle.solution[row]![col]!;
      const destRow = bandSwap.row[row]!;
      const destCol = bandSwap.col[col]!;
      assert.equal(morphed.solution[destRow]![destCol], given === 0 && solved === 0 ? 0 : bandSwap.digit[solved]);
      if (given !== 0) assert.equal(morphed.givens[destRow]![destCol], bandSwap.digit[given]);
    }
  }
});

test("random deal morphs stay inside bands and stacks and do not transpose", () => {
  // Swapping one row out of its band is not a band permutation.
  const crossBand: SudokuMorph = {
    digit: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    row: [3, 1, 2, 0, 4, 5, 6, 7, 8],
    col: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  };
  assert.equal(isDealMorph(crossBand), false);
  const source = [
    [1, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];
  for (let seed = 1; seed <= 40; seed++) {
    const morph = randomMorph(mulberry32(seed));
    assert.equal(isDealMorph(morph), true);
    const moved = applyMorphGrid(source, morph);
    const destRow = morph.row[0] ?? 0;
    const destCol = morph.col[0] ?? 0;
    assert.equal(moved[destRow]![destCol], morph.digit[1]);
    if (destRow !== destCol) assert.equal(moved[destCol]![destRow], 0);
  }
});

test("two deals of the same bank id are not the same board, and the label stays", () => {
  const text = readFileSync(new URL("../public/bank-by-hardest.jsonl", import.meta.url), "utf8");
  const entry = filterByHardest(parseBank(text), "x_wing")[0];
  assert.ok(entry);
  const puzzle = entryToPuzzle(entry);
  const boards = new Set<string>();
  for (let seed = 1; seed <= 8; seed++) {
    const dealt = applyDealMorph(puzzle, mulberry32(seed));
    assert.equal(dealt.maxTechnique, "x_wing");
    assert.equal(dealt.unique, true);
    assertSudoku(dealt.solution);
    dealt.givens.forEach((row, rowIndex) => {
      row.forEach((digit, colIndex) => {
        if (digit !== 0) assert.equal(digit, dealt.solution[rowIndex]![colIndex]);
      });
    });
    boards.add(rowsToFlat(dealt.givens).join(""));
  }
  assert.ok(boards.size >= 2, `expected distinct boards, saw ${boards.size}`);

  const checked = applyDealMorph(puzzle, mulberry32(3));
  const counted = countSolutions(rowsToFlat(checked.givens), 9, 2);
  assert.equal(counted.unique, true);
  assert.deepEqual(counted.solution, rowsToFlat(checked.solution));
});
