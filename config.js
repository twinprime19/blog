// Site configuration — shared by app.js and feed.js
import { join } from 'path';

let blogNameFromFile;
try {
  // Node/local only. Worker runtime won't use this fallback.
  const { readFileSync } = await import('fs');
  const settings = JSON.parse(readFileSync(join(process.cwd(), 'settings.json'), 'utf-8'));
  blogNameFromFile = settings.blogName;
} catch {}

export const port = parseInt(process.env.PORT || '1911', 10);
export const siteUrl = (process.env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
export const siteTitle = blogNameFromFile || process.env.SITE_TITLE || 'The Chair';
export const siteDescription = process.env.SITE_DESCRIPTION || 'A lightweight blog powered by agents';
export const contentDir = process.env.CONTENT_DIR || join(process.cwd(), 'content');
export const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
