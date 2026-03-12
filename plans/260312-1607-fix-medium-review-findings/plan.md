# Fix Medium Priority Code Review Findings

**Date:** 2026-03-12
**Branch:** feature/productionization
**Source:** plans/reports/code-reviewer-260312-1538-pr2-productionization-v2.md
**Status:** Complete

## Overview

7 medium-priority fixes from PR #2 v2 code review. All are small, targeted changes with clear specs.

## Phases

| # | Phase | Items | Status |
|---|-------|-------|--------|
| 1 | Source code fixes | M1, M2, M3, M4, M7 | [x] |
| 2 | Docker build fix | M5 | [x] |
| 3 | Rate limit tests | M6 | [x] |

## Phase 1: Source Code Fixes

### M1. Escape `siteUrl` in OG meta tags
**File:** `routes/page-routes.js:160`
**Change:** `${siteUrl}` → `${esc(siteUrl)}`

### M2. Guard `c.req.json()` on POST/PUT
**File:** `routes/api-routes.js:34, 61`
**Change:** Wrap `await c.req.json()` in try/catch, return 400 on parse failure

### M3. Improve rate limiter IP extraction
**File:** `middleware/rate-limit.js:15`
**Change:** Use first IP from `x-forwarded-for` chain, fallback to `x-real-ip`, then `'unknown'`
**Note:** Add comment documenting reverse proxy requirement

### M4. Isolate rate limiter store per instance
**File:** `middleware/rate-limit.js:2`
**Change:** Move `const store = new Map()` inside `createRateLimiter()`. Move cleanup interval inside too.

### M7. Fix stale port in seed.js
**File:** `seed.js:17`
**Change:** Replace `8877` with generic placeholder or reference config

## Phase 2: Docker Build Fix

### M5. Add Alpine build tools for better-sqlite3
**File:** `Dockerfile:4`
**Change:** Add `apk add --no-cache python3 make g++` before `npm ci`

## Phase 3: Rate Limit Tests

### M6. Add rate limiting behavior test
**File:** `tests/api.test.js` (or new `tests/rate-limit.test.js`)
**Tests:**
- Requests within limit succeed (200)
- Request exceeding limit returns 429 + Retry-After header
- Different limiter instances have isolated stores (verifies M4 fix)

## Success Criteria

- All 7 medium items addressed
- `npm test` passes (49+ tests)
- No file exceeds 200 LOC
