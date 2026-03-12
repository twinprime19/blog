// Site configuration — shared by app.js and feed.js
import 'dotenv/config';

export const port = parseInt(process.env.PORT || '3000', 10);
export const siteUrl = (process.env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
export const siteTitle = process.env.SITE_TITLE || 'The Wire';
export const siteDescription = process.env.SITE_DESCRIPTION || 'A lightweight blog powered by agents';
