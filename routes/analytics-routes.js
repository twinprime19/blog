import { Hono } from 'hono';
import { getAnalytics } from '../analytics-store.js';
import { requireAuth } from '../middleware/auth.js';

const analytics = new Hono();

analytics.get('/api/analytics', requireAuth, (c) => {
  const path = c.req.query('path') || undefined;
  const days = parseInt(c.req.query('days')) || 30;
  return c.json(getAnalytics({ path, days }));
});

export default analytics;
