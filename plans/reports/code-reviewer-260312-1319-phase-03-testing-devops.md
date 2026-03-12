# Code Review: Phase 3 - Testing & DevOps

**Date:** 2026-03-12
**Reviewer:** code-reviewer
**Scope:** 11 files (tests, vitest config, Docker, CI, deploy script, package.json)

---

## Overall Assessment

Solid foundation. Tests are well-structured with proper isolation (in-memory DB, global setup/teardown for tokens.json). Docker and CI are minimal and functional. Several security and correctness issues need attention before production.

---

## Critical Issues

### 1. deploy.sh backs up hardcoded `blog.db` but Docker uses `/app/data/blog.db`

**File:** `scripts/deploy.sh` line 8
The backup checks `blog.db` (relative), but `docker-compose.yml` mounts DB at `/app/data/blog.db` via `DB_PATH`. If deploy runs inside the container or the server uses a custom `DB_PATH`, the backup silently skips the real database.

**Fix:** Read `DB_PATH` from env or `.env` file:
```bash
DB_FILE="${DB_PATH:-$REPO_DIR/blog.db}"
if [ -f "$DB_FILE" ]; then
  cp "$DB_FILE" "${DB_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
fi
```

### 2. `tokens.json` not mounted into Docker container

**File:** `docker-compose.yml`
The app reads `tokens.json` at startup for auth. `.dockerignore` excludes it. No volume mount is configured. Result: **all write endpoints return 401 in production Docker** because `loadTokens()` returns `{}`.

**Fix:** Add a volume mount or an env-based token strategy:
```yaml
volumes:
  - ./data:/app/data
  - ./tokens.json:/app/tokens.json:ro
```

---

## High Priority

### 3. No test for PUT on nonexistent slug (404 path)

**File:** `tests/api.test.js`
PUT and DELETE 404 paths are asymmetric: DELETE verifies post-deletion 404, but PUT on a nonexistent slug is never tested. The code at `app.js:172-173` handles it, but it is unverified.

**Fix:** Add test:
```js
it('returns 404 for nonexistent slug', async () => {
  const res = await apiRequest('PUT', '/api/posts/ghost', { title: 'X' });
  expect(res.status).toBe(404);
});
```

### 4. No test for validation on PUT endpoint

**File:** `tests/validate.test.js`
All validation tests hit POST only. The PUT path also calls `validatePost(body, true)` with different semantics (fields optional). No test verifies that oversized title/content on PUT returns 400.

### 5. No test for webhook endpoint

**File:** `tests/api.test.js`
`/webhook/deploy` has no test coverage. The signature verification logic (`verifySignature`) is security-critical. At minimum, test that requests without a valid signature return 401.

### 6. Docker image runs as root

**File:** `Dockerfile`
No `USER` directive. The Node process runs as root inside the container, increasing blast radius if compromised.

**Fix:**
```dockerfile
RUN addgroup -S app && adduser -S app -G app
RUN mkdir -p /app/data && chown -R app:app /app
USER app
```

### 7. `docker-compose.yml` missing version and healthcheck

**File:** `docker-compose.yml`
No healthcheck means orchestrators (Watchtower, Portainer, etc.) cannot determine container health.

**Fix:**
```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
  interval: 30s
  timeout: 5s
  retries: 3
```

### 8. CI does not run lint (no linter configured)

**File:** `.github/workflows/ci.yml`
Pipeline only runs `npm test`. No linting step. Acceptable for now if no linter exists, but should be tracked as tech debt.

---

## Medium Priority

### 9. Global setup race condition on tokens.json

**File:** `tests/global-setup.js`
The global setup overwrites `tokens.json` with test tokens, and teardown restores it. If the test process is killed (SIGKILL, OOM), teardown never runs and production `tokens.json` is left with test credentials. Low risk in CI (no prod tokens), higher risk on dev machines.

**Mitigation:** Use a separate path like `tokens.test.json` with an env var override, or use a temp file + atomic rename.

### 10. `vitest.config.js` sets `globals: true` but tests import from vitest

**File:** `vitest.config.js` line 5, `tests/api.test.js` line 1
`globals: true` injects `describe/it/expect` globally, but tests explicitly import them from `vitest`. Harmless (explicit imports are actually better practice), but the config option is unnecessary. Minor inconsistency.

### 11. `npm install --production` in deploy.sh vs `npm ci --production` in Dockerfile

**File:** `scripts/deploy.sh` line 19, `Dockerfile` line 4
`npm install` can modify `package-lock.json` and resolve differently than CI. Deploy should use `npm ci --production` for deterministic installs matching the lockfile.

### 12. Port 3000 hardcoded in docker-compose

**File:** `docker-compose.yml` line 5
Host port mapping is `3000:3000`. Per user's global instructions, default ports should be avoided and conflicts are likely on the dev machine. Consider making host port configurable or using a non-default port.

### 13. `.dockerignore` missing `.env.example`, `CLAUDE.md`, `AGENTS.md`, other dev files

**File:** `.dockerignore`
Dev artifacts like `CLAUDE.md`, `AGENTS.md`, `.env.example`, `*.md` docs, `vitest.config.js`, `LICENSE` are copied into the production image unnecessarily. Increases image size and leaks project metadata.

**Fix:** Add:
```
*.md
vitest.config.js
.env.example
AGENTS.md
CLAUDE.md
docs/
```

---

## Low Priority

### 14. Test coverage gaps - edge cases not tested

- Vietnamese text (NFC normalization) not tested at all
- Empty string title/content (whitespace-only) not tested on PUT
- Slug with special chars (Unicode) not tested
- Concurrent duplicate slug creation not tested
- `cover_image` field not tested on any endpoint
- `author` field default ("Anonymous") not tested

### 15. No `.node-version` or `.nvmrc` file

Package.json specifies `engines.node >= 18`, CI uses Node 20, Dockerfile uses `node:20-alpine`. A `.node-version` file would make this consistent across environments.

---

## Positive Observations

- **Test isolation is clean:** in-memory DB + `clearPosts()` before each test, global setup/teardown for tokens
- **`app.request()` for testing:** Using Hono's built-in request method avoids spinning up a real server -- fast (144ms) and reliable
- **deploy.sh improvements:** Replacing `git reset --hard` with `git pull --ff-only` is significantly safer; DB backup before deploy is good practice
- **`.dockerignore` excludes sensitive files:** `tokens.json`, `.env`, `.git`, `tests/`, `plans/`
- **CI is minimal and correct:** Checkout, setup-node with npm cache, ci install, test

---

## Recommended Actions (Priority Order)

1. **[Critical]** Mount `tokens.json` into Docker container or implement env-based token loading
2. **[Critical]** Fix deploy.sh backup path to respect `DB_PATH`
3. **[High]** Add `USER` directive to Dockerfile (non-root)
4. **[High]** Add tests for: PUT 404, PUT validation, webhook 401
5. **[High]** Add Docker healthcheck
6. **[Medium]** Switch deploy.sh to `npm ci --production`
7. **[Medium]** Expand `.dockerignore` to exclude dev files
8. **[Medium]** Make tokens path configurable via env var (solves both Docker mount and test isolation issues)
9. **[Low]** Add remaining edge case tests (Vietnamese text, cover_image, author default)

---

## Metrics

| Metric | Value |
|--------|-------|
| Tests | 17 pass / 0 fail |
| Runtime | 144ms |
| Test files | 2 (api.test.js, validate.test.js) |
| Endpoint coverage | ~70% (CRUD + auth + health; missing webhook, PUT 404, PUT validation) |
| Docker best practices | Partial (no non-root user, no healthcheck, broad COPY) |
| CI coverage | Basic (test only, no lint, no Docker build check) |

---

## Unresolved Questions

1. Is `tokens.json` the intended long-term auth mechanism for Docker deployments, or will it be replaced by env-based tokens?
2. Should CI also build and test the Docker image (`docker build .`) to catch Dockerfile issues early?
3. The deploy script assumes PM2 -- is this the production process manager, or will Docker replace it?
