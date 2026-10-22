import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DISCARD_START_GUARD_MS,
  DISCARD_START_GUARD_RADIUS,
  continueSavedGame,
  discardSavedGame,
  guardStartAfterDiscard,
  phaseFromStorage,
  playFromSnapshot,
  playHtml,
  rememberPlay,
  resumePromptHtml,
  sameSpotStart,
  snapshotFromPlay,
  type Play,
} from "../src/app.ts";
import {
  IN_PROGRESS_DEBOUNCE_MS,
  IN_PROGRESS_KEY,
  createProgressWriter,
  readInProgress,
  writeInProgress,
  type GameSnapshot,
  type ProgressStorage,
} from "../src/persist.ts";

const appSource = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const persistSource = readFileSync(new URL("../src/persist.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

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
  return Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, col) => fill(row * 9 + col)));
}

function sampleSnapshot(): GameSnapshot {
  const solution = grid((index) => (index % 9) + 1);
  const givens = grid((index) => (index % 5 === 0 ? solution[Math.floor(index / 9)][index % 9] : 0));
  const clues = givens.flat();
  const values = clues.slice();
  values[1] = 6;
  const notes = Array<number>(81).fill(0);
  notes[2] = (1 << 3) | (1 << 8);
  return {
    difficulty: "中級",
    bankId: "bank-swordfish-4",
    puzzle: { givens, solution, maxTechnique: "Swordfish", unique: true },
    values,
    notes,
    clues,
    givens: clues.map((value) => value !== 0),
    solution: solution.flat(),
    undo: [{ cells: [{ index: 1, value: 0, notes: 1 << 6 }] }],
    selectedDigit: 6,
    selectedCell: 1,
    pencilMode: true,
    hintStep: 2,
    hintIndexes: [1, 4, 7],
    hintTechnique: "obvious_singles",
    hintAction: { kind: "fill", value: 6, evidence: [4, 7], unit: null },
    hintNote: "這一格可用〔Obvious Singles〕。",
    candidateNote: null,
    checkNote: "未發現錯填。",
    wrongMarks: [1],
  };
}

function clock() {
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
      const due = timers.filter((timer) => timer.at <= now);
      for (const timer of due) {
        const index = timers.indexOf(timer);
        if (index < 0) continue;
        timers.splice(index, 1);
        timer.fn();
      }
    },
  };
}

test("resume prompt uses the locked copy on the top-bar confirm, not a page modal", () => {
  assert.equal(resumePromptHtml().includes("有未完成的一局。要繼續定開新局？"), true);
  const html = resumePromptHtml();
  assert.match(html, /class="confirm"/);
  assert.match(html, /role="alertdialog" aria-label="續局"/);
  assert.match(html, /class="primary" data-action="resume-keep">繼續上一局</);
  assert.match(html, /data-action="resume-drop">開新局</);
  for (const banned of ["Continue", "New", "Save", "Resume", "還原", "讀檔", "儲存", "確定"]) {
    assert.equal(html.includes(banned), false, banned);
  }

  const play = playFromSnapshot(sampleSnapshot());
  const resume = playHtml(play, true);
  const top = resume.slice(resume.indexOf('class="top-actions"'), resume.indexOf('class="play-main"'));
  assert.match(top, /data-action="restart">重開/);
  assert.match(top, /data-action="new">新局/);
  assert.match(top, /data-action="back">返回/);
  assert.ok(top.indexOf("有未完成的一局。要繼續定開新局？") > top.indexOf("返回"));
  assert.match(top, /aria-label="續局"/);
  assert.match(resume, /data-resume="true"/);
  assert.match(resume, /data-index="1"[^>]*>6</);
  assert.match(resume, /data-difficulty="中級"/);
  assert.match(resume, /Obvious Singles/);
  assert.equal(resume.slice(resume.indexOf('class="play-rail"')).includes("有未完成的一局"), false);
  assert.equal(resume.includes("position: fixed"), false);

  play.confirm = "new";
  const dirty = playHtml(play, false);
  assert.match(dirty, /開新局並放棄這一題？/);
  assert.match(dirty, /data-action="confirm-yes">確定<\/button>/);
  assert.match(dirty, /data-action="confirm-no">繼續<\/button>/);
  assert.equal(dirty.includes("有未完成的一局"), false);
  assert.equal(dirty.includes('aria-label="續局"'), false);
});

test("continue restores the same unfinished game and new game clears the slot", () => {
  const storage = memory();
  const snapshot = sampleSnapshot();
  writeInProgress(storage, snapshot);

  const booted = phaseFromStorage(storage);
  assert.equal(booted.kind, "resume");
  if (booted.kind !== "resume") return;
  assert.equal(booted.play.complete, false);
  assert.equal(booted.play.confirm, null);
  assert.deepEqual(snapshotFromPlay(booted.play), snapshot);

  const raw = storage.getItem(IN_PROGRESS_KEY);
  const continued = continueSavedGame(booted);
  assert.equal(continued.kind, "play");
  if (continued.kind !== "play") return;
  assert.equal(continued.play, booted.play);
  assert.deepEqual(continued.play.values, snapshot.values);
  assert.deepEqual(continued.play.notes, snapshot.notes);
  assert.deepEqual(continued.play.undo, snapshot.undo);
  assert.equal(continued.play.difficulty, "中級");
  assert.equal(continued.play.bankId, "bank-swordfish-4");
  assert.equal(continued.play.puzzle.maxTechnique, "Swordfish");
  assert.equal(continued.play.hintStep, 2);
  assert.equal(continued.play.hintTechnique, "obvious_singles");
  assert.deepEqual(continued.play.hintAction, snapshot.hintAction);
  assert.deepEqual(continued.play.wrongMarks, [1]);
  assert.equal(continued.play.checkNote, "未發現錯填。");
  assert.equal(storage.getItem(IN_PROGRESS_KEY), raw);

  const writer = createProgressWriter(() => storage, IN_PROGRESS_DEBOUNCE_MS, clock());
  const home = discardSavedGame(writer);
  assert.equal(home.kind, "home");
  assert.equal(readInProgress(storage), null);
  assert.equal(phaseFromStorage(storage).kind, "home");
});

test("a second click on the same spot as 開新局 does not start the difficulty now underneath", () => {
  const now = 10_000;
  const guard = guardStartAfterDiscard(now, 876, 184);
  assert.equal(guard.until - now, DISCARD_START_GUARD_MS);
  assert.equal(sameSpotStart(guard, now + 40, 876, 184), true);
  assert.equal(sameSpotStart(guard, now + 300, 880, 190), true);
  assert.equal(sameSpotStart(guard, now + DISCARD_START_GUARD_MS, 876, 184), false);
  assert.equal(sameSpotStart(guard, now + 50, 876, 184 + DISCARD_START_GUARD_RADIUS + 8), false);
  assert.equal(sameSpotStart(null, now + 50, 876, 184), false);

  const resume = appSource.slice(appSource.indexOf('if (phase.kind === "resume")'), appSource.indexOf('if (action === "start")'));
  assert.match(resume, /discardSavedGame\(progress\)/);
  assert.match(resume, /guardStartAfterDiscard\(Date\.now\(\), event\.clientX, event\.clientY\)/);
  const start = appSource.slice(appSource.indexOf('if (action === "start")'), appSource.indexOf('if (action === "retry")'));
  assert.match(start, /sameSpotStart\(startGuard, Date\.now\(\), event\.clientX, event\.clientY\)/);
  assert.equal(start.includes("startGame"), true);
});

test("a finished or unreadable save does not prompt, and a new deal replaces the old one", () => {
  const storage = memory();
  storage.setItem(IN_PROGRESS_KEY, "{");
  assert.equal(phaseFromStorage(storage).kind, "home");
  assert.equal(storage.getItem(IN_PROGRESS_KEY), null);

  const finished = sampleSnapshot();
  finished.values = finished.solution.slice();
  storage.setItem(IN_PROGRESS_KEY, JSON.stringify({ version: 1, payload: finished }));
  assert.equal(phaseFromStorage(storage).kind, "home");
  assert.equal(storage.getItem(IN_PROGRESS_KEY), null);

  const writer = createProgressWriter(() => storage, IN_PROGRESS_DEBOUNCE_MS, clock());
  const current = playFromSnapshot(sampleSnapshot());
  rememberPlay(writer, current);
  writer.flush();
  assert.equal(readInProgress(storage)?.values[1], 6);

  current.values = current.solution.slice();
  current.complete = true;
  rememberPlay(writer, current);
  assert.equal(readInProgress(storage), null);

  const restarted = playFromSnapshot(sampleSnapshot());
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
  rememberPlay(writer, restarted);
  writer.flush();
  const savedRestart = readInProgress(storage);
  assert.deepEqual(savedRestart?.values, restarted.clues);
  assert.deepEqual(savedRestart?.undo, []);
  assert.equal(savedRestart?.puzzle.maxTechnique, "Swordfish");
  assert.equal(savedRestart?.bankId, "bank-swordfish-4");

  writer.clear();
  const replacement = playFromSnapshot(sampleSnapshot());
  replacement.difficulty = "專家";
  replacement.bankId = "other-bank";
  replacement.values = replacement.clues.slice();
  replacement.values[2] = 3;
  rememberPlay(writer, replacement);
  writer.flush();
  const savedNext = readInProgress(storage);
  assert.equal(savedNext?.difficulty, "專家");
  assert.equal(savedNext?.bankId, "other-bank");
  assert.equal(savedNext?.values[1], 0);
  assert.equal(savedNext?.values[2], 3);
});

test("reload gate is wired to localStorage without disturbing dirty confirms or technique names", () => {
  assert.equal(appSource.includes("sessionStorage"), false);
  assert.equal(persistSource.includes("sessionStorage"), false);
  assert.match(appSource, /localStorage/);
  assert.match(persistSource, /mysudok\.inProgress/);

  assert.match(appSource, /phase = phaseFromStorage\(browserProgressStorage\(\)\)/);
  assert.match(appSource, /pagehide[\s\S]*progress\.flush\(\)/);
  assert.match(appSource, /visibilityState === "hidden"[\s\S]*progress\.flush\(\)/);

  const resume = appSource.slice(appSource.indexOf('if (phase.kind === "resume")'), appSource.indexOf('if (action === "start")'));
  assert.ok(resume.length > 0);
  assert.match(resume, /continueSavedGame\(phase\)/);
  assert.match(resume, /discardSavedGame\(progress\)/);
  assert.equal(resume.includes("startGame"), false);
  assert.equal(resume.includes("redraw"), false);

  const start = appSource.slice(appSource.indexOf("async function startGame"), appSource.indexOf("function redraw"));
  assert.match(start, /progress\.clear\(\)/);
  assert.match(start, /progress\.flush\(\)/);

  const leave = appSource.slice(appSource.indexOf("function leavePlay"), appSource.indexOf("function dirty"));
  assert.equal(leave.includes("progress.clear"), false);
  assert.equal(leave.includes("discardSavedGame"), false);

  const restart = appSource.slice(appSource.indexOf('if (action === "restart")'), appSource.indexOf('if (action === "confirm-no")'));
  assert.match(restart, /applyRestart\(phase\.play\)/);
  assert.equal(restart.includes("progress.clear"), false);
  assert.equal(restart.includes("discardSavedGame"), false);

  const accept = appSource.slice(
    appSource.indexOf('if (action === "confirm-yes")'),
    appSource.indexOf('if (phase.kind !== "play" || phase.play.confirm)'),
  );
  assert.match(accept, /choice === "back"/);
  assert.match(accept, /choice === "new"/);
  assert.match(accept, /choice === "restart"/);
  assert.match(accept, /leavePlay\(\)/);
  assert.match(accept, /redraw\(play\)/);
  assert.match(accept, /applyRestart\(phase\.play\)/);
  assert.equal(accept.includes("discardSavedGame"), false);

  assert.match(appSource, /playHtml\(phase\.play, true\)/);
  assert.match(appSource, /rememberPlay\(progress, phase\.play\)/);
  assert.match(appSource, /role="alertdialog" aria-label="確認"/);
  assert.match(appSource, /data-action="confirm-yes">確定<\/button>/);
  assert.match(appSource, /data-action="confirm-no">繼續<\/button>/);
  assert.match(appSource, /<span class="tech-name">\$\{name\}<\/span>/);

  assert.match(css, /\.top-actions > \.confirm\s*\{/);
  assert.match(css, /\.confirm button\.primary\s*\{[^}]*background:\s*var\(--ink\)/);
  assert.equal(css.includes("position: fixed"), false);
  assert.equal(css.includes(".play-rail > .confirm"), false);
});

test("play snapshot keeps selection, hints, and undo independent from later edits", () => {
  const play = playFromSnapshot(sampleSnapshot());
  const shot = snapshotFromPlay(play);
  play.values[1] = 1;
  play.undo.push({ cells: [{ index: 1, value: 6, notes: 0 }] });
  play.hintNote = "changed";
  assert.equal(shot.values[1], 6);
  assert.equal(shot.undo.length, 1);
  assert.equal(shot.hintNote, "這一格可用〔Obvious Singles〕。");
  const restored = playFromSnapshot(shot);
  assert.equal(restored.menuOpen, false);
  assert.equal(restored.complete, false);
  assert.equal(restored.confirm, null);
  assert.deepEqual(snapshotFromPlay(restored), shot);
  const typed: Play = restored;
  assert.equal(typed.pencilMode, true);
});
