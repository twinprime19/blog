// Manages tokens.json lifecycle + test dir cleanup for all test files (runs once, not per-file)
// CONTENT_DIR and DATA_DIR env vars are set by vitest.config.js
import { writeFileSync, existsSync, readFileSync, unlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(__dirname, '..', 'tokens.json');
let savedTokens = null;

export function setup() {
  if (existsSync(tokensPath)) {
    savedTokens = readFileSync(tokensPath, 'utf-8');
  }
  writeFileSync(tokensPath, JSON.stringify({
    tokens: {
      'test-token-for-vitest': { agent: 'TestBot', role: 'admin' },
      'test-token-writer-a': { agent: 'WriterA', role: 'writer' },
      'test-token-writer-b': { agent: 'WriterB', role: 'writer' },
    },
  }));
}

export function teardown() {
  if (savedTokens !== null) {
    writeFileSync(tokensPath, savedTokens);
  } else {
    try { unlinkSync(tokensPath); } catch {}
  }
  // Clean up project-relative test dirs
  const root = join(__dirname, '..');
  try { rmSync(join(root, '.test-content'), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
  try { rmSync(join(root, '.test-data'), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
}
