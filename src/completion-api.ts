export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const COUNT_TIMEOUT_MS = 8_000;

export function normalizeCompletionApiBase(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : null;
}

export function completionApiBase(source?: { VITE_COMPLETION_API_URL?: string }): string | null {
  return normalizeCompletionApiBase((source ?? readViteEnv()).VITE_COMPLETION_API_URL);
}

function readViteEnv(): { VITE_COMPLETION_API_URL?: string } {
  const env = (import.meta as ImportMeta).env;
  if (!env || typeof env !== "object") return {};
  return env;
}

export function completionCountLine(count: number | null): string {
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return "已完成 — 局";
  return `已完成 ${count} 局`;
}

function isCountBody(body: unknown): body is { count: number } {
  if (typeof body !== "object" || body === null) return false;
  const count = (body as { count?: unknown }).count;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
}

async function readCount(response: Response): Promise<number> {
  if (!response.ok) throw new Error(`completion ${response.status}`);
  const body: unknown = await response.json();
  if (!isCountBody(body)) throw new Error("completion shape");
  return body.count;
}

export async function fetchCompletionCount(base: string, fetchImpl: FetchLike = fetch): Promise<number> {
  const response = await fetchImpl(`${base}/count`, {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    signal: AbortSignal.timeout(COUNT_TIMEOUT_MS),
  });
  return readCount(response);
}

export async function postCompletion(
  base: string,
  idempotencyKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<number> {
  const response = await fetchImpl(`${base}/complete`, {
    method: "POST",
    cache: "no-store",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: "{}",
    signal: AbortSignal.timeout(COUNT_TIMEOUT_MS),
  });
  return readCount(response);
}

/** One attempt, then a single retry. Failures stay quiet so the finished puzzle still shows. */
export async function publishCompletion(
  base: string | null,
  idempotencyKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  if (!base) return;
  try {
    await postCompletion(base, idempotencyKey, fetchImpl);
  } catch {
    try {
      await postCompletion(base, idempotencyKey, fetchImpl);
    } catch {
      // Home reads the stored total later. The done overlay does not wait on this.
    }
  }
}

export async function loadHomeCompletionCount(
  base: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<number | null> {
  if (!base) return null;
  try {
    return await fetchCompletionCount(base, fetchImpl);
  } catch {
    return null;
  }
}

export interface CompletionPlayFlag {
  complete: boolean;
  completionPosted: boolean;
  playId: string;
}

/** First transition into a solved board for this deal. Re-renders return null. */
export function takeCompletionPost(
  play: CompletionPlayFlag,
  wasComplete: boolean,
): { playId: string } | null {
  if (wasComplete || !play.complete || play.completionPosted || play.playId.length === 0) return null;
  play.completionPosted = true;
  return { playId: play.playId };
}
