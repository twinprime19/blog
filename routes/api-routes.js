import { Hono } from 'hono';
import { rm } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { nfc } from '../helpers.js';
import { validateSlug, validatePost } from '../validation.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { processContentImages } from '../process-content-images.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads');

const insertAttachment = db.prepare(
  `INSERT INTO attachments (post_slug, filename, original_name, mime_type, size_bytes, created_by)
   VALUES (?, ?, ?, ?, ?, ?)`
);

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
  const createdBy = c.get('agent');
  // Per-token post limit — writers capped at 50 posts, admins exempt
  if (c.get('role') !== 'admin') {
    const count = db.prepare('SELECT COUNT(*) as n FROM posts WHERE created_by = ?').get(createdBy).n;
    if (count >= 50) return c.json({ error: 'Post limit reached (max 50 per agent)' }, 403);
  }
  // Extract inline data URI images from content and content_vi
  let finalContent = content;
  let finalContentVi = content_vi;
  const allAttachments = [];
  try {
    const contentResult = await processContentImages(content, finalSlug, createdBy);
    finalContent = contentResult.cleanContent;
    allAttachments.push(...contentResult.attachments);

    if (content_vi) {
      const viResult = await processContentImages(content_vi, finalSlug, createdBy);
      finalContentVi = viResult.cleanContent;
      allAttachments.push(...viResult.attachments);
    }
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }

  try {
    const insertPost = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO posts (slug, title, subtitle, content, content_vi, title_vi, subtitle_vi, author, cover_image, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(finalSlug, nfc(title), nfc(subtitle), nfc(finalContent), nfc(finalContentVi), nfc(title_vi), nfc(subtitle_vi), nfc(author) || 'Anonymous', cover_image || null, status || 'published', createdBy);
      for (const att of allAttachments) {
        insertAttachment.run(finalSlug, att.filename, att.originalName, att.mimeType, att.sizeBytes, att.createdBy);
      }
      return result;
    });
    const result = insertPost();

    const response = { id: result.lastInsertRowid, slug: finalSlug };
    if (allAttachments.length > 0) {
      response.images = allAttachments.map(a => ({ url: a.url, alt: a.alt, mime_type: a.mimeType, size: a.sizeBytes }));
    }
    return c.json(response, 201);
  } catch (e) {
    // Clean up orphaned files on DB failure
    if (allAttachments.length > 0) {
      try { await rm(join(UPLOADS_DIR, finalSlug), { recursive: true, force: true }); } catch {}
    }
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
  const existing = db.prepare('SELECT id, created_by FROM posts WHERE slug = ?').get(slug);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  // Ownership check: non-admin can only update own posts
  if (c.get('role') !== 'admin' && existing.created_by !== c.get('agent')) {
    return c.json({ error: 'You can only update your own posts' }, 403);
  }
  // Extract inline data URI images from content and content_vi
  const allAttachments = [];
  try {
    if (body.content) {
      const contentResult = await processContentImages(body.content, slug, c.get('agent'));
      body.content = contentResult.cleanContent;
      allAttachments.push(...contentResult.attachments);
    }
    if (body.content_vi) {
      const viResult = await processContentImages(body.content_vi, slug, c.get('agent'));
      body.content_vi = viResult.cleanContent;
      allAttachments.push(...viResult.attachments);
    }
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }

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

  for (const att of allAttachments) {
    insertAttachment.run(slug, att.filename, att.originalName, att.mimeType, att.sizeBytes, att.createdBy);
  }

  const response = { ok: true };
  if (allAttachments.length > 0) {
    response.images = allAttachments.map(a => ({ url: a.url, alt: a.alt, mime_type: a.mimeType, size: a.sizeBytes }));
  }
  return c.json(response);
});

// H5: Validate slug param on DELETE
api.delete('/api/posts/:slug', requireAuth, writeLimit, async (c) => {
  const slug = c.req.param('slug');
  const slugErr = validateSlug(slug);
  if (slugErr) return c.json({ error: slugErr }, 400);
  // Ownership check: non-admin can only delete own posts
  const post = db.prepare('SELECT id, created_by FROM posts WHERE slug = ?').get(slug);
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (c.get('role') !== 'admin' && post.created_by !== c.get('agent')) {
    return c.json({ error: 'You can only delete your own posts' }, 403);
  }
  db.prepare('DELETE FROM posts WHERE slug = ?').run(slug);
  // Clean up uploaded files from disk (non-blocking, failure is non-fatal)
  try { await rm(join(UPLOADS_DIR, slug), { recursive: true, force: true }); } catch {}
  return c.json({ ok: true });
});

export default api;
