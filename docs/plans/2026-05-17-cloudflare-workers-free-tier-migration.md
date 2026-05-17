# Cloudflare Workers Free-Tier Migration Plan (GitHub Source of Truth)

> **Orchestration mode:** Multi-agent execution via Claude Code workers, coordinated by Hermes.
> **Goal:** Preserve existing blog UX/API while running fully within Cloudflare free-tier limits, with GitHub as canonical post storage.

## 1) Constraints (Non-negotiable)

- **Source of truth for content:** GitHub repository (`content/{slug}/post.md`).
- **Cloudflare free tier only:** No paid-only features required for core operation.
- **Keep lightweight:** Avoid unnecessary services and avoid over-modeling.
- **Operational simplicity:** Deploy from GitHub Actions to Workers.

## 2) Target Architecture (Free-tier aligned)

### Runtime
- Cloudflare Worker + Hono (`fetch` handler only, no Node server wrapper).

### Data layout
- **Posts (canonical):** GitHub Contents API (read/write markdown + frontmatter).
- **Media uploads:** Cloudflare R2 (free-tier friendly object storage for images/files).
- **Fast metadata/index cache:** Cloudflare KV (`index:posts`, `post:{slug}:meta`, short TTL strategy).
- **Analytics:** Minimal/no-op on first migration; optional lightweight counters in KV.

### Removed from runtime
- Local filesystem usage (`fs`, `uploads/`, `tokens.json`, `settings.json` at runtime).
- Node TCP/port logic (`server.js`, `net.createServer`).
- Shell-based deploy hooks (`git pull`, `pm2`, local scripts from webhook route).

## 3) Free-tier Guardrails

- Keep Worker CPU path small: cache metadata in KV, avoid repeated full-repo scans.
- Keep GitHub API calls bounded and cached (ETag/conditional fetch where possible).
- Keep request body limits conservative for base64 image processing.
- Move binary payloads to R2 quickly, avoid oversized in-memory transforms.
- Do not depend on Durable Objects / paid products for MVP.

## 4) Phase Plan

## Phase 0 — Audit + Contract Freeze
**Objective:** lock behavior so migration does not regress public API.

Tasks:
- [ ] Snapshot current API behavior and response shapes (`/api/posts`, `/api/posts/:slug`, create/update/delete).
- [ ] Freeze compatibility requirements in this doc.
- [ ] Record current tests and expected pass set.

Deliverables:
- Compatibility matrix (old vs new behavior).
- “Must keep” checklist.

---

## Phase 1 — Worker Runtime Skeleton
**Objective:** convert app to Worker-native execution.

Tasks:
- [ ] Remove Node-specific server bootstrap path.
- [ ] Add `wrangler.toml` with KV/R2/env bindings.
- [ ] Ensure routes run under Worker `fetch` entrypoint.
- [ ] Keep health endpoint and existing route URLs.

Deliverables:
- Worker starts locally with `wrangler dev`.
- Basic route smoke tests pass.

---

## Phase 2 — Storage Adapter Split
**Objective:** clean abstraction before migration logic.

Tasks:
- [ ] Introduce `PostStore` interface (`list/get/create/update/delete`).
- [ ] Implement `GitHubPostStore` as canonical store.
- [ ] Add KV-backed cache layer for post index + metadata.
- [ ] Replace direct `fs` calls in routes with store interface.

Deliverables:
- API routes no longer import filesystem storage directly.
- Store swap is centralized and testable.

---

## Phase 3 — Media Pipeline to R2
**Objective:** preserve inline image workflow with Worker-safe storage.

Tasks:
- [ ] Replace local `uploads/` writes with R2 puts.
- [ ] Rewrite markdown image URLs to Worker-served upload route.
- [ ] Add upload retrieval route (`/uploads/:slug/:file`) backed by R2.
- [ ] Keep file-type validation + size checks.

Deliverables:
- End-to-end post creation with embedded image works.
- Image URLs remain stable and publicly renderable.

---

## Phase 4 — Auth/Config Migration
**Objective:** remove local token/settings files from runtime.

Tasks:
- [ ] Move token validation to KV-backed token records.
- [ ] Move site settings to KV or Wrangler vars.
- [ ] Add simple admin bootstrap script/docs for token management.

Deliverables:
- No runtime dependency on `tokens.json` / `settings.json`.
- Auth-protected writes still behave as before.

---

## Phase 5 — CI/CD and GitHub Source-of-Truth Flow
**Objective:** make GitHub the control plane and truth plane.

Tasks:
- [ ] Add GitHub Action for Worker deploy on main.
- [ ] Add least-privilege secrets for Cloudflare + optional GitHub API token.
- [ ] Update README with deploy/runbook + rollback.

Deliverables:
- Push-to-main deploy path is deterministic.
- Runbook allows another operator to recover quickly.

---

## Phase 6 — Cutover Validation
**Objective:** verify parity, costs, and reliability before adoption.

Tasks:
- [ ] Run API compatibility tests.
- [ ] Run upload + markdown rewrite tests.
- [ ] Verify caching behavior and stale-content recovery path.
- [ ] Confirm all features operate under free-tier assumptions.

Deliverables:
- Signed-off go/no-go checklist.
- Known limitations documented.

## 5) Agent Orchestration Model

For each phase:
1. **Implementation agent (Claude Code)** executes scoped tasks.
2. **Spec-review agent** checks contract parity + free-tier constraints.
3. **Code-review agent** checks maintainability/minimalism.
4. Merge only when all checks pass.

## 6) Resume Tracker (always update this)

Current phase: **Phase 0**  
Current status: **Not started**  
Last updated: **2026-05-17**

### Execution Log
- [ ] P0-T1 Snapshot API behavior
- [ ] P0-T2 Freeze compatibility matrix
- [ ] P0-T3 Baseline tests + fixtures
- [ ] P1-T1 Worker entrypoint conversion
- [ ] P1-T2 Wrangler bindings + local dev
- [ ] P2-T1 PostStore interface extraction
- [ ] P2-T2 GitHubPostStore implementation
- [ ] P2-T3 KV index cache integration
- [ ] P3-T1 R2 upload write path
- [ ] P3-T2 R2 upload read route
- [ ] P3-T3 Content rewrite + validation tests
- [ ] P4-T1 KV token auth migration
- [ ] P4-T2 Settings migration
- [ ] P5-T1 GitHub Actions deploy flow
- [ ] P5-T2 Docs + rollback runbook
- [ ] P6-T1 Full parity test pass
- [ ] P6-T2 Free-tier verification sign-off

## 7) MVP Scope (to stay lightweight)

Included:
- Core CRUD for posts
- Markdown rendering
- Embedded image handling
- Auth for write endpoints
- Cloudflare deployment + GitHub canonical storage

Deferred (only if demanded later):
- Rich analytics dashboards
- Full-text search service
- Multi-tenant publishing
- Heavy webhook automation pipelines

## 8) Risks + Mitigations

- **Risk:** GitHub API rate/latency affects read paths  
  **Mitigation:** KV metadata cache + conditional requests + bounded refresh.

- **Risk:** Large embedded base64 payloads stress Worker memory  
  **Mitigation:** strict payload limits + immediate stream/write to R2.

- **Risk:** Concurrent edits overwrite content  
  **Mitigation:** use GitHub blob SHA precondition (optimistic concurrency).

## 9) Definition of Done

- Worker-native app deployed from GitHub Actions.
- Content truth in GitHub repo.
- Uploads in R2.
- Auth/config no longer file-based at runtime.
- Existing API behavior maintained or explicitly documented if changed.
- Operates within Cloudflare free-tier assumptions.
