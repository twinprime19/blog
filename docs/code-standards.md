# Code Standards & Guidelines

## Purpose

This document defines code style, architecture patterns, and quality standards for The Wire blog engine. All code contributions must follow these guidelines to maintain readability, security, and maintainability.

---

## File Organization

### Directory Structure

```
blog/
├── app.js              # Main application (routes, auth, rendering)
├── config.js           # Configuration exports
├── feed.js             # RSS and sitemap routes
├── db.js               # Database connection
├── server.js           # Server startup
├── seed.js             # Database initialization
├── package.json        # Dependencies
├── docs/               # Documentation (this folder)
├── scripts/            # Deployment scripts
├── tests/              # Test files (mirror src structure)
├── tokens.json         # Token registry (gitignored)
├── blog.db             # Database (gitignored)
└── .env                # Environment variables (gitignored)
```

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Files (JS) | kebab-case | `deploy.sh`, `app.js` |
| Variables | camelCase | `siteUrl`, `tokenEntry` |
| Constants | UPPER_SNAKE_CASE | `WEBHOOK_SECRET`, `MAX_CONTENT_SIZE` |
| Functions | camelCase | `validateSlug()`, `requireAuth()` |
| Classes | PascalCase | `Hono`, `SQLiteDatabase` |
| Database tables | lowercase_plural | `posts` |
| Database columns | lowercase_snake_case | `published_at`, `cover_image` |
| URL routes | lowercase-kebab | `/api/posts`, `/p/:slug` |

---

## Code Style

### JavaScript Conventions

#### Imports/Exports

**ES Modules only** (no CommonJS):
```javascript
// ✅ Correct
import { Hono } from 'hono';
export const siteUrl = process.env.SITE_URL;

// ❌ Avoid
const hono = require('hono');
module.exports = { siteUrl };
```

#### Variable Declaration

Prefer `const` > `let` > `var` (never use `var`):
```javascript
// ✅ Correct
const app = new Hono();
let counter = 0;

// ❌ Avoid
var app = new Hono();
const counter = 0; counter++; // Reassignment should be let
```

#### String Formatting

Use template literals for interpolation:
```javascript
// ✅ Correct
const msg = `Hello ${name}, you have ${count} posts`;

// ❌ Avoid
const msg = "Hello " + name + ", you have " + count + " posts";
```

#### Arrow Functions vs Regular Functions

Use arrow functions for callbacks and short functions:
```javascript
// ✅ Correct
const doubled = numbers.map(n => n * 2);
app.get('/posts', (c) => c.json(posts));

// ✅ Also correct (named functions for clarity)
function loadTokens() { ... }
function validateSlug(slug) { ... }
```

#### Comments

Write comments for **why**, not **what** (code speaks for itself):
```javascript
// ✅ Correct
// Normalize Unicode to NFC — prevents NFD decomposition gaps in Vietnamese text
const nfc = (s) => s ? String(s).normalize('NFC') : s;

// ❌ Avoid (obvious from code)
// Convert to uppercase
const upper = (s) => s.toUpperCase();
```

#### Spacing & Indentation

- 2-space indentation (no tabs)
- No trailing whitespace
- Single blank line between logical sections
- Opening braces on same line:

```javascript
// ✅ Correct
function validatePost(body, isUpdate = false) {
  const { title, content } = body;
  if (!title) return 'title is required';
  return null;
}

// ❌ Avoid
function validatePost(body, isUpdate = false)
{
  const {title,content}=body;
  if (!title) return 'title is required'
  return null;
}
```

---

## Architecture Patterns

### Module Responsibilities

**app.js** — Main application
- Request routing (GET, POST, PUT, DELETE)
- Authentication middleware
- Input validation
- HTML rendering
- Error handling

**config.js** — Configuration
- Environment variable loading
- Configuration object export
- No business logic

**feed.js** — Feed generation
- RSS 2.0 generation
- Sitemap generation
- XML utilities (escaping, formatting)

**db.js** — Database
- SQLite connection setup
- Schema initialization
- Database queries (do NOT put queries in route handlers)

**server.js** — Startup
- Import app
- Listen on port
- Minimal code

### Input Validation Pattern

Always validate before database access:

```javascript
// ✅ Correct pattern
app.post('/api/posts', requireAuth, async (c) => {
  const body = await c.req.json();

  // 1. Validate
  const error = validatePost(body);
  if (error) return c.json({ error }, 400);

  // 2. Process
  const slug = body.slug || generateSlug(body.title);

  // 3. Database
  try {
    const result = db.prepare(...).run(...);
    return c.json({ id: result.lastInsertRowid, slug }, 201);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return c.json({ error: 'Slug already exists' }, 409);
    throw e;
  }
});
```

### Error Handling Pattern

Generic error messages in responses, detailed logging in console:

```javascript
// ✅ Correct
app.onError((err, c) => {
  console.error(err); // Log for debugging
  return c.json({ error: 'Internal server error' }, 500); // Generic to client
});

// ❌ Avoid
app.onError((err, c) => {
  return c.json({ error: err.stack }, 500); // Stack trace leaks implementation details
});
```

### Authentication Pattern

Always check token before accessing sensitive data:

```javascript
// ✅ Correct
function requireAuth(c, next) {
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const tokens = loadTokens(); // Hot-reload
  const entry = tokens[token];
  if (!entry) return c.json({ error: 'Unauthorized — valid Bearer token required' }, 401);
  c.set('agent', entry.agent);
  c.set('role', entry.role);
  return next();
}

// ❌ Avoid
app.post('/api/posts', async (c) => {
  const body = await c.req.json();
  // Missing: no token check before inserting
  db.prepare(...).run(...);
});
```

### Database Query Pattern

Use parameterized queries (prevent SQL injection):

```javascript
// ✅ Correct (parameterized)
const post = db.prepare('SELECT * FROM posts WHERE slug = ?').get(slug);
db.prepare('INSERT INTO posts (slug, title) VALUES (?, ?)').run(slug, title);

// ❌ Avoid (SQL injection risk)
const post = db.prepare(`SELECT * FROM posts WHERE slug = '${slug}'`).get();
```

---

## Security Standards

### XSS Prevention

Always escape user input in HTML templates:

```javascript
// ✅ Correct
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = `<h1>${esc(post.title)}</h1>`;

// ❌ Avoid (XSS vulnerability)
const html = `<h1>${post.title}</h1>`;
```

### Markdown Sanitization

Disable HTML tags in Markdown rendering:

```javascript
// ✅ Correct
marked.use({ renderer: { html: () => '' } }); // Strip HTML tags

// ❌ Avoid (allows HTML injection)
// marked.use({ /* no config, allows HTML */ });
```

### Token Security

- Never log tokens
- Never include in error messages
- Load from file, not environment (environment persists in logs)
- Validate length and format

```javascript
// ✅ Correct
const tokens = JSON.parse(readFileSync('tokens.json'));
const entry = tokens[token]; // File-based, not hardcoded
if (!entry) return c.json({ error: 'Unauthorized' }, 401); // Generic message

// ❌ Avoid
console.log(`Token: ${token}`); // Leaked in logs
const token = process.env.API_TOKEN; // In environment, logged by some tools
```

### Security Headers

Always include:

```javascript
// ✅ Correct
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
});
```

---

## Testing Standards

### Test File Structure

```javascript
// ✅ Correct test structure
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../app.js';

describe('API: POST /api/posts', () => {
  let token = 'test-token-123';

  beforeEach(async () => {
    // Setup
  });

  afterEach(async () => {
    // Cleanup
  });

  it('should create a post with valid data', async () => {
    const res = await app.request(
      new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title: 'Test', content: 'Body' })
      })
    );
    expect(res.status).toBe(201);
  });

  it('should reject without token', async () => {
    const res = await app.request(
      new Request('http://localhost/api/posts', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test', content: 'Body' })
      })
    );
    expect(res.status).toBe(401);
  });
});
```

### Test Coverage Goals

- [x] All API endpoints (CRUD)
- [x] Authentication (valid/invalid tokens)
- [x] Input validation (required fields, formats)
- [x] Error scenarios (404, 409, 400, 401)
- [x] Database operations
- [x] Feed generation (RSS, sitemap)

**Target:** >80% code coverage

### Test Naming

Use descriptive test names (what should happen, not how):

```javascript
// ✅ Correct (describes behavior)
it('should reject posts without title', async () => { ... });
it('should return 401 when token is missing', async () => { ... });

// ❌ Avoid (too vague or implementation-focused)
it('should work', async () => { ... });
it('tests validation', async () => { ... });
```

---

## Database Standards

### Schema Design

```sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  title_vi TEXT,
  subtitle TEXT,
  subtitle_vi TEXT,
  content TEXT NOT NULL,
  content_vi TEXT,
  author TEXT DEFAULT 'Anonymous',
  cover_image TEXT,
  status TEXT DEFAULT 'published',
  published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_status ON posts(status);
CREATE INDEX idx_published_at ON posts(published_at);
```

**Design principles:**
- Denormalized where appropriate (no joins needed)
- Indexes on frequently queried columns (status, published_at)
- Unique constraints enforce invariants (slug uniqueness)
- Default values reduce NULL handling

### Query Standards

- Use prepared statements (prevent SQL injection)
- Filter in database, not application
- Limit results at query time, not post-processing
- Name queries with comments for clarity

```javascript
// ✅ Correct
const posts = db.prepare(`
  SELECT id, slug, title, subtitle, author, published_at
  FROM posts WHERE status='published' ORDER BY published_at DESC
`).all();

// ❌ Avoid
const posts = db.prepare('SELECT * FROM posts').all();
const published = posts.filter(p => p.status === 'published').slice(0, 20);
```

---

## Documentation Standards

### Code Comments

Comment the **why**, not the **what**:

```javascript
// ✅ Correct (explains non-obvious logic)
// Normalize Unicode to NFC — prevents NFD decomposition gaps in Vietnamese text
const nfc = (s) => s ? String(s).normalize('NFC') : s;

// ✅ Also correct (explains edge case)
// Webhook secret is optional — if not set, webhook validation is skipped
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

// ❌ Avoid (code already explains this)
// Get the slug
const slug = body.slug || generateSlug(body.title);

// ❌ Avoid (vague)
// Process the data
const result = db.prepare(...).run(...);
```

### JSDoc Comments (for public functions)

```javascript
// ✅ Correct (documents intent and parameters)
/**
 * Validate post data before insert/update.
 * @param {Object} body - Post object from request
 * @param {string} body.title - Post title (required)
 * @param {string} body.content - Markdown body (required)
 * @param {string} body.slug - URL slug (optional, auto-generated)
 * @param {boolean} isUpdate - If true, only validates provided fields
 * @returns {string|null} Error message or null if valid
 */
function validatePost(body, isUpdate = false) {
  ...
}
```

### README & Docs

- Keep README.md focused on getting started
- Detailed docs go in `docs/` folder
- Link to docs from README

---

## Performance Standards

### Response Time Goals

| Endpoint | Goal | Notes |
|----------|------|-------|
| GET /api/posts | < 100ms | List all posts |
| GET /api/posts/:slug | < 150ms | Single post + Markdown parsing |
| GET /p/:slug | < 200ms | Full HTML rendering |
| GET /rss.xml | < 300ms | RSS generation |
| POST /api/posts | < 300ms | Create + index |

### Optimization Rules

1. **Database queries:** Use indexes, filter at database level
2. **Markdown:** Only parse when needed (not in list view)
3. **HTML escaping:** Batch operations, avoid per-character processing
4. **Token loading:** OK to read from file (infrequent, small file)
5. **No caching:** Trade performance for simplicity (live updates)

### Load Testing

Before production deployment:
- [ ] Test with 1000+ posts
- [ ] Test with concurrent requests (10+)
- [ ] Verify response times stay within goals
- [ ] Monitor memory usage (no leaks)

---

## Dependency Management

### Approved Dependencies

Core only:
- `hono` — HTTP framework
- `marked` — Markdown parser
- `better-sqlite3` — Database driver
- `dotenv` — Environment variables

Testing:
- `vitest` — Test framework

Building:
- None (Node.js native ESM)

**Principle:** Minimize dependencies for easier maintenance and faster installs.

### Updating Dependencies

```bash
npm outdated          # Check for updates
npm update            # Update to latest compatible
npm ci                # Install exact versions from lock file
npm test              # Verify nothing broke
```

Before updating:
- Check CHANGELOG for breaking changes
- Run full test suite
- Test in staging environment

---

## Version Control Standards

### Commit Messages

Use conventional commits:

```
feat: add OpenGraph meta tags to post pages
fix: prevent XSS in Markdown rendering
docs: update authentication guide
refactor: extract validation logic to separate function
test: add edge cases for slug validation
chore: update dependencies
```

**Format:** `<type>: <description>`

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation changes
- `refactor` — Code reorganization (no behavior change)
- `test` — Test additions/updates
- `chore` — Dependencies, build config

### Branch Naming

```
feature/add-openai-integration
bugfix/fix-xss-vulnerability
docs/update-readme
```

### Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] No console errors
- [ ] Security review (no hardcoded secrets)
- [ ] Code style compliant (no linting errors)
- [ ] Documentation updated (if applicable)
- [ ] One approval from team member

---

## Modularization & File Size

### File Size Guidelines

| Type | Max Size | Guidance |
|------|----------|----------|
| JavaScript | 300 lines | Split logic into separate modules |
| Tests | 500 lines | OK to be longer (mirror implementation) |
| Markdown | Unlimited | Use headings for navigation |

### When to Modularize

Extract to separate file when:
- Function used in multiple modules
- Module exceeds 200 lines
- Logical concern (validation, database, etc.)
- Improves testability

### Current Modularization (Phase 4)

| Module | Purpose | Size |
|--------|---------|------|
| app.js | Routes, auth, rendering | 342 lines |
| config.js | Configuration | 8 lines |
| feed.js | RSS, sitemap | 73 lines |
| db.js | Database connection | Small |
| server.js | Startup | Small |

**Healthy.** No immediate modularization needed.

---

## Accessibility Standards

### HTML Semantic Markup

- Use proper heading hierarchy (h1 → h2 → h3)
- Use semantic tags: `<article>`, `<section>`, `<header>`, `<footer>`
- Provide alt text for images (future feature)
- Label form inputs (N/A for API)

### Responsive Design

- Mobile-first approach
- Breakpoints: mobile (< 640px), tablet (640-1024px), desktop (> 1024px)
- No fixed widths for text (max-width only)

### Color Contrast

- WCAG AA minimum (4.5:1 for normal text)
- Current theme: dark text on white background (>12:1 ratio)

---

## Deployment Standards

### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] No console errors
- [ ] Environment variables set correctly
- [ ] Database backup exists
- [ ] Rollback plan documented
- [ ] Deploy script tested

### Monitoring

- [ ] Health check endpoint responds
- [ ] Error rates < 0.5%
- [ ] Response times < 300ms (p95)
- [ ] Database file integrity

### Rollback Plan

1. Stop app service
2. Restore previous code (git checkout)
3. Restore database backup (if schema changed)
4. Restart app
5. Verify health endpoint
6. Post-mortem: what went wrong?

---

## Continuous Improvement

### Code Review Focus Areas

1. **Security:** Token handling, XSS prevention, input validation
2. **Performance:** Query optimization, unnecessary processing
3. **Readability:** Naming clarity, comment quality
4. **Testing:** Coverage, edge cases, error scenarios
5. **Maintainability:** Modularity, documentation, DRY principle

### Regular Audits

Monthly:
- Review error logs
- Check slow query logs
- Update dependencies
- Verify backup integrity
- Security audit (static analysis)

---

## Related Documents

- [Project Overview & PDR](./project-overview-pdr.md) — Product requirements and vision
- [System Architecture](./system-architecture.md) — Technical design
- [Codebase Summary](./codebase-summary.md) — File reference

