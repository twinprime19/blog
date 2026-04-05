// Flat-file content store — replaces SQLite posts table
// Posts stored as content/{slug}/post.md with YAML frontmatter + markdown body
import matter from 'gray-matter';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { contentDir } from './config.js';
import { nfc } from './helpers.js';

const POST_FILE = 'post.md';
const VI_SEPARATOR = '\n---vi---\n';

// In-memory index: Map<slug, frontmatter> — loaded lazily, invalidated on writes
let _index = null;

// Frontmatter fields stored in YAML header
const FM_FIELDS = [
  'id', 'slug', 'title', 'title_vi', 'subtitle', 'subtitle_vi',
  'author', 'created_by', 'cover_image', 'status', 'published_at', 'updated_at',
];

function _ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function _loadIndex() {
  if (_index) return _index;
  _index = new Map();
  _ensureDir(contentDir);
  let entries;
  try { entries = readdirSync(contentDir, { withFileTypes: true }); } catch { return _index; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = join(contentDir, entry.name, POST_FILE);
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const { data } = matter(raw);
      data.slug = data.slug || entry.name;
      _index.set(entry.name, data);
    } catch {
      // Skip unreadable entries
    }
  }
  return _index;
}

function _readPost(slug) {
  const filePath = join(contentDir, slug, POST_FILE);
  let raw;
  try { raw = readFileSync(filePath, 'utf-8'); } catch { return null; }
  const { data, content: body } = matter(raw);
  data.slug = data.slug || slug;

  // Split body on ---vi--- separator
  const parts = body.split(VI_SEPARATOR);
  const content = parts[0].trim();
  const content_vi = parts.length > 1 ? parts[1].trim() : null;

  return { ...data, content, content_vi };
}

function _writePost(slug, frontmatter, content, contentVi) {
  const dir = join(contentDir, slug);
  _ensureDir(dir);

  let body = content || '';
  if (contentVi) {
    body += VI_SEPARATOR + contentVi;
  }

  // Build clean frontmatter object with only known fields
  const fm = {};
  for (const key of FM_FIELDS) {
    if (frontmatter[key] !== undefined) fm[key] = frontmatter[key];
  }

  const fileContent = matter.stringify(body, fm);
  const finalPath = join(dir, POST_FILE);
  // Atomic write via tmp+rename; fall back to direct write on failure (e.g. Windows EPERM)
  try {
    const tmpPath = join(dir, `post.md.tmp`);
    writeFileSync(tmpPath, fileContent, 'utf-8');
    renameSync(tmpPath, finalPath);
  } catch {
    _ensureDir(dir);
    writeFileSync(finalPath, fileContent, 'utf-8');
  }
}

// --- Public API ---

export function getIndex() {
  return _loadIndex();
}

export function resetIndex() {
  _index = null;
}

export function listPosts({ status, limit, offset } = {}) {
  const index = _loadIndex();
  let posts = [...index.values()];

  if (status) {
    posts = posts.filter(p => p.status === status);
  }

  // Sort by published_at descending (newest first)
  posts.sort((a, b) => {
    const da = a.published_at ? new Date(a.published_at).getTime() : 0;
    const db = b.published_at ? new Date(b.published_at).getTime() : 0;
    return db - da;
  });

  if (offset) posts = posts.slice(offset);
  if (limit) posts = posts.slice(0, limit);

  return posts;
}

export function getPost(slug) {
  return _readPost(slug);
}

export function createPost(data) {
  const now = new Date().toISOString();
  const id = data.id || Date.now();
  const slug = data.slug;

  // Check for duplicate slug
  const index = _loadIndex();
  if (index.has(slug)) {
    const err = new Error('Slug already exists');
    err.code = 'DUPLICATE_SLUG';
    throw err;
  }

  const frontmatter = {
    id,
    slug,
    title: nfc(data.title),
    title_vi: nfc(data.title_vi) || null,
    subtitle: nfc(data.subtitle) || null,
    subtitle_vi: nfc(data.subtitle_vi) || null,
    author: nfc(data.author) || 'Anonymous',
    created_by: data.created_by || null,
    cover_image: data.cover_image || null,
    status: data.status || 'published',
    published_at: data.published_at || now,
    updated_at: data.updated_at || now,
  };

  const content = nfc(data.content) || '';
  const contentVi = nfc(data.content_vi) || null;

  _writePost(slug, frontmatter, content, contentVi);
  // Incremental index update — avoids full O(N) re-scan
  if (_index) _index.set(slug, { ...frontmatter });
  return { id, slug };
}

export function updatePost(slug, data) {
  const existing = _readPost(slug);
  if (!existing) {
    const err = new Error('Not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const now = new Date().toISOString();
  const textFields = new Set(['title', 'subtitle', 'content', 'content_vi', 'title_vi', 'subtitle_vi', 'author']);

  // Merge frontmatter — only update fields that are provided
  const fm = {};
  for (const key of FM_FIELDS) {
    fm[key] = existing[key];
  }
  for (const key of ['title', 'subtitle', 'title_vi', 'subtitle_vi', 'author', 'cover_image', 'status']) {
    if (data[key] !== undefined) {
      fm[key] = textFields.has(key) ? nfc(data[key]) : data[key];
    }
  }
  fm.updated_at = now;

  const content = data.content !== undefined ? nfc(data.content) : existing.content;
  const contentVi = data.content_vi !== undefined ? nfc(data.content_vi) : existing.content_vi;

  _writePost(slug, fm, content, contentVi);
  // Incremental index update — avoids full O(N) re-scan
  if (_index) _index.set(slug, { ...fm });
}

export function deletePost(slug) {
  const index = _loadIndex();
  if (!index.has(slug)) return false;

  // Remove content directory
  const dir = join(contentDir, slug);
  try { rmSync(dir, { recursive: true, force: true }); } catch {}

  // Remove uploads directory
  const uploadsDir = join(process.cwd(), 'uploads', slug);
  try { rmSync(uploadsDir, { recursive: true, force: true }); } catch {}

  // Incremental index update — avoids full O(N) re-scan
  if (_index) _index.delete(slug);
  return true;
}
