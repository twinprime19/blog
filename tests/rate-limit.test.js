import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../middleware/rate-limit.js';

// Minimal Hono-like context mock for testing the middleware directly
function createMockContext(headers = {}) {
  const resHeaders = {};
  return {
    req: { header: (name) => headers[name.toLowerCase()] },
    header: (k, v) => { resHeaders[k] = v; },
    json: (body, status) => ({ body, status }),
    _resHeaders: resHeaders,
  };
}

describe('Rate Limiter (M6)', () => {
  it('allows requests within the limit', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    for (let i = 0; i < 3; i++) {
      const ctx = createMockContext({ 'x-forwarded-for': '1.2.3.4' });
      const result = await limiter(ctx, async () => 'ok');
      expect(result).toBe('ok');
    }
  });

  it('returns 429 with Retry-After when limit exceeded', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const ip = '10.0.0.1';

    // Exhaust the limit
    for (let i = 0; i < 2; i++) {
      await limiter(createMockContext({ 'x-forwarded-for': ip }), async () => 'ok');
    }

    // Next request should be blocked
    const ctx = createMockContext({ 'x-forwarded-for': ip });
    const result = await limiter(ctx, async () => 'ok');
    expect(result.status).toBe(429);
    expect(result.body.error).toMatch(/too many/i);
    expect(ctx._resHeaders['Retry-After']).toBeDefined();
  });

  it('isolates stores between limiter instances (M4)', async () => {
    const limiterA = createRateLimiter({ windowMs: 60_000, max: 1 });
    const limiterB = createRateLimiter({ windowMs: 60_000, max: 1 });
    const ip = '5.5.5.5';

    // Exhaust limiterA
    await limiterA(createMockContext({ 'x-forwarded-for': ip }), async () => 'ok');
    const blockedA = await limiterA(createMockContext({ 'x-forwarded-for': ip }), async () => 'ok');
    expect(blockedA.status).toBe(429);

    // limiterB should still allow the same IP
    const resultB = await limiterB(createMockContext({ 'x-forwarded-for': ip }), async () => 'ok');
    expect(resultB).toBe('ok');
  });

  it('extracts first IP from x-forwarded-for chain (M3)', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    // Use a chain — only the first IP should be keyed
    await limiter(createMockContext({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1' }), async () => 'ok');
    const blocked = await limiter(createMockContext({ 'x-forwarded-for': '9.9.9.9, 2.2.2.2' }), async () => 'ok');
    expect(blocked.status).toBe(429);
  });

  it('falls back to x-real-ip when x-forwarded-for absent', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    await limiter(createMockContext({ 'x-real-ip': '7.7.7.7' }), async () => 'ok');
    const blocked = await limiter(createMockContext({ 'x-real-ip': '7.7.7.7' }), async () => 'ok');
    expect(blocked.status).toBe(429);
  });
});
