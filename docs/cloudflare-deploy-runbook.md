# Cloudflare Deployment + Rollback Runbook

This runbook describes how to deploy The Chair to Cloudflare Workers with GitHub as source-of-truth.

## 1) Prerequisites

- Cloudflare account
- Wrangler CLI (via `npm install` in repo)
- GitHub repo/token with contents write permissions (for post CRUD)
- Optional: GitHub Actions access for CI/CD deploys

## 2) Create Cloudflare resources

## KV
Create namespaces:
- `BLOG_CACHE` (post index/metadata cache)
- `TOKENS_KV` (optional auth token store)

## R2
Create bucket:
- `BLOG_UPLOADS`

## 3) Configure `wrangler.toml`

Set real IDs/names for:
- `[[kv_namespaces]]` for `BLOG_CACHE`
- `[[r2_buckets]]` for `BLOG_UPLOADS`

If you also bind `TOKENS_KV`, add an additional kv namespace block with binding `TOKENS_KV`.

## 4) Configure secrets

```bash
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_OWNER
wrangler secret put GITHUB_REPO
# optional
wrangler secret put GITHUB_BRANCH
```

## 5) Local dev smoke test

```bash
npm run dev:worker
```

Validate:
- `GET /health`
- `GET /api/posts`
- `POST /api/posts` with token
- image upload round-trip via data URI

## 6) Deploy

```bash
npm run deploy:worker
```

Record deployed Worker URL and verify:
- home page
- single post page
- rss
- sitemap
- uploads

## 7) GitHub Actions (recommended)

Minimal production approach:
- Trigger: push to `main`
- Steps:
  1. install dependencies
  2. run tests
  3. `wrangler deploy`
- Required secrets in GitHub repo:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `GITHUB_TOKEN` (runtime secret still set on Worker)

## 8) Rollback

## Fast rollback options
1. **Redeploy previous commit**
   - checkout previous known-good commit
   - run `npm run deploy:worker`

2. **Revert PR and redeploy**
   - revert merge commit on `main`
   - push and run deploy workflow

3. **Emergency read-only mode (optional)**
   - temporarily block write routes by removing/invalidating auth tokens

## Post-rollback checks
- `GET /health` returns 200
- `GET /api/posts` returns expected list
- read routes render correctly
- no spike in 5xx logs

## 9) Operational notes

- Keep payload sizes bounded (20MB request body max)
- Prefer KV cache for index/list speed
- Keep binary uploads in R2, not GitHub
- Use GitHub API SHA precondition for safe concurrent updates

## 10) Incident template

When deployment fails, capture:
- commit SHA
- workflow run URL
- worker deployment output
- failing endpoint(s)
- rollback action taken
- follow-up action item
