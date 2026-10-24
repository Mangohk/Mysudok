import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { countSolutions } from "openzeloku";
import { boardHtml, homeHtml, padKeys } from "../src/app.ts";
import { createBoard, fillAllCandidates, tapCell, undoCell, writeDigit } from "../src/board-input.ts";
import { geometryOf } from "../src/engine/geometry.ts";
import { generate } from "../src/engine/generate.ts";
import { findHint } from "../src/engine/hint.ts";
import { peersOf, rowsToFlat } from "../src/engine/techniques.ts";
import { parseInProgress, writeInProgress, type GameSnapshot, type ProgressStorage } from "../src/persist.ts";

const appSource = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const generateSource = readFileSync(new URL("../src/engine/generate.ts", import.meta.url), "utf8");

test("home order is 4×4, 6×6, then the four 9×9 difficulties", () => {
  const buttons = [...homeHtml().matchAll(/data-action="start" data-difficulty="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(buttons, ["4×4", "6×6", "初級", "中級", "高級", "專家"]);
  assert.match(homeHtml(), /<span class="kicker">4×4<\/span>/);
  assert.match(homeHtml(), /<span class="kicker">6×6<\/span>/);
});

test("mini geometry is 2×2 and 2×3, and 9×9 peers stay the classic set", () => {
  const four = geometryOf(4);
  assert.equal(four.size, 4);
  assert.equal(four.boxH, 2);
  assert.equal(four.boxW, 2);
  assert.equal(four.cellCount, 16);
  assert.deepEqual(four.boxes[0], [0, 1, 4, 5]);

  const six = geometryOf(6);
  assert.equal(six.size, 6);
  assert.equal(six.boxH, 2);
  assert.equal(six.boxW, 3);
  assert.equal(six.cellCount, 36);
  assert.deepEqual(six.boxes[0], [0, 1, 2, 6, 7, 8]);
  assert.equal(six.boxes.length, 6);

  const nine = geometryOf(9);
  assert.equal(nine.boxH, 3);
  assert.equal(nine.boxW, 3);
  assert.equal(nine.cellCount, 81);
  assert.equal(peersOf(0).length, 20);
  assert.deepEqual(peersOf(0), nine.peers[0]);
});

test("4×4 board draws 2×2 lines and a 1–4 pad; 6×6 draws 2×3 lines and a 1–6 pad", () => {
  const four = solved(4);
  const fourBoard = createBoard(four.map((value, index) => (index === 15 ? 0 : value)), four);
  const fourHtml = boardHtml(markup(fourBoard));
  assert.equal((fourHtml.match(/data-index="/g) ?? []).length, 16);
  assert.match(fourHtml, /data-size="4"/);
  assert.deepEqual(cellsWith(fourHtml, "thick-r"), [1, 5, 9, 13]);
  assert.deepEqual(cellsWith(fourHtml, "thick-b"), [4, 5, 6, 7]);
  assert.deepEqual(
    padKeys(fourBoard, false).map((key) => key.digit),
    [1, 2, 3, 4],
  );
  assert.equal(writeDigit(fourBoard, 15, 5), false);
  assert.equal(fourBoard.values[15], 0);

  const six = solved(6);
  const sixBoard = createBoard(six.map((value, index) => (index === 35 ? 0 : value)), six);
  const sixHtml = boardHtml(markup(sixBoard));
  assert.equal((sixHtml.match(/data-index="/g) ?? []).length, 36);
  assert.match(sixHtml, /data-size="6"/);
  assert.deepEqual(cellsWith(sixHtml, "thick-r"), [2, 8, 14, 20, 26, 32]);
  assert.deepEqual(cellsWith(sixHtml, "thick-b"), [6, 7, 8, 9, 10, 11, 18, 19, 20, 21, 22, 23]);
  assert.deepEqual(
    padKeys(sixBoard, false).map((key) => key.digit),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(writeDigit(sixBoard, 35, 7), false);
});

test("4×4 box conflicts use 2×2 houses and 6×6 uses 2×3", () => {
  const four = createBoard(Array(16).fill(0), solved(4));
  four.values[0] = 1;
  four.values[5] = 1;
  const fourBad = [...boardHtml(markup(four)).matchAll(/data-index="(\d+)"[^>]*class="([^"]*)"/g)];
  const fourConflicts = indexesOfClass(boardHtml(markup(four)), "bad");
  assert.deepEqual(fourConflicts, [0, 5]);
  assert.equal(fourBad.length >= 0, true);

  const six = Array(36).fill(0);
  six[0] = 1;
  six[8] = 1;
  const sameBox = indexesOfClass(boardHtml(markup(createBoard(six, solved(6)))), "bad");
  assert.deepEqual(sameBox, [0, 8]);
  const other = Array(36).fill(0);
  other[0] = 1;
  other[9] = 1;
  assert.deepEqual(indexesOfClass(boardHtml(markup(createBoard(other, solved(6)))), "bad"), []);
});

test("mini notes, hint, and undo follow the same board tools", () => {
  const solution = solved(4);
  const clues = solution.slice();
  clues[15] = 0;
  const board = createBoard(clues, solution);
  const missing = solution[15] ?? 1;
  board.pencilMode = true;
  board.selectedDigit = missing;
  tapCell(board, 15);
  assert.equal(board.notes[15], 1 << missing);
  assert.equal(board.values[15], 0);
  undoCell(board);
  assert.equal(board.notes[15], 0);

  board.pencilMode = false;
  board.selectedDigit = null;
  const hint = findHint(board.values, board.notes, clues);
  assert.equal(hint?.technique, "last_free_cell");
  assert.equal(hint?.action.kind, "fill");
  if (hint?.action.kind === "fill") assert.equal(hint.action.value, solution[15]);

  fillAllCandidates(board);
  assert.ok((board.notes[15] ?? 0) !== 0);
  assert.equal(board.notes[15]! & (1 << 5), 0);
  undoCell(board);
  assert.equal(board.notes[15], 0);
  assert.match(appSource, /data-action="notes"/);
  assert.match(appSource, /data-action="hint"/);
  assert.match(appSource, /data-action="undo"/);
});

test("4×4 and 6×6 puzzles are generated live with exactly one solution", { timeout: 30_000 }, async () => {
  assert.equal(generateSource.includes("analyze("), true);
  const mini = generateSource.slice(generateSource.indexOf("function carveMini"), generateSource.indexOf("async function generateMini"));
  assert.equal(mini.includes("analyze"), false);
  assert.equal(mini.includes("acceptsDifficulty"), false);
  assert.equal(mini.includes("jsonl"), false);
  assert.equal(mini.includes("dealExpert"), false);

  for (const difficulty of ["4×4", "6×6"] as const) {
    for (let round = 0; round < 2; round++) {
      const puzzle = await generate(difficulty);
      const size = difficulty === "4×4" ? 4 : 6;
      const boxH = difficulty === "4×4" ? 2 : 2;
      const boxW = difficulty === "4×4" ? 2 : 3;
      assert.equal(puzzle.givens.length, size);
      assert.equal(puzzle.solution.length, size);
      const givens = rowsToFlat(puzzle.givens);
      const solution = rowsToFlat(puzzle.solution);
      assert.equal(givens.length, size * size);
      assert.equal(solution.length, size * size);
      assert.ok(givens.some((value) => value === 0));
      assertValidGrid(solution, size, boxH, boxW);
      givens.forEach((value, index) => {
        assert.ok(value >= 0 && value <= size);
        if (value !== 0) assert.equal(value, solution[index]);
      });

      const counted = countSolutions(givens, size, 2);
      assert.equal(counted.solutionCount, 1);
      assert.equal(counted.unique, true);
      assert.deepEqual(counted.solution, solution);

      const independent = countBySearch(givens, size, boxH, boxW, 2);
      assert.equal(independent.count, 1);
      assert.deepEqual(independent.solution, solution);
    }
  }
});

test("mini start does not read a bank and no mini jsonl is shipped", () => {
  const start = appSource.slice(appSource.indexOf("async function startGame"), appSource.indexOf("function redraw"));
  const mini = start.slice(start.indexOf("isMiniDifficulty"), start.indexOf("dealExpert"));
  assert.match(mini, /await generate\(difficulty\)/);
  assert.match(mini, /bankId: null/);
  assert.equal(mini.includes("dealExpert"), false);
  assert.equal(mini.includes("applyDealMorph"), false);
  assert.equal(mini.includes("loadBankEntries"), false);
  assert.equal(mini.includes("loadPracticeBank"), false);
  assert.match(start, /applyDealMorph\(await generate\(difficulty\)\)/);
  assert.match(start, /dealExpert\(/);

  const files = readdirSync(new URL("../public", import.meta.url));
  assert.deepEqual(
    files.filter((name) => name.endsWith(".jsonl")),
    ["bank-by-hardest.jsonl"],
  );
  assert.equal(generateSource.includes("bank-by-hardest"), false);
});

test("persist round-trips 4×4 and 6×6 and still rejects a finished or mismatched board", () => {
  const storage = memory();
  const snapshot = miniSnapshot("4×4");
  writeInProgress(storage, snapshot);
  const loaded = parseInProgress(storage.getItem("mysudok.inProgress") ?? "");
  assert.ok(loaded);
  assert.equal(loaded?.difficulty, "4×4");
  assert.equal(loaded?.values.length, 16);
  assert.equal(loaded?.puzzle.givens.length, 4);
  assert.equal(loaded?.puzzle.maxTechnique, "");
  assert.deepEqual(loaded?.values, snapshot.values);

  const six = miniSnapshot("6×6");
  writeInProgress(storage, six);
  const loadedSix = parseInProgress(storage.getItem("mysudok.inProgress") ?? "");
  assert.equal(loadedSix?.difficulty, "6×6");
  assert.equal(loadedSix?.values.length, 36);
  assert.equal(loadedSix?.puzzle.solution.length, 6);

  const classic = miniSnapshot("4×4");
  classic.difficulty = "初級";
  writeInProgress(storage, classic);
  assert.equal(parseInProgress(storage.getItem("mysudok.inProgress") ?? ""), null);
});

function solved(size: 4 | 6): number[] {
  const puzzle = size === 4 ? generateSyncShape(4) : generateSyncShape(6);
  return puzzle;
}

function generateSyncShape(size: 4 | 6): number[] {
  const grid = Array<number>(size * size).fill(0);
  const boxH = size === 4 ? 2 : 2;
  const boxW = size === 4 ? 2 : 3;
  const digits = Array.from({ length: size }, (_, index) => index + 1);
  const place = (index: number): boolean => {
    if (index === grid.length) return true;
    for (const digit of digits) {
      if (!fits(grid, index, digit, size, boxH, boxW)) continue;
      grid[index] = digit;
      if (place(index + 1)) return true;
      grid[index] = 0;
    }
    return false;
  };
  assert.equal(place(0), true);
  return grid.slice();
}

function fits(grid: readonly number[], index: number, digit: number, size: number, boxH: number, boxW: number): boolean {
  const row = Math.floor(index / size);
  const col = index % size;
  for (let cursor = 0; cursor < size; cursor++) {
    if (grid[row * size + cursor] === digit || grid[cursor * size + col] === digit) return false;
  }
  const row0 = Math.floor(row / boxH) * boxH;
  const col0 = Math.floor(col / boxW) * boxW;
  for (let r = 0; r < boxH; r++) {
    for (let c = 0; c < boxW; c++) {
      if (grid[(row0 + r) * size + (col0 + c)] === digit) return false;
    }
  }
  return true;
}

function assertValidGrid(grid: readonly number[], size: number, boxH: number, boxW: number): void {
  const expect = Array.from({ length: size }, (_, index) => index + 1);
  for (let row = 0; row < size; row++) {
    assert.deepEqual(grid.slice(row * size, row * size + size).slice().sort((a, b) => a - b), expect);
  }
  for (let col = 0; col < size; col++) {
    const values = Array.from({ length: size }, (_, row) => grid[row * size + col] ?? 0).sort((a, b) => a - b);
    assert.deepEqual(values, expect);
  }
  const across = size / boxW;
  const down = size / boxH;
  for (let box = 0; box < across * down; box++) {
    const row0 = Math.floor(box / across) * boxH;
    const col0 = (box % across) * boxW;
    const values: number[] = [];
    for (let row = 0; row < boxH; row++) {
      for (let col = 0; col < boxW; col++) values.push(grid[(row0 + row) * size + (col0 + col)] ?? 0);
    }
    assert.deepEqual(values.sort((a, b) => a - b), expect);
  }
}

/** Separate from openzeloku: MRV search capped at `limit`. */
function countBySearch(
  givens: readonly number[],
  size: number,
  boxH: number,
  boxW: number,
  limit: number,
): { count: number; solution: number[] | null } {
  const grid = givens.slice();
  let count = 0;
  let solution: number[] | null = null;
  const walk = (): boolean => {
    let best = -1;
    let options: number[] = [];
    for (let index = 0; index < grid.length; index++) {
      if (grid[index] !== 0) continue;
      const digits: number[] = [];
      for (let digit = 1; digit <= size; digit++) {
        if (fits(grid, index, digit, size, boxH, boxW)) digits.push(digit);
      }
      if (digits.length === 0) return false;
      if (best < 0 || digits.length < options.length) {
        best = index;
        options = digits;
        if (digits.length === 1) break;
      }
    }
    if (best < 0) {
      count += 1;
      if (!solution) solution = grid.slice();
      return count >= limit;
    }
    for (const digit of options) {
      grid[best] = digit;
      if (walk()) return true;
      grid[best] = 0;
    }
    return false;
  };
  walk();
  return { count, solution };
}

function markup(board: ReturnType<typeof createBoard>) {
  return {
    values: board.values,
    notes: board.notes,
    givens: board.givens,
    solution: board.solution,
    selectedDigit: board.selectedDigit,
    selectedCell: board.selectedCell,
    pencilMode: board.pencilMode,
    wrongMarks: null,
    hintStep: 0 as const,
    hintIndexes: [],
    hintTechnique: null,
  };
}

function cellsWith(html: string, className: string): number[] {
  return indexesOfClass(html, className);
}

function indexesOfClass(html: string, className: string): number[] {
  const found: number[] = [];
  const pattern = /class="([^"]*)"[^>]*data-index="(\d+)"/g;
  for (const match of html.matchAll(pattern)) {
    const classes = (match[1] ?? "").split(/\s+/);
    if (classes.includes(className)) found.push(Number(match[2]));
  }
  return found;
}

function memory(): ProgressStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function miniSnapshot(difficulty: "4×4" | "6×6"): GameSnapshot {
  const size = difficulty === "4×4" ? 4 : 6;
  const flat = solved(size);
  const clues = flat.slice();
  clues[flat.length - 1] = 0;
  clues[flat.length - 2] = 0;
  const values = clues.slice();
  values[flat.length - 2] = flat[flat.length - 2] ?? 0;
  const rows = (cells: number[]) =>
    Array.from({ length: size }, (_, row) => cells.slice(row * size, row * size + size));
  const notes = Array<number>(flat.length).fill(0);
  notes[flat.length - 1] = 1 << 1;
  return {
    difficulty,
    bankId: null,
    puzzle: {
      givens: rows(clues),
      solution: rows(flat),
      maxTechnique: "",
      unique: true,
    },
    values,
    notes,
    clues,
    givens: clues.map((value) => value !== 0),
    solution: flat,
    undo: [],
    selectedDigit: 1,
    selectedCell: flat.length - 1,
    pencilMode: true,
    hintStep: 0,
    hintIndexes: [],
    hintTechnique: null,
    hintAction: null,
    hintNote: null,
    candidateNote: null,
    checkNote: null,
    wrongMarks: null,
  };
}
