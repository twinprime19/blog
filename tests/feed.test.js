import { describe, it, expect, beforeEach } from 'vitest';
import { app, clearPosts, apiRequest } from './setup.js';

beforeEach(() => clearPosts());

const samplePost = { title: 'Feed Test Post', subtitle: 'A subtitle', content: '## Hello', author: 'TestBot' };

describe('GET /rss.xml', () => {
  it('returns valid RSS 2.0 XML with correct content-type', async () => {
    await apiRequest('POST', '/api/posts', samplePost);
    const res = await app.request('/rss.xml');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/rss+xml');
    const xml = await res.text();
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>Feed Test Post</title>');
    expect(xml).toContain('<dc:creator>TestBot</dc:creator>');
    expect(xml).toContain('<description>A subtitle</description>');
  });

  it('returns empty channel when no posts exist', async () => {
    const res = await app.request('/rss.xml');
    const xml = await res.text();
    expect(xml).toContain('<channel>');
    expect(xml).not.toContain('<item>');
  });

  it('escapes XML special characters', async () => {
    await apiRequest('POST', '/api/posts', {
      title: 'Test & <Script>', content: 'body', slug: 'xml-escape-test'
    });
    const res = await app.request('/rss.xml');
    const xml = await res.text();
    expect(xml).toContain('Test &amp; &lt;Script&gt;');
    expect(xml).not.toContain('<Script>');
  });

  it('excludes draft posts', async () => {
    await apiRequest('POST', '/api/posts', { ...samplePost, status: 'draft' });
    const res = await app.request('/rss.xml');
    const xml = await res.text();
    expect(xml).not.toContain('Feed Test Post');
  });
});

describe('GET /sitemap.xml', () => {
  it('returns valid sitemap XML with correct content-type', async () => {
    await apiRequest('POST', '/api/posts', samplePost);
    const res = await app.request('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
    const xml = await res.text();
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('/p/feed-test-post</loc>');
    expect(xml).toContain('<lastmod>');
  });

  it('includes homepage URL', async () => {
    const res = await app.request('/sitemap.xml');
    const xml = await res.text();
    expect(xml).toContain('<loc>');
    // Homepage entry should be present even with no posts
    expect(xml).toContain('</loc>');
  });

  it('excludes draft posts', async () => {
    await apiRequest('POST', '/api/posts', { ...samplePost, status: 'draft', slug: 'draft-sitemap' });
    const res = await app.request('/sitemap.xml');
    const xml = await res.text();
    expect(xml).not.toContain('draft-sitemap');
  });
});
