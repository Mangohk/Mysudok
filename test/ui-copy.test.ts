import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CEILING_LABEL, DIGIT_FIRST_COACH, HOME_BLURB, SKILL_REFERENCE, TECHNIQUE_MAP_HREF, confirmCopy, playStatusMarkup, skillReferenceMarkup } from "../src/app.ts";

test("home blurb names the three beginner techniques, including 唯一數字", () => {
  assert.match(HOME_BLURB.初級, /最後一格/);
  assert.match(HOME_BLURB.初級, /剩餘格/);
  assert.match(HOME_BLURB.初級, /唯一數字/);
});

test("home advanced blurb names Pointing Pairs and X-Wing", () => {
  assert.equal(HOME_BLURB.高級, "Pointing Pairs、X-Wing");
  assert.equal(HOME_BLURB.高級.includes("區塊指向"), false);
  assert.equal(HOME_BLURB.中級, "筆記之後嘅單一、數對、三數組");
  assert.equal(HOME_BLURB.專家, "Y-Wing、Swordfish");
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

test("hint status wraps advanced Title Case names without adding home reference rows", () => {
  for (const name of ["Pointing Pairs", "Pointing Triples", "X-Wing", "Y-Wing", "Swordfish"]) {
    const html = playStatusMarkup(false, `呢幾格可用〔${name}〕：〔原因〕。`);
    assert.match(html, new RegExp(`<span class="tech-name">${name}</span>`));
    assert.equal(html.includes("\u00ad"), false);
    assert.equal(html.includes(CEILING_LABEL), false);
  }
  assert.equal(skillReferenceMarkup().includes("pointing-pairs"), false);
});

test("hint status wraps English technique names without a soft hyphen", () => {
  const hint = "這一格可用〔Last Remaining Cell〕：〔呢行仲有空位，呢個數只可以放喺呢一格〕。";
  const hinted = playStatusMarkup(false, hint);
  assert.match(hinted, /<span class="tech-name">Last Remaining Cell<\/span>/);
  assert.match(hinted, /class="status"/);
  assert.equal(hinted.includes("\u00ad"), false);
  assert.equal(hinted.includes(CEILING_LABEL), false);
});

test("top actions are 重開, 新局, 返回 and confirm anchors under them", () => {
  const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  const topStart = app.indexOf('<div class="top-actions">');
  const headerEnd = app.indexOf("</header>", topStart);
  assert.ok(topStart >= 0 && headerEnd > topStart);
  const top = app.slice(topStart, headerEnd);
  const restartAt = top.indexOf('data-action="restart"');
  const newAt = top.indexOf('data-action="new"');
  const backAt = top.indexOf('data-action="back"');
  assert.ok(restartAt >= 0 && restartAt < newAt && newAt < backAt);
  assert.match(top, /data-action="restart">重開</);
  assert.match(top, /data-action="new">新局</);
  assert.match(top, /data-action="back">返回</);
  assert.ok(top.includes("${confirm}"));
  assert.ok(top.indexOf("${confirm}") > backAt);

  const railStart = app.indexOf('<div class="play-rail">');
  const helpAt = app.indexOf('<p class="help">', railStart);
  assert.ok(railStart >= 0 && helpAt > railStart);
  const rail = app.slice(railStart, helpAt);
  assert.equal(rail.includes("${confirm}"), false);
  assert.equal(rail.includes('class="confirm"'), false);
  assert.match(rail, /data-action="notes"/);
  assert.match(rail, /data-action="hint"/);
  assert.match(rail, /data-action="menu"/);

  assert.match(app, /role="alertdialog" aria-label="確認"/);
  assert.match(app, /class="confirm-actions"[\s\S]*data-action="confirm-yes">確定<\/button>[\s\S]*data-action="confirm-no">繼續<\/button>/);
  assert.match(css, /\.top-actions > \.confirm\s*\{/);
  assert.match(css, /\.confirm-actions\s*\{[^}]*flex-flow:\s*row\s+nowrap/);
  assert.match(css, /\.confirm-actions button\s*\{[^}]*white-space:\s*nowrap/);
  assert.equal(css.includes(".play-rail > .confirm"), false);
  assert.equal(css.includes("position: fixed"), false);
});

test("dirty top actions confirm with the locked copy and a clean board does not", () => {
  assert.equal(confirmCopy("restart"), "重開並放棄而家進度？");
  assert.equal(confirmCopy("new"), "開新局並放棄這一題？");
  assert.equal(confirmCopy("back"), "返回並放棄這一題？");
  assert.equal(confirmCopy("check"), "會對答案標出唔啱嘅格（求救），唔會改你嘅盤。確定？");
  assert.equal(confirmCopy(null), "");

  const app = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  const dirty = app.slice(app.indexOf("function dirty("), app.indexOf("function onClick"));
  assert.match(dirty, /!play\.givens\[index\] && value !== 0/);
  assert.match(dirty, /play\.notes\.some\(\(note\) => note !== 0\)/);

  const back = app.slice(app.indexOf('if (action === "back")'), app.indexOf('if (action === "new" || action === "again")'));
  assert.match(back, /dirty\(phase\.play\) && !phase\.play\.complete/);
  assert.match(back, /phase\.play\.confirm = "back"/);

  const fresh = app.slice(app.indexOf('if (action === "new" || action === "again")'), app.indexOf('if (action === "restart")'));
  assert.match(fresh, /action === "new" && dirty\(phase\.play\) && !phase\.play\.complete/);
  assert.match(fresh, /phase\.play\.confirm = "new"/);

  const restart = app.slice(app.indexOf('if (action === "restart")'), app.indexOf('if (action === "confirm-no")'));
  assert.match(restart, /if \(dirty\(phase\.play\)\)/);
  assert.match(restart, /phase\.play\.confirm = "restart"/);
  assert.match(restart, /applyRestart\(phase\.play\)/);

  const dismiss = app.slice(app.indexOf('if (action === "confirm-no")'), app.indexOf('if (action === "confirm-yes")'));
  assert.match(dismiss, /phase\.play\.confirm = null/);
  const accept = app.slice(app.indexOf('if (action === "confirm-yes")'), app.indexOf("if (phase.kind !== \"play\" || phase.play.confirm)"));
  assert.match(accept, /choice === "back"/);
  assert.match(accept, /choice === "new"/);
  assert.match(accept, /choice === "restart"/);
  assert.match(accept, /leavePlay\(\)/);
  assert.match(accept, /redraw\(play\)/);
  assert.match(accept, /applyRestart\(phase\.play\)/);
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
