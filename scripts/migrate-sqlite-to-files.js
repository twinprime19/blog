#!/usr/bin/env node
// One-time migration: converts existing blog.db into flat-file markdown + JSONL analytics
// Usage: node scripts/migrate-sqlite-to-files.js [path-to-blog.db]
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { processContentImages } from '../process-content-images.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.argv[2] || join(__dirname, '..', 'blog.db');
const contentDir = process.env.CONTENT_DIR || join(__dirname, '..', 'content');
const dataDir = process.env.DATA_DIR || join(__dirname, '..', 'data');

if (!existsSync(dbPath)) {
  console.log(`No database found at ${dbPath} — nothing to migrate.`);
  process.exit(0);
}

let Database;
try {
  Database = (await import('better-sqlite3')).default;
} catch {
  console.error('better-sqlite3 is required for migration. Run: npm install better-sqlite3');
  process.exit(1);
}

let matter;
try {
  matter = (await import('gray-matter')).default;
} catch {
  console.error('gray-matter is required. Run: npm install gray-matter');
  process.exit(1);
}

// Parse date safely — handles values with or without timezone info
function safeDate(val) {
  if (!val) return new Date().toISOString();
  const d = new Date(val.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(val) ? val : val + 'Z');
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const db = new Database(dbPath, { readonly: true });

const stats = { migrated: 0, skipped: 0, imagesExtracted: 0, uploadWarnings: [], analyticsRows: 0 };

// --- Posts (streamed one row at a time to avoid OOM with large base64 content) ---
for (const post of db.prepare('SELECT * FROM posts').iterate()) {
  const slug = post.slug;
  const dir = join(contentDir, slug);

  if (existsSync(join(dir, 'post.md'))) {
    console.log(`  SKIP ${slug} (already exists)`);
    stats.skipped++;
    continue;
  }

  mkdirSync(dir, { recursive: true });

  const fm = {
    id: post.id,
    slug: post.slug,
    title: post.title,
    title_vi: post.title_vi || null,
    subtitle: post.subtitle || null,
    subtitle_vi: post.subtitle_vi || null,
    author: post.author,
    created_by: post.created_by || null,
    cover_image: post.cover_image || null,
    status: post.status,
    published_at: safeDate(post.published_at),
    updated_at: safeDate(post.updated_at),
  };

  let body = post.content || '';
  if (post.content_vi) {
    body += '\n---vi---\n' + post.content_vi;
  }

  // Extract inline data URIs to uploads/{slug}/ and rewrite URLs
  const { cleanContent, attachments } = await processContentImages(body, slug, post.created_by || 'migration');
  if (attachments.length > 0) {
    stats.imagesExtracted += attachments.length;
    console.log(`  IMG  ${slug}: ${attachments.length} data URI(s) extracted`);
  }

  const fileContent = matter.stringify(cleanContent, fm);
  writeFileSync(join(dir, 'post.md'), fileContent, 'utf-8');
  console.log(`  OK   ${slug}`);
  stats.migrated++;
}

// --- Upload file verification ---
const hasAttachments = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attachments'").get();
if (hasAttachments) {
  const rows = db.prepare('SELECT post_slug, filename FROM attachments').all();
  for (const row of rows) {
    const filePath = join(__dirname, '..', 'uploads', row.post_slug, row.filename);
    if (!existsSync(filePath)) {
      const warning = `Missing upload: uploads/${row.post_slug}/${row.filename}`;
      stats.uploadWarnings.push(warning);
      console.log(`  WARN ${warning}`);
    }
  }
}

// --- Analytics ---
const analyticsFile = join(dataDir, 'analytics.jsonl');
const analyticsExists = existsSync(analyticsFile) && readFileSync(analyticsFile, 'utf-8').trim().length > 0;

if (analyticsExists) {
  console.log('  SKIP analytics (analytics.jsonl already has data)');
} else {
  const hasPageViews = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='page_views'").get();
  if (hasPageViews) {
    mkdirSync(dataDir, { recursive: true });
    // Stream rows in batches to avoid OOM on large analytics tables
    const BATCH_SIZE = 1000;
    let batch = [];
    for (const v of db.prepare('SELECT path, ip, user_agent, referer, viewed_at FROM page_views').iterate()) {
      batch.push(JSON.stringify({
        path: v.path,
        ip: v.ip || '',
        ua: v.user_agent || '',
        ref: v.referer || '',
        ts: safeDate(v.viewed_at),
      }));
      if (batch.length >= BATCH_SIZE) {
        appendFileSync(analyticsFile, batch.join('\n') + '\n', 'utf-8');
        stats.analyticsRows += batch.length;
        batch = [];
      }
    }
    if (batch.length > 0) {
      appendFileSync(analyticsFile, batch.join('\n') + '\n', 'utf-8');
      stats.analyticsRows += batch.length;
    }
  }
}

db.close();

// --- Summary ---
const total = stats.migrated + stats.skipped;
console.log(`\nMigration complete:`);
console.log(`  Posts:      ${stats.migrated} migrated, ${stats.skipped} skipped (${total} total)`);
console.log(`  Images:     ${stats.imagesExtracted} data URIs extracted to uploads/`);
console.log(`  Uploads:    ${stats.uploadWarnings.length} warnings`);
console.log(`  Analytics:  ${stats.analyticsRows > 0 ? stats.analyticsRows + ' rows -> data/analytics.jsonl' : analyticsExists ? 'skipped (already exists)' : 'no page_views data'}`);
