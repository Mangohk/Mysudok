import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { homeHtml, playTopCopyMarkup } from "../src/app.ts";

const appSource = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

test("home stacks four full-width difficulties and has no practice entry", () => {
  const html = homeHtml();
  const buttons = [...html.matchAll(/data-action="start" data-difficulty="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(buttons, ["初級", "中級", "高級", "專家"]);
  assert.equal((html.match(/class="choice /g) ?? []).length, 4);
  assert.equal(html.includes("練習技巧"), false);
  assert.equal(html.includes("練習"), false);
  assert.equal(html.includes('data-action="practice"'), false);
  assert.equal(html.includes("practice-start"), false);
  assert.equal(html.includes("data-screen=\"practice\""), false);
  assert.equal(appSource.includes("練習技巧"), false);
  assert.equal(appSource.includes("startPractice"), false);
  assert.equal(appSource.includes('data-action="practice"'), false);

  const choices = css.match(/\.choices\s*\{([^}]*)\}/);
  assert.ok(choices);
  const body = choices[1] ?? "";
  assert.match(body, /grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)/);
  assert.match(body, /grid-auto-flow:\s*row/);
  assert.doesNotMatch(body, /repeat\(\s*[24]\s*,/);
  assert.doesNotMatch(body, /1fr\s+1fr/);
  const choice = css.match(/\.choice\s*\{([^}]*)\}/);
  assert.match(choice?.[1] ?? "", /width:\s*100%/);
});

test("completion header names 專家 and in-play copy stays blank", () => {
  assert.equal(playTopCopyMarkup(false, "專家", "Y-Wing", 20), "");
  const html = playTopCopyMarkup(true, "專家", "Y-Wing", 0);
  assert.match(html, /class="eyebrow"/);
  assert.match(html, /data-difficulty="專家"/);
  assert.match(html, />專家</);
  assert.equal(html.includes("練習"), false);
  assert.match(playTopCopyMarkup(true, "高級", "X-Wing", 0), />高級</);
  assert.equal(playTopCopyMarkup(true, "高級", "X-Wing", 0).includes("專家"), false);
});

test("difficulty deals morph live puzzles and expert deals morph the bank", () => {
  assert.match(appSource, /applyDealMorph\(await generate\(difficulty\)\)/);
  assert.match(appSource, /dealExpert\(/);
  const expert = readFileSync(new URL("../src/engine/expert-deal.ts", import.meta.url), "utf8");
  assert.match(expert, /applyDealMorph/);
  assert.match(expert, /entryToPuzzle/);
  assert.match(expert, /expertPool/);
  assert.equal(expert.includes("while (true)"), false);
});
