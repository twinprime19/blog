# Planner Report: Blog Productionization

**Date:** 2026-03-12
**Plan:** `plans/260312-1050-blog-productionization/`

## Summary

Created 6-phase productionization plan for The Wire blog engine. Total estimated effort: ~16h. Each phase independently shippable.

## Phase Breakdown

| # | Phase | Effort | Key Deliverables |
|---|-------|--------|-----------------|
| 1 | Cleanup & Config | 2h | Remove leaked files, LICENSE, .env support, sanitize README |
| 2 | Modularize | 3h | Split 296-line server.js into src/ modules (<60 lines each) |
| 3 | API Hardening | 3h | Input validation, rate limiting, pagination, health check, CORS |
| 4 | Testing | 3h | Vitest setup, unit + integration tests, in-memory SQLite |
| 5 | DevOps & Docs | 3h | Dockerfile, GitHub Actions CI, CONTRIBUTING.md, README polish |
| 6 | Blog Features | 2h | RSS feed, sitemap.xml, OpenGraph tags, favicon |

## Key Decisions

- **MIT License** — standard for lightweight OSS tools
- **dotenv** for config — no custom config system
- **Keep file-based auth** (tokens.json) — simple, fits the project
- **Vitest** for testing — ESM-native, fast, no config overhead
- **In-memory rate limiter** — no Redis dependency (YAGNI for single-process SQLite app)
- **No ORM, no Zod** — manual validation adequate at this scale
- **Pagination changes response shape** — breaking change, needs semver bump to 2.0.0

## Dependency Graph

```
P1 --> P2 --> P3 (sequential: must modularize before hardening)
              P2 --> P4 (tests target modularized code)
                     P4 --> P5 (CI needs tests to exist)
              P2 --> P6 (features plug into modular structure)
```

## Notable Risks

1. **Phase 2 (modularize)** is highest risk — many file moves, potential broken imports. Must test every route after.
2. **Phase 3 pagination** is a breaking API change — response goes from array to `{ posts: [], pagination: {} }`.
3. **Phase 5 deploy.sh** change from `git reset --hard` to `git pull --ff-only` may fail on diverged deployments (but that's safer than silent data loss).

## Files Created

- `plans/260312-1050-blog-productionization/plan.md`
- `plans/260312-1050-blog-productionization/phase-01-cleanup-and-config.md`
- `plans/260312-1050-blog-productionization/phase-02-modularize.md`
- `plans/260312-1050-blog-productionization/phase-03-api-hardening.md`
- `plans/260312-1050-blog-productionization/phase-04-testing.md`
- `plans/260312-1050-blog-productionization/phase-05-devops-and-docs.md`
- `plans/260312-1050-blog-productionization/phase-06-blog-features.md`
