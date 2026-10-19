import assert from "node:assert/strict";
import test from "node:test";
import { CEILING_LABEL, DIGIT_FIRST_COACH, HOME_BLURB, playStatusMarkup } from "../src/app.ts";

test("home blurb names the three beginner techniques, including 唯一數字", () => {
  assert.match(HOME_BLURB.初級, /最後一格/);
  assert.match(HOME_BLURB.初級, /剩餘格/);
  assert.match(HOME_BLURB.初級, /唯一數字/);
});

test("completed games drop the digit-first coach and keep 最高技巧 apart from hint copy", () => {
  assert.equal(DIGIT_FIRST_COACH, "先點數字，再點格子。");
  assert.equal(CEILING_LABEL, "最高技巧");
  const playing = playStatusMarkup(false, null);
  assert.match(playing, /先點數字，再點格子/);
  assert.equal(playing.includes(CEILING_LABEL), false);
  assert.equal(playStatusMarkup(true, null), "");
  const hint = "這一格可用〔Last Remaining Cell〕：〔呢行仲有空位，呢個數只可以放喺呢一格〕。";
  const hinted = playStatusMarkup(false, hint);
  assert.match(hinted, /Last Remaining Cell/);
  assert.equal(hinted.includes(CEILING_LABEL), false);
  assert.equal(hinted.includes(DIGIT_FIRST_COACH), false);
});
