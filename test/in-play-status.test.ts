import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { padMarkup, playTopCopyMarkup } from "../src/app.ts";
import { createBoard } from "../src/board-input.ts";

const appSource = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");

test("U1 in-play top copy is blank", () => {
  for (const difficulty of ["初級", "中級", "高級", "專家"] as const) {
    const html = playTopCopyMarkup(false, difficulty, "Pointing Pairs", 42);
    assert.equal(html, "");
    assert.equal(html.includes(difficulty), false);
    assert.equal(html.includes("最高技巧"), false);
    assert.equal(html.includes("Pointing Pairs"), false);
    assert.equal(html.includes("仲剩"), false);
  }
});

test("U5 completed top copy stays empty and the result card has no max technique", () => {
  const html = playTopCopyMarkup(true, "高級", "Pointing Pairs", 0);
  assert.equal(html, "");
  assert.equal(html.includes("高級"), false);
  assert.equal(html.includes("最高技巧"), false);
  assert.equal(html.includes("Pointing Pairs"), false);
  assert.equal(html.includes("仲剩"), false);
  assert.equal(html.includes("完成"), false);

  const header = appSource.slice(appSource.indexOf('<header class="top">'), appSource.indexOf("</header>"));
  assert.match(header, /playTopCopyMarkup\(/);
  assert.equal(header.includes("最高技巧"), false);
  assert.equal(header.includes("仲剩"), false);
  assert.equal(header.includes(">完成<"), false);
  const done = appSource.slice(appSource.indexOf('class="done"'), appSource.indexOf("再來一題"));
  assert.match(done, /id="done-title">完成</);
  assert.equal(done.includes("ceiling-kicker"), false);
  assert.equal(done.includes("done-technique"), false);
  assert.equal(done.includes("最高技巧"), false);
  assert.equal(done.includes("${"), false);
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
