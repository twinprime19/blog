// Site configuration — shared by app.js and feed.js
import 'dotenv/config';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read blog name from settings.json (written by setup.js), fall back to env var, then default
let _blogName;
try {
  const settings = JSON.parse(readFileSync(join(__dirname, 'settings.json'), 'utf-8'));
  _blogName = settings.blogName;
} catch { /* settings.json missing or invalid — use fallback */ }

export const port = parseInt(process.env.PORT || '1911', 10);
export const siteUrl = (process.env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
export const siteTitle = _blogName || process.env.SITE_TITLE || 'The Chair';
export const siteDescription = process.env.SITE_DESCRIPTION || 'A lightweight blog powered by agents';
export const contentDir = process.env.CONTENT_DIR || join(process.cwd(), 'content');
export const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
