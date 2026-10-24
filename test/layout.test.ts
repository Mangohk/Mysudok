import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

test("narrow confirm keeps 確定 and 繼續 on one row", () => {
  const narrow = css.split("@media").find((block) => {
    const header = block.slice(0, block.indexOf("{"));
    return /max-width:\s*640px/.test(header) && !/orientation:\s*landscape/.test(header);
  });
  assert.ok(narrow);
  assert.match(ruleBody("\\.top-actions", narrow), /flex-basis:\s*100%/);
  assert.match(ruleBody("\\.confirm-actions button", narrow), /font-size:\s*0\.875rem/);
  assert.match(ruleBody("\\.confirm-actions button", narrow), /padding:\s*0\.28rem\s+0\.48rem/);
  assert.doesNotMatch(narrow, /\.confirm-actions[^{]*\{[^}]*flex-direction:\s*column/);
  const portrait = css.split("@media")[0] ?? "";
  assert.match(ruleBody("\\.confirm-actions", portrait), /flex-flow:\s*row\s+nowrap/);
  assert.match(ruleBody("\\.confirm-actions button", portrait), /white-space:\s*nowrap/);
});

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
  assert.match(rows, /grid-template-rows:\s*repeat\(\s*9\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/);
  assert.match(rows, /grid-template-columns:\s*repeat\(\s*9\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/);
  assert.doesNotMatch(rows, /repeat\(\s*9\s*,\s*1fr\s*\)/);

  const cell = ruleBody("\\.cell", portrait);
  assert.match(cell, /min-height:\s*0/);
  assert.match(cell, /min-width:\s*0/);
  assert.match(cell, /overflow:\s*hidden/);

  for (const block of css.split("@media").slice(1)) {
    if (!/orientation:\s*landscape/.test(block.slice(0, block.indexOf("{")))) continue;
    const override = block.match(/\.board\s*\{([^}]*)\}/);
    if (!override) continue;
    assert.doesNotMatch(override[1] ?? "", /grid-template-rows\s*:/);
    assert.doesNotMatch(override[1] ?? "", /grid-template-columns\s*:/);
  }
});

test("pencil notes cannot raise a row above an empty row", () => {
  const portrait = css.split("@media")[0] ?? "";
  const cell = ruleBody("\\.cell", portrait);
  assert.match(cell, /position:\s*relative/);

  const notes = ruleBody("\\.notes", portrait);
  assert.match(notes, /position:\s*absolute/);
  assert.match(notes, /inset:\s*0/);
  assert.match(notes, /min-width:\s*0/);
  assert.match(notes, /min-height:\s*0/);
  assert.match(notes, /overflow:\s*hidden/);
  assert.match(notes, /font-size:\s*clamp\(\s*0\.48rem\s*,\s*1\.85vw\s*,\s*0\.68rem\s*\)/);
  assert.match(notes, /grid-template-columns:\s*repeat\(\s*3\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/);
  assert.match(notes, /grid-template-rows:\s*repeat\(\s*3\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/);
  assert.doesNotMatch(notes, /repeat\(\s*3\s*,\s*1fr\s*\)/);

  const slot = ruleBody("\\.notes i", portrait);
  assert.match(slot, /place-items:\s*center/);
  assert.match(slot, /min-width:\s*0/);
  assert.match(slot, /min-height:\s*0/);

  const landscape = css.split("@media").find((block) => {
    const header = block.slice(0, block.indexOf("{"));
    return /orientation:\s*landscape/.test(header) && /min-width:\s*900px/.test(header) && !/max-height/.test(header);
  });
  assert.ok(landscape);
  const notesFont = ruleBody("\\.notes", landscape);
  assert.match(notesFont, /font-size:\s*clamp\(\s*0\.42rem\s*,\s*2\.7cqw\s*,\s*0\.68rem\s*\)/);
  assert.doesNotMatch(notesFont, /grid-template-rows\s*:/);
  assert.doesNotMatch(notesFont, /position\s*:/);
  assert.doesNotMatch(notesFont, /inset\s*:/);
});

test("landscape right rail A keeps done, status, pad, tools", () => {
  const landscape = css.split("@media").find((block) => {
    const header = block.slice(0, block.indexOf("{"));
    return /orientation:\s*landscape/.test(header) && /min-width:\s*900px/.test(header) && !/max-height/.test(header);
  });
  assert.ok(landscape);
  const orders: Array<[string, string]> = [
    [String.raw`\.play-rail > \.done`, "1"],
    [String.raw`\.play-rail > \.status`, "2"],
    [String.raw`\.play-rail > \.pad`, "3"],
    [String.raw`\.play-rail > \.tools`, "4"],
  ];
  for (const [selector, order] of orders) {
    assert.match(ruleBody(selector, landscape), new RegExp(String.raw`order:\s*${order}\b`));
  }
  assert.equal(landscape.includes(".play-rail > .confirm"), false);
  assert.equal(css.includes(".play-rail > .confirm"), false);
  assert.equal(landscape.includes("undo-bar"), false);
  assert.equal(css.includes("undo-bar"), false);
});

test("status wraps anywhere in portrait and in the landscape rail", () => {
  const portrait = css.split("@media")[0] ?? "";
  assert.match(ruleBody("\\.status", portrait), /overflow-wrap:\s*anywhere/);
  assert.match(ruleBody("\\.status \\.tech-name", portrait), /overflow-wrap:\s*anywhere/);
  const landscape = css.split("@media").find((block) => {
    const header = block.slice(0, block.indexOf("{"));
    return /orientation:\s*landscape/.test(header) && /min-width:\s*900px/.test(header) && !/max-height/.test(header);
  });
  assert.ok(landscape);
  assert.match(ruleBody(String.raw`\.play-rail > \.status`, landscape), /overflow-wrap:\s*anywhere/);
  assert.equal(css.includes("\u00ad"), false);
  assert.doesNotMatch(css, /&shy;|soft\s*hyphen/i);
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

function landscapeRail(): string {
  const landscape = css.split("@media").find((block) => {
    const header = block.slice(0, block.indexOf("{"));
    return /orientation:\s*landscape/.test(header) && /min-width:\s*900px/.test(header) && !/max-height/.test(header);
  });
  assert.ok(landscape);
  return landscape;
}

test("digit pad slots stay 1 through 9 in portrait and landscape", () => {
  const portrait = css.split("@media")[0] ?? "";
  const pad = ruleBody("\\.pad", portrait);
  assert.match(pad, /grid-template-columns:\s*repeat\(\s*9\s*,\s*1fr\s*\)/);
  assert.doesNotMatch(pad, /grid-template-rows\s*:/);
  const padButton = ruleBody("\\.pad button", portrait);
  assert.doesNotMatch(padButton, /\border\s*:/);
  assert.match(padButton, /margin:\s*0\b/);

  for (let digit = 1; digit <= 9; digit++) {
    const cell = ruleBody(String.raw`\.pad button\[data-digit="${digit}"\]`, portrait);
    assert.match(cell, new RegExp(String.raw`order:\s*${digit}\b`));
    assert.match(cell, /grid-row:\s*1\b/);
    assert.match(cell, new RegExp(String.raw`grid-column:\s*${digit}\b`));
  }

  const landscape = landscapeRail();
  const railPad = ruleBody(String.raw`\.play-rail \.pad`, landscape);
  assert.match(railPad, /grid-template-columns:\s*repeat\(\s*3\s*,\s*minmax\(\s*44pt\s*,\s*1fr\s*\)\s*\)/);
  assert.match(railPad, /grid-template-rows:\s*repeat\(\s*3\s*,\s*minmax\(\s*44pt\s*,\s*1fr\s*\)\s*\)/);
  assert.doesNotMatch(ruleBody(String.raw`\.play-rail \.pad button`, landscape), /\border\s*:/);
  for (let digit = 1; digit <= 9; digit++) {
    const row = Math.floor((digit - 1) / 3) + 1;
    const col = ((digit - 1) % 3) + 1;
    const cell = ruleBody(String.raw`\.play-rail \.pad button\[data-digit="${digit}"\]`, landscape);
    assert.match(cell, new RegExp(String.raw`grid-row:\s*${row}\b`));
    assert.match(cell, new RegExp(String.raw`grid-column:\s*${col}\b`));
  }

  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const orderRules = [...stripped.matchAll(/([^{]+)\{([^}]*\border\s*:[^}]*)\}/g)];
  assert.ok(orderRules.length >= 6);
  for (const match of orderRules) {
    const selector = match[1] ?? "";
    const body = match[2] ?? "";
    assert.doesNotMatch(selector, /data-done|data-remaining/);
    if (!/\.done\b/.test(selector)) continue;
    assert.match(selector, />\s*\.done\b/);
    assert.doesNotMatch(selector, /\.pad\b/);
    assert.match(body, /order:\s*1\b/);
  }
});

test("tools main row is 筆記, 上一步, 提示, ⋯ and the menu is one flat layer", () => {
  const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.doesNotMatch(app, /撤銷|復原|還原|回退/);
  assert.doesNotMatch(readme, /撤銷|復原|還原|回退/);
  assert.match(app, /Z 上一步/);
  assert.match(app, /已填合法候選 · 可上一步/);
  assert.match(app, /已清候選 · 可上一步/);
  assert.doesNotMatch(app, /可撤銷/);

  const toolsStart = app.indexOf('<div class="tools">');
  const toolsEnd = app.indexOf("${padHtml(play)}");
  assert.ok(toolsStart >= 0 && toolsEnd > toolsStart);
  const tools = app.slice(toolsStart, toolsEnd);
  assert.match(tools, /data-action="notes"[\s\S]*?>筆記</);
  const undoButton = tools.match(/<button type="button" data-action="undo"[^>]*>上一步<\/button>/);
  assert.ok(undoButton);
  assert.doesNotMatch(undoButton[0] ?? "", /aria-/);
  assert.match(tools, /data-action="hint"/);
  assert.match(tools, /data-action="menu"/);
  assert.doesNotMatch(tools, /fill-candidates|undo-bar|填滿候選/);
  const notesAt = tools.indexOf('data-action="notes"');
  const undoAt = tools.indexOf('data-action="undo"');
  const hintAt = tools.indexOf('data-action="hint"');
  const menuAt = tools.indexOf('data-action="menu"');
  assert.ok(notesAt < undoAt && undoAt < hintAt && hintAt < menuAt);

  assert.match(
    app,
    /class="menu-pop" role="menu"><button type="button" data-action="fill-candidates"[^>]*>填滿候選<\/button><button type="button" data-action="check-wrong">檢查錯格<\/button>/,
  );
});

test("mini boards enlarge type by cell ratio and the 4×4 pad is 2×2", () => {
  const portrait = css.split("@media")[0] ?? "";
  assert.match(ruleBody("\\.cell", portrait), /font-size:\s*clamp\(\s*1rem\s*,\s*4\.8vw\s*,\s*1\.55rem\s*\)/);
  assert.match(ruleBody("\\.cell", portrait), /font-weight:\s*680/);
  assert.match(ruleBody("\\.cell\\.given", portrait), /font-weight:\s*760/);
  assert.match(css, /--ink:\s*#241910/);
  assert.match(css, /--paper:\s*#f7f1e6/);

  const fourBoard = ruleBody(String.raw`\.board\[data-size="4"\]`, portrait);
  const sixBoard = ruleBody(String.raw`\.board\[data-size="6"\]`, portrait);
  assert.match(fourBoard, /container-type:\s*inline-size/);
  assert.match(sixBoard, /container-type:\s*inline-size/);
  assert.match(
    ruleBody(String.raw`\.board\[data-size="4"\] \.cell`, portrait),
    /font-size:\s*clamp\(\s*1\.15rem\s*,\s*12\.5cqw\s*,\s*13\.75cqw\s*\)/,
  );
  assert.match(
    ruleBody(String.raw`\.board\[data-size="6"\] \.cell`, portrait),
    /font-size:\s*clamp\(\s*1rem\s*,\s*7\.5cqw\s*,\s*8\.33cqw\s*\)/,
  );
  assert.match(ruleBody(String.raw`\.board\[data-size="4"\] \.notes`, portrait), /font-size:\s*max\(\s*0\.9rem\s*,\s*0\.46em\s*\)/);
  assert.match(ruleBody(String.raw`\.board\[data-size="6"\] \.notes`, portrait), /font-size:\s*max\(\s*0\.78rem\s*,\s*0\.5em\s*\)/);

  const pad4 = ruleBody(String.raw`\.pad\[data-size="4"\]`, portrait);
  assert.match(pad4, /grid-template-columns:\s*repeat\(\s*2\s*,\s*1fr\s*\)/);
  assert.match(pad4, /grid-template-rows:\s*repeat\(\s*2\s*,\s*minmax\(\s*44pt\s*,\s*auto\s*\)\s*\)/);
  assert.doesNotMatch(pad4, /repeat\(\s*4/);
  const spots: Array<[number, number, number]> = [
    [1, 1, 1],
    [2, 1, 2],
    [3, 2, 1],
    [4, 2, 2],
  ];
  for (const [digit, row, col] of spots) {
    const cell = ruleBody(String.raw`\.pad\[data-size="4"\] button\[data-digit="${digit}"\]`, portrait);
    assert.match(cell, new RegExp(String.raw`grid-row:\s*${row}\b`));
    assert.match(cell, new RegExp(String.raw`grid-column:\s*${col}\b`));
  }

  const wide = css.split("@media").find((block) => {
    const header = block.slice(0, block.indexOf("{"));
    return /min-width:\s*700px/.test(header) && !/orientation:\s*landscape/.test(header);
  });
  assert.ok(wide);
  assert.match(ruleBody("\\.cell", wide), /font-size:\s*1\.45rem/);

  const landscape = landscapeRail();
  assert.match(ruleBody("\\.cell", landscape), /font-size:\s*clamp\(\s*0\.75rem\s*,\s*8cqw\s*,\s*1\.5rem\s*\)/);
  const railPad4 = ruleBody(String.raw`\.play-rail \.pad\[data-size="4"\]`, landscape);
  assert.match(railPad4, /grid-template-columns:\s*repeat\(\s*2\s*,\s*minmax\(\s*44pt\s*,\s*1fr\s*\)\s*\)/);
  assert.match(railPad4, /grid-template-rows:\s*repeat\(\s*2\s*,\s*minmax\(\s*44pt\s*,\s*1fr\s*\)\s*\)/);
  assert.doesNotMatch(railPad4, /repeat\(\s*3/);
  for (const [digit, row, col] of spots) {
    const cell = ruleBody(
      String.raw`\.play-rail \.pad\[data-size="4"\] button\[data-digit="${digit}"\]`,
      landscape,
    );
    assert.match(cell, new RegExp(String.raw`grid-row:\s*${row}\b`));
    assert.match(cell, new RegExp(String.raw`grid-column:\s*${col}\b`));
  }
});
