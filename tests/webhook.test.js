import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { app } from './setup.js';

const SECRET = 'test-webhook-secret';

function signPayload(body) {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('POST /webhook/deploy', () => {
  it('returns 401 without valid HMAC signature', async () => {
    const body = JSON.stringify({ ref: 'refs/heads/main' });
    const res = await app.request('/webhook/deploy', {
      method: 'POST',
      body,
      headers: { 'x-hub-signature-256': 'sha256=invalid' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with missing signature header', async () => {
    const body = JSON.stringify({ ref: 'refs/heads/main' });
    const res = await app.request('/webhook/deploy', {
      method: 'POST',
      body,
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for malformed JSON with valid signature (C2)', async () => {
    const body = 'not json {{{';
    const sig = signPayload(body);
    const res = await app.request('/webhook/deploy', {
      method: 'POST',
      body,
      headers: { 'x-hub-signature-256': sig },
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  it('skips non-main branch pushes', async () => {
    const body = JSON.stringify({ ref: 'refs/heads/develop' });
    const sig = signPayload(body);
    const res = await app.request('/webhook/deploy', {
      method: 'POST',
      body,
      headers: { 'x-hub-signature-256': sig },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe(true);
  });

  it('returns deploying:true for valid main branch push', async () => {
    const body = JSON.stringify({
      ref: 'refs/heads/main',
      head_commit: { id: 'abc1234567890', message: 'test commit' },
    });
    const sig = signPayload(body);
    const res = await app.request('/webhook/deploy', {
      method: 'POST',
      body,
      headers: { 'x-hub-signature-256': sig },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deploying).toBe(true);
  });
});
