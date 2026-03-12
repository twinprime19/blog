import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { marked } from 'marked';
import crypto from 'crypto';
import { readFileSync, appendFileSync, unlinkSync } from 'fs';
import { execFile } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const port = parseInt(process.env.PORT || '3000', 10);

// HTML-escape to prevent stored XSS from DB values
const esc = (s) => s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '';

// Normalize Unicode to NFC — prevents NFD decomposition gaps in Vietnamese text
const nfc = (s) => s ? String(s).normalize('NFC') : s;

// Sanitize marked output — strip raw HTML tags from markdown
marked.use({ renderer: { html: () => '' } });

// --- Token Auth ---
function loadTokens() {
  try {
    const raw = readFileSync(join(__dirname, 'tokens.json'), 'utf-8');
    return JSON.parse(raw).tokens || {};
  } catch { return {}; }
}

function requireAuth(c, next) {
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const tokens = loadTokens();
  const entry = tokens[token];
  if (!entry) return c.json({ error: 'Unauthorized — valid Bearer token required' }, 401);
  c.set('agent', entry.agent);
  c.set('role', entry.role);
  return next();
}

export const app = new Hono();

// CORS — configurable via CORS_ORIGIN env var (comma-separated origins, or * for all)
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use('*', cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(o => o.trim()).filter(Boolean),
}));

// Security headers
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
});

// Global error handler — prevent stack trace leaks
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

// --- GitHub Webhook ---
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const DEPLOY_SCRIPT = join(__dirname, 'scripts', 'deploy.sh');
const FAILURE_LOG = join(__dirname, 'deploy-failure.log');

function verifySignature(payload, signature) {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch { return false; }
}

app.post('/webhook/deploy', async (c) => {
  const body = await c.req.text();
  const sig = c.req.header('x-hub-signature-256');
  if (!verifySignature(body, sig)) return c.json({ error: 'Invalid signature' }, 401);

  const payload = JSON.parse(body);
  if (payload.ref !== 'refs/heads/main') {
    return c.json({ ok: true, skipped: true, reason: 'not main branch' });
  }

  const commitShort = payload.head_commit?.id?.slice(0, 7) || 'unknown';
  const commitMsg = payload.head_commit?.message?.split('\n')[0] || '';
  console.log(`[webhook] Deploy triggered by push to main (${commitShort}: ${commitMsg})`);

  execFile('bash', [DEPLOY_SCRIPT], { cwd: __dirname, timeout: 120_000 }, (err, stdout, stderr) => {
    if (err) {
      const failMsg = `❌ Blog auto-deploy FAILED\nCommit: ${commitShort} — ${commitMsg}\nError: ${err.message}\n${stderr ? `Stderr: ${stderr.slice(-500)}` : ''}`;
      console.error(`[webhook]`, failMsg);
      appendFileSync(FAILURE_LOG, `[${new Date().toISOString()}] ${failMsg}\n---\n`);
    } else {
      console.log(`[webhook] Deploy succeeded (${commitShort})`);
      try { unlinkSync(FAILURE_LOG); } catch {}
    }
  });

  return c.json({ ok: true, deploying: true });
});

// --- Health Check ---
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

// --- Input Validation ---
function validateSlug(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'Slug must be alphanumeric with hyphens only';
  if (slug.length > 200) return 'Slug must be 200 characters or fewer';
  return null;
}

function validatePost(body, isUpdate = false) {
  const { title, content, subtitle, author, status, slug, title_vi, subtitle_vi, content_vi } = body;
  if (!isUpdate) {
    if (!title || !String(title).trim()) return 'title is required';
    if (!content || !String(content).trim()) return 'content is required';
  }
  if (title !== undefined && String(title).length > 200) return 'title must be 200 characters or fewer';
  if (title_vi !== undefined && String(title_vi).length > 200) return 'title_vi must be 200 characters or fewer';
  if (content !== undefined && Buffer.byteLength(String(content), 'utf-8') > 100 * 1024) return 'content must be 100KB or smaller';
  if (content_vi !== undefined && Buffer.byteLength(String(content_vi), 'utf-8') > 100 * 1024) return 'content_vi must be 100KB or smaller';
  if (subtitle !== undefined && String(subtitle).length > 300) return 'subtitle must be 300 characters or fewer';
  if (subtitle_vi !== undefined && String(subtitle_vi).length > 300) return 'subtitle_vi must be 300 characters or fewer';
  if (author !== undefined && String(author).length > 100) return 'author must be 100 characters or fewer';
  if (status !== undefined && !['published', 'draft'].includes(status)) return 'status must be "published" or "draft"';
  if (slug !== undefined && !isUpdate) { const slugErr = validateSlug(slug); if (slugErr) return slugErr; }
  return null;
}

// --- API ---

app.get('/api/posts', (c) => {
  const posts = db.prepare(`
    SELECT id, slug, title, subtitle, author, cover_image, published_at, updated_at, status
    FROM posts WHERE status='published' ORDER BY published_at DESC
  `).all();
  return c.json(posts);
});

app.get('/api/posts/:slug', (c) => {
  const post = db.prepare('SELECT * FROM posts WHERE slug = ?').get(c.req.param('slug'));
  if (!post) return c.json({ error: 'Not found' }, 404);
  return c.json(post);
});

app.post('/api/posts', requireAuth, async (c) => {
  const body = await c.req.json();
  const { title, content, subtitle, author, cover_image, status, slug, content_vi, title_vi, subtitle_vi } = body;
  const validationError = validatePost(body);
  if (validationError) return c.json({ error: validationError }, 400);
  const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `post-${Date.now()}`;
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

app.put('/api/posts/:slug', requireAuth, async (c) => {
  const body = await c.req.json();
  const updateError = validatePost(body, true);
  if (updateError) return c.json({ error: updateError }, 400);
  const existing = db.prepare('SELECT id FROM posts WHERE slug = ?').get(c.req.param('slug'));
  if (!existing) return c.json({ error: 'Not found' }, 404);
  const fields = [];
  const values = [];
  const textFields = new Set(['title', 'subtitle', 'content', 'content_vi', 'title_vi', 'subtitle_vi', 'author']);
  for (const key of ['title', 'subtitle', 'content', 'content_vi', 'title_vi', 'subtitle_vi', 'author', 'cover_image', 'status']) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(textFields.has(key) ? nfc(body[key]) : body[key]); }
  }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
  fields.push("updated_at = datetime('now')");
  values.push(c.req.param('slug'));
  db.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE slug = ?`).run(...values);
  return c.json({ ok: true });
});

app.delete('/api/posts/:slug', requireAuth, (c) => {
  const r = db.prepare('DELETE FROM posts WHERE slug = ?').run(c.req.param('slug'));
  if (r.changes === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

// --- HTML ---

const layout = (title, body, meta = '') => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<title>${esc(title)}</title>
${meta}
<style>
  :root { --bg: #fff; --text: #1a1a1a; --muted: #6b6b6b; --border: #e6e6e6; --accent: #ff6719; --max-w: 680px; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Noto Serif', 'Times New Roman', 'Georgia', serif; color: var(--text); background: var(--bg); line-height: 1.7; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  header { border-bottom: 1px solid var(--border); padding: 1.2rem 0; margin-bottom: 2rem; }
  header .inner { max-width: var(--max-w); margin: 0 auto; padding: 0 1.5rem; display: flex; align-items: center; justify-content: space-between; }
  header .logo { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 1.3rem; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
  header .logo:hover { text-decoration: none; }

  main { max-width: var(--max-w); margin: 0 auto; padding: 0 1.5rem 4rem; }

  .post-card { margin-bottom: 2.5rem; padding-bottom: 2.5rem; border-bottom: 1px solid var(--border); }
  .post-card:last-child { border-bottom: none; }
  .post-card h2 { font-size: 1.6rem; line-height: 1.3; margin-bottom: 0.3rem; }
  .post-card h2 a { color: var(--text); }
  .post-card .subtitle { color: var(--muted); font-size: 1.1rem; margin-bottom: 0.6rem; }
  .post-card .meta { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 0.85rem; color: var(--muted); }
  .post-card .cover { width: 100%; border-radius: 4px; margin-bottom: 1rem; }

  .post-full h1 { font-size: 2.2rem; line-height: 1.2; margin-bottom: 0.4rem; }
  .post-full .subtitle { font-size: 1.25rem; color: var(--muted); margin-bottom: 0.8rem; }
  .post-full .meta { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 0.9rem; color: var(--muted); margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
  .post-full .cover { width: 100%; border-radius: 4px; margin-bottom: 2rem; }
  .post-full .content { font-size: 1.15rem; }
  .post-full .content h1,.post-full .content h2,.post-full .content h3 { margin-top: 2rem; margin-bottom: 0.8rem; line-height: 1.3; }
  .post-full .content p { margin-bottom: 1.2rem; }
  .post-full .content ul,.post-full .content ol { margin-bottom: 1.2rem; padding-left: 1.5rem; }
  .post-full .content blockquote { border-left: 3px solid var(--accent); padding-left: 1rem; margin: 1.5rem 0; color: var(--muted); font-style: italic; }
  .post-full .content img { max-width: 100%; border-radius: 4px; }
  .post-full .content code { background: #f5f5f5; padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.9em; }
  .post-full .content pre { background: #f5f5f5; padding: 1rem; border-radius: 6px; overflow-x: auto; margin-bottom: 1.2rem; }
  .post-full .content pre code { background: none; padding: 0; }

  .lang-toggle { display: flex; gap: 0.5rem; margin-bottom: 1.2rem; }
  .lang-btn { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 0.85rem; padding: 0.4rem 0.9rem; border: 1px solid var(--border); border-radius: 20px; background: var(--bg); color: var(--muted); cursor: pointer; transition: all 0.2s; }
  .lang-btn.active { background: var(--text); color: var(--bg); border-color: var(--text); }
  .lang-btn:hover { border-color: var(--text); }

  footer { max-width: var(--max-w); margin: 0 auto; padding: 2rem 1.5rem; border-top: 1px solid var(--border); text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 0.8rem; color: var(--muted); }
</style>
</head>
<body>
<header><div class="inner"><a href="/" class="logo">The Wire</a></div></header>
<main>${body}</main>
<footer>Powered by agents · ${new Date().getFullYear()}</footer>
</body>
</html>`;

const formatDate = (d) => new Date(d + 'Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// Home
app.get('/', (c) => {
  const posts = db.prepare(`
    SELECT slug, title, title_vi, subtitle, subtitle_vi, author, cover_image, published_at
    FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 50
  `).all();

  const cards = posts.length === 0
    ? '<p style="color:var(--muted)">No posts yet.</p>'
    : posts.map(p => {
      const displayTitle = esc(p.title_vi || p.title);
      const displaySubtitle = esc(p.subtitle_vi || p.subtitle);
      return `
      <article class="post-card">
        ${p.cover_image ? `<img class="cover" src="${esc(p.cover_image)}" alt="">` : ''}
        <h2><a href="/p/${esc(p.slug)}">${displayTitle}</a></h2>
        ${displaySubtitle ? `<p class="subtitle">${displaySubtitle}</p>` : ''}
        <p class="meta">${esc(p.author)} · ${formatDate(p.published_at)}</p>
      </article>
    `;}).join('');

  return c.html(layout('The Wire', cards));
});

// Single post
app.get('/p/:slug', (c) => {
  const post = db.prepare('SELECT * FROM posts WHERE slug = ? AND status = ?').get(c.req.param('slug'), 'published');
  if (!post) return c.html(layout('Not Found', '<h1>Post not found</h1>'), 404);

  const htmlEn = marked.parse(post.content);
  const htmlVi = post.content_vi ? marked.parse(post.content_vi) : null;
  const hasBilingual = !!htmlVi;

  const langToggle = hasBilingual ? `
    <div class="lang-toggle">
      <button class="lang-btn active" data-lang="vi">🇻🇳 Tiếng Việt</button>
      <button class="lang-btn" data-lang="en">🇬🇧 English</button>
    </div>` : '';

  const langScript = hasBilingual ? `
    <script>
      document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const lang = btn.dataset.lang;
          document.getElementById('content-vi').style.display = lang === 'vi' ? 'block' : 'none';
          document.getElementById('content-en').style.display = lang === 'en' ? 'block' : 'none';
          document.getElementById('title-vi').style.display = lang === 'vi' ? 'block' : 'none';
          document.getElementById('title-en').style.display = lang === 'en' ? 'block' : 'none';
        });
      });
    </script>` : '';

  const titleEn = `<h1 id="title-en" style="${hasBilingual ? 'display:none' : ''}">${esc(post.title)}</h1>`;
  const titleVi = hasBilingual ? `<h1 id="title-vi">${esc(post.title_vi || post.title)}</h1>` : '';
  const subtitleEn = post.subtitle ? `<p class="subtitle" id="subtitle-en" style="${hasBilingual ? 'display:none' : ''}">${esc(post.subtitle)}</p>` : '';
  const subtitleVi = hasBilingual && (post.subtitle_vi || post.subtitle) ? `<p class="subtitle" id="subtitle-vi">${esc(post.subtitle_vi || post.subtitle)}</p>` : '';

  const body = `
    <article class="post-full">
      ${post.cover_image ? `<img class="cover" src="${esc(post.cover_image)}" alt="">` : ''}
      ${langToggle}
      ${titleVi}${titleEn}
      ${subtitleVi}${subtitleEn}
      <p class="meta">${esc(post.author)} · ${formatDate(post.published_at)}</p>
      ${hasBilingual ? `<div class="content" id="content-vi">${htmlVi}</div>` : ''}
      <div class="content" id="content-en" style="${hasBilingual ? 'display:none' : ''}">${htmlEn}</div>
    </article>
    ${langScript}
  `;
  return c.html(layout(post.title, body));
});
