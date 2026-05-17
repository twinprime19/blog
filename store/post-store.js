// PostStore abstraction — picks a backend based on environment.
//
// Contract (all methods are async):
//   listPosts({ status, limit, offset }) → Array<frontmatter>
//     Sorted by published_at desc. Filters by status when given.
//   getPost(slug) → { ...frontmatter, content, content_vi } | null
//   createPost(data) → { id, slug }
//     Throws Error with code === 'DUPLICATE_SLUG' on slug collision.
//   updatePost(slug, data) → void
//     Throws Error with code === 'NOT_FOUND' when slug is unknown.
//   deletePost(slug) → boolean
//   getIndex() → Map<slug, frontmatter>
//   reset() → void (drops any in-memory cache; test helper)
//
// Backends use content/{slug}/post.md with YAML frontmatter + markdown body,
// optionally split by a '\n---vi---\n' separator for bilingual content.

import { FilePostStore } from './file-post-store.js';
import { GitHubPostStore } from './github-post-store.js';

export class PostStore {
  async listPosts(_opts) { throw new Error('not implemented'); }
  async getPost(_slug) { throw new Error('not implemented'); }
  async createPost(_data) { throw new Error('not implemented'); }
  async updatePost(_slug, _data) { throw new Error('not implemented'); }
  async deletePost(_slug) { throw new Error('not implemented'); }
  async getIndex() { throw new Error('not implemented'); }
  reset() {}
}

let _instance = null;

// Returns the configured singleton store. Reads env from c.env when a Hono
// context is supplied (e.g. Cloudflare Workers), otherwise from process.env.
export function getPostStore(c) {
  if (_instance) return _instance;
  const env = (c && c.env) || process.env;
  if (env.GITHUB_OWNER && env.GITHUB_REPO && env.GITHUB_TOKEN) {
    _instance = new GitHubPostStore({
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      token: env.GITHUB_TOKEN,
      branch: env.GITHUB_BRANCH || 'main',
      basePath: env.GITHUB_CONTENT_PATH || 'content',
    });
  } else {
    _instance = new FilePostStore();
  }
  return _instance;
}

// Drop the cached singleton — used by tests to switch between fixtures.
export function resetPostStore() {
  if (_instance && typeof _instance.reset === 'function') _instance.reset();
  _instance = null;
}
