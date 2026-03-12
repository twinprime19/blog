# Phase 2: API Hardening

## Context
- [plan.md](./plan.md) | Depends on Phase 1
- No input validation — API accepts any payload size/shape
- No health check endpoint
- No CORS config
- Blog is behind Cloudflare tunnel — Cloudflare handles rate limiting and DDoS
- Blog will have <100 posts — pagination is unnecessary complexity and a breaking API change

## Overview
- **Priority:** Important
- **Status:** **done**
- **Effort:** 2h
- **Description:** Add input validation, health check, and CORS. Skip rate limiting (Cloudflare) and pagination (YAGNI).

## Key Insights
- Hono has built-in CORS middleware — no extra dependency
- Rate limiting: SKIP — behind Cloudflare tunnel
- Pagination: SKIP — breaking API change for <100 posts
- Input validation: manual inline, no Zod/Joi (YAGNI for this scale)

## Requirements

### Functional
- POST/PUT body validation: title max 200 chars, content max 100KB, subtitle max 300 chars, author max 100 chars
- Slug validation: alphanumeric + hyphens only, max 200 chars
- Status validation: only "published" or "draft"
- Health check: `GET /health` returns `{ status: "ok", uptime: N }`
- CORS: configurable allowed origins via env var

### Non-functional
- Validation errors return descriptive messages
- Zero breaking changes to existing API response format

## Related Code Files

### Files to modify
- `app.js` — add validation function, apply to POST/PUT, add health check, add CORS middleware
- `.env.example` — add CORS_ORIGIN

## Implementation Steps

1. **Add CORS middleware** to app.js:
   ```js
   import { cors } from 'hono/cors';
   const corsOrigin = process.env.CORS_ORIGIN || '*';
   app.use('*', cors({ origin: corsOrigin }));
   ```
   Update `.env.example` with `CORS_ORIGIN=*`.

2. **Add inline `validatePost(body)` function** in app.js (~15 lines):
   - Returns `{ valid: true }` or `{ valid: false, error: "message" }`
   - Checks: title required (1-200 chars), content required (max 100KB), subtitle (0-300), author (0-100), status in [published, draft], slug format if provided
   - `validateSlug(slug)` — alphanumeric + hyphens, 1-200 chars

3. **Add health check** in app.js (2 lines):
   ```js
   app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));
   ```

4. **Add validation** to POST and PUT handlers in app.js:
   - Call `validatePost(body)` before DB operations
   - Return 400 with specific error message on failure

5. **Update .env.example**:
   ```env
   # CORS (comma-separated origins, or * for all)
   CORS_ORIGIN=*
   ```

## Todo List
- [x] Add CORS middleware
- [x] Add validatePost() and validateSlug() functions inline
- [x] Apply validation to POST handler
- [x] Apply validation to PUT handler
- [x] Add health check endpoint
- [x] Update .env.example with CORS_ORIGIN
- [x] Vietnamese fields (title_vi, subtitle_vi, content_vi) validated
- [x] Empty slug fallback for non-Latin titles
- [ ] Test all endpoints with valid/invalid inputs (manual — awaiting user)

## Success Criteria
- POST with title >200 chars returns 400
- POST with empty title returns 400
- POST with >100KB content returns 400
- GET /health returns 200 with status and uptime
- CORS headers present in responses
- GET /api/posts still returns flat array (no breaking change)
- All currently valid payloads still accepted

## Risk Assessment
- **Low risk:** All changes are additive
- **Validation edge cases:** Must not reject currently valid payloads — test with existing posts
