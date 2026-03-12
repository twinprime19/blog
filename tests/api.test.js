import { describe, it, expect, beforeEach } from 'vitest';
import { app, clearPosts, apiRequest, WRITER_A_TOKEN, WRITER_B_TOKEN } from './setup.js';

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

  it('returns 404 for draft post (C1)', async () => {
    await apiRequest('POST', '/api/posts', { ...samplePost, status: 'draft', slug: 'draft-api' });
    const res = await app.request('/api/posts/draft-api');
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed slug (H5)', async () => {
    const res = await app.request('/api/posts/UPPERCASE');
    expect(res.status).toBe(400);
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

  it('returns 400 for malformed slug (H5)', async () => {
    const res = await apiRequest('PUT', '/api/posts/INVALID_SLUG', { title: 'Hack' });
    expect(res.status).toBe(400);
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

  it('returns 400 for malformed slug (H5)', async () => {
    const res = await apiRequest('DELETE', '/api/posts/BAD SLUG!');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/posts — cover_image validation (C3)', () => {
  it('rejects javascript: protocol in cover_image', async () => {
    const res = await apiRequest('POST', '/api/posts', { ...samplePost, cover_image: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cover_image/i);
  });

  it('accepts https:// cover_image', async () => {
    const res = await apiRequest('POST', '/api/posts', { ...samplePost, cover_image: 'https://example.com/img.jpg', slug: 'https-img' });
    expect(res.status).toBe(201);
  });

  it('accepts relative / cover_image', async () => {
    const res = await apiRequest('POST', '/api/posts', { ...samplePost, cover_image: '/images/photo.jpg', slug: 'rel-img' });
    expect(res.status).toBe(201);
  });
});

describe('Pagination (M5)', () => {
  it('?limit=1 returns 1 post', async () => {
    await apiRequest('POST', '/api/posts', { title: 'Post A', content: 'a', slug: 'post-a' });
    await apiRequest('POST', '/api/posts', { title: 'Post B', content: 'b', slug: 'post-b' });
    const res = await app.request('/api/posts?limit=1');
    const posts = await res.json();
    expect(posts).toHaveLength(1);
  });

  it('?page=2 returns empty when no more posts', async () => {
    await apiRequest('POST', '/api/posts', { title: 'Only Post', content: 'a', slug: 'only' });
    const res = await app.request('/api/posts?page=2&limit=1');
    const posts = await res.json();
    expect(posts).toHaveLength(0);
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

describe('Ownership — writer token scoping', () => {
  // Use distinct X-Forwarded-For per test to avoid shared rate-limit bucket
  function ownershipRequest(method, path, body, token) {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Forwarded-For': `ownership-test-${Math.random()}`,
    };
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    return app.request(path, opts);
  }

  it('writer can delete own post', async () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 255)}`;
    const hdrs = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'X-Forwarded-For': ip });
    await app.request('/api/posts', { method: 'POST', headers: hdrs(WRITER_A_TOKEN), body: JSON.stringify({ title: 'Writer A Post', content: 'body', slug: 'wa-post' }) });
    const res = await app.request('/api/posts/wa-post', { method: 'DELETE', headers: hdrs(WRITER_A_TOKEN) });
    expect(res.status).toBe(200);
  });

  it('writer cannot delete another writer\'s post', async () => {
    const ip = `10.0.1.${Math.floor(Math.random() * 255)}`;
    const hdrs = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'X-Forwarded-For': ip });
    await app.request('/api/posts', { method: 'POST', headers: hdrs(WRITER_A_TOKEN), body: JSON.stringify({ title: 'Writer A Post', content: 'body', slug: 'wa-post' }) });
    const res = await app.request('/api/posts/wa-post', { method: 'DELETE', headers: hdrs(WRITER_B_TOKEN) });
    expect(res.status).toBe(403);
  });

  it('writer can update own post', async () => {
    const ip = `10.0.2.${Math.floor(Math.random() * 255)}`;
    const hdrs = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'X-Forwarded-For': ip });
    await app.request('/api/posts', { method: 'POST', headers: hdrs(WRITER_A_TOKEN), body: JSON.stringify({ title: 'Writer A Post', content: 'body', slug: 'wa-post' }) });
    const res = await app.request('/api/posts/wa-post', { method: 'PUT', headers: hdrs(WRITER_A_TOKEN), body: JSON.stringify({ title: 'Updated' }) });
    expect(res.status).toBe(200);
  });

  it('writer cannot update another writer\'s post', async () => {
    const ip = `10.0.3.${Math.floor(Math.random() * 255)}`;
    const hdrs = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'X-Forwarded-For': ip });
    await app.request('/api/posts', { method: 'POST', headers: hdrs(WRITER_A_TOKEN), body: JSON.stringify({ title: 'Writer A Post', content: 'body', slug: 'wa-post' }) });
    const res = await app.request('/api/posts/wa-post', { method: 'PUT', headers: hdrs(WRITER_B_TOKEN), body: JSON.stringify({ title: 'Hacked' }) });
    expect(res.status).toBe(403);
  });

  it('admin can delete any writer\'s post', async () => {
    const ip = `10.0.4.${Math.floor(Math.random() * 255)}`;
    const hdrs = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'X-Forwarded-For': ip });
    await app.request('/api/posts', { method: 'POST', headers: hdrs(WRITER_A_TOKEN), body: JSON.stringify({ title: 'Writer A Post', content: 'body', slug: 'wa-post' }) });
    const res = await app.request('/api/posts/wa-post', { method: 'DELETE', headers: hdrs('test-token-for-vitest') });
    expect(res.status).toBe(200);
  });

  it('admin can update any writer\'s post', async () => {
    const ip = `10.0.5.${Math.floor(Math.random() * 255)}`;
    const hdrs = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'X-Forwarded-For': ip });
    await app.request('/api/posts', { method: 'POST', headers: hdrs(WRITER_A_TOKEN), body: JSON.stringify({ title: 'Writer A Post', content: 'body', slug: 'wa-post' }) });
    const res = await app.request('/api/posts/wa-post', { method: 'PUT', headers: hdrs('test-token-for-vitest'), body: JSON.stringify({ title: 'Admin Edit' }) });
    expect(res.status).toBe(200);
  });

  it('writer cannot delete legacy post (created_by=NULL)', async () => {
    const { db } = await import('./setup.js');
    db.prepare("INSERT INTO posts (slug, title, content, author) VALUES ('legacy', 'Legacy', 'old', 'Admin')").run();
    const ip = `10.0.6.${Math.floor(Math.random() * 255)}`;
    const hdrs = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', 'X-Forwarded-For': ip });
    const res = await app.request('/api/posts/legacy', { method: 'DELETE', headers: hdrs(WRITER_A_TOKEN) });
    expect(res.status).toBe(403);
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
