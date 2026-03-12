import { Hono } from 'hono';
import db from '../db.js';
import { esc, markedInstance } from '../helpers.js';
import { validateSlug } from '../validation.js';
import { siteUrl, siteDescription } from '../config.js';

const pages = new Hono();

// M3: Only append 'Z' if input lacks timezone indicator; return original on invalid date
const formatDate = (d) => {
  const str = String(d || '');
  const hasTimezone = /[Zz]|[+-]\d{2}:\d{2}$/.test(str);
  const date = new Date(hasTimezone ? str : str + 'Z');
  if (isNaN(date.getTime())) return str;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const layout = (title, body, meta = '') => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<title>${esc(title)}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>W</text></svg>">
<link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml">
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

// Home
pages.get('/', (c) => {
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

// Single post — H5: validate slug param
pages.get('/p/:slug', (c) => {
  const slug = c.req.param('slug');
  const slugErr = validateSlug(slug);
  if (slugErr) return c.html(layout('Not Found', '<h1>Post not found</h1>'), 404);

  const post = db.prepare('SELECT * FROM posts WHERE slug = ? AND status = ?').get(slug, 'published');
  if (!post) return c.html(layout('Not Found', '<h1>Post not found</h1>'), 404);

  const htmlEn = markedInstance.parse(post.content);
  const htmlVi = post.content_vi ? markedInstance.parse(post.content_vi) : null;
  const hasBilingual = !!htmlVi;

  const langToggle = hasBilingual ? `
    <div class="lang-toggle">
      <button class="lang-btn active" data-lang="vi">Tiếng Việt</button>
      <button class="lang-btn" data-lang="en">English</button>
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
  const ogMeta = `
    <meta property="og:title" content="${esc(post.title)}">
    <meta property="og:description" content="${esc(post.subtitle || siteDescription)}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${esc(siteUrl)}/p/${esc(post.slug)}">
    ${post.cover_image ? `<meta property="og:image" content="${esc(post.cover_image)}">` : ''}`;
  return c.html(layout(post.title, body, ogMeta));
});

export default pages;
