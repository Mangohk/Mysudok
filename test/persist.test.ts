import assert from "node:assert/strict";
import test from "node:test";
import type { UndoStep } from "../src/board-input.ts";
import type { HintAction } from "../src/engine/hint.ts";
import {
  IN_PROGRESS_DEBOUNCE_MS,
  IN_PROGRESS_KEY,
  IN_PROGRESS_VERSION,
  clearInProgress,
  createProgressWriter,
  parseInProgress,
  readInProgress,
  writeInProgress,
  type GameSnapshot,
  type ProgressStorage,
} from "../src/persist.ts";

function memory(): ProgressStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function grid(fill: (index: number) => number): number[][] {
  return Array.from({ length: 9 }, (_, row) =>
    Array.from({ length: 9 }, (_, col) => fill(row * 9 + col)),
  );
}

function sampleSnapshot(): GameSnapshot {
  const solution = grid((index) => (index % 9) + 1);
  const givens = grid((index) => (index % 4 === 0 ? solution[Math.floor(index / 9)][index % 9] : 0));
  const clues = givens.flat();
  const values = clues.slice();
  values[1] = 4;
  values[3] = 7;
  const notes = Array<number>(81).fill(0);
  notes[2] = (1 << 2) | (1 << 5);
  notes[5] = 1 << 9;
  const undo: UndoStep[] = [
    { cells: [{ index: 1, value: 0, notes: 0 }] },
    {
      cells: [
        { index: 3, value: 0, notes: 1 << 7 },
        { index: 2, value: 0, notes: 0 },
      ],
    },
  ];
  const hintAction: HintAction = {
    kind: "fill",
    value: 4,
    evidence: [1, 10, 19],
    unit: "row",
  };
  return {
    difficulty: "高級",
    bankId: "expert-y-wing-17",
    puzzle: {
      givens,
      solution,
      maxTechnique: "X-Wing",
      unique: true,
    },
    values,
    notes,
    clues,
    givens: clues.map((value) => value !== 0),
    solution: solution.flat(),
    undo,
    selectedDigit: 4,
    selectedCell: 3,
    pencilMode: true,
    hintStep: 2,
    hintIndexes: [1, 10, 19, 1],
    hintTechnique: "last_remaining_cell",
    hintAction,
    hintNote: "這一格可用〔Last Remaining Cell〕：〔呢行仲有空位〕。",
    candidateNote: "已填合法候選 · 可上一步",
    checkNote: "已標 〔2〕 格唔啱 · 改完可繼續。",
    wrongMarks: [3, 8],
  };
}

function roundTrip(snapshot: GameSnapshot = sampleSnapshot()): GameSnapshot | null {
  const storage = memory();
  writeInProgress(storage, snapshot);
  return readInProgress(storage);
}

test("a meaningful in-progress game round-trips through versioned localStorage payload", () => {
  const storage = memory();
  const snapshot = sampleSnapshot();
  writeInProgress(storage, snapshot);

  const raw = storage.getItem(IN_PROGRESS_KEY);
  assert.equal(typeof raw, "string");
  const saved = JSON.parse(raw!) as { version: unknown; payload: GameSnapshot };
  assert.equal(saved.version, IN_PROGRESS_VERSION);
  assert.equal(saved.version, 1);
  assert.equal(Object.keys(saved).includes("payload"), true);

  const loaded = readInProgress(storage);
  assert.ok(loaded);
  assert.deepEqual(loaded, snapshot);
  assert.notEqual(loaded.values, snapshot.values);
  assert.notEqual(loaded.undo, snapshot.undo);
  assert.notEqual(loaded.hintAction, snapshot.hintAction);
  assert.equal(loaded.puzzle.maxTechnique, "X-Wing");
  assert.equal(loaded.bankId, "expert-y-wing-17");
  assert.equal(loaded.hintNote?.includes("Last Remaining Cell"), true);
  assert.deepEqual(loaded.wrongMarks, [3, 8]);
  assert.equal(loaded.pencilMode, true);
  assert.equal(loaded.selectedDigit, 4);
  assert.equal(loaded.selectedCell, 3);

  loaded.values[1] = 9;
  const again = readInProgress(storage);
  assert.equal(again?.values[1], snapshot.values[1]);
});

test("clear notes, a null bank id, and an idle hint still count as one unfinished game", () => {
  const snapshot = sampleSnapshot();
  snapshot.bankId = null;
  snapshot.hintStep = 0;
  snapshot.hintIndexes = [];
  snapshot.hintTechnique = null;
  snapshot.hintAction = null;
  snapshot.hintNote = "解唔落。";
  snapshot.candidateNote = null;
  snapshot.checkNote = null;
  snapshot.wrongMarks = null;
  snapshot.selectedDigit = null;
  snapshot.selectedCell = null;
  snapshot.pencilMode = false;
  snapshot.undo = [];
  snapshot.notes = Array(81).fill(0);
  snapshot.values = snapshot.clues.slice();
  assert.deepEqual(roundTrip(snapshot), snapshot);
});

test("a clear-note hint action and the notes hint action round-trip", () => {
  const clearAction: HintAction = {
    kind: "clear",
    digits: [4, 7],
    indexes: [8, 17],
    keep: [2, 3],
    unit: "box",
  };
  const clearing = sampleSnapshot();
  clearing.hintAction = clearAction;
  clearing.hintTechnique = "x_wing";
  clearing.hintStep = 3;
  assert.deepEqual(roundTrip(clearing)?.hintAction, clearAction);

  const notes = sampleSnapshot();
  notes.hintAction = { kind: "notes" };
  notes.hintTechnique = "notes";
  notes.hintStep = 1;
  notes.hintIndexes = [];
  assert.deepEqual(roundTrip(notes)?.hintAction, { kind: "notes" });
});

test("bad, unknown, and finished saves are dropped instead of restored", () => {
  const storage = memory();
  const cases: unknown[] = [
    "not-json",
    "",
    "null",
    "[]",
    "1",
    {},
    { version: 2, payload: sampleSnapshot() },
    { version: "1", payload: sampleSnapshot() },
    { version: 1 },
    { version: 1, payload: null },
    { payload: sampleSnapshot() },
  ];

  for (const value of cases) {
    storage.setItem(IN_PROGRESS_KEY, typeof value === "string" ? value : JSON.stringify(value));
    assert.equal(readInProgress(storage), null, `kept ${JSON.stringify(value).slice(0, 80)}`);
    assert.equal(storage.getItem(IN_PROGRESS_KEY), null);
  }

  const broken = (edit: (snapshot: GameSnapshot) => void) => {
    const snapshot = sampleSnapshot();
    edit(snapshot);
    return snapshot;
  };
  const rejects: GameSnapshot[] = [
    broken((snapshot) => {
      snapshot.values = snapshot.solution.slice();
    }),
    broken((snapshot) => {
      snapshot.values = snapshot.values.slice(0, 80);
    }),
    broken((snapshot) => {
      snapshot.values[1] = 10;
    }),
    broken((snapshot) => {
      snapshot.notes[2] = -1;
    }),
    broken((snapshot) => {
      snapshot.givens[0] = false;
    }),
    broken((snapshot) => {
      snapshot.values[0] = 0;
    }),
    broken((snapshot) => {
      snapshot.clues[1] = 3;
    }),
    broken((snapshot) => {
      snapshot.puzzle.givens[0][0] = 0;
    }),
    broken((snapshot) => {
      snapshot.puzzle.solution[0][1] = 9;
    }),
    broken((snapshot) => {
      snapshot.puzzle.unique = false as true;
    }),
    broken((snapshot) => {
      snapshot.puzzle.maxTechnique = "";
    }),
    broken((snapshot) => {
      snapshot.difficulty = "easy" as GameSnapshot["difficulty"];
    }),
    broken((snapshot) => {
      snapshot.bankId = 4 as unknown as string;
    }),
    broken((snapshot) => {
      snapshot.hintStep = 5 as GameSnapshot["hintStep"];
    }),
    broken((snapshot) => {
      snapshot.hintAction = { kind: "fill", value: 0, evidence: [], unit: null };
    }),
    broken((snapshot) => {
      snapshot.hintAction = { kind: "other" } as unknown as HintAction;
    }),
    broken((snapshot) => {
      snapshot.undo = [{ cells: [{ index: 81, value: 0, notes: 0 }] }];
    }),
    broken((snapshot) => {
      snapshot.selectedDigit = 0;
    }),
    broken((snapshot) => {
      snapshot.selectedCell = 81;
    }),
    broken((snapshot) => {
      snapshot.wrongMarks = [81];
    }),
    broken((snapshot) => {
      delete (snapshot as { checkNote?: unknown }).checkNote;
    }),
  ];

  for (const snapshot of rejects) {
    storage.setItem(IN_PROGRESS_KEY, JSON.stringify({ version: 1, payload: snapshot }));
    assert.equal(parseInProgress(storage.getItem(IN_PROGRESS_KEY)!), null);
    assert.equal(readInProgress(storage), null);
    assert.equal(storage.getItem(IN_PROGRESS_KEY), null);
  }
});

test("storage failures and clear leave no in-progress game", () => {
  const throwing: ProgressStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readInProgress(throwing), null);
  assert.doesNotThrow(() => writeInProgress(throwing, sampleSnapshot()));
  assert.doesNotThrow(() => clearInProgress(throwing));

  const storage = memory();
  writeInProgress(storage, sampleSnapshot());
  clearInProgress(storage);
  assert.equal(storage.getItem(IN_PROGRESS_KEY), null);
  assert.equal(readInProgress(storage), null);
});

test("debounced saves keep the latest unfinished snapshot and clear cancels a pending write", () => {
  const storage = memory();
  const clock = manualClock();
  const writer = createProgressWriter(() => storage, IN_PROGRESS_DEBOUNCE_MS, clock);
  const first = sampleSnapshot();
  const second = sampleSnapshot();
  second.values = first.values.slice();
  second.values[1] = 8;
  second.notes = first.notes.slice();
  second.notes[6] = 1 << 3;

  writer.save(first);
  assert.equal(storage.getItem(IN_PROGRESS_KEY), null);
  clock.tick(IN_PROGRESS_DEBOUNCE_MS - 1);
  writer.save(second);
  clock.tick(IN_PROGRESS_DEBOUNCE_MS - 1);
  assert.equal(storage.getItem(IN_PROGRESS_KEY), null);
  clock.tick(1);
  assert.equal(readInProgress(storage)?.values[1], 8);
  assert.equal(readInProgress(storage)?.notes[6], 1 << 3);

  const restarted = sampleSnapshot();
  restarted.values = restarted.clues.slice();
  restarted.notes = Array(81).fill(0);
  restarted.undo = [];
  restarted.hintStep = 0;
  restarted.hintIndexes = [];
  restarted.hintTechnique = null;
  restarted.hintAction = null;
  restarted.hintNote = null;
  restarted.candidateNote = null;
  restarted.checkNote = null;
  restarted.wrongMarks = null;
  restarted.selectedDigit = null;
  restarted.selectedCell = null;
  restarted.pencilMode = false;
  writer.save(restarted);
  writer.flush();
  const loaded = readInProgress(storage);
  assert.deepEqual(loaded?.values, restarted.clues);
  assert.deepEqual(loaded?.undo, []);
  assert.equal(loaded?.puzzle.maxTechnique, "X-Wing");
  assert.deepEqual(loaded?.puzzle.givens, restarted.puzzle.givens);

  writer.save(second);
  writer.clear();
  clock.tick(IN_PROGRESS_DEBOUNCE_MS + 50);
  assert.equal(storage.getItem(IN_PROGRESS_KEY), null);
});

function manualClock() {
  let now = 0;
  let nextId = 1;
  const timers: { id: number; at: number; fn: () => void }[] = [];
  return {
    setTimeout(fn: () => void, ms: number) {
      const id = nextId++;
      timers.push({ id, at: now + ms, fn });
      return id;
    },
    clearTimeout(handle: unknown) {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index >= 0) timers.splice(index, 1);
    },
    tick(ms: number) {
      now += ms;
      const due = timers.filter((timer) => timer.at <= now).sort((a, b) => a.at - b.at || a.id - b.id);
      for (const timer of due) {
        const index = timers.indexOf(timer);
        if (index < 0) continue;
        timers.splice(index, 1);
        timer.fn();
      }
    },
  };
}
