import { Hono } from 'hono';
import db from './db.js';
import { siteUrl, siteTitle, siteDescription } from './config.js';

const feed = new Hono();

// XML-escape special characters
const escXml = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Extract YYYY-MM-DD from SQLite datetime, fallback to today
const toDateStr = (d) => {
  const m = String(d || '').match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : new Date().toISOString().split('T')[0];
};

// RSS 2.0 feed — latest 20 published posts
feed.get('/rss.xml', (c) => {
  const posts = db.prepare(`
    SELECT slug, title, subtitle, author, published_at
    FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 20
  `).all();

  const items = posts.map(p => `
    <item>
      <title>${escXml(p.title)}</title>
      <link>${escXml(siteUrl)}/p/${escXml(p.slug)}</link>
      <guid>${escXml(siteUrl)}/p/${escXml(p.slug)}</guid>
      <pubDate>${new Date(p.published_at + 'Z').toUTCString()}</pubDate>
      <dc:creator>${escXml(p.author)}</dc:creator>
      ${p.subtitle ? `<description>${escXml(p.subtitle)}</description>` : ''}
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escXml(siteTitle)}</title>
    <link>${escXml(siteUrl)}</link>
    <description>${escXml(siteDescription)}</description>
    <language>en</language>
    <atom:link href="${escXml(siteUrl)}/rss.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  c.header('Content-Type', 'application/rss+xml; charset=utf-8');
  return c.body(xml);
});

// Sitemap — all published posts
feed.get('/sitemap.xml', (c) => {
  const posts = db.prepare(`
    SELECT slug, updated_at FROM posts WHERE status='published' ORDER BY published_at DESC
  `).all();

  const urls = posts.map(p => `
  <url>
    <loc>${escXml(siteUrl)}/p/${escXml(p.slug)}</loc>
    <lastmod>${toDateStr(p.updated_at)}</lastmod>
  </url>`).join('');

  // E6: Add lastmod to homepage from latest post's updated_at
  const latestUpdated = posts.length > 0 ? toDateStr(posts[0].updated_at) : '';
  const homepageLastmod = latestUpdated ? `<lastmod>${latestUpdated}</lastmod>` : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${escXml(siteUrl)}</loc>${homepageLastmod}</url>${urls}
</urlset>`;

  c.header('Content-Type', 'application/xml; charset=utf-8');
  return c.body(xml);
});

export default feed;
