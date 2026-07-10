/**
 * Retry a promise-returning operation a few times with linear backoff.
 *
 * Neon's serverless tier auto-suspends the compute after idle; the first query
 * after it wakes can transiently fail or time out. Wrapping critical reads in
 * withRetry() lets them recover instead of crashing the request.
 *
 * Pass a factory that builds a FRESH operation each attempt (e.g. a Drizzle
 * query is lazy — return the builder so it re-executes on retry).
 */
export async function withRetry<T>(fn: () => PromiseLike<T>, attempts = 3, delayMs = 250): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}
