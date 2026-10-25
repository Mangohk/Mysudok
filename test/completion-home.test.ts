import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyRestart,
  beginHomeCompletionLoad,
  homeCompletionLoadIsCurrent,
  homeHtml,
  playFromSnapshot,
  playHtml,
  snapshotFromPlay,
  syncComplete,
} from "../src/app.ts";
import type { GameSnapshot } from "../src/persist.ts";

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const clientSource = [
  readFileSync(new URL("../src/completion-api.ts", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app.ts", import.meta.url), "utf8"),
].join("\n");

function tinySnapshot(): GameSnapshot {
  const row = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const grid = Array.from({ length: 9 }, () => row.slice());
  const givens = grid.map((line) => line.map((value, index) => (index === 0 ? 0 : value)));
  const values = givens.flat();
  return {
    difficulty: "初級",
    bankId: null,
    puzzle: { givens, solution: grid, maxTechnique: "last_free_cell", unique: true },
    values,
    notes: Array(81).fill(0),
    clues: givens.flat(),
    givens: givens.flat().map((value) => value !== 0),
    solution: grid.flat(),
    undo: [],
    selectedDigit: null,
    selectedCell: null,
    pencilMode: false,
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

test("U1 home count sits under the six difficulties and above the credit", () => {
  const html = homeHtml(12);
  const choices = html.indexOf('<div class="choices">');
  const count = html.indexOf('class="completion-count"');
  const credit = html.indexOf('class="credit"');
  assert.ok(choices >= 0 && count > choices && credit > count);
  assert.match(html, /已完成 12 局/);
  assert.equal((html.match(/class="completion-count"/g) ?? []).length, 1);
  assert.equal((html.match(/data-action="start"/g) ?? []).length, 6);
  assert.equal(html.includes("共"), false);
  assert.equal(html.includes("合計"), false);
  assert.equal(html.includes("全站"), false);
  assert.match(homeHtml(null), /已完成 — 局/);
  assert.match(homeHtml(), /已完成 — 局/);
  assert.match(homeHtml(0), /已完成 0 局/);

  const rule = css.match(/\.completion-count\s*\{([^}]*)\}/);
  assert.ok(rule);
  assert.match(rule[1] ?? "", /color:\s*var\(--muted\)/);
  assert.match(rule[1] ?? "", /font-size:\s*0\.8rem/);
  assert.match(css, /\.credit\s*\{[^}]*font-size:\s*0\.85rem/);
});

test("U1 the count line is not on the board or the done overlay", () => {
  const play = playFromSnapshot(tinySnapshot());
  play.complete = true;
  const html = playHtml(play);
  assert.equal(html.includes("completion-count"), false);
  assert.equal(html.includes("已完成"), false);
  assert.match(html, /id="done-title">完成</);
});

test("A2 A4 solving posts once per deal and restart or an unfinished board does not", () => {
  const play = playFromSnapshot(tinySnapshot());
  play.values = play.solution.slice();
  const posts: string[] = [];
  syncComplete(play, (playId) => posts.push(playId));
  assert.equal(play.complete, true);
  assert.deepEqual(posts, [play.playId]);
  syncComplete(play, (playId) => posts.push(playId));
  assert.deepEqual(posts, [play.playId]);

  applyRestart(play);
  assert.equal(play.complete, false);
  assert.equal(play.completionPosted, true);
  play.values = play.solution.slice();
  syncComplete(play, (playId) => posts.push(playId));
  assert.deepEqual(posts, [play.playId]);

  const unfinished = playFromSnapshot(tinySnapshot());
  const quiet: string[] = [];
  syncComplete(unfinished, (playId) => quiet.push(playId));
  applyRestart(unfinished);
  syncComplete(unfinished, (playId) => quiet.push(playId));
  assert.deepEqual(quiet, []);
  assert.equal(unfinished.complete, false);
});

test("completion identity is not part of the saved game", () => {
  const play = playFromSnapshot(tinySnapshot());
  assert.match(play.playId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(play.completionPosted, false);
  const shot = snapshotFromPlay(play);
  assert.equal(Object.hasOwn(shot, "playId"), false);
  assert.equal(Object.hasOwn(shot, "completionPosted"), false);
  assert.equal(JSON.stringify(shot).includes(play.playId), false);
  const restored = playFromSnapshot(shot);
  assert.notEqual(restored.playId, play.playId);
  assert.equal(restored.completionPosted, false);
  assert.deepEqual(snapshotFromPlay(restored), shot);
});

test("a newer home visit ignores a stale count response", () => {
  const first = beginHomeCompletionLoad();
  const second = beginHomeCompletionLoad();
  assert.equal(homeCompletionLoadIsCurrent(first, "home"), false);
  assert.equal(homeCompletionLoadIsCurrent(second, "home"), true);
  assert.equal(homeCompletionLoadIsCurrent(second, "play"), false);
  assert.equal(homeCompletionLoadIsCurrent(second, "loading"), false);
});

test("frontend source has no hardcoded Worker host or Cloudflare token", () => {
  assert.equal(clientSource.includes("workers.dev"), false);
  assert.equal(clientSource.includes("CLOUDFLARE_API_TOKEN"), false);
  assert.equal(clientSource.includes("CLOUDFLARE_ACCOUNT_ID"), false);
  assert.match(clientSource, /VITE_COMPLETION_API_URL/);
  assert.match(clientSource, /Idempotency-Key/);
});
