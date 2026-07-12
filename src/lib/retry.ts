/**
 * Retry a promise-returning operation with exponential backoff.
 *
 * Neon's serverless tier auto-suspends the compute after idle; waking it can
 * take several seconds, during which queries transiently fail. The default
 * budget (4 attempts: 300ms, 600ms, 1200ms between tries ≈ 2s of waiting plus
 * query time) is sized to outlast a cold start.
 *
 * Pass a factory that builds a FRESH operation each attempt (e.g. a Drizzle
 * query is lazy — return the builder so it re-executes on retry).
 */
export async function withRetry<T>(fn: () => PromiseLike<T>, attempts = 4, delayMs = 300): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * 2 ** i));
    }
  }
  throw lastErr;
}
