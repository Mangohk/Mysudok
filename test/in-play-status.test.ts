import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CEILING_LABEL, padMarkup, playTopCopyMarkup } from "../src/app.ts";
import { createBoard } from "../src/board-input.ts";

const appSource = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");

test("U1 in-play top copy is blank", () => {
  for (const difficulty of ["初級", "中級", "高級", "專家"] as const) {
    const html = playTopCopyMarkup(false, difficulty, "Pointing Pairs", 42);
    assert.equal(html, "");
    assert.equal(html.includes(difficulty), false);
    assert.equal(html.includes(CEILING_LABEL), false);
    assert.equal(html.includes("Pointing Pairs"), false);
    assert.equal(html.includes("仲剩"), false);
  }
});

test("U5 completed top copy and result card still name the max technique", () => {
  const html = playTopCopyMarkup(true, "高級", "Pointing Pairs", 0);
  assert.match(html, /class="eyebrow"/);
  assert.match(html, /data-difficulty="高級"/);
  assert.match(html, />高級</);
  assert.match(html, /class="ceiling-kicker"/);
  assert.match(html, new RegExp(CEILING_LABEL));
  assert.match(html, /<h1>Pointing Pairs<\/h1>/);
  assert.match(html, /仲剩 0 格/);

  const header = appSource.slice(appSource.indexOf('<header class="top">'), appSource.indexOf("</header>"));
  assert.match(header, /playTopCopyMarkup\(/);
  const done = appSource.slice(appSource.indexOf('class="done"'), appSource.indexOf("再來一題"));
  assert.match(done, /class="ceiling-kicker"/);
  assert.match(done, /CEILING_LABEL/);
  assert.match(done, /class="done-technique"/);
  assert.match(done, /\$\{esc\(label\)\}/);
});

test("U2 U3 top actions stay 重開｜新局｜返回 with confirm underneath", () => {
  const header = appSource.slice(appSource.indexOf('<header class="top">'), appSource.indexOf("</header>"));
  const restartAt = header.indexOf('data-action="restart"');
  const newAt = header.indexOf('data-action="new"');
  const backAt = header.indexOf('data-action="back"');
  assert.ok(restartAt >= 0 && restartAt < newAt && newAt < backAt);
  assert.match(header, /data-action="restart">重開</);
  assert.match(header, /data-action="new">新局</);
  assert.match(header, /data-action="back">返回</);
  assert.ok(header.indexOf("${confirm}") > backAt);
  assert.equal(header.includes('class="play-rail"'), false);
});

test("U4 digit pad remainders stay on every key", () => {
  const board = createBoard([1], [1]);
  board.values = Array.from({ length: 81 }, () => 0);
  const html = padMarkup(board, false);
  const remains = [...html.matchAll(/class="pad-remain">(\d+)</g)].map((match) => Number(match[1]));
  assert.deepEqual(remains, [9, 9, 9, 9, 9, 9, 9, 9, 9]);
  assert.match(html, /aria-label="數字 1，剩餘 9"/);
});
