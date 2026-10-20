import assert from "node:assert/strict";
import test from "node:test";
import { CEILING_LABEL, DIGIT_FIRST_COACH, HOME_BLURB, SKILL_REFERENCE, TECHNIQUE_MAP_HREF, playStatusMarkup, skillReferenceMarkup } from "../src/app.ts";

test("home blurb names the three beginner techniques, including 唯一數字", () => {
  assert.match(HOME_BLURB.初級, /最後一格/);
  assert.match(HOME_BLURB.初級, /剩餘格/);
  assert.match(HOME_BLURB.初級, /唯一數字/);
});

test("home skill reference is the locked #1–#10 sudoku.com table", () => {
  const expected: Array<[number, string, string]> = [
    [1, "Last free cell", "https://sudoku.com/sudoku-rules/last-free-cell/"],
    [2, "Last remaining cell", "https://sudoku.com/sudoku-rules/last-remaining-cell/"],
    [3, "Last possible number", "https://sudoku.com/sudoku-rules/last-possible-number/"],
    [4, "Notes in Sudoku", "https://sudoku.com/sudoku-rules/notes-in-sudoku/"],
    [5, "Obvious singles", "https://sudoku.com/sudoku-rules/obvious-singles/"],
    [6, "Obvious pairs", "https://sudoku.com/sudoku-rules/obvious-pairs/"],
    [7, "Obvious triples", "https://sudoku.com/sudoku-rules/obvious-triples/"],
    [8, "Hidden singles", "https://sudoku.com/sudoku-rules/hidden-singles/"],
    [9, "Hidden pairs", "https://sudoku.com/sudoku-rules/hidden-pairs/"],
    [10, "Hidden triples", "https://sudoku.com/sudoku-rules/hidden-triples/"],
  ];
  assert.equal(SKILL_REFERENCE.length, expected.length);
  for (const [rank, name, href] of expected) {
    const skill = SKILL_REFERENCE[rank - 1];
    assert.ok(skill);
    assert.equal(skill.rank, rank);
    assert.equal(skill.name, name);
    assert.equal(skill.href, href);
  }
  const html = skillReferenceMarkup();
  for (const skill of SKILL_REFERENCE) {
    assert.match(html, new RegExp(`href="${skill.href}"`));
    assert.match(html, new RegExp(`<span class="skill-name">${skill.name}</span>`));
  }
  const referenceLinks = html.match(/<a href="https:\/\/sudoku\.com\/[^"]+" target="_blank" rel="noopener">Reference<\/a>/g) ?? [];
  assert.equal(referenceLinks.length, 10);
  assert.match(html, new RegExp(`class="skill-map"[^>]*>GitHub technique map <a href="${TECHNIQUE_MAP_HREF}" target="_blank" rel="noopener">Technique map</a>`));
  assert.equal(html.includes("pointing-pairs"), false);
  assert.equal(html.includes("swordfish"), false);
  assert.equal(html.includes("\u00ad"), false);
});

test("hint status wraps English technique names without a soft hyphen", () => {
  const hint = "這一格可用〔Last Remaining Cell〕：〔呢行仲有空位，呢個數只可以放喺呢一格〕。";
  const hinted = playStatusMarkup(false, hint);
  assert.match(hinted, /<span class="tech-name">Last Remaining Cell<\/span>/);
  assert.match(hinted, /class="status"/);
  assert.equal(hinted.includes("\u00ad"), false);
  assert.equal(hinted.includes(CEILING_LABEL), false);
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
