import { Hono } from 'hono';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const analytics = new Hono();

analytics.get('/api/analytics', requireAuth, (c) => {
  const path = c.req.query('path');
  const days = parseInt(c.req.query('days')) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  if (path) {
    const views = db.prepare(
      'SELECT COUNT(*) as total FROM page_views WHERE path = ? AND viewed_at >= ?'
    ).get(path, since);
    const recent = db.prepare(
      `SELECT path, ip, referer, viewed_at FROM page_views
       WHERE path = ? AND viewed_at >= ? ORDER BY viewed_at DESC LIMIT 50`
    ).all(path, since);
    return c.json({ path, days, total: views.total, recent });
  }

  const top = db.prepare(
    `SELECT path, COUNT(*) as views FROM page_views
     WHERE viewed_at >= ? GROUP BY path ORDER BY views DESC LIMIT 50`
  ).all(since);
  const total = db.prepare(
    'SELECT COUNT(*) as total FROM page_views WHERE viewed_at >= ?'
  ).get(since);
  return c.json({ days, total: total.total, pages: top });
});

export default analytics;
