import { Hono } from 'hono';
import { validateSlug, validatePost } from '../validation.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { processContentImages } from '../process-content-images.js';
import { getPostStore } from '../store/index.js';
import { slugify } from '../helpers.js';

const api = new Hono();
const writeLimit = createRateLimiter({ windowMs: 60_000, max: 20 });

api.get('/api/posts', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page')) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit')) || 20));
  const offset = (page - 1) * limit;
  const store = getPostStore(c);
  const posts = await store.listPosts({ status: 'published', limit, offset });
  return c.json(posts);
});

api.get('/api/posts/:slug', async (c) => {
  const slug = c.req.param('slug');
  const slugErr = validateSlug(slug);
  if (slugErr) return c.json({ error: slugErr }, 400);
  const store = getPostStore(c);
  const post = await store.getPost(slug);
  if (!post || post.status !== 'published') return c.json({ error: 'Not found' }, 404);
  return c.json(post);
});

api.post('/api/posts', requireAuth, writeLimit, async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
  const { title, content, subtitle, author, cover_image, status, slug, content_vi, title_vi, subtitle_vi } = body;
  const validationError = validatePost(body);
  if (validationError) return c.json({ error: validationError }, 400);
  const finalSlug = slug || slugify(title) || `post-${Date.now()}`;
  if (!slug) {
    const autoSlugErr = validateSlug(finalSlug);
    if (autoSlugErr) return c.json({ error: `Auto-generated slug is invalid: ${autoSlugErr}` }, 400);
  }
  const createdBy = c.get('agent');
  const store = getPostStore(c);

  if (c.get('role') !== 'admin') {
    const count = [...(await store.getIndex()).values()].filter((p) => p.created_by === createdBy).length;
    if (count >= 50) return c.json({ error: 'Post limit reached (max 50 per agent)' }, 403);
  }

  let finalContent = content;
  let finalContentVi = content_vi;
  const allAttachments = [];
  try {
    const contentResult = await processContentImages(content, finalSlug, createdBy, c.env);
    finalContent = contentResult.cleanContent;
    allAttachments.push(...contentResult.attachments);

    if (content_vi) {
      const viResult = await processContentImages(content_vi, finalSlug, createdBy, c.env);
      finalContentVi = viResult.cleanContent;
      allAttachments.push(...viResult.attachments);
    }
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }

  try {
    const result = await store.createPost({
      slug: finalSlug, title, subtitle, content: finalContent, content_vi: finalContentVi,
      title_vi, subtitle_vi, author, cover_image, status, created_by: createdBy,
    });

    const response = { id: result.id, slug: result.slug };
    if (allAttachments.length > 0) {
      response.images = allAttachments.map((a) => ({ url: a.url, alt: a.alt, mime_type: a.mimeType, size: a.sizeBytes }));
    }
    return c.json(response, 201);
  } catch (e) {
    if (e.code === 'DUPLICATE_SLUG') return c.json({ error: 'Slug already exists' }, 409);
    throw e;
  }
});

api.put('/api/posts/:slug', requireAuth, writeLimit, async (c) => {
  const slug = c.req.param('slug');
  const slugErr = validateSlug(slug);
  if (slugErr) return c.json({ error: slugErr }, 400);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
  const updateError = validatePost(body, true);
  if (updateError) return c.json({ error: updateError }, 400);

  const store = getPostStore(c);
  const existing = (await store.getIndex()).get(slug);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (c.get('role') !== 'admin' && existing.created_by !== c.get('agent')) {
    return c.json({ error: 'You can only update your own posts' }, 403);
  }

  const allAttachments = [];
  try {
    if (body.content) {
      const contentResult = await processContentImages(body.content, slug, c.get('agent'), c.env);
      body.content = contentResult.cleanContent;
      allAttachments.push(...contentResult.attachments);
    }
    if (body.content_vi) {
      const viResult = await processContentImages(body.content_vi, slug, c.get('agent'), c.env);
      body.content_vi = viResult.cleanContent;
      allAttachments.push(...viResult.attachments);
    }
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }

  const updatableFields = ['title', 'subtitle', 'content', 'content_vi', 'title_vi', 'subtitle_vi', 'author', 'cover_image', 'status'];
  const hasUpdate = updatableFields.some((k) => body[k] !== undefined);
  if (!hasUpdate) return c.json({ error: 'No fields to update' }, 400);

  await store.updatePost(slug, body);

  const response = { ok: true };
  if (allAttachments.length > 0) {
    response.images = allAttachments.map((a) => ({ url: a.url, alt: a.alt, mime_type: a.mimeType, size: a.sizeBytes }));
  }
  return c.json(response);
});

api.delete('/api/posts/:slug', requireAuth, writeLimit, async (c) => {
  const slug = c.req.param('slug');
  const slugErr = validateSlug(slug);
  if (slugErr) return c.json({ error: slugErr }, 400);

  const store = getPostStore(c);
  const post = (await store.getIndex()).get(slug);
  if (!post) return c.json({ error: 'Not found' }, 404);
  if (c.get('role') !== 'admin' && post.created_by !== c.get('agent')) {
    return c.json({ error: 'You can only delete your own posts' }, 403);
  }
  await store.deletePost(slug);
  return c.json({ ok: true });
});

export default api;
