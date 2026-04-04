import { rmSync, mkdirSync } from 'fs';
import { app } from '../app.js';
import { contentDir } from '../config.js';
import { resetIndex } from '../content-store.js';

export const TEST_TOKEN = 'test-token-for-vitest';
export const WRITER_A_TOKEN = 'test-token-writer-a';
export const WRITER_B_TOKEN = 'test-token-writer-b';

// Clear all posts between tests for isolation
export function clearPosts() {
  try { rmSync(contentDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
  mkdirSync(contentDir, { recursive: true });
  resetIndex();
}

// Helper: build Authorization header
export function authHeader(token = TEST_TOKEN) {
  return { Authorization: `Bearer ${token}` };
}

// Helper: make authenticated JSON request (defaults to admin token)
export function apiRequest(method, path, body, token = TEST_TOKEN) {
  const opts = { method, headers: { ...authHeader(token), 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return app.request(path, opts);
}

export { app };
