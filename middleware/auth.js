import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(__dirname, '..', 'tokens.json');

// H2: Token caching with 5s TTL + stale fallback on failure
let cachedTokens = null;
let cacheTime = 0;
const CACHE_TTL = 5000;

export function loadTokens() {
  const now = Date.now();
  if (cachedTokens && (now - cacheTime) < CACHE_TTL) return cachedTokens;
  try {
    const raw = readFileSync(tokensPath, 'utf-8');
    cachedTokens = JSON.parse(raw).tokens || {};
    cacheTime = now;
    return cachedTokens;
  } catch (err) {
    console.warn('[auth] Failed to load tokens:', err.message);
    if (cachedTokens) return cachedTokens;
    return {};
  }
}

export function requireAuth(c, next) {
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const tokens = loadTokens();
  const entry = tokens[token];
  if (!entry) return c.json({ error: 'Unauthorized — valid Bearer token required' }, 401);
  c.set('agent', entry.agent);
  c.set('role', entry.role);
  return next();
}
