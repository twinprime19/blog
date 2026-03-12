import db from '../db.js';
import { app } from '../app.js';

export const TEST_TOKEN = 'test-token-for-vitest';

// Clear all posts between tests for isolation
export function clearPosts() {
  db.exec('DELETE FROM posts');
}

// Helper: build Authorization header
export function authHeader() {
  return { Authorization: `Bearer ${TEST_TOKEN}` };
}

// Helper: make authenticated JSON request
export function apiRequest(method, path, body) {
  const opts = { method, headers: { ...authHeader(), 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return app.request(path, opts);
}

export { app, db };
