import { Hono } from 'hono';
import db from '../db.js';
import { nfc } from '../helpers.js';
import { validateSlug, validatePost } from '../validation.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

const api = new Hono();
const writeLimit = createRateLimiter({ windowMs: 60_000, max: 20 });

// M5: Pagination via ?page= and ?limit= query params
api.get('/api/posts', (c) => {
  const page = Math.max(1, parseInt(c.req.query('page')) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit')) || 20));
  const offset = (page - 1) * limit;
  const posts = db.prepare(`
    SELECT id, slug, title, subtitle, author, cover_image, published_at, updated_at, status
    FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
  return c.json(posts);
});

// C1: Only return published posts; H5: Validate slug param
api.get('/api/posts/:slug', (c) => {
  const slug = c.req.param('slug');
  const slugErr = validateSlug(slug);
  if (slugErr) return c.json({ error: slugErr }, 400);
  const post = db.prepare('SELECT * FROM posts WHERE slug = ? AND status = ?').get(slug, 'published');
  if (!post) return c.json({ error: 'Not found' }, 404);
  return c.json(post);
});

api.post('/api/posts', requireAuth, writeLimit, async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
  const { title, content, subtitle, author, cover_image, status, slug, content_vi, title_vi, subtitle_vi } = body;
  const validationError = validatePost(body);
  if (validationError) return c.json({ error: validationError }, 400);
  const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `post-${Date.now()}`;
  // M2: Validate auto-generated slugs
  if (!slug) {
    const autoSlugErr = validateSlug(finalSlug);
    if (autoSlugErr) return c.json({ error: `Auto-generated slug is invalid: ${autoSlugErr}` }, 400);
  }
  try {
    const result = db.prepare(`
      INSERT INTO posts (slug, title, subtitle, content, content_vi, title_vi, subtitle_vi, author, cover_image, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(finalSlug, nfc(title), nfc(subtitle), nfc(content), nfc(content_vi), nfc(title_vi), nfc(subtitle_vi), nfc(author) || 'Anonymous', cover_image || null, status || 'published');
    return c.json({ id: result.lastInsertRowid, slug: finalSlug }, 201);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return c.json({ error: 'Slug already exists' }, 409);
    throw e;
  }
});

// H5: Validate slug param on PUT
api.put('/api/posts/:slug', requireAuth, writeLimit, async (c) => {
  const slug = c.req.param('slug');
  const slugErr = validateSlug(slug);
  if (slugErr) return c.json({ error: slugErr }, 400);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
  const updateError = validatePost(body, true);
  if (updateError) return c.json({ error: updateError }, 400);
  const existing = db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  const fields = [];
  const values = [];
  const textFields = new Set(['title', 'subtitle', 'content', 'content_vi', 'title_vi', 'subtitle_vi', 'author']);
  for (const key of ['title', 'subtitle', 'content', 'content_vi', 'title_vi', 'subtitle_vi', 'author', 'cover_image', 'status']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(textFields.has(key) ? nfc(body[key]) : body[key]); }
  }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
  fields.push("updated_at = datetime('now')");
  values.push(slug);
  db.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE slug = ?`).run(...values);
  return c.json({ ok: true });
});

// H5: Validate slug param on DELETE
api.delete('/api/posts/:slug', requireAuth, writeLimit, (c) => {
  const slug = c.req.param('slug');
  const slugErr = validateSlug(slug);
  if (slugErr) return c.json({ error: slugErr }, 400);
  const r = db.prepare('DELETE FROM posts WHERE slug = ?').run(slug);
  if (r.changes === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

export default api;
