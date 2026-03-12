# Code Review: Phase 4 -- Blog Features (RSS, Sitemap, OpenGraph)

**Date:** 2026-03-12
**Scope:** `app.js` (layout/OG changes), `feed.js` (new), `.env.example`
**LOC reviewed:** ~75 new/changed lines
**Focus:** Correctness, security, edge cases

---

## Overall Assessment

Solid implementation. RSS 2.0 and sitemap are spec-compliant, XML escaping is correct, and OpenGraph meta tags are properly escaped. A few medium-priority issues around edge cases and minor spec details.

---

## Critical Issues

None.

---

## High Priority

### H1. Sitemap `<lastmod>` crashes on null/malformed `updated_at`

**File:** `feed.js:53`
```js
<lastmod>${p.updated_at.split(' ')[0]}</lastmod>
```
While `updated_at` has a `NOT NULL DEFAULT` in the schema, the column stores SQLite datetime strings like `"2026-03-12 14:00:00"`. If the value is ever an unexpected format (e.g., ISO 8601 with `T` separator), `.split(' ')[0]` still works. However, if a post is inserted via raw SQL or a migration alters the column, this will throw a runtime error crashing the entire route.

**Fix:** Add defensive handling:
```js
<lastmod>${(p.updated_at || '').split(/[T ]/)[0] || new Date().toISOString().split('T')[0]}</lastmod>
```

### H2. RSS `<author>` element violates RSS 2.0 spec

**File:** `feed.js:25`
```xml
<author>${escXml(p.author)}</author>
```
Per RSS 2.0 spec, `<author>` must contain an email address (RFC 2822). Most readers tolerate plain names, but validators will flag this. Consider using `<dc:creator>` (Dublin Core) instead, which accepts plain text names.

**Fix:** Either add `xmlns:dc="http://purl.org/dc/elements/1.1/"` to the `<rss>` tag and use `<dc:creator>`, or simply remove `<author>` since it's optional.

---

## Medium Priority

### M1. No tests for RSS and sitemap endpoints

No test coverage exists for `/rss.xml` or `/sitemap.xml`. These are public-facing endpoints that should have at least:
- Valid XML output assertion
- Correct Content-Type header
- Empty posts produces valid XML (no items/urls)
- Posts with special characters (`&`, `<`, quotes) are properly escaped
- Only published posts appear (not drafts)

### M2. RSS feed missing `<language>` element

**File:** `feed.js:29-38`
The blog supports bilingual content (EN/VI). The RSS feed should include a `<language>` element (e.g., `<language>en</language>`) per RSS 2.0 spec. This helps feed readers display content correctly.

### M3. OpenGraph `og:url` uses raw slug without escaping

**File:** `app.js:339`
```js
<meta property="og:url" content="${siteUrl}/p/${post.slug}">
```
`post.slug` is not passed through `esc()`. While the `validateSlug` function restricts slugs to `[a-z0-9-]`, slugs created before validation was added or via direct DB insertion could contain characters that break the HTML attribute. Should be `${esc(post.slug)}` for defense-in-depth.

### M4. Circular module dependency risk

`app.js` imports `feed.js`, and `feed.js` imports `{ siteUrl, siteTitle, siteDescription }` from `app.js`. This is a circular dependency. It works in this case because ES modules handle cycles via live bindings and the exported constants are initialized before `feed.js` accesses them. However, this is fragile -- if someone reorders exports or moves the `feedRoutes` import earlier, it could break silently.

**Suggestion:** Extract `siteUrl`, `siteTitle`, `siteDescription` into a separate `config.js` module that both files import from. This eliminates the cycle entirely.

### M5. Sitemap home page `<url>` missing `<lastmod>`

**File:** `feed.js:58`
```xml
<url><loc>${escXml(siteUrl)}</loc></url>
```
The homepage entry has no `<lastmod>`. Consider using the most recent post's `updated_at` as the homepage lastmod, or omit `<lastmod>` consistently.

---

## Low Priority

### L1. RSS `<guid>` missing `isPermaLink` attribute

**File:** `feed.js:23`
When `<guid>` contains a URL, RSS 2.0 defaults `isPermaLink="true"`. This works correctly here but being explicit improves clarity:
```xml
<guid isPermaLink="true">${escXml(siteUrl)}/p/${escXml(p.slug)}</guid>
```

### L2. Favicon is inline SVG data URI

**File:** `app.js:208`
Works fine but renders as a plain "W" letter. Not blocking -- just noting it's a placeholder.

### L3. `escXml` uses `&apos;` while `esc` (HTML) uses `&#39;`

**File:** `feed.js:10` vs `app.js:21`
Both are correct for their contexts (`&apos;` is valid XML, `&#39;` is safer for HTML4 compat). Consistent and fine.

---

## Edge Cases Scouted

| Scenario | Status |
|---|---|
| No published posts (empty DB) | RSS: empty `<channel>` (valid). Sitemap: only homepage entry (valid). OK. |
| Post with `&`, `<`, `"` in title/subtitle | Escaped by `escXml()`. OK. |
| Post with null `subtitle` | RSS: skips `<description>` via ternary. OG: falls back to `siteDescription`. OK. |
| Post with null `cover_image` | OG: skips `og:image` via ternary. OK. |
| `SITE_URL` with trailing slash | Stripped by `.replace(/\/+$/, '')` in app.js:16. OK. |
| `SITE_URL` not set | Falls back to `http://localhost:${port}`. OK for dev, feeds will have localhost URLs in production if misconfigured -- acceptable. |
| Very long post content | Not included in RSS feed (only title/subtitle). OK. |
| Unicode/Vietnamese in title | `escXml` handles UTF-8 correctly. NFC normalization applied at write time. OK. |
| `updated_at` format edge case | See H1 above. |

---

## Positive Observations

- Clean separation: feed routes in own module with proper Hono sub-router
- XML escaping is thorough (5 characters: `&`, `<`, `>`, `"`, `'`)
- RSS includes `atom:link` self-reference (best practice)
- Sitemap uses correct namespace
- OpenGraph tags properly escaped via existing `esc()` helper
- RSS autodiscovery link in `<head>` enables browser feed detection
- `.env.example` documents all new env vars with sensible defaults

---

## Recommended Actions (prioritized)

1. **[M4]** Extract site config to `config.js` to break circular dependency
2. **[M1]** Add tests for `/rss.xml` and `/sitemap.xml` endpoints
3. **[H2]** Switch RSS `<author>` to `<dc:creator>` for spec compliance
4. **[M3]** Escape `post.slug` in og:url for defense-in-depth
5. **[H1]** Add defensive handling for `updated_at` parsing in sitemap
6. **[M2]** Add `<language>` element to RSS channel

---

## Metrics

- Type Coverage: N/A (vanilla JS, no TypeScript)
- Test Coverage: 0% for new feed.js; existing app.js routes covered
- Linting Issues: 0 syntax errors detected

---

## Unresolved Questions

1. Should the RSS feed include `content:encoded` with full post HTML? Currently only title+subtitle are in the feed, which may feel sparse to feed reader users.
2. Should there be a `robots.txt` pointing to the sitemap? (`Sitemap: {siteUrl}/sitemap.xml`)
3. Should Vietnamese content get a separate RSS feed (e.g., `/rss-vi.xml`)?
