// H3: Simple in-memory rate limiter for write endpoints
export function createRateLimiter({ windowMs = 60_000, max = 20 } = {}) {
  // M4: Each limiter instance gets its own isolated store
  const store = new Map();

  // Cleanup stale entries periodically
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.start > windowMs) store.delete(key);
    }
  }, 5 * 60_000);
  cleanup.unref();

  return async (c, next) => {
    // M3: Extract client IP — first entry from x-forwarded-for, then x-real-ip, then 'unknown'
    // Assumes a trusted reverse proxy sets these headers
    const forwarded = c.req.header('x-forwarded-for');
    const key = (forwarded ? forwarded.split(',')[0].trim() : null)
      || c.req.header('x-real-ip')
      || 'unknown';
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || now - entry.start > windowMs) {
      entry = { count: 0, start: now };
      store.set(key, entry);
    }

    entry.count++;
    if (entry.count > max) {
      c.header('Retry-After', String(Math.ceil((entry.start + windowMs - now) / 1000)));
      return c.json({ error: 'Too many requests' }, 429);
    }

    return next();
  };
}
