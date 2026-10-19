import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

test("landscape right rail turns on only for landscape and min-width 900px", () => {
  const queries = css.match(/@media[^{]+\{/g) ?? [];
  const landscape = queries.filter((query) => /orientation:\s*landscape/.test(query));
  assert.ok(landscape.length >= 1);
  for (const query of landscape) {
    assert.match(query, /\(\s*orientation:\s*landscape\s*\)/);
    assert.match(query, /\(\s*min-width:\s*900px\s*\)/);
    assert.match(query, /and/);
  }
  assert.equal(
    queries.some((query) => /orientation:\s*landscape/.test(query) && !/min-width:\s*900px/.test(query)),
    false,
  );
});

function ruleBody(selector: string, block: string): string {
  const match = block.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing ${selector} rule`);
  return match[1] ?? "";
}

test("board rows are nine equal tracks in portrait and landscape", () => {
  const portrait = css.split("@media")[0] ?? "";
  const rows = ruleBody("\\.board", portrait);
  assert.match(rows, /grid-template-rows:\s*repeat\(\s*9\s*,\s*1fr\s*\)/);
  assert.match(rows, /grid-template-columns:\s*repeat\(\s*9\s*,\s*1fr\s*\)/);

  const cell = ruleBody("\\.cell", portrait);
  assert.match(cell, /min-height:\s*0/);

  for (const block of css.split("@media").slice(1)) {
    if (!/orientation:\s*landscape/.test(block.slice(0, block.indexOf("{")))) continue;
    const override = block.match(/\.board\s*\{([^}]*)\}/);
    if (!override) continue;
    assert.doesNotMatch(override[1] ?? "", /grid-template-rows\s*:/);
  }
});

test("landscape board side is min(available width, available height)", () => {
  const landscape = css.split("@media").find((block) => {
    const header = block.slice(0, block.indexOf("{"));
    return /orientation:\s*landscape/.test(header) && /min-width:\s*900px/.test(header) && !/max-height/.test(header);
  });
  assert.ok(landscape);
  const board = ruleBody("\\.board", landscape);
  assert.match(board, /width:\s*min\(\s*100cqw\s*,\s*100cqh\s*\)/);
  assert.match(board, /height:\s*min\(\s*100cqw\s*,\s*100cqh\s*\)/);
  assert.match(board, /aspect-ratio:\s*1/);
  assert.doesNotMatch(board, /width:\s*100%/);
  assert.doesNotMatch(board, /max-height\s*:/);
  assert.match(ruleBody("\\.play-main", landscape), /container-type:\s*size/);
});
