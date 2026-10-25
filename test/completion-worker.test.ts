import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWED_ORIGINS,
  GET_LIMIT,
  IDEMP_TTL_SECONDS,
  POST_LIMIT,
  TOTAL_KEY,
  handleCompletionRequest,
  type CompletionKv,
} from "../worker/src/index.ts";

interface MemoryKv extends CompletionKv {
  rows: Map<string, { value: string; expiresAt?: number; expirationTtl?: number }>;
  reads: { key: string; cacheTtl?: number }[];
}

function memoryKv(): MemoryKv {
  const rows = new Map<string, { value: string; expiresAt?: number; expirationTtl?: number }>();
  const reads: { key: string; cacheTtl?: number }[] = [];
  return {
    rows,
    reads,
    async get(key, options) {
      await Promise.resolve();
      reads.push({ key, cacheTtl: options?.cacheTtl });
      const row = rows.get(key);
      if (!row) return null;
      if (row.expiresAt !== undefined && row.expiresAt <= Date.now()) {
        rows.delete(key);
        return null;
      }
      return row.value;
    },
    async put(key, value, options) {
      await Promise.resolve();
      const expirationTtl = options?.expirationTtl;
      rows.set(key, {
        value,
        expirationTtl,
        expiresAt: expirationTtl ? Date.now() + expirationTtl * 1000 : undefined,
      });
    },
  };
}

function request(method: string, path: string, origin?: string, idempotencyKey?: string, ip = "203.0.113.10"): Request {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  headers.set("CF-Connecting-IP", ip);
  return new Request(`https://worker.test${path}`, { method, headers });
}

async function readJson(response: Response): Promise<{ count?: number; error?: string }> {
  return (await response.json()) as { count?: number; error?: string };
}

test("GET /count is zero when the total key is missing", async () => {
  const kv = memoryKv();
  const response = await handleCompletionRequest(request("GET", "/count"), { COMPLETIONS: kv });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await readJson(response), { count: 0 });
  assert.equal(kv.rows.has(TOTAL_KEY), false);
  assert.equal(kv.reads.some((read) => read.key === TOTAL_KEY && read.cacheTtl === undefined), true);
  assert.equal(kv.reads.every((read) => read.cacheTtl === undefined), true);
});

test("POST /complete increments one shared total and replays an idempotency key", async () => {
  const kv = memoryKv();
  const env = { COMPLETIONS: kv };
  const origin = "https://mangohk.github.io";
  const first = await handleCompletionRequest(request("POST", "/complete", origin, "deal-a"), env);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("access-control-allow-origin"), origin);
  assert.deepEqual(await readJson(first), { count: 1 });
  assert.equal(kv.rows.get(TOTAL_KEY)?.value, "1");
  assert.equal(kv.rows.get("mysudok:completions:idemp:deal-a")?.value, "1");
  assert.ok((kv.rows.get("mysudok:completions:idemp:deal-a")?.expirationTtl ?? 0) >= IDEMP_TTL_SECONDS);
  assert.ok(IDEMP_TTL_SECONDS >= 86_400);

  const second = await handleCompletionRequest(request("POST", "/complete", origin, "deal-b"), env);
  assert.deepEqual(await readJson(second), { count: 2 });

  const replay = await handleCompletionRequest(request("POST", "/complete", origin, "deal-a"), env);
  assert.equal(replay.status, 200);
  assert.deepEqual(await readJson(replay), { count: 2 });
  assert.equal(kv.rows.get(TOTAL_KEY)?.value, "2");

  const again = await handleCompletionRequest(request("GET", "/count", origin), env);
  assert.deepEqual(await readJson(again), { count: 2 });
});

test("parallel completes in one isolate do not drop increments", async () => {
  const kv = memoryKv();
  const env = { COMPLETIONS: kv };
  const responses = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      handleCompletionRequest(request("POST", "/complete", undefined, `deal-${index}`), env),
    ),
  );
  const counts = [];
  for (const response of responses) {
    assert.equal(response.status, 200);
    counts.push((await readJson(response)).count);
  }
  counts.sort((left, right) => (left ?? 0) - (right ?? 0));
  assert.deepEqual(counts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("the same idempotency key in flight counts once", async () => {
  const kv = memoryKv();
  const env = { COMPLETIONS: kv };
  const [left, right] = await Promise.all([
    handleCompletionRequest(request("POST", "/complete", undefined, "same-deal"), env),
    handleCompletionRequest(request("POST", "/complete", undefined, "same-deal"), env),
  ]);
  assert.equal((await readJson(left)).count, 1);
  assert.equal((await readJson(right)).count, 1);
  assert.equal(kv.rows.get(TOTAL_KEY)?.value, "1");
});

test("CORS allowlist echoes Pages and Vite origins and rejects other sites", async () => {
  assert.ok(ALLOWED_ORIGINS.includes("https://mangohk.github.io"));
  assert.ok(ALLOWED_ORIGINS.includes("http://localhost:5173"));
  const kv = memoryKv();
  const env = { COMPLETIONS: kv };
  for (const origin of ["https://mangohk.github.io", "http://localhost:5173", "http://127.0.0.1:5173"]) {
    const response = await handleCompletionRequest(request("GET", "/count", origin), env);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
    assert.equal(response.headers.get("access-control-allow-headers"), "Content-Type, Idempotency-Key");
    assert.equal(response.headers.get("vary"), "Origin");
  }

  const blocked = await handleCompletionRequest(request("GET", "/count", "https://evil.example"), env);
  assert.equal(blocked.status, 200);
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  const lookalike = await handleCompletionRequest(
    request("GET", "/count", "https://mangohk.github.io.evil.com"),
    env,
  );
  assert.equal(lookalike.headers.get("access-control-allow-origin"), null);

  const preflight = await handleCompletionRequest(
    request("OPTIONS", "/complete", "https://mangohk.github.io"),
    env,
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://mangohk.github.io");
  assert.equal(preflight.headers.get("access-control-max-age"), "86400");
  assert.equal(kv.rows.has(TOTAL_KEY), false);
});

test("IP windows rate limit POST and GET separately", async () => {
  const kv = memoryKv();
  const env = { COMPLETIONS: kv };
  const now = 1_700_000_000_000;
  for (let index = 0; index < POST_LIMIT; index += 1) {
    const response = await handleCompletionRequest(request("POST", "/complete", undefined, `k-${index}`), env, { now });
    assert.equal(response.status, 200);
  }
  const limited = await handleCompletionRequest(request("POST", "/complete", undefined, "overflow"), env, { now });
  assert.equal(limited.status, 429);
  assert.deepEqual(await readJson(limited), { error: "rate_limited" });

  const otherIp = await handleCompletionRequest(
    request("POST", "/complete", undefined, "other-ip", "198.51.100.4"),
    env,
    { now },
  );
  assert.equal(otherIp.status, 200);

  const nextWindow = await handleCompletionRequest(request("POST", "/complete", undefined, "later"), env, {
    now: now + 60_000,
  });
  assert.equal(nextWindow.status, 200);

  for (let index = 0; index < GET_LIMIT; index += 1) {
    const response = await handleCompletionRequest(request("GET", "/count", undefined, undefined, "203.0.113.8"), env, {
      now,
    });
    assert.equal(response.status, 200);
  }
  const getLimited = await handleCompletionRequest(request("GET", "/count", undefined, undefined, "203.0.113.8"), env, {
    now,
  });
  assert.equal(getLimited.status, 429);
  assert.deepEqual(await readJson(getLimited), { error: "rate_limited" });
  const postStillOpen = await handleCompletionRequest(
    request("POST", "/complete", undefined, "post-while-get-limited", "203.0.113.8"),
    env,
    { now },
  );
  assert.equal(postStillOpen.status, 200);
});

test("unknown paths and wrong methods stay out of the API", async () => {
  const kv = memoryKv();
  const env = { COMPLETIONS: kv };
  for (const path of ["/stats", "/admin", "/login", "/complete/reset", "/count/初級", "/leaderboard"]) {
    const response = await handleCompletionRequest(request("GET", path), env);
    assert.equal(response.status, 404);
    assert.deepEqual(await readJson(response), { error: "not_found" });
  }
  const postCount = await handleCompletionRequest(request("POST", "/count"), env);
  assert.equal(postCount.status, 405);
  assert.deepEqual(await readJson(postCount), { error: "method_not_allowed" });
  const getComplete = await handleCompletionRequest(request("GET", "/complete"), env);
  assert.equal(getComplete.status, 405);
  assert.equal(kv.rows.has(TOTAL_KEY), false);
});

test("a broken total or a KV failure is an internal error without a stack", async () => {
  const kv = memoryKv();
  kv.rows.set(TOTAL_KEY, { value: "nope" });
  const corrupt = await handleCompletionRequest(request("GET", "/count"), { COMPLETIONS: kv });
  assert.equal(corrupt.status, 500);
  const body = await corrupt.text();
  assert.deepEqual(JSON.parse(body), { error: "internal" });
  assert.equal(body.includes("Error"), false);

  const down: CompletionKv = {
    async get() {
      throw new Error("kv down at /secret/path");
    },
    async put() {
      throw new Error("kv down");
    },
  };
  const failed = await handleCompletionRequest(request("POST", "/complete"), { COMPLETIONS: down });
  assert.equal(failed.status, 500);
  const text = await failed.text();
  assert.deepEqual(JSON.parse(text), { error: "internal" });
  assert.equal(text.includes("secret"), false);
});

test("a rejected idempotency key does not increment", async () => {
  const kv = memoryKv();
  const response = await handleCompletionRequest(
    request("POST", "/complete", undefined, "bad key"),
    { COMPLETIONS: kv },
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await readJson(response), { error: "bad_request" });
  assert.equal(kv.rows.has(TOTAL_KEY), false);
});
