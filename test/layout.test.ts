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
