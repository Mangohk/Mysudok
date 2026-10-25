export const TOTAL_KEY = "mysudok:completions:total";
export const IDEMP_PREFIX = "mysudok:completions:idemp:";
/** At least 24h so a retry of the same finished deal does not count twice. */
export const IDEMP_TTL_SECONDS = 86_400;
export const POST_LIMIT = 20;
export const GET_LIMIT = 60;

export const ALLOWED_ORIGINS = [
  "https://mangohk.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
] as const;

const RATE_TTL_SECONDS = 120;
const IDEMP_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface CompletionKv {
  get(key: string, options?: { cacheTtl?: number }): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface CompletionEnv {
  COMPLETIONS: CompletionKv;
}

export interface HandleOptions {
  now?: number;
}

let kvChain: Promise<void> = Promise.resolve();

/** One in-flight read-modify-write at a time inside this isolate. */
function withKvLock<T>(task: () => Promise<T>): Promise<T> {
  const run = kvChain.then(task, task);
  kvChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  return (ALLOWED_ORIGINS as readonly string[]).includes(origin) ? origin : null;
}

function applyCors(headers: Headers, origin: string | null): void {
  headers.set("Vary", "Origin");
  if (!origin) return;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
}

function json(body: { count: number } | { error: string }, status: number, origin: string | null): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  applyCors(headers, origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function clientIp(request: Request): string {
  const raw = request.headers.get("CF-Connecting-IP") ?? "";
  if (/^[0-9a-fA-F:.]{1,64}$/.test(raw)) return raw;
  return "unknown";
}

function idempotencyKey(request: Request): string | null | "invalid" {
  const raw = request.headers.get("Idempotency-Key");
  if (raw === null || raw.trim() === "") return null;
  if (!IDEMP_KEY_RE.test(raw)) return "invalid";
  return raw;
}

function parseTotal(raw: string | null): number {
  if (raw === null) return 0;
  if (!/^[0-9]+$/.test(raw)) throw new Error("corrupt total");
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error("corrupt total");
  return value;
}

async function consumeRate(kv: CompletionKv, kind: "get" | "post", ip: string, now: number): Promise<boolean> {
  const limit = kind === "post" ? POST_LIMIT : GET_LIMIT;
  const bucket = Math.floor(now / 60_000);
  const key = `mysudok:completions:rl:${kind}:${ip}:${bucket}`;
  const raw = await kv.get(key, { cacheTtl: 0 });
  const used = raw !== null && /^[0-9]+$/.test(raw) ? Number(raw) : 0;
  if (used >= limit) return false;
  await kv.put(key, String(used + 1), { expirationTtl: RATE_TTL_SECONDS });
  return true;
}

async function readTotal(kv: CompletionKv): Promise<number> {
  return parseTotal(await kv.get(TOTAL_KEY, { cacheTtl: 0 }));
}

async function completeOnce(kv: CompletionKv, key: string | null): Promise<number> {
  if (key) {
    const seen = await kv.get(`${IDEMP_PREFIX}${key}`, { cacheTtl: 0 });
    if (seen !== null) return readTotal(kv);
  }
  const current = await readTotal(kv);
  if (current === Number.MAX_SAFE_INTEGER) throw new Error("overflow");
  const next = current + 1;
  await kv.put(TOTAL_KEY, String(next));
  if (key) await kv.put(`${IDEMP_PREFIX}${key}`, "1", { expirationTtl: IDEMP_TTL_SECONDS });
  return next;
}

export async function handleCompletionRequest(
  request: Request,
  env: CompletionEnv,
  options?: HandleOptions,
): Promise<Response> {
  const origin = allowedOrigin(request);
  const path = new URL(request.url).pathname;
  const known = path === "/count" || path === "/complete";
  if (request.method === "OPTIONS" && known) {
    const headers = new Headers();
    applyCors(headers, origin);
    if (origin) headers.set("Access-Control-Max-Age", "86400");
    return new Response(null, { status: 204, headers });
  }
  if (!known) return json({ error: "not_found" }, 404, origin);
  const methodOk = (path === "/count" && request.method === "GET") || (path === "/complete" && request.method === "POST");
  if (!methodOk) return json({ error: "method_not_allowed" }, 405, origin);

  const key = request.method === "POST" ? idempotencyKey(request) : null;
  if (key === "invalid") return json({ error: "bad_request" }, 400, origin);

  try {
    return await withKvLock(async () => {
      const kind = request.method === "POST" ? "post" : "get";
      const allowed = await consumeRate(env.COMPLETIONS, kind, clientIp(request), options?.now ?? Date.now());
      if (!allowed) return json({ error: "rate_limited" }, 429, origin);
      if (request.method === "GET") return json({ count: await readTotal(env.COMPLETIONS) }, 200, origin);
      return json({ count: await completeOnce(env.COMPLETIONS, key) }, 200, origin);
    });
  } catch {
    return json({ error: "internal" }, 500, origin);
  }
}

export default {
  fetch(request: Request, env: CompletionEnv): Promise<Response> {
    return handleCompletionRequest(request, env);
  },
};
