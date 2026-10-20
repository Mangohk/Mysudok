import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseBank, type BankEntry } from "../src/engine/bank.ts";
import {
  dealExpert,
  EXPERT_EMPTY_MESSAGE,
  EXPERT_FALLBACK_ATTEMPTS,
  EXPERT_HARDEST,
  expertPool,
} from "../src/engine/expert-deal.ts";
import { MAX_ATTEMPTS, type Puzzle } from "../src/engine/generate.ts";

const bankText = readFileSync(new URL("../public/bank-by-hardest.jsonl", import.meta.url), "utf8");

function row(id: string, hardest: string, band = "advanced"): BankEntry {
  return {
    id,
    givens: "0".repeat(81),
    solution: "123456789".repeat(9),
    techniques: [hardest],
    technique_names: [hardest],
    hardest,
    band,
    clue_count: 0,
  };
}

const identity = (puzzle: Puzzle) => puzzle;

test("shipped expert pool is only y_wing and swordfish, labeled expert", () => {
  const entries = parseBank(bankText);
  const pool = expertPool(entries);
  assert.deepEqual(EXPERT_HARDEST, ["y_wing", "swordfish"]);
  assert.equal(pool.length, 200);
  const counts = { y_wing: 0, swordfish: 0 };
  for (const entry of pool) {
    assert.ok(entry.hardest === "y_wing" || entry.hardest === "swordfish");
    assert.equal(entry.band, "expert");
    counts[entry.hardest] += 1;
  }
  assert.equal(counts.y_wing, 100);
  assert.equal(counts.swordfish, 100);
  assert.equal(expertPool(entries.filter((entry) => entry.hardest === "x_wing")).length, 0);
});

test("a stale advanced band on y_wing still deals as that hardest, without regenerate", async () => {
  let calls = 0;
  const dealt = await dealExpert({
    entries: [row("stale", "y_wing", "advanced"), row("wing", "x_wing", "advanced")],
    regenerate: async () => {
      calls += 1;
      throw new Error("bank hit must not regenerate");
    },
    morph: identity,
    rng: () => 0,
  });
  assert.equal(calls, 0);
  assert.equal(dealt.bankId, "stale");
  assert.equal(dealt.puzzle.maxTechnique, "y_wing");
  assert.equal(dealt.puzzle.unique, true);
});

test("empty expert pool regenerates once with a short cap, then blocks", async () => {
  let calls = 0;
  let seen = 0;
  await assert.rejects(
    () =>
      dealExpert({
        entries: [],
        regenerate: async (maxAttempts) => {
          calls += 1;
          seen = maxAttempts;
          throw new Error("miss");
        },
        morph: identity,
      }),
    new RegExp(EXPERT_EMPTY_MESSAGE),
  );
  assert.equal(calls, 1);
  assert.equal(seen, EXPERT_FALLBACK_ATTEMPTS);
  assert.ok(EXPERT_FALLBACK_ATTEMPTS > 0);
  assert.ok(EXPERT_FALLBACK_ATTEMPTS < MAX_ATTEMPTS);

  let missingCalls = 0;
  await assert.rejects(
    () =>
      dealExpert({
        entries: null,
        regenerate: async () => {
          missingCalls += 1;
          throw new Error("miss");
        },
      }),
    new RegExp(EXPERT_EMPTY_MESSAGE),
  );
  assert.equal(missingCalls, 1);
});

test("a short regenerate is kept only when it returns, and the next bank draw can skip an id", async () => {
  const puzzle: Puzzle = {
    givens: [[0]],
    solution: [[1]],
    maxTechnique: "swordfish",
    unique: true,
  };
  const dealt = await dealExpert({
    entries: null,
    regenerate: async (maxAttempts) => {
      assert.equal(maxAttempts, EXPERT_FALLBACK_ATTEMPTS);
      return puzzle;
    },
    morph: identity,
  });
  assert.equal(dealt.bankId, null);
  assert.equal(dealt.puzzle.maxTechnique, "swordfish");

  const pool = [row("a", "y_wing", "expert"), row("b", "swordfish", "expert")];
  const next = await dealExpert({
    entries: pool,
    avoidId: "a",
    regenerate: async () => {
      throw new Error("pool is not empty");
    },
    morph: identity,
    rng: () => 0,
  });
  assert.equal(next.bankId, "b");
  assert.equal(next.puzzle.maxTechnique, "swordfish");
});
