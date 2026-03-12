# Phase 4: Blog Features

## Context
- [plan.md](./plan.md) | After Phase 1 (independent of 2-3)
- No RSS feed, sitemap, OpenGraph tags, or favicon
- These are table stakes for any public-facing blog

## Overview
- **Priority:** Nice to have
- **Status:** done
- **Effort:** 2h (completed)
- **Description:** Add RSS feed, sitemap.xml, OpenGraph meta tags, and favicon

## Key Insights
- RSS and sitemap are simple XML templates — no library needed
- OpenGraph tags already have a `meta` param slot in the layout function
- Favicon can be a simple SVG inline (no image file needed)
- All features are read-only additions — zero risk to existing functionality
- Feed routes (~50 lines) are a distinct concern — worth a separate file

## Requirements

### Functional
- `GET /rss.xml` — valid RSS 2.0 feed with latest 20 posts
- `GET /sitemap.xml` — lists all published post URLs
- OpenGraph meta tags on post pages (title, description, image, type)
- Favicon (inline SVG)

### Non-functional
- RSS validates against RSS 2.0 spec
- Sitemap follows sitemap protocol spec

## Related Code Files

### Files to create
- `feed.js` — RSS and sitemap routes (~50 lines)

### Files to modify
- `app.js` — add OG meta tags to post pages, add favicon + RSS autodiscovery to layout, mount feed routes, add site config vars
- `.env.example` — add SITE_URL, SITE_TITLE, SITE_DESCRIPTION

## Implementation Steps

1. **Add site config** vars at top of app.js:
   ```js
   const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
   const siteTitle = process.env.SITE_TITLE || 'The Wire';
   const siteDescription = process.env.SITE_DESCRIPTION || 'A lightweight blog powered by agents';
   ```

2. **Create `feed.js`** (~50 lines):

   RSS endpoint (`GET /rss.xml`):
   - Query latest 20 published posts
   - Generate RSS 2.0 XML with proper XML escaping
   - Set Content-Type: application/rss+xml

   Sitemap endpoint (`GET /sitemap.xml`):
   - Query all published posts
   - Generate sitemap XML with post URLs and lastmod dates
   - Set Content-Type: application/xml

   Add `escXml()` helper in this file.

3. **Add OpenGraph meta tags** to post page in app.js:
   ```js
   const meta = `
     <meta property="og:title" content="${esc(post.title)}">
     <meta property="og:description" content="${esc(post.subtitle || '')}">
     <meta property="og:type" content="article">
     <meta property="og:url" content="${siteUrl}/p/${post.slug}">
     ${post.cover_image ? `<meta property="og:image" content="${esc(post.cover_image)}">` : ''}
   `;
   ```

4. **Add favicon** to layout in app.js:
   ```html
   <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>W</text></svg>">
   ```

5. **Add RSS autodiscovery** link to layout head:
   ```html
   <link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml">
   ```

6. **Mount feed routes** in app.js:
   ```js
   import feedRoutes from './feed.js';
   app.route('/', feedRoutes);
   ```

7. **Update .env.example** with SITE_URL, SITE_TITLE, SITE_DESCRIPTION

## Todo List
- [x] Add site config vars to app.js
- [x] Create feed.js with RSS and sitemap
- [x] Add OpenGraph meta tags to post pages
- [x] Add inline SVG favicon to layout
- [x] Add RSS autodiscovery link to layout
- [x] Mount feed routes in app.js
- [x] Update .env.example
- [x] Validate RSS output
- [x] Validate sitemap output

## Success Criteria
- `GET /rss.xml` returns valid RSS 2.0 XML with correct Content-Type
- `GET /sitemap.xml` returns valid sitemap XML with all published post URLs
- Post pages have og:title, og:description, og:type, og:url meta tags
- Posts with cover_image also have og:image tag
- Browser shows favicon (W letter)
- RSS readers can subscribe via /rss.xml

## Risk Assessment
- **Very low risk:** All features are new read-only routes and template additions
- **XML escaping:** Must escape special XML chars in RSS content (& < > " ')
