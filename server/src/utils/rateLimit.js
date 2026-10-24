import { ApiError } from "./apiError.js";

export function createRateLimiter({ windowMs, max, now = () => Date.now() }) {
  // Sliding window: per-key list of hit timestamps kept sorted oldest first.
  const hits = new Map();
  const MAX_KEYS = 5000;
  let checks = 0;

  function prune(t) {
    checks += 1;

    if (hits.size <= MAX_KEYS && checks % 100 !== 0) {
      return;
    }

    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter((ts) => ts > t - windowMs);

      if (fresh.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, fresh);
      }
    }
  }

  return {
    check(key) {
      const t = now();
      prune(t);

      const timestamps = (hits.get(key) ?? []).filter((ts) => ts > t - windowMs);

      if (timestamps.length >= max) {
        hits.set(key, timestamps);
        const retryAfterMs = Math.max(windowMs - (t - timestamps[0]), 0);
        return { ok: false, remaining: 0, retryAfterMs };
      }

      timestamps.push(t);
      hits.set(key, timestamps);
      return { ok: true, remaining: max - timestamps.length, retryAfterMs: 0 };
    },

    size() {
      return hits.size;
    },

    reset() {
      hits.clear();
    },
  };
}

export function rateLimit({ windowMs, max, keyBy = "ip" }) {
  const limiter = createRateLimiter({ windowMs, max });

  return function rateLimitMiddleware(req, res, next) {
    const key = keyBy === "user" ? (req.user?.id ?? "anonymous") : (req.ip ?? "unknown");
    const result = limiter.check(key);

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(result.remaining));

    if (!result.ok) {
      res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
      return next(new ApiError(429, "Too many requests. Please try again later."));
    }

    return next();
  };
}
