/** Resolves after `ms`, or rejects with an AbortError as soon as `signal` aborts. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Exponential backoff: base, 2×base, 4×base … capped at `maxSeconds`. */
export function backoffSeconds(failureIndex: number, baseSeconds: number, maxSeconds: number): number {
  return Math.min(baseSeconds * 2 ** Math.max(0, failureIndex - 1), maxSeconds);
}

/** Adds a random cooldown without ever shortening the configured minimum delay. */
export function jitterSeconds(baseSeconds: number, extraPercent: number, random: () => number = Math.random): number {
  const safeBase = Math.max(1, Math.round(baseSeconds));
  const safePercent = Math.min(100, Math.max(0, extraPercent));
  const extra = Math.round(safeBase * (safePercent / 100) * Math.min(1, Math.max(0, random())));
  return safeBase + extra;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function abortError(): Error {
  const error = new Error("Send run stopped");
  error.name = "AbortError";
  return error;
}
