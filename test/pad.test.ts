import assert from "node:assert/strict";
import test from "node:test";
import { padKeys, padMarkup } from "../src/app.ts";
import { createBoard } from "../src/board-input.ts";

const SOLUTION = [
  6, 5, 4, 3, 1, 2, 9, 8, 7, 7, 8, 9, 5, 4, 6, 1, 3, 2, 3, 2, 1, 8, 9, 7, 5, 6, 4, 8, 4, 7, 6, 5, 3, 2, 1, 9, 2, 9,
  3, 7, 8, 1, 6, 4, 5, 5, 1, 6, 9, 2, 4, 3, 7, 8, 4, 6, 2, 1, 7, 5, 8, 9, 3, 9, 3, 5, 4, 6, 8, 7, 2, 1, 1, 7, 8, 2,
  3, 9, 4, 5, 6,
];

test("pad markup stays 1 through 9 when 1, 2, and 4 are finished", () => {
  const board = createBoard(SOLUTION, SOLUTION);
  const finished = new Set([1, 2, 4]);
  for (let index = 0; index < board.values.length; index++) {
    if (!finished.has(board.values[index] ?? 0)) board.values[index] = 0;
  }

  const keys = padKeys(board, false);
  assert.deepEqual(
    keys.map((key) => key.digit),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.deepEqual(
    keys.filter((key) => key.done).map((key) => key.digit),
    [1, 2, 4],
  );
  assert.deepEqual(
    keys.filter((key) => key.remain === 0).map((key) => key.digit),
    [1, 2, 4],
  );
  for (const key of keys) {
    if (finished.has(key.digit)) {
      assert.equal(key.disabled, true);
      assert.equal(key.armed, false);
    } else {
      assert.equal(key.done, false);
      assert.equal(key.disabled, false);
      assert.ok(key.remain > 0);
    }
  }

  const html = padMarkup(board, false);
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((match) => match[0]);
  assert.deepEqual(
    buttons.map((button) => Number(button.match(/data-digit="(\d)"/)?.[1])),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  for (const button of buttons) {
    const digit = Number(button.match(/data-digit="(\d)"/)?.[1]);
    const className = button.match(/class="([^"]*)"/)?.[1];
    if (finished.has(digit)) {
      assert.equal(className, "pad-key done");
      assert.match(button, /data-remaining="0"/);
      assert.match(button, /data-done="true"/);
      assert.match(button, /\sdisabled(?:\s|>)/);
    } else {
      assert.equal(className, "pad-key");
      assert.match(button, /data-done="false"/);
      assert.doesNotMatch(button, /data-remaining="0"/);
      assert.doesNotMatch(button, /\sdisabled(?:\s|>)/);
    }
  }
});

test("a full board still renders pad keys in digit order", () => {
  const board = createBoard(SOLUTION, SOLUTION);
  const keys = padKeys(board, true);
  assert.deepEqual(
    keys.map((key) => [key.digit, key.remain, key.done, key.disabled]),
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => [digit, 0, true, true]),
  );
});
