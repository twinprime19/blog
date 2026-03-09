import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'blog.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    content TEXT NOT NULL,
    content_vi TEXT,
    title_vi TEXT,
    subtitle_vi TEXT,
    author TEXT NOT NULL DEFAULT 'Anonymous',
    cover_image TEXT,
    published_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published'))
  );
  CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
  CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at);
`);

// Migrate: add Vietnamese columns if they don't exist
try { db.exec('ALTER TABLE posts ADD COLUMN content_vi TEXT'); } catch {}
try { db.exec('ALTER TABLE posts ADD COLUMN title_vi TEXT'); } catch {}
try { db.exec('ALTER TABLE posts ADD COLUMN subtitle_vi TEXT'); } catch {}

export default db;
