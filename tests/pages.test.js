import { describe, it, expect, beforeEach } from 'vitest';
import { app, clearPosts, apiRequest } from './setup.js';

beforeEach(() => clearPosts());

describe('GET / (home page)', () => {
  it('returns 200 with post cards', async () => {
    await apiRequest('POST', '/api/posts', { title: 'Hello World', content: 'body' });
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Hello World');
    expect(html).toContain('post-card');
  });

  it('shows "No posts yet" when empty', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('No posts yet');
  });
});

describe('GET /p/:slug (single post)', () => {
  it('renders markdown and returns 200', async () => {
    await apiRequest('POST', '/api/posts', { title: 'Markdown Test', content: '## Heading\n\nParagraph', slug: 'md-test' });
    const res = await app.request('/p/md-test');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<h2>');
    expect(html).toContain('Markdown Test');
  });

  it('returns 404 for nonexistent post', async () => {
    const res = await app.request('/p/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns 404 for draft post', async () => {
    await apiRequest('POST', '/api/posts', { title: 'Draft', content: 'x', status: 'draft', slug: 'draft-post' });
    const res = await app.request('/p/draft-post');
    expect(res.status).toBe(404);
  });

  it('escapes XSS in title — <script> tags are entity-encoded', async () => {
    await apiRequest('POST', '/api/posts', { title: '<script>alert(1)</script>', content: 'safe', slug: 'xss-test' });
    const res = await app.request('/p/xss-test');
    const html = await res.text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes OG meta tags', async () => {
    await apiRequest('POST', '/api/posts', { title: 'OG Test', subtitle: 'OG Sub', content: 'body', slug: 'og-test' });
    const res = await app.request('/p/og-test');
    const html = await res.text();
    expect(html).toContain('og:title');
    expect(html).toContain('og:description');
    expect(html).toContain('og:url');
  });
});
