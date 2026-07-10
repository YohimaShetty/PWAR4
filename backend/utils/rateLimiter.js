/**
 * rateLimiter.js
 * A minimal sliding-window rate limiter, no external dependency.
 * Suitable for a single-instance deployment (Render/Railway/Vercel functions
 * with a warm instance). For multi-instance production, swap this for a
 * Redis-backed limiter — the interface below stays the same.
 */

function createRateLimiter({
  windowMs = 60000,
  max = 30,
  methods = null,
  skip = null,
} = {}) {
  const hits = new Map(); // ip -> array of timestamps

  return function rateLimit(req, res, next) {
    if (typeof skip === 'function' && skip(req)) return next();
    if (Array.isArray(methods) && methods.length > 0 && !methods.includes(req.method)) return next();

    const forwarded = req.headers['x-forwarded-for'];
    const forwardedIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null;
    const ip = forwardedIp || req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = (hits.get(ip) || []).filter((t) => t > windowStart);
    timestamps.push(now);
    hits.set(ip, timestamps);

    const remaining = Math.max(0, max - timestamps.length);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(windowStart / 1000) + Math.ceil(windowMs / 1000)));

    if (timestamps.length > max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again shortly.',
      });
    }
    return next();
  };
}

module.exports = createRateLimiter;
