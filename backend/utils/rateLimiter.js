/**
 * rateLimiter.js
 * A minimal sliding-window rate limiter, no external dependency.
 * Suitable for a single-instance deployment (Render/Railway/Vercel functions
 * with a warm instance). For multi-instance production, swap this for a
 * Redis-backed limiter — the interface below stays the same.
 */

function createRateLimiter({ windowMs = 60000, max = 30 } = {}) {
  const hits = new Map(); // ip -> array of timestamps

  return function rateLimit(req, res, next) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = (hits.get(ip) || []).filter((t) => t > windowStart);
    timestamps.push(now);
    hits.set(ip, timestamps);

    if (timestamps.length > max) {
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again shortly.',
      });
    }
    return next();
  };
}

module.exports = createRateLimiter;
