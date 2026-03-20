import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { port } from './config.js';
import db from './db.js';
import webhookRoutes from './routes/webhook-routes.js';
import apiRoutes from './routes/api-routes.js';
import pageRoutes from './routes/page-routes.js';
import feedRoutes from './feed.js';
import analyticsRoutes from './routes/analytics-routes.js';

export { port };

export const app = new Hono();

// CORS — configurable via CORS_ORIGIN env var (comma-separated origins, or * for all)
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use('*', cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(o => o.trim()).filter(Boolean),
}));

// Body size limit — reject payloads over 256KB before parsing
app.post('*', bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: 'Payload too large (max 256KB)' }, 413) }));
app.put('*', bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: 'Payload too large (max 256KB)' }, 413) }));

// Security headers including CSP (H4)
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src * data:; script-src 'self' 'unsafe-inline'");
});

// Global error handler — prevent stack trace leaks
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

// --- Analytics: log page views ---
const logView = db.prepare(
  'INSERT INTO page_views (path, ip, user_agent, referer) VALUES (?, ?, ?, ?)'
);
app.use('*', async (c, next) => {
  await next();
  const path = new URL(c.req.url).pathname;
  if (c.res.status === 200 && !path.startsWith('/api/') && !path.startsWith('/webhook/') && path !== '/health') {
    try {
      const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
      const ua = c.req.header('user-agent') || '';
      const ref = c.req.header('referer') || '';
      logView.run(path, ip, ua, ref);
    } catch {}
  }
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

// Mount routes
app.route('/', webhookRoutes);
app.route('/', apiRoutes);
app.route('/', feedRoutes);
app.route('/', analyticsRoutes);
app.route('/', pageRoutes);
