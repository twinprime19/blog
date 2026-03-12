# Code Review v2: PR #2 — Productionize Blog Engine

**Reviewer:** code-reviewer
**Date:** 2026-03-12
**Branch:** feature/productionization
**Commits:** 4 (49efdaa, 569be82, 42897be, c870e1a)
**Stats:** +7370 / -328 across 55 files (~643 LOC source JS, ~487 LOC tests)

---

## Scope

- **Files reviewed:** app.js, server.js, config.js, db.js, feed.js, helpers.js, validation.js, seed.js, Dockerfile, docker-compose.yml, deploy.sh, ci.yml, vitest.config.js, middleware/auth.js, middleware/rate-limit.js, routes/api-routes.js, routes/page-routes.js, routes/webhook-routes.js, tests/*.js, .gitignore, .dockerignore, .env.example, package.json
- **Focus:** Full PR review — security, correctness, architecture, performance, testing, Docker/DevOps
- **Test run:** 49/49 passing (188ms), 5 test files
- **Baseline:** Compared against v1 review findings (code-reviewer-260312-1459)

---

## Overall Assessment

Strong productionization effort. The fix commit (c870e1a) addressed most critical and high-priority findings from v1 review: modularized app.js into routes/middleware/helpers/validation, added rate limiting, CSP header, slug validation on all endpoints, cover_image URL validation, token caching, webhook JSON try/catch, draft post filtering, page/webhook tests, and isolated Marked instance. Code is clean, well-organized, and tests are comprehensive.

**Remaining issues are primarily medium/low severity.** No blocking items for merge, but a few items worth addressing.

---

## V1 Review Findings — Resolution Status

| ID | Finding | Status |
|----|---------|--------|
| C1 | GET /api/posts/:slug exposes drafts | **FIXED** — filters `status = 'published'` |
| C2 | Webhook JSON.parse no try/catch | **FIXED** — wrapped with 400 response |
| C3 | cover_image no URL validation | **FIXED** — validates protocol in validation.js |
| H1 | app.js >200 lines | **FIXED** — split to routes/, middleware/, helpers.js, validation.js (largest file now 165 LOC) |
| H2 | Token auth reads FS every request | **FIXED** — 5s TTL cache with stale fallback |
| H3 | No rate limiting | **FIXED** — createRateLimiter middleware on write endpoints + webhook |
| H4 | Missing CSP header | **FIXED** — added in app.js |
| H5 | No slug validation on GET/PUT/DELETE | **FIXED** — validateSlug on all slug params |
| H6 | tokens.json committed | **FIXED** — no longer tracked in git |
| M1 | esc() inconsistent with nfc() for falsy | **FIXED** — uses `== null` check |
| M2 | Auto-slug not validated | **FIXED** — runs validateSlug on auto-generated |
| M3 | formatDate assumes UTC | **FIXED** — checks for timezone indicator |
| M5 | No pagination on GET /api/posts | **FIXED** — ?page= and ?limit= with cap |
| M6 | marked.use() global mutation | **FIXED** — uses `new Marked()` instance |
| M7 | No page rendering tests | **FIXED** — pages.test.js with 7 tests |
| M8 | No webhook tests | **FIXED** — webhook.test.js with 5 tests |
| E5 | nfc(undefined) returns undefined | **FIXED** — returns null |
| L1 | seed.js references port 8877 | **OPEN** — still on line 17 |

---

## Remaining Issues

### Medium Priority

#### M1. `siteUrl` not escaped in OG meta tags (page-routes.js:160)

**File:** `routes/page-routes.js:160`

```js
<meta property="og:url" content="${siteUrl}/p/${esc(post.slug)}">
```

`siteUrl` is injected raw into HTML attribute. In feed.js, `siteUrl` is properly escaped with `escXml()`. While `siteUrl` comes from an env var (not user-controlled at runtime), if the URL contains `&` (e.g., tracking params) or `"`, it breaks the HTML attribute.

**Fix:** `content="${esc(siteUrl)}/p/${esc(post.slug)}"` — consistent with how feed.js handles it.

---

#### M2. `c.req.json()` unguarded on POST/PUT — returns 500 instead of 400

**File:** `routes/api-routes.js:34, 61`

```js
const body = await c.req.json();
```

If the request has wrong Content-Type or malformed JSON, `c.req.json()` throws. The global `app.onError` catches it and returns 500. A 400 would be more correct.

**Fix:** Wrap in try/catch:
```js
let body;
try { body = await c.req.json(); }
catch { return c.json({ error: 'Invalid JSON body' }, 400); }
```

---

#### M3. Rate limiter uses `x-forwarded-for` directly — spoofable

**File:** `middleware/rate-limit.js:15`

```js
const key = c.req.header('x-forwarded-for') || 'unknown';
```

`x-forwarded-for` is trivially spoofable by clients. An attacker can bypass rate limiting by changing this header on each request. Also, if no proxy is in front, all requests key on `'unknown'` — meaning one user hitting the limit blocks ALL users.

**Fix options:**
- Use `c.req.header('x-real-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'` (take first IP in chain)
- For Hono, consider `c.env.incoming?.socket?.remoteAddress` for direct connections
- Document that a reverse proxy (Cloudflare/nginx) is expected to set trusted headers

---

#### M4. Rate limiter shared `store` across all instances

**File:** `middleware/rate-limit.js:2`

```js
const store = new Map();
```

All `createRateLimiter()` calls share the same `Map`. The API write limiter (20/min) and webhook limiter (20/min) use the same store with the same keys. An API writer who hits 20 requests also blocks webhook requests from the same IP.

**Fix:** Move `const store = new Map()` inside `createRateLimiter()` so each limiter has its own store.

---

#### M5. Docker: `better-sqlite3` native build on Alpine

**File:** `Dockerfile:4`

```Dockerfile
RUN npm ci --production
```

`better-sqlite3` requires native compilation. Alpine may not have build tools. The package ships prebuilt binaries via `prebuild-install` for common targets, but this can break on version bumps or uncommon architectures.

**Fix:** Either add `RUN apk add --no-cache python3 make g++` before `npm ci` (and optionally remove after in a multi-stage build), or test the Docker build in CI.

---

#### M6. No test for rate limiting behavior

No test verifies the rate limiter actually rejects requests after the limit. Given the shared store issue (M4), this is worth testing.

---

#### M7. `seed.js` still references port 8877

**File:** `seed.js:17`

```js
curl -X POST http://localhost:8877/api/posts \
```

Stale hardcoded port in sample content. Low impact (only affects seed post content), but inconsistent with the rest of the codebase.

---

### Low Priority

#### L1. CSP allows `script-src 'unsafe-inline'`

**File:** `app.js:24`

The CSP header includes `script-src 'self' 'unsafe-inline'`. The inline script in page-routes.js (bilingual toggle, lines 124-137) requires this. While functional, `unsafe-inline` significantly weakens XSS protection.

**Fix (future):** Extract inline script to a static JS file, then remove `'unsafe-inline'` from CSP. Use a nonce-based approach if inline scripts are needed.

---

#### L2. Cleanup interval in rate limiter never clears on shutdown

**File:** `middleware/rate-limit.js:6-10`

```js
const cleanup = setInterval(() => { ... }, 5 * 60_000);
cleanup.unref();
```

`unref()` prevents the interval from keeping Node.js alive, which is correct. But for tests running multiple instances, intervals accumulate. Not a practical problem with current test setup (tests use app.request, not real HTTP), but worth noting.

---

#### L3. `docker-compose.yml` hardcodes port 3000

**File:** `docker-compose.yml:5`

```yaml
ports:
  - "3000:3000"
```

Could use `${PORT:-3000}:3000` for host-side flexibility.

---

#### L4. Home page hardcoded to 50 posts with no pagination

**File:** `routes/page-routes.js:86`

```js
LIMIT 50
```

The API has pagination (M5 fix), but the HTML home page does not. For a blog this is unlikely to be an issue soon, but as content grows it will need pagination or infinite scroll.

---

#### L5. `.env.example` shows `CORS_ORIGIN=*` default

For production, wildcard CORS is insecure. The example should comment it as dev-only:
```
# CORS_ORIGIN=*  # Dev only — set specific origins for production
```

---

## Edge Cases Found by Scout

1. **PUT with empty body or wrong Content-Type:** `c.req.json()` throws, caught by global error handler as 500 instead of 400 (see M2)
2. **Rate limit key collision:** API and webhook rate limiters share one Map. A burst of API writes blocks webhooks from same IP (see M4)
3. **Rate limit bypass:** `x-forwarded-for` spoofable. All direct connections share `'unknown'` key (see M3)
4. **Unicode-only title slugification:** Title of pure CJK characters -> empty string after regex -> falls back to `post-{timestamp}` which now passes validateSlug. Correct behavior but generates non-descriptive slugs.
5. **Concurrent slug collision:** Two simultaneous POSTs with identical title race. Second gets 409 (UNIQUE constraint). This is correct and well-handled.
6. **Token file corruption recovery:** If `tokens.json` becomes invalid JSON, `loadTokens()` logs warning and returns stale cache. If no cache exists, returns `{}` (denies all writes). Good fail-safe behavior.
7. **`siteUrl` with trailing slash:** `config.js` strips trailing slashes, preventing double-slash in URLs like `https://example.com//p/slug`. Good.

---

## Positive Observations

- **Excellent refactoring:** app.js went from 342 lines to 40 lines. All files under 200 LOC threshold
- **Comprehensive test suite:** 49 tests covering API, feeds, pages, validation, webhook, auth, XSS, OG tags
- **Security posture:** Parameterized SQL, XSS escaping via `esc()`, markdown HTML stripping, CSP header, HMAC timing-safe comparison, token caching with stale fallback, rate limiting
- **Clean architecture:** config.js / db.js / helpers.js / validation.js / middleware / routes — clear separation of concerns
- **Good defensive patterns:** `nfc()` returns null for null/undefined, `esc()` handles null via `== null`, `validatePost()` validates all fields with length limits
- **Tests use in-memory DB:** Fast and isolated, no disk I/O
- **Global test setup:** Properly backs up and restores tokens.json
- **Docker:** Non-root user, health check, sensible .dockerignore

---

## Recommended Actions (Priority Order)

1. **[Medium]** Move rate limiter `store` inside `createRateLimiter()` to isolate per-limiter state — trivial fix, prevents cross-contamination (M4)
2. **[Medium]** Wrap `c.req.json()` in try/catch on POST/PUT for proper 400 response (M2)
3. **[Medium]** Escape `siteUrl` in OG meta tags for consistency (M1)
4. **[Medium]** Improve rate limiter IP key extraction — take first IP from `x-forwarded-for`, document proxy requirement (M3)
5. **[Low]** Test Docker build in CI or add Alpine build tools (M5)
6. **[Low]** Fix stale port 8877 in seed.js (M7)
7. **[Low]** Consider extracting inline script to remove `script-src 'unsafe-inline'` from CSP (L1)
8. **[Low]** Make docker-compose port configurable (L3)

---

## Metrics

| Metric | v1 | v2 |
|--------|-----|-----|
| Source LOC | 796 (1 file >200) | 643 (all <200) |
| Test files | 3 | 5 |
| Tests | 24 | 49 |
| Test duration | 156ms | 188ms |
| Critical issues | 3 | 0 |
| High issues | 6 | 0 |
| Medium issues | 8 | 7 (4 new, 3 remaining) |
| Low issues | 6 | 5 |
| tokens.json tracked | Yes | No |

---

## Verdict

**Approve with minor suggestions.** All critical and high-priority issues from v1 are resolved. The remaining medium-priority items (rate limiter store isolation, JSON parsing error codes, OG escaping) are non-blocking improvements that can be addressed in a follow-up. The codebase is well-structured, secure, and thoroughly tested.

---

## Unresolved Questions

1. Is the Docker build tested end-to-end? `better-sqlite3` native compilation on Alpine is the most likely deployment failure point.
2. Should rate limiting have per-endpoint isolation, or is the shared store acceptable for this scale?
3. Is `script-src 'unsafe-inline'` acceptable long-term, or should the bilingual toggle script be extracted?
