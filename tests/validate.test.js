import { describe, it, expect } from 'vitest';
import { apiRequest } from './setup.js';

describe('Input validation', () => {
  it('rejects missing title', async () => {
    const res = await apiRequest('POST', '/api/posts', { content: 'body' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title/i);
  });

  it('rejects missing content', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'No body' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/content/i);
  });

  it('rejects title over 200 chars', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'x'.repeat(201), content: 'body' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title/i);
  });

  it('rejects content over 100KB', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'Big', content: 'x'.repeat(102401) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/content/i);
  });

  it('rejects invalid status value', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'Bad Status', content: 'x', status: 'archived' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/status/i);
  });
});
