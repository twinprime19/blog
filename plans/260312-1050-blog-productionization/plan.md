---
title: "The Wire — Open-Source Productionization"
description: "Phased plan to prepare The Wire blog engine for public open-source release"
status: complete
priority: P1
effort: 8h (all phases completed)
branch: feature/productionization
tags: [productionization, open-source, cleanup, hardening, testing, devops]
created: 2026-03-12
updated: 2026-03-12
---

# The Wire — Open-Source Productionization Plan

## Summary

Prepare The Wire (Hono + SQLite + Marked blog engine) for public release as a lightweight, self-hostable blog. Four phases, each independently shippable. Simplicity is the feature — the app is ~290 lines and should stay lean.

## Current State (post Phase 4 — Complete)

- **app.js** (332 lines) — all app logic: routes, CORS, health check, input validation, auth, webhook, templates
- **server.js** (6 lines) — entry point, imports app + calls serve()
- **db.js** (36 lines) — SQLite setup with `createDatabase()` factory, `DB_PATH` env support
- **config.js** — site config vars (SITE_URL, SITE_TITLE, SITE_DESCRIPTION)
- **feed.js** — RSS 2.0 and sitemap routes with escXml() helper
- **seed.js** — sample data seeder
- **package.json** — complete metadata, MIT license, engines >=18, vitest devDep, test script
- **scripts/deploy.sh** — fixed: uses `git pull --ff-only`, DB backup before deploy, PM2 restart
- **README.md** — sanitized, no internal IPs, Docker section, config reference table
- **.env.example** — PORT, DB_PATH, GITHUB_WEBHOOK_SECRET, CORS_ORIGIN, SITE_URL, SITE_TITLE, SITE_DESCRIPTION
- **LICENSE** — MIT
- **tests/** — vitest setup with 24 passing tests (17 API, 7 feed) in 144ms
- **vitest.config.js** — ESM config, node environment, globals enabled
- **Dockerfile** — node:20-alpine, runs `npm ci --production`
- **docker-compose.yml** — service with persistent data volume, env vars
- **.dockerignore** — excludes node_modules, db files, tokens, .env, tests, plans
- **.github/workflows/ci.yml** — GitHub Actions: checkout, setup Node 20, npm ci, npm test

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | Cleanup & Config | 2h | **done** | [phase-01](./phase-01-cleanup-and-config.md) |
| 2 | API Hardening | 2h | **done** | [phase-02](./phase-02-api-hardening.md) |
| 3 | Testing & DevOps | 2h | **done** | [phase-03](./phase-03-testing-and-devops.md) |
| 4 | Blog Features | 2h | **done** | [phase-04](./phase-04-blog-features.md) |

## Dependencies

```
Phase 1 (Cleanup) ✅ --> Phase 2 (Hardening)
                     --> Phase 3 (Testing & DevOps)
                     --> Phase 4 (Features) -- independent
```

Phase 1 done. Phases 2-4 can run in parallel.

## Key Decisions

- **Keep app.js as monolith** — 292 lines is fine. Split was app.js (setup) + server.js (listen) for testability
- **Keep file-based auth** (tokens.json) — simple, works, appropriate scale
- **Keep SQLite** — no reason to add Postgres complexity
- **MIT License** — standard for lightweight tools
- **No ORM** — better-sqlite3 direct queries are fine
- **dotenv for config** — standard, no custom config system
- **No rate limiting** — behind Cloudflare tunnel
- **No pagination** — <100 posts; avoid breaking API change
- **No CONTRIBUTING.md** — public open-source but contributions are welcomed organically
- **Minimal test files** — 2-3 files focused on API integration tests
- **Inline validation** — no Zod/Joi, manual checks in app.js
