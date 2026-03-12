# Phase 3: Testing & DevOps

## Context
- [plan.md](./plan.md) | Depends on Phase 1
- Currently: `"test": "echo \"Error: no test specified\" && exit 1"`
- No test framework, no Dockerfile, no CI, deploy.sh uses `git reset --hard`
- SQLite is file-based — easy to create in-memory test databases
- Phase 1 provides: app.js (exported app) and db.js (createDatabase factory)

## Overview
- **Priority:** Critical
- **Status:** **done**
- **Effort:** 2h
- **Description:** Add Vitest tests (focused on API integration), Dockerfile, GitHub Actions CI, fix deploy script.

## Key Insights
- Vitest: fast, ESM-native, no Babel config needed
- Hono has `app.request()` for testing without starting a server
- SQLite `:memory:` for test isolation — no cleanup needed
- Unit tests for `esc()`/`nfc()` are near zero ROI — focus on API integration tests

## Architecture

```
tests/
  setup.js              -- test DB factory, test app factory, test tokens
  api.test.js           -- CRUD + auth + error cases (bulk of value)
  validate.test.js      -- validation helpers (if Phase 2 done)
```

2-3 test files. API integration tests catch real bugs.

## Related Code Files

### Files to create
- `vitest.config.js`
- `tests/setup.js` — test helpers
- `tests/api.test.js` — main test suite
- `tests/validate.test.js` — validation tests (if Phase 2 complete)
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.github/workflows/ci.yml`

### Files to modify
- `package.json` — add vitest devDependency, update test script
- `scripts/deploy.sh` — replace `git reset --hard` with `git pull --ff-only`
- `README.md` — add Docker section, config reference table

## Implementation Steps

### Testing

1. **Install Vitest**:
   ```bash
   npm install -D vitest
   ```

2. **Create vitest.config.js** (~8 lines):
   ```js
   import { defineConfig } from 'vitest/config';
   export default defineConfig({
     test: { globals: true, environment: 'node' }
   });
   ```

3. **Update package.json** test scripts:
   ```json
   "test": "vitest run",
   "test:watch": "vitest"
   ```

4. **Create tests/setup.js** (~30 lines):
   - `createTestApp()` — creates in-memory DB via `createDatabase(':memory:')`, wires it into a fresh Hono app with routes
   - `TEST_TOKEN` constant and test token fixture
   - Helper for authenticated requests

5. **Create tests/api.test.js** (~80 lines):
   - Create post returns 201 with id and slug
   - Create post auto-generates slug from title
   - Create duplicate slug returns 409
   - List posts returns published posts
   - Get single post by slug
   - Get nonexistent post returns 404
   - Update post changes fields
   - Delete post returns ok
   - Request without auth returns 401
   - Request with invalid token returns 401
   - Read endpoints work without auth
   - Health check returns 200 (if Phase 2 done)

6. **Create tests/validate.test.js** (~30 lines, if Phase 2 done):
   - Valid post passes
   - Missing title fails
   - Title too long fails
   - Content too large fails
   - Invalid status fails

### DevOps

7. **Create Dockerfile** (~15 lines):
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --production
   COPY . .
   EXPOSE 3000
   ENV PORT=3000
   RUN mkdir -p /app/data
   CMD ["node", "server.js"]
   ```
   `DB_PATH` env var already supported in db.js (done in Phase 1).

8. **Create docker-compose.yml** (~12 lines):
   ```yaml
   services:
     blog:
       build: .
       ports:
         - "3000:3000"
       volumes:
         - ./data:/app/data
       environment:
         - PORT=3000
         - DB_PATH=/app/data/blog.db
       restart: unless-stopped
   ```

9. **Create .dockerignore**: node_modules, *.db*, tokens.json, .env, .git, plans/, tests/

10. **Create .github/workflows/ci.yml** (~20 lines):
    ```yaml
    name: CI
    on: [push, pull_request]
    jobs:
      test:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with: { node-version: 20, cache: npm }
          - run: npm ci
          - run: npm test
    ```

11. **Fix scripts/deploy.sh**:
    - Replace `git reset --hard` with `git pull --ff-only`
    - Add SQLite DB backup before deploy
    - Keep PM2 restart

12. **Update README.md**: add Docker section + config reference table

## Todo List
- [x] Install vitest
- [x] Create vitest.config.js
- [x] Update package.json test scripts
- [x] Create test setup/helpers
- [x] Write API integration tests
- [x] Write validation tests (if Phase 2 done)
- [x] Create Dockerfile
- [x] Create docker-compose.yml
- [x] Create .dockerignore
- [x] Create .github/workflows/ci.yml
- [x] Fix scripts/deploy.sh
- [x] Update README.md with Docker + config sections
- [x] Verify all tests pass
- [x] Verify Docker build works

## Success Criteria
- `npm test` runs all tests, all pass, <5 seconds
- No test DB files created on disk
- `docker build -t the-wire .` succeeds
- `docker compose up` starts blog with persistent data
- GitHub Actions CI runs tests on push
- deploy.sh uses safe git pull, not reset --hard

## Risk Assessment
- **Low risk:** Tests are additive; devops files are new
- **db.js factory refactor:** Done in Phase 1, must keep default export working
- **better-sqlite3 in CI:** Needs compilation on Linux — handled by npm ci
