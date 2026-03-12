# Code Review: PR #2 — Productionize Blog Engine

**Reviewer:** code-reviewer
**Date:** 2026-03-12
**Branch:** feature/productionization
**Commits:** 3 (49efdaa, 569be82, 42897be)
**Stats:** +7025 / -328 across 45 files (796 LOC in source/test JS)

---

## Scope

- **Files reviewed:** app.js, server.js, config.js, db.js, feed.js, seed.js, Dockerfile, docker-compose.yml, deploy.sh, ci.yml, vitest.config.js, tests/*.js, .gitignore, .dockerignore, .env.example, package.json
- **Focus:** Security, correctness, architecture, performance, testing, Docker/DevOps
- **Test run:** 24/24 passing (156ms)
- **Syntax check:** All JS files parse OK

---

## Overall Assessment

Solid productionization effort. Clean separation of app.js/server.js, proper parameterized SQL, XSS escaping, webhook HMAC verification with timing-safe comparison, and a working test suite. However, several security gaps and architectural issues need attention before production deployment.

---

## Critical Issues

### C1. `GET /api/posts/:slug` exposes draft posts and all fields without auth

**File:** `app.js:145-148`

```js
app.get('/api/posts/:slug', (c) => {
  const post = db.prepare('SELECT * FROM posts WHERE slug = ?').get(c.req.param('slug'));
  if (!post) return c.json({ error: 'Not found' }, 404);
  return c.json(post);
});
```

**Impact:** Anyone who knows (or brute-forces) a slug can read draft posts. The `SELECT *` also returns every column, potentially exposing internal fields. The list endpoint at `/api/posts` correctly filters `WHERE status='published'`, but the detail endpoint does not.

**Fix:** Either add `AND status='published'` for unauthenticated requests, or require auth. At minimum, filter columns.

---

### C2. Webhook payload `JSON.parse` has no try/catch

**File:** `app.js:84`

```js
const payload = JSON.parse(body);
```

**Impact:** Malformed JSON with a valid HMAC signature (unlikely but possible if secret is compromised, or if GitHub sends unexpected encoding) crashes the handler. The global error handler (`app.onError`) catches it, but this returns a generic 500 instead of a clear 400.

**Fix:** Wrap in try/catch returning 400 for parse errors.

---

### C3. `cover_image` has no URL validation — stored XSS vector

**File:** `app.js:161`

```js
cover_image || null
```

`cover_image` is stored raw and rendered in HTML as:
```js
`<img class="cover" src="${esc(p.cover_image)}" alt="">`
```

While `esc()` prevents breaking out of the attribute, a `javascript:` URL is still escaped correctly and would not execute via `src`. However, the field is also used in OG meta tags:
```js
`<meta property="og:image" content="${esc(post.cover_image)}">`
```

**Risk level:** Low-medium. The `esc()` function neutralizes most injection vectors, but a protocol-level validation (must start with `https://` or `/`) would be defense-in-depth.

**Fix:** Validate `cover_image` is a valid HTTP(S) URL or relative path in `validatePost()`.

---

## High Priority

### H1. app.js is 342 lines — exceeds 200-line modularization threshold

Per project convention in CLAUDE.md: *"If a code file exceeds 200 lines of code, consider modularizing it."*

`app.js` contains: auth, webhook, validation, CRUD API, HTML rendering (100+ lines of CSS + templates), feed route mounting. These are distinct concerns.

**Suggested split:**
- `middleware/auth.js` — loadTokens, requireAuth
- `routes/api.js` — CRUD endpoints
- `routes/pages.js` — HTML rendering (layout, home, single post)
- `validation.js` — validateSlug, validatePost
- `webhook.js` — GitHub deploy webhook

---

### H2. Token auth reads from filesystem on every request

**File:** `app.js:27-32`

```js
function loadTokens() {
  try {
    const raw = readFileSync(join(__dirname, 'tokens.json'), 'utf-8');
    return JSON.parse(raw).tokens || {};
  } catch { return {}; }
}
```

**Impact:** Synchronous `readFileSync` on every authenticated request. For this blog's scale this is fine, but it blocks the event loop unnecessarily. Also, if `tokens.json` is deleted or corrupted, all auth silently fails (returns `{}`).

**Fix:** Cache tokens with a file watcher or TTL-based refresh. At minimum, log when token loading fails.

---

### H3. No rate limiting on any endpoint

No rate limiting exists on `/api/posts` (POST), `/webhook/deploy`, or any other endpoint. An attacker can:
- Spam post creation (filling the DB)
- Flood the webhook endpoint
- DDoS the HTML pages (each hits SQLite)

**Fix:** Add basic rate limiting, at least on write endpoints. Hono has middleware for this, or use a simple in-memory counter.

---

### H4. Missing `Content-Security-Policy` header

**File:** `app.js:54-58`

Security headers include `X-Content-Type-Options` and `X-Frame-Options` but omit CSP. The HTML pages inline CSS and load Google Fonts, so a minimal CSP would be:

```
default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src * data:; script-src 'self' 'unsafe-inline'
```

---

### H5. No slug validation on GET/PUT/DELETE route parameters

**File:** `app.js:145, 169, 188, 287`

`validateSlug()` is only called during POST create (line 131). The PUT, DELETE, and HTML routes pass `c.req.param('slug')` directly to SQL without slug format checks. SQLite parameterized queries prevent injection, but the inconsistency means malformed slugs (spaces, Unicode, etc.) still hit the database.

**Fix:** Apply `validateSlug()` to all slug params, or add middleware.

---

### H6. `tokens.json` committed to repo with test token

**File:** `tokens.json` (line 1 in git)

```json
{"tokens":{"test-token-for-vitest":{"agent":"TestBot","role":"admin"}}}
```

This file is in `.gitignore` but was already committed (it exists on disk with test data). The global-setup.js correctly manages it for tests, but if someone runs the server without running tests first, the test token is live.

**Risk:** The test token `test-token-for-vitest` could be used as a real auth token.

**Fix:** Ensure `tokens.json` is not in the committed tree. The global-setup should handle creation/teardown atomically.

---

## Medium Priority

### M1. `esc()` returns empty string for falsy values — inconsistent with `nfc()`

**File:** `app.js:18, 21`

```js
const esc = (s) => s ? String(s).replace(...) : '';
const nfc = (s) => s ? String(s).normalize('NFC') : s;
```

`esc(null)` returns `''`, `esc(0)` returns `''`, `esc(undefined)` returns `''`. But `nfc(null)` returns `null`, `nfc(undefined)` returns `undefined`. This asymmetry can cause subtle bugs if a numeric or boolean value passes through.

**Fix:** Standardize: `const esc = (s) => s == null ? '' : String(s).replace(...)` to explicitly handle null/undefined but not coerce falsy numbers.

---

### M2. Auto-generated slug does not go through `validateSlug()`

**File:** `app.js:156`

```js
const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `post-${Date.now()}`;
```

If the user omits `slug`, the auto-generated one from `title` is never validated via `validateSlug()`. The regex replacement is similar but not identical to the validation regex. Example divergence: a title of just spaces/symbols produces empty string, falling back to `post-${Date.now()}` which fails `validateSlug` pattern (contains uppercase? no, but it's never checked).

**Fix:** Run `validateSlug(finalSlug)` after generation.

---

### M3. `formatDate` assumes UTC by appending 'Z'

**File:** `app.js:259`

```js
const formatDate = (d) => new Date(d + 'Z').toLocaleDateString('en-US', ...);
```

SQLite `datetime('now')` stores UTC without timezone suffix. Appending `'Z'` is correct for interpretation, but if a date is already ISO-formatted with a timezone, this creates an invalid date string (e.g., `2026-03-12T06:00:00+00:00Z`).

**Risk:** Low for this codebase since all dates come from SQLite's `datetime('now')`, but fragile.

---

### M4. Docker: `npm ci --production` runs before `COPY . .` — good, but `better-sqlite3` needs build tools

**File:** `Dockerfile:4`

```Dockerfile
RUN npm ci --production
```

`better-sqlite3` is a native addon that requires build tools (python3, make, g++). Alpine does not include these by default. The build will fail unless:
- The npm package ships prebuilt binaries for Alpine (it does via prebuild-install for common targets)
- Or build tools are installed

**Risk:** May work now but can break on version bumps. Should test the Docker build.

**Fix:** Add `RUN apk add --no-cache python3 make g++` before `npm ci`, or add a multi-stage build.

---

### M5. No pagination on `GET /api/posts` or home page

**File:** `app.js:137-143`

The API endpoint returns ALL published posts. The home page uses `LIMIT 50`. As the blog grows, the API response will become unbounded.

**Fix:** Add `?page=` and `?limit=` query params with sensible defaults (e.g., 20) and max cap.

---

### M6. `marked.use({ renderer: { html: () => '' } })` is global mutation

**File:** `app.js:24`

```js
marked.use({ renderer: { html: () => '' } });
```

This modifies the global `marked` instance. If any other code imports `marked`, the renderer override applies everywhere. Fine for this app, but a future import could be surprised.

**Fix:** Use `new marked.Marked()` to create an isolated instance.

---

### M7. Tests don't cover HTML page rendering

No tests for `GET /` (home page) or `GET /p/:slug` (post page). These contain the most complex logic (bilingual toggle, OG tags, XSS escaping in HTML context).

**Fix:** Add tests verifying:
- Home page returns 200 with post cards
- Post page renders markdown correctly
- XSS payloads in title/content are escaped in HTML output
- OG meta tags are present
- 404 page for nonexistent post

---

### M8. Tests don't cover the webhook endpoint

The `/webhook/deploy` endpoint has no test coverage. It involves HMAC verification, JSON parsing, and shell execution.

---

## Low Priority / Nits

### L1. `seed.js` still references port 8877

**File:** `seed.js:17`

```js
curl -X POST http://localhost:8877/api/posts \\
```

The port was changed to 3000 (configurable). The seed content has a stale reference.

---

### L2. Inline CSS in app.js — ~40 lines of style

The CSS block (lines 208-250) is hardcoded in the `layout()` template string. Extracting to a static CSS file would improve maintainability and enable browser caching.

---

### L3. `docker-compose.yml` hardcodes port 3000

**File:** `docker-compose.yml:5`

```yaml
ports:
  - "3000:3000"
```

The host-side port should be configurable via env var for flexibility.

---

### L4. CI workflow does not cache node_modules between runs

The `cache: npm` in setup-node caches the npm registry cache, not `node_modules`. This is correct behavior but `npm ci` still runs every time. For faster CI, consider caching `node_modules` directly or using `actions/cache`.

Actually, `cache: npm` + `npm ci` is the recommended pattern. This is fine as-is.

---

### L5. `.env.example` shows `CORS_ORIGIN=*` as default

For production, `CORS_ORIGIN=*` is insecure. The example should show a restrictive default with a comment explaining the wildcard option.

---

### L6. `deploy.sh` uses `pm2 restart blog` — no graceful handling

If PM2 is not installed or the process name differs, the deploy fails silently (captured by the webhook error handler, but the root cause is opaque).

---

## Edge Cases Found by Scout

1. **Unicode slug generation:** A title like `"Xin chao"` (Vietnamese) generates a slug fine, but a title entirely in Chinese characters produces empty slug after regex, falling back to `post-${Date.now()}`.
2. **Concurrent POST with same auto-slug:** Two simultaneous requests with the same title race to insert. The second gets a 409, which is correct.
3. **Empty body on PUT:** `body = await c.req.json()` throws if Content-Type is wrong or body is empty. Global error handler catches it but returns 500 instead of 400.
4. **`readFileSync` in `loadTokens()` during high concurrency:** Synchronous I/O blocks the Node.js event loop. At blog scale this is fine, but under load it serializes all requests through token file reads.
5. **`nfc(undefined)` returns `undefined`, passed to SQL:** In the INSERT, `nfc(content_vi)` could be `undefined` which better-sqlite3 rejects (it expects null). The `nfc()` helper does not convert undefined to null.
6. **Sitemap has no `<lastmod>` for homepage entry:** Line 65 of feed.js — the homepage `<url>` has no `<lastmod>`, which is valid XML but suboptimal for SEO.

---

## Positive Observations

- Clean app/server separation enables testing without starting HTTP server
- Parameterized SQL throughout — no SQL injection vectors
- `timingSafeEqual` for webhook HMAC — correct crypto practice
- `marked` HTML renderer override strips raw HTML from markdown — good XSS defense
- `createDatabase()` factory in db.js with `:memory:` support for tests — good pattern
- Global error handler prevents stack trace leaks
- `.dockerignore` excludes sensitive files (tokens, .env, .git)
- Test global-setup properly backs up and restores `tokens.json`
- NFC normalization for Vietnamese text — thoughtful internationalization

---

## Recommended Actions (Priority Order)

1. **[Critical]** Fix `GET /api/posts/:slug` to filter by status or require auth
2. **[Critical]** Wrap webhook `JSON.parse` in try/catch
3. **[High]** Add `cover_image` URL validation
4. **[High]** Modularize `app.js` (342 lines > 200-line threshold)
5. **[High]** Add rate limiting on write endpoints
6. **[High]** Add CSP header
7. **[High]** Validate slug on GET/PUT/DELETE params
8. **[High]** Remove test token from committed `tokens.json`
9. **[Medium]** Add HTML page rendering tests (home, post, XSS, OG tags)
10. **[Medium]** Add webhook endpoint tests
11. **[Medium]** Run `validateSlug()` on auto-generated slugs
12. **[Medium]** Handle `nfc(undefined)` -> null conversion
13. **[Medium]** Add pagination to `GET /api/posts`
14. **[Low]** Fix stale port reference in seed.js
15. **[Low]** Extract inline CSS to static file

---

## Metrics

| Metric | Value |
|--------|-------|
| Source LOC | 796 (JS) |
| Test files | 3 |
| Tests | 24 passing |
| Test duration | 156ms |
| Linting issues | 0 (no linter configured) |
| Syntax errors | 0 |
| Files > 200 LOC | 1 (app.js: 342) |

---

## Unresolved Questions

1. Is `GET /api/posts/:slug` intentionally unrestricted (exposing drafts)? If so, document as feature. If not, fix as critical.
2. Should the blog support authentication scopes (read-only tokens vs write tokens)? Currently all tokens are equivalent.
3. Is the Docker build tested? `better-sqlite3` native compilation on Alpine may need build tools.
4. What is the intended behavior when `tokens.json` is missing — deny all writes (current) or allow unauthenticated access?
5. Should `CORS_ORIGIN=*` be the production default, or should it require explicit configuration?
