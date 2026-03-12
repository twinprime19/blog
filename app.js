import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { port } from './config.js';
import webhookRoutes from './routes/webhook-routes.js';
import apiRoutes from './routes/api-routes.js';
import pageRoutes from './routes/page-routes.js';
import feedRoutes from './feed.js';

export { port };

export const app = new Hono();

// CORS — configurable via CORS_ORIGIN env var (comma-separated origins, or * for all)
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use('*', cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(o => o.trim()).filter(Boolean),
}));

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

// Health check
app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

// Mount routes
app.route('/', webhookRoutes);
app.route('/', apiRoutes);
app.route('/', feedRoutes);
app.route('/', pageRoutes);
