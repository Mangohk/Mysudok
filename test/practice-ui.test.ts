import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PRACTICE_EMPTY_LABEL,
  PRACTICE_ENTRY_LABEL,
  homeHtml,
  practiceLoadingMarkup,
  practicePickerMarkup,
  practiceProgressLabel,
} from "../src/app.ts";
import { parseBank, practiceChoices } from "../src/engine/bank.ts";
import { TECHNIQUE_LABEL } from "../src/engine/techniques.ts";

const bankText = readFileSync(new URL("../public/bank-by-hardest.jsonl", import.meta.url), "utf8");

test("home puts 練習技巧 beside the difficulty controls", () => {
  const html = homeHtml();
  const practiceAt = html.indexOf('data-action="practice"');
  const advancedAt = html.indexOf('data-difficulty="高級"');
  assert.ok(practiceAt > advancedAt);
  assert.match(html, new RegExp(PRACTICE_ENTRY_LABEL));
  assert.match(html, /data-difficulty="初級"/);
  assert.match(html, /data-difficulty="中級"/);
  assert.match(html, /data-difficulty="高級"/);
});

test("the practice picker uses Title Case names and nn/100, and hides closed techniques", () => {
  const choices = practiceChoices(parseBank(bankText));
  const html = practicePickerMarkup(choices, null);
  assert.equal(html.includes("正在出題"), false);
  assert.equal(html.includes("Obvious Singles"), false);
  assert.equal(html.includes("Notes In Sudoku"), false);
  assert.equal(html.includes("obvious_singles"), false);
  assert.equal(html.includes('data-technique="notes"'), false);
  for (const choice of choices) {
    assert.equal(choice.title, TECHNIQUE_LABEL[choice.id]);
    assert.match(html, new RegExp(`data-technique="${choice.id}"`));
    assert.match(html, new RegExp(choice.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, new RegExp(practiceProgressLabel(choice.count).replace("/", "\\/")));
  }
  assert.match(html, /X-Wing/);
  assert.match(html, /100\/100/);
});

test("an empty practice pool shows 暫缺 and does not offer a deal", () => {
  const html = practicePickerMarkup(practiceChoices([]), PRACTICE_EMPTY_LABEL);
  assert.match(html, new RegExp(`role="status">${PRACTICE_EMPTY_LABEL}`));
  assert.match(html, new RegExp(`class="technique empty"[^>]*disabled`));
  assert.equal(html.includes("practice-start"), false);
  assert.equal(html.includes("100/100"), false);
  assert.equal(html.includes("正在出題"), false);
  const loading = practiceLoadingMarkup();
  assert.match(loading, /載入題庫/);
  assert.equal(loading.includes("正在出題"), false);
});

test("difficulty deals and practice deals both pass through the shared morph", () => {
  const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  assert.match(source, /applyDealMorph\(await generate\(difficulty\)\)/);
  const start = source.slice(source.indexOf("async function startPractice"), source.indexOf("function redraw"));
  assert.match(start, /applyDealMorph\(entryToPuzzle\(entry\)\)/);
  assert.match(start, /filterByHardest/);
  assert.equal(start.includes("generate("), false);
  const generateSource = readFileSync(new URL("../src/engine/generate.ts", import.meta.url), "utf8");
  assert.match(generateSource, /export async function generate/);
});
