// Site configuration — shared by app.js and feed.js
import 'dotenv/config';
import { join } from 'path';

export const port = parseInt(process.env.PORT || '3000', 10);
export const siteUrl = (process.env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
export const siteTitle = process.env.SITE_TITLE || 'The Wire';
export const siteDescription = process.env.SITE_DESCRIPTION || 'A lightweight blog powered by agents';
export const contentDir = process.env.CONTENT_DIR || join(process.cwd(), 'content');
export const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
