import { FilePostStore } from './file-post-store.js';
import { GitHubPostStore } from './github-post-store.js';

const fileStoreSingleton = new FilePostStore();

function hasGithubConfig(env) {
  return !!(env?.GITHUB_OWNER && env?.GITHUB_REPO && env?.GITHUB_TOKEN);
}

export function getPostStore(c) {
  const env = c?.env || process.env;
  if (hasGithubConfig(env)) {
    return new GitHubPostStore({
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      token: env.GITHUB_TOKEN,
      branch: env.GITHUB_BRANCH || 'main',
      kv: env.BLOG_CACHE || null,
    });
  }

  return fileStoreSingleton;
}

export function getFileStoreForTests() {
  return fileStoreSingleton;
}
