import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { homeHtml, playTopCopyMarkup } from "../src/app.ts";

const appSource = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

const DIFFICULTIES = ["初級", "中級", "高級", "專家"] as const;
const TECHNIQUE_NAMES = ["Last Free Cell", "Hidden Triples", "Pointing Pairs", "X-Wing", "Y-Wing", "Swordfish"];

test("U1 home has difficulty cards and no technique reference list", () => {
  const html = homeHtml();
  const buttons = [...html.matchAll(/data-action="start" data-difficulty="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(buttons, [...DIFFICULTIES]);
  assert.equal((html.match(/class="choice /g) ?? []).length, 4);

  assert.equal(html.includes("<h2>技巧</h2>"), false);
  assert.equal(html.includes('aria-label="技巧參考"'), false);
  assert.equal(html.includes('class="skills"'), false);
  assert.equal(html.includes("skill-list"), false);
  assert.equal(html.includes("skill-rank"), false);
  assert.equal(html.includes(">Reference<"), false);
  assert.equal(html.includes("Technique map"), false);
  assert.equal(html.includes("sudoku.com"), false);
  for (const rank of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    assert.equal(html.includes(`>#${rank}<`), false);
  }

  const choices = css.match(/\.choices\s*\{([^}]*)\}/);
  assert.ok(choices);
  assert.match(choices[1] ?? "", /grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)/);
  assert.equal(css.includes(".skills"), false);
  assert.equal(appSource.includes("skillReferenceMarkup"), false);
  assert.equal(appSource.includes("SKILL_REFERENCE"), false);
});

test("U2 home footer keeps a one-line openzeloku MIT credit", () => {
  const html = homeHtml();
  const credits = html.match(/<p class="credit">[\s\S]*?<\/p>/g) ?? [];
  assert.equal(credits.length, 1);
  assert.match(credits[0] ?? "", /href="https:\/\/github\.com\/mr-girff\/openzeloku"/);
  assert.match(credits[0] ?? "", />openzeloku<\/a>（MIT）/);
  assert.equal((credits[0] ?? "").includes("<br"), false);
  assert.match(css, /\.credit\s*\{[^}]*font-size:\s*0\.85rem/);

  const homeStart = appSource.indexOf("export function homeHtml");
  const homeEnd = appSource.indexOf("function loadingHtml", homeStart);
  const home = appSource.slice(homeStart, homeEnd);
  assert.match(home, /class="credit"/);
  assert.equal(home.includes("skillReferenceMarkup"), false);
});

test("U3 in-play top-left stays empty", () => {
  for (const difficulty of DIFFICULTIES) {
    for (const technique of TECHNIQUE_NAMES) {
      const html = playTopCopyMarkup(false, difficulty, technique, 41);
      assert.equal(html, "");
    }
  }
});

test("U4 done panel is 完成 plus actions, without a max-technique kicker", () => {
  const doneStart = appSource.indexOf('class="done"');
  const againAt = appSource.indexOf("再來一題", doneStart);
  assert.ok(doneStart >= 0 && againAt > doneStart);
  const done = appSource.slice(doneStart, againAt);
  assert.match(done, /id="done-title">完成</);
  assert.match(done, /data-action="again"/);
  assert.match(appSource.slice(againAt, againAt + 80), /data-action="back">返回/);
  assert.equal(done.includes("最高技巧"), false);
  assert.equal(done.includes("ceiling-kicker"), false);
  assert.equal(done.includes("done-technique"), false);
  assert.equal(done.includes("${"), false);
  for (const technique of TECHNIQUE_NAMES) {
    assert.equal(done.includes(technique), false);
  }
  assert.equal(css.includes(".done-technique"), false);
  assert.equal(css.includes(".ceiling-kicker"), false);
  assert.match(appSource, /maxTechnique/);
  assert.match(readFileSync(new URL("../src/engine/generate.ts", import.meta.url), "utf8"), /maxTechnique/);
});

test("U5 completed top-left stays empty", () => {
  for (const difficulty of DIFFICULTIES) {
    for (const technique of TECHNIQUE_NAMES) {
      const html = playTopCopyMarkup(true, difficulty, technique, 0);
      assert.equal(html, "");
      assert.equal(html.includes(difficulty), false);
      assert.equal(html.includes(technique), false);
      assert.equal(html.includes("最高技巧"), false);
      assert.equal(html.includes("仲剩"), false);
      assert.equal(html.includes("完成"), false);
    }
  }

  const header = appSource.slice(appSource.indexOf('<header class="top">'), appSource.indexOf("</header>"));
  assert.match(header, /playTopCopyMarkup\(play\.complete/);
  assert.equal(header.includes("最高技巧"), false);
  assert.equal(header.includes("仲剩"), false);
  assert.equal(header.includes(">完成<"), false);
  assert.equal(header.includes('class="eyebrow"'), false);
});
