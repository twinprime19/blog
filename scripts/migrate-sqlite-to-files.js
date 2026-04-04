#!/usr/bin/env node
// One-time migration: converts existing blog.db posts into flat-file markdown (content/{slug}/post.md)
// Usage: node scripts/migrate-sqlite-to-files.js [path-to-blog.db]
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.argv[2] || join(__dirname, '..', 'blog.db');
const contentDir = process.env.CONTENT_DIR || join(__dirname, '..', 'content');

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

const db = new Database(dbPath, { readonly: true });
const posts = db.prepare('SELECT * FROM posts').all();

let migrated = 0;
let skipped = 0;

for (const post of posts) {
  const slug = post.slug;
  const dir = join(contentDir, slug);

  if (existsSync(join(dir, 'post.md'))) {
    console.log(`  SKIP ${slug} (already exists)`);
    skipped++;
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
    published_at: post.published_at ? new Date(post.published_at + 'Z').toISOString() : new Date().toISOString(),
    updated_at: post.updated_at ? new Date(post.updated_at + 'Z').toISOString() : new Date().toISOString(),
  };

  let body = post.content || '';
  if (post.content_vi) {
    body += '\n---vi---\n' + post.content_vi;
  }

  const fileContent = matter.stringify(body, fm);
  writeFileSync(join(dir, 'post.md'), fileContent, 'utf-8');
  console.log(`  OK   ${slug}`);
  migrated++;
}

db.close();
console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped, ${posts.length} total.`);
console.log('Analytics (page_views) are not migrated — JSONL starts fresh.');
