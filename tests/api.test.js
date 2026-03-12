import { describe, it, expect, beforeEach } from 'vitest';
import { app, clearPosts, apiRequest } from './setup.js';

beforeEach(() => clearPosts());

const samplePost = { title: 'Test Post', content: '## Hello\n\nWorld' };

describe('POST /api/posts', () => {
  it('creates a post and returns 201 with id and slug', async () => {
    const res = await apiRequest('POST', '/api/posts', samplePost);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.slug).toBe('test-post');
  });

  it('auto-generates slug from title', async () => {
    const res = await apiRequest('POST', '/api/posts', { title: 'My Great Article!', content: 'body' });
    const body = await res.json();
    expect(body.slug).toBe('my-great-article');
  });

  it('returns 409 for duplicate slug', async () => {
    await apiRequest('POST', '/api/posts', samplePost);
    const res = await apiRequest('POST', '/api/posts', samplePost);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/slug/i);
  });
});

describe('GET /api/posts', () => {
  it('returns published posts', async () => {
    await apiRequest('POST', '/api/posts', samplePost);
    await apiRequest('POST', '/api/posts', { title: 'Draft', content: 'x', status: 'draft' });
    const res = await app.request('/api/posts');
    expect(res.status).toBe(200);
    const posts = await res.json();
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('Test Post');
  });
});

describe('GET /api/posts/:slug', () => {
  it('returns a single post by slug', async () => {
    await apiRequest('POST', '/api/posts', samplePost);
    const res = await app.request('/api/posts/test-post');
    expect(res.status).toBe(200);
    const post = await res.json();
    expect(post.title).toBe('Test Post');
    expect(post.content).toBe('## Hello\n\nWorld');
  });

  it('returns 404 for nonexistent post', async () => {
    const res = await app.request('/api/posts/no-such-post');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/posts/:slug', () => {
  it('updates post fields', async () => {
    await apiRequest('POST', '/api/posts', samplePost);
    const res = await apiRequest('PUT', '/api/posts/test-post', { title: 'Updated Title' });
    expect(res.status).toBe(200);
    const check = await app.request('/api/posts/test-post');
    const post = await check.json();
    expect(post.title).toBe('Updated Title');
  });
});

describe('DELETE /api/posts/:slug', () => {
  it('deletes a post and returns ok', async () => {
    await apiRequest('POST', '/api/posts', samplePost);
    const res = await apiRequest('DELETE', '/api/posts/test-post');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Verify gone
    const check = await app.request('/api/posts/test-post');
    expect(check.status).toBe(404);
  });
});

describe('Auth', () => {
  it('returns 401 without auth header', async () => {
    const res = await app.request('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePost),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await app.request('/api/posts', {
      method: 'POST',
      headers: { Authorization: 'Bearer bad-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePost),
    });
    expect(res.status).toBe(401);
  });

  it('allows read endpoints without auth', async () => {
    const res = await app.request('/api/posts');
    expect(res.status).toBe(200);
  });
});

describe('Health check', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
