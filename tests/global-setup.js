// Manages tokens.json lifecycle for all test files (runs once, not per-file)
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs';
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
    tokens: { 'test-token-for-vitest': { agent: 'TestBot', role: 'admin' } },
  }));
}

export function teardown() {
  if (savedTokens !== null) {
    writeFileSync(tokensPath, savedTokens);
  } else {
    try { unlinkSync(tokensPath); } catch {}
  }
}
