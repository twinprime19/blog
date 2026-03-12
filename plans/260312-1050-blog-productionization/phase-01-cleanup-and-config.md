# Phase 1: Cleanup & Config

## Context
- [plan.md](./plan.md)
- server.js hardcodes port 8877
- README contains internal IPs (172.16.20.20), PM2 process name
- release-manifest.json leaked from Claude toolkit
- package.json missing description, author, keywords, repository, engines

## Overview
- **Priority:** Critical — blocks public release
- **Status:** **done**
- **Effort:** 2h
- **Description:** Remove leaked files, add LICENSE, introduce .env config, fix package.json metadata, sanitize README. Also: minimal app/server split for testability and db.js cleanup.

## Key Insights
- release-manifest.json is NOT part of this project — must remove AND gitignore
- README is well-written but needs IP/infra references replaced with localhost examples
- tokens.json already gitignored, but no .env.example exists for new users
- db.js ALTER TABLE migration hacks are dead code (columns already in CREATE TABLE)
- server.js needs app/server split so Phase 3 can test routes without starting a server

## Requirements

### Functional
- All internal IPs/infra details removed from public-facing files
- .env file support for PORT, GITHUB_WEBHOOK_SECRET
- .env.example with documented variables
- MIT LICENSE file at root
- Complete package.json metadata
- app.js exports Hono app, server.js just calls serve()
- db.js exports createDatabase(path) factory for testing

### Non-functional
- Zero breaking changes to existing functionality
- Existing deployments unaffected (set PORT=8877 in .env)

## Related Code Files

### Files to modify
- `server.js` — gut to ~5 line entry point (import app, call serve)
- `db.js` — remove ALTER TABLE hacks, add createDatabase() factory export
- `package.json` — add metadata fields
- `.gitignore` — add release-manifest.json, deploy-failure.log, .env
- `README.md` — replace all 172.16.20.20 refs with localhost, remove PM2/LAN details
- `docs/token-management.md` — replace 172.16.20.20 refs
- `seed.js` — update db import if path changes

### Files to create
- `app.js` — Hono app setup (everything currently in server.js except the serve() call)
- `LICENSE` — MIT license
- `.env.example` — documented env vars template

### Files to delete
- `release-manifest.json` — leaked artifact

## Implementation Steps

1. **Delete release-manifest.json**

2. **Update .gitignore** — add: `.env`, `deploy-failure.log`, `release-manifest.json`

3. **Install dotenv** and add to top of app.js:
   ```bash
   npm install dotenv
   ```
   Add `import 'dotenv/config';` at top of app.js.

4. **Split server.js into app.js + server.js:**
   - `app.js` — all current server.js content (imports, app setup, routes, middleware) EXCEPT the last 3 lines. Add `import 'dotenv/config';` at top. Change port to `parseInt(process.env.PORT || '3000', 10)`. Export `app` and `port`.
   - `server.js` — slim entry point (~5 lines):
     ```js
     import { serve } from '@hono/node-server';
     import { app, port } from './app.js';
     serve({ fetch: app.fetch, port }, () => {
       console.log(`Blog running at http://localhost:${port}`);
     });
     ```

5. **Clean up db.js:**
   - Remove the 3 try/catch ALTER TABLE lines (dead code)
   - Add factory export:
     ```js
     export function createDatabase(dbPath) {
       const db = new Database(dbPath);
       db.pragma('journal_mode = WAL');
       db.pragma('foreign_keys = ON');
       db.exec(`CREATE TABLE IF NOT EXISTS posts (...)`);
       return db;
     }
     ```
   - Default export stays: `export default createDatabase(join(__dirname, 'blog.db'));`

6. **Create .env.example**:
   ```env
   # Server
   PORT=3000

   # GitHub webhook (optional — for auto-deploy)
   GITHUB_WEBHOOK_SECRET=
   ```

7. **Create LICENSE** — MIT, copyright "The Wire Contributors"

8. **Update package.json**: add name, description, author, license, keywords, repository, engines (node >=18)

9. **Sanitize README.md**: remove PM2/LAN lines, replace 172.16.20.20:8877 with localhost:3000, add Getting Started section

10. **Sanitize docs/token-management.md**: replace 172.16.20.20:8877 with localhost:3000

## Todo List
- [x] Delete release-manifest.json
- [x] Update .gitignore
- [x] Install dotenv
- [x] Split server.js → app.js + server.js
- [x] Clean up db.js (remove ALTER hacks, add createDatabase factory, add DB_PATH env)
- [x] Create .env.example
- [x] Create MIT LICENSE
- [x] Update package.json metadata
- [x] Sanitize README.md
- [x] Sanitize docs/token-management.md
- [x] Verify app.js loads with port=3000
- [x] Verify createDatabase exports correctly

## Success Criteria
- `release-manifest.json` gone from repo
- `grep -r "172.16.20.20" .` returns zero results (excluding node_modules)
- Server starts with `node server.js` using default PORT=3000
- Server starts with `PORT=4000 node server.js` using custom port
- LICENSE file exists and is valid MIT
- package.json has all required npm fields
- `import { app } from './app.js'` works (for Phase 3 testing)
- `import { createDatabase } from './db.js'` works (for Phase 3 testing)

## Risk Assessment
- **Low risk:** All changes are additive or cosmetic except port default change
- **Port change mitigation:** Existing deployments use .env or PM2 ecosystem config, unaffected
- **app/server split:** Mechanical refactor, no logic changes
