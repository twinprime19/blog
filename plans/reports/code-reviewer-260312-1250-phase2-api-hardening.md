# Code Review: Phase 2 API Hardening

**Date:** 2026-03-12
**Reviewer:** code-reviewer
**Branch:** feature/productionization
**Scope:** `app.js` (new, 328 lines), `.env.example` (new)

---

## Overall Assessment

Solid implementation. All Phase 2 requirements met. Validation logic is correct, CORS config is appropriate, no breaking changes to existing API. A few medium-priority edge cases and one high-priority issue found below.

---

## Critical Issues

None.

---

## High Priority

### H1. Auto-generated slug can produce empty string

**File:** `app.js` line 152
```js
const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
```

If `title` is all non-ASCII (e.g. a Vietnamese-only title like `"Tin tuc"` after NFC works fine, but `"!!!"` or `"..."`) the generated slug becomes empty string `""`. This passes the `INSERT` but creates a post reachable at `/api/posts/` and `/p/` -- ambiguous routing.

**Fix:** Add a guard after slug generation:
```js
const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
if (!finalSlug) return c.json({ error: 'Cannot auto-generate slug from title; provide a slug explicitly' }, 400);
```

**Impact:** Edge case, but if hit, creates unreachable/conflicting post. Easy fix.

### H2. Vietnamese-only titles produce empty auto-slug

Related to H1 -- Vietnamese diacritics like `"Bai viet dau tien"` (with diacriticals) get stripped to `"bi-vit-u-tin"` which is fine, but pure non-Latin titles (e.g. CJK, emoji-only) produce empty. The regex `[^a-z0-9]` strips everything non-ASCII. Same fix as H1 covers this.

### H3. PUT handler validates `slug` in body but never applies it

**File:** `app.js` lines 165-181

`validatePost` checks `body.slug` if present, but the PUT handler's field loop (line 174) does not include `slug` in its key list:
```js
for (const key of ['title', 'subtitle', 'content', 'content_vi', 'title_vi', 'subtitle_vi', 'author', 'cover_image', 'status']) {
```

Sending `{ "slug": "new-slug" }` in a PUT passes validation but is silently ignored. This is likely intentional (slug is immutable after creation), but:
- If intentional: `validatePost` should skip slug validation for updates, or the API should return a clear error
- If unintentional: add `slug` to the updatable fields list

**Recommendation:** Explicitly reject slug in PUT body for clarity:
```js
if (body.slug !== undefined) return c.json({ error: 'Slug cannot be changed after creation' }, 400);
```

---

## Medium Priority

### M1. `validatePost` does not check `content_vi`, `title_vi`, `subtitle_vi`

These fields are accepted and stored (lines 149, 174-175) but have no length/size validation. A caller could send a 10MB `content_vi` payload. Applies to both POST and PUT.

**Fix:** Add the Vietnamese fields to `validatePost`:
```js
if (content_vi !== undefined && Buffer.byteLength(String(content_vi), 'utf-8') > 100 * 1024) return 'content_vi must be 100KB or smaller';
if (title_vi !== undefined && String(title_vi).length > 200) return 'title_vi must be 200 characters or fewer';
if (subtitle_vi !== undefined && String(subtitle_vi).length > 300) return 'subtitle_vi must be 300 characters or fewer';
```

### M2. `cover_image` field not validated

No URL format check or length limit. A caller could store an arbitrarily long string. At minimum, add a length cap:
```js
if (cover_image !== undefined && String(cover_image).length > 2000) return 'cover_image URL must be 2000 characters or fewer';
```

URL format validation (protocol check) is optional but worth considering to prevent `javascript:` URIs in the `<img src>` attribute. The `esc()` function prevents XSS via attribute injection, so this is defense-in-depth only.

### M3. CORS origin list doesn't validate individual origins

**File:** `app.js` line 49
```js
origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(o => o.trim()),
```

Empty strings in the list (e.g. `CORS_ORIGIN=http://a,,http://b`) produce `["http://a", "", "http://b"]`. Hono's cors middleware likely handles this gracefully, but filtering empties is cheap:
```js
origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(o => o.trim()).filter(Boolean),
```

### M4. `POST /api/posts` doesn't validate `c.req.json()` parse failure

**File:** `app.js` line 148

If a client sends invalid JSON, `c.req.json()` throws. The global `onError` handler catches this and returns a generic 500. A 400 with "Invalid JSON" would be more helpful:
```js
let body;
try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
```

Same applies to PUT on line 166. This is a pre-existing issue (not introduced in Phase 2) but worth noting since validation was the focus.

---

## Low Priority

### L1. `validateSlug` regex order: length check runs after regex

The regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` runs on slugs up to any length before the 200-char check. For a 10K-char slug this is wasted CPU. Trivial impact given <100 posts and auth-gated endpoints, but swap order for correctness:
```js
if (slug.length > 200) return 'Slug must be 200 characters or fewer';
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'Slug must be alphanumeric with hyphens only';
```

### L2. Health endpoint exposes `process.uptime()`

Minimal info leakage -- reveals how long the process has been running. Acceptable for a blog behind Cloudflare. No action needed unless security posture changes.

### L3. Tester report noted auto-slug can produce consecutive hyphens

Title `"Hello   World"` produces slug `"hello---world"`. This passes `validateSlug` regex since `^[a-z0-9]+(?:-[a-z0-9]+)*$` requires segments between hyphens -- actually wait, `"hello---world"` would FAIL this regex because `--` creates empty segments. So the auto-generated slug would be rejected by `validateSlug` if explicitly passed, but the code path at line 152 generates the slug and does NOT validate it through `validateSlug`.

**The auto-generated slug bypasses validation.** Fix: run `validateSlug(finalSlug)` after generation.

Actually, reviewing again: the auto-slug regex `replace(/[^a-z0-9]+/g, '-')` replaces one-or-more non-alphanumeric chars with a single hyphen, so `"Hello   World"` becomes `"hello-world"` (single hyphen). Consecutive non-alphanumeric chars get collapsed. This is correct. No issue.

---

## Edge Cases Scouted

1. **Empty JSON body on POST:** `await c.req.json()` returns `{}`, then `validatePost({})` returns `"title is required"`. Handled correctly.
2. **Non-string field values:** `validatePost` uses `String(title)` coercion. Sending `{ "title": 123, "content": true }` coerces to `"123"` and `"true"`. This is acceptable behavior -- the DB stores text anyway.
3. **Null field values:** `title: null` -- `!title` is true, returns "title is required". Correct.
4. **URL path slug injection:** `:slug` param in routes like `GET /api/posts/:slug` goes directly to SQL parameterized query. No injection risk. Correct.
5. **DELETE endpoint has no validation:** Slug comes from URL param, goes to parameterized query. No body to validate. Correct.
6. **DB migration removed:** Phase 1 removed the `ALTER TABLE` migration lines from `db.js`. The schema now uses `CREATE TABLE IF NOT EXISTS` with all columns. This means existing databases from before the `content_vi` columns were added will NOT get those columns. Fine if this is a fresh deploy for open-source, but worth documenting.

---

## Positive Observations

- Clean separation: `app.js` exports app, `server.js` just serves -- good for testing
- `Buffer.byteLength` for content size -- correct approach for multibyte text
- Security headers (nosniff, DENY) applied globally
- Global error handler prevents stack trace leaks
- `esc()` function consistently applied to all user-visible output
- `nfc()` normalization for Vietnamese text -- thoughtful
- Parameterized SQL throughout -- no injection vectors
- `timingSafeEqual` for webhook signature verification

---

## Todo List Verification (Phase 2)

- [x] Add CORS middleware
- [x] Add validatePost() and validateSlug() functions inline
- [x] Apply validation to POST handler
- [x] Apply validation to PUT handler
- [x] Add health check endpoint
- [x] Update .env.example with CORS_ORIGIN
- [ ] Test all endpoints with valid/invalid inputs -- manual, no automated tests yet (Phase 3)

All implementation tasks complete. Testing deferred to manual + Phase 3 Jest.

---

## Recommended Actions

1. **[High]** Add empty-slug guard after auto-generation (H1) -- 2 lines
2. **[High]** Decide on slug mutability in PUT and make it explicit (H3)
3. **[Medium]** Add validation for `content_vi`, `title_vi`, `subtitle_vi` (M1)
4. **[Medium]** Add `cover_image` length cap (M2)
5. **[Medium]** Filter empty CORS origins (M3) -- 1 line
6. **[Medium]** Catch JSON parse errors with 400 instead of 500 (M4)
7. **[Low]** Swap slug validation order for efficiency (L1)

---

## Metrics

- **Files changed:** 2 (app.js new, .env.example new) + 3 modified (server.js, db.js, .gitignore)
- **LOC added:** ~328 (app.js) + 11 (.env.example)
- **Type coverage:** N/A (plain JS, no TypeScript)
- **Test coverage:** 0% automated (manual vectors in tester report)
- **Linting issues:** 0 (no linter configured)

---

## Unresolved Questions

1. Is slug immutable after creation? (drives H3 fix direction)
2. Should `content_vi`/`title_vi`/`subtitle_vi` have the same limits as their English counterparts?
3. Is the removed DB migration (ALTER TABLE for Vietnamese columns) acceptable for existing deployments, or should a migration script be provided?
