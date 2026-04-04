// JSONL append-log analytics — replaces SQLite page_views table
// Each line in data/analytics.jsonl is one JSON object per page view
import { appendFile } from 'fs/promises';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { dataDir } from './config.js';

const ANALYTICS_FILE = join(dataDir, 'analytics.jsonl');
let _dirEnsured = false;

function _ensureDir() {
  if (_dirEnsured) return;
  mkdirSync(dataDir, { recursive: true });
  _dirEnsured = true;
}

export function logView(path, ip, ua, ref) {
  _ensureDir();
  const line = JSON.stringify({ path, ip, ua, ref, ts: new Date().toISOString() });
  appendFile(ANALYTICS_FILE, line + '\n', 'utf-8').catch(() => {});
}

export function getAnalytics({ path, days } = {}) {
  const numDays = days || 30;
  const since = new Date(Date.now() - numDays * 86400000).toISOString();

  let lines = [];
  if (existsSync(ANALYTICS_FILE)) {
    try {
      const raw = readFileSync(ANALYTICS_FILE, 'utf-8').trim();
      if (raw) {
        lines = raw.split('\n').map(line => {
          try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
      }
    } catch {
      // Empty or unreadable file — return zero counts
    }
  }

  // Filter by time range
  let filtered = lines.filter(e => e.ts >= since);

  if (path) {
    // Single path: return total + recent entries
    const pathEntries = filtered.filter(e => e.path === path);
    const recent = pathEntries
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, 50)
      .map(e => ({ path: e.path, ip: e.ip, referer: e.ref, viewed_at: e.ts }));
    return { path, days: numDays, total: pathEntries.length, recent };
  }

  // All paths: return aggregated page counts
  const counts = new Map();
  for (const e of filtered) {
    counts.set(e.path, (counts.get(e.path) || 0) + 1);
  }
  const pages = [...counts.entries()]
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 50);

  return { days: numDays, total: filtered.length, pages };
}
