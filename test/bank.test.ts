import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bankAssetUrl,
  drawEntry,
  filterByHardest,
  loadPracticeBank,
  parseBank,
  PRACTICE_CLOSED,
  PRACTICE_TARGET,
  practiceChoices,
  resetPracticeBankCache,
  type BankEntry,
} from "../src/engine/bank.ts";
import { TECHNIQUE_LABEL, TECHNIQUE_ORDER } from "../src/engine/techniques.ts";

const bankText = readFileSync(new URL("../public/bank-by-hardest.jsonl", import.meta.url), "utf8");

function line(entry: Record<string, unknown>): string {
  return JSON.stringify(entry);
}

const sample = {
  id: "sample-hidden",
  givens: "0".repeat(81),
  solution: "123456789".repeat(9),
  techniques: ["x_wing", "hidden_singles"],
  technique_names: ["X-Wing", "Hidden Singles"],
  hardest: "hidden_singles",
  band: "intermediate",
  clue_count: 0,
};

test("parseBank reads one JSONL object per line and ignores blanks", () => {
  const text = `\n${line(sample)}\n\n${line({ ...sample, id: "second", hardest: "x_wing" })}\n`;
  const entries = parseBank(text);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.id, "sample-hidden");
  assert.equal(entries[0]?.givens.length, 81);
  assert.equal(entries[1]?.hardest, "x_wing");
  assert.equal("morph" in (entries[0] as object), false);
});

test("hardest filter does not treat techniques[] membership as a match", () => {
  const entries = parseBank(
    [sample, { ...sample, id: "wing", hardest: "x_wing" }, { ...sample, id: "other", hardest: "swordfish" }]
      .map((entry) => line(entry))
      .join("\n"),
  );
  const pool = filterByHardest(entries, "x_wing");
  assert.deepEqual(
    pool.map((entry) => entry.id),
    ["wing"],
  );
  assert.equal(filterByHardest(entries, "obvious_singles").length, 0);
  assert.equal(filterByHardest(entries, "notes").length, 0);
});

test("an empty pool does not deal", () => {
  const entries = parseBank(line(sample));
  assert.equal(filterByHardest(entries, "x_wing").length, 0);
  assert.equal(drawEntry(filterByHardest(entries, "x_wing")), null);
  assert.equal(drawEntry([]), null);
  const choices = practiceChoices(entries);
  const wing = choices.find((choice) => choice.id === "x_wing");
  assert.ok(wing);
  assert.equal(wing.empty, true);
  assert.equal(wing.count, 0);
  assert.equal(wing.title, "X-Wing");
});

test("practice picker skips notes and obvious singles", () => {
  const entries = parseBank(
    line({
      ...sample,
      id: "closed",
      hardest: "obvious_singles",
      techniques: ["obvious_singles"],
      technique_names: ["Obvious Singles"],
    }),
  );
  const ids = practiceChoices(entries).map((choice) => choice.id);
  assert.equal(ids.includes("obvious_singles"), false);
  assert.equal(ids.includes("notes" as never), false);
  assert.deepEqual(PRACTICE_CLOSED, ["notes", "obvious_singles"]);
  assert.deepEqual(
    ids,
    TECHNIQUE_ORDER.filter((id) => id !== "obvious_singles"),
  );
});

test("a new draw prefers a different bank id when the pool has one", () => {
  const entries = parseBank(
    ["a", "b", "c"]
      .map((id) => line({ ...sample, id, hardest: "y_wing" }))
      .join("\n"),
  );
  const pool = filterByHardest(entries, "y_wing");
  for (let i = 0; i < 10; i++) {
    assert.notEqual(drawEntry(pool, "a", () => 0)?.id, "a");
  }
  const only: BankEntry[] = [pool[0]!];
  assert.equal(drawEntry(only, only[0]?.id, () => 0)?.id, "a");
});

test("the shipped bank is 1300 rows, 100 per open technique, with no stored morph", () => {
  assert.equal(bankText.trim().split(/\r?\n/).length, 1300);
  assert.equal(bankText.includes('"morph"'), false);
  const entries = parseBank(bankText);
  assert.equal(entries.length, 1300);
  const choices = practiceChoices(entries);
  assert.equal(choices.length, 13);
  for (const choice of choices) {
    assert.equal(choice.count, PRACTICE_TARGET);
    assert.equal(choice.empty, false);
    assert.equal(choice.title, TECHNIQUE_LABEL[choice.id]);
    assert.equal(filterByHardest(entries, choice.id).length, PRACTICE_TARGET);
    for (const entry of filterByHardest(entries, choice.id)) {
      assert.equal(entry.hardest, choice.id);
      if (entry.hardest === "y_wing" || entry.hardest === "swordfish") assert.equal(entry.band, "expert");
      if (entry.hardest === "pointing_pairs" || entry.hardest === "pointing_triples" || entry.hardest === "x_wing") {
        assert.equal(entry.band, "advanced");
      }
      assert.equal(entry.givens.length, 81);
      assert.equal(entry.solution.length, 81);
      for (let index = 0; index < 81; index++) {
        const given = entry.givens.charCodeAt(index) - 48;
        const solved = entry.solution.charCodeAt(index) - 48;
        assert.ok(solved >= 1 && solved <= 9);
        if (given !== 0) assert.equal(given, solved);
      }
    }
  }
  assert.equal(filterByHardest(entries, "obvious_singles").length, 0);
  assert.equal(filterByHardest(entries, "notes").length, 0);
});

test("malformed bank lines fail closed", () => {
  assert.throws(() => parseBank("{"), /JSON/);
  assert.throws(() => parseBank(line({ ...sample, givens: "123" })), /givens/);
});

test("the bank URL stays on the Vite /Mysudok/ base", () => {
  assert.equal(bankAssetUrl("/Mysudok/"), "/Mysudok/bank-by-hardest.jsonl");
  assert.equal(bankAssetUrl("/Mysudok"), "/Mysudok/bank-by-hardest.jsonl");
});

test("loadPracticeBank parses the static asset without a second fetch", async () => {
  resetPracticeBankCache();
  let calls = 0;
  const loader = async (url: string) => {
    calls += 1;
    assert.equal(url, "/Mysudok/bank-by-hardest.jsonl");
    return bankText;
  };
  const first = await loadPracticeBank(loader);
  const second = await loadPracticeBank(loader);
  assert.equal(first.length, 1300);
  assert.equal(second, first);
  assert.equal(calls, 1);
  resetPracticeBankCache();
});
