const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_MAX_CALLS = 2;

/**
 * Simple in-memory rate limiter keyed by IP.
 * Note: resets on server restart; for stricter enforcement, persist to Redis/Supabase.
 */
class DemoRateLimit {
  constructor({ windowMs = DEFAULT_WINDOW_MS, maxCalls = DEFAULT_MAX_CALLS } = {}) {
    this.windowMs = windowMs;
    this.maxCalls = maxCalls;
    this.store = new Map(); // ip -> { count, resetAtMs }

    // Best-effort cleanup to prevent unbounded growth.
    const interval = setInterval(() => this.prune(), Math.min(this.windowMs, 60 * 60 * 1000));
    // Don't keep the process alive because of this timer.
    interval.unref?.();
  }

  prune() {
    const now = Date.now();
    for (const [ip, entry] of this.store.entries()) {
      if (!entry || entry.resetAtMs <= now) {
        this.store.delete(ip);
      }
    }
  }

  consume(ip) {
    const now = Date.now();
    const key = (ip || 'unknown').trim() || 'unknown';

    const existing = this.store.get(key);
    if (!existing || existing.resetAtMs <= now) {
      const resetAtMs = now + this.windowMs;
      this.store.set(key, { count: 1, resetAtMs });
      return {
        allowed: true,
        remaining: Math.max(this.maxCalls - 1, 0),
        resetAt: new Date(resetAtMs).toISOString(),
      };
    }

    if (existing.count >= this.maxCalls) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(existing.resetAtMs).toISOString(),
      };
    }

    existing.count += 1;
    this.store.set(key, existing);

    return {
      allowed: true,
      remaining: Math.max(this.maxCalls - existing.count, 0),
      resetAt: new Date(existing.resetAtMs).toISOString(),
    };
  }
}

module.exports = new DemoRateLimit();
module.exports.DemoRateLimit = DemoRateLimit;

