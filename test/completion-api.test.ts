import assert from "node:assert/strict";
import test from "node:test";
import {
  completionApiBase,
  completionCountLine,
  fetchCompletionCount,
  loadHomeCompletionCount,
  normalizeCompletionApiBase,
  postCompletion,
  publishCompletion,
  takeCompletionPost,
  type FetchLike,
} from "../src/completion-api.ts";

test("API base is build-time, trimmed, and empty means no endpoint", () => {
  assert.equal(normalizeCompletionApiBase(undefined), null);
  assert.equal(normalizeCompletionApiBase(null), null);
  assert.equal(normalizeCompletionApiBase(""), null);
  assert.equal(normalizeCompletionApiBase("   "), null);
  assert.equal(normalizeCompletionApiBase("https://count.example/"), "https://count.example");
  assert.equal(normalizeCompletionApiBase("https://count.example///"), "https://count.example");
  assert.equal(completionApiBase({ VITE_COMPLETION_API_URL: "" }), null);
  assert.equal(completionApiBase({}), null);
  assert.equal(
    completionApiBase({ VITE_COMPLETION_API_URL: "https://count.example/" }),
    "https://count.example",
  );
});

test("home copy is 已完成 N 局 and the failure line keeps the em dash", () => {
  assert.equal(completionCountLine(0), "已完成 0 局");
  assert.equal(completionCountLine(42), "已完成 42 局");
  assert.equal(completionCountLine(null), "已完成 — 局");
  assert.equal(completionCountLine(-1), "已完成 — 局");
  assert.equal(completionCountLine(1.5), "已完成 — 局");
  assert.equal(completionCountLine(Number.NaN), "已完成 — 局");
  assert.equal(completionCountLine(Number.POSITIVE_INFINITY), "已完成 — 局");
});

test("GET /count reads a non-negative integer and rejects failures", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const fetchImpl: FetchLike = async (url, init) => {
    seen.url = url;
    seen.init = init;
    return Response.json({ count: 8 });
  };
  assert.equal(await fetchCompletionCount("https://count.example", fetchImpl), 8);
  assert.equal(seen.url, "https://count.example/count");
  assert.equal(seen.init?.method, "GET");
  assert.equal(seen.init?.cache, "no-store");
  assert.equal(seen.init?.credentials, "omit");

  const failing: FetchLike = async () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });
  await assert.rejects(() => fetchCompletionCount("https://count.example", failing));

  const shaped: FetchLike = async () => Response.json({ count: -3 });
  await assert.rejects(() => fetchCompletionCount("https://count.example", shaped));
});

test("POST /complete sends one Idempotency-Key and an empty JSON body", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const fetchImpl: FetchLike = async (url, init) => {
    seen.url = url;
    seen.init = init;
    return Response.json({ count: 9 });
  };
  assert.equal(await postCompletion("https://count.example", "play-uuid-1", fetchImpl), 9);
  assert.equal(seen.url, "https://count.example/complete");
  assert.equal(seen.init?.method, "POST");
  assert.equal(seen.init?.body, "{}");
  assert.equal(seen.init?.credentials, "omit");
  const headers = new Headers(seen.init?.headers);
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(headers.get("Idempotency-Key"), "play-uuid-1");
});

test("publishing retries a lost response once and never throws", async () => {
  let calls = 0;
  const flaky: FetchLike = async () => {
    calls += 1;
    if (calls === 1) return new Response("nope", { status: 500 });
    return Response.json({ count: 3 });
  };
  await publishCompletion("https://count.example", "same-key", flaky);
  assert.equal(calls, 2);

  calls = 0;
  const down: FetchLike = async () => {
    calls += 1;
    throw new Error("offline");
  };
  await publishCompletion("https://count.example", "same-key", down);
  assert.equal(calls, 2);

  calls = 0;
  await publishCompletion(null, "same-key", down);
  assert.equal(calls, 0);
});

test("home load returns null without a base or when the read fails", async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls += 1;
    return Response.json({ count: 4 });
  };
  assert.equal(await loadHomeCompletionCount(null, fetchImpl), null);
  assert.equal(calls, 0);
  assert.equal(await loadHomeCompletionCount("https://count.example", fetchImpl), 4);
  const failing: FetchLike = async () => new Response("", { status: 503 });
  assert.equal(await loadHomeCompletionCount("https://count.example", failing), null);
});

test("a solved play posts once; a redraw or an unfinished play does not", () => {
  const play = { complete: true, completionPosted: false, playId: "deal-1" };
  const first = takeCompletionPost(play, false);
  assert.deepEqual(first, { playId: "deal-1" });
  assert.equal(play.completionPosted, true);
  assert.equal(takeCompletionPost(play, true), null);
  assert.equal(takeCompletionPost({ complete: false, completionPosted: false, playId: "deal-2" }, false), null);
  assert.equal(takeCompletionPost({ complete: true, completionPosted: false, playId: "" }, false), null);
});
