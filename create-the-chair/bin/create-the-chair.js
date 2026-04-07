#!/usr/bin/env node
// Scaffolder for The Chair blog engine.
// Usage: npx create-the-chair [directory]

import { execFileSync, execSync } from 'child_process';
import { existsSync, rmSync, cpSync } from 'fs';
import { resolve, basename } from 'path';

const REPO = 'https://github.com/twinprime19/blog.git';
// Dev-only files/dirs stripped from scaffolded output
const STRIP = [
  '.git', 'create-the-chair', 'CLAUDE.md', 'AGENTS.md',
  '.claude', '.opencode', '.github',
  'tests', 'vitest.config.js', 'plans', 'docs',
  'seed.js', '.repomixignore', '.dockerignore',
  'install.cmd', 'release-manifest.json',
];

const arg = process.argv[2];

if (arg === '--help' || arg === '-h') {
  console.log('Usage: npx create-the-chair [directory]\n');
  console.log('Scaffolds a new blog powered by The Chair.\n');
  console.log('  directory  Target folder (default: my-blog)');
  process.exit(0);
}

const dir = resolve(arg || 'my-blog');
const name = basename(dir);

// Pre-flight: check git is available
try {
  execSync('git --version', { stdio: 'ignore' });
} catch {
  console.error('Error: git is not installed. Install it from https://git-scm.com');
  process.exit(1);
}

// Check target directory doesn't already exist
if (existsSync(dir)) {
  console.error(`Error: "${name}" already exists. Pick a different name or remove it first.`);
  process.exit(1);
}

// Clone the repo (execFileSync avoids shell injection via dir name)
console.log(`Creating ${name}...`);
try {
  execFileSync('git', ['clone', '--depth', '1', REPO, dir], { stdio: 'ignore' });
} catch {
  console.error('Error: failed to clone repository. Check your network connection.');
  // Clean up partial clone
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}

// Strip dev-only files
for (const entry of STRIP) {
  const target = resolve(dir, entry);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}

// Copy .env.example to .env
const envExample = resolve(dir, '.env.example');
if (existsSync(envExample)) cpSync(envExample, resolve(dir, '.env'));

// Install dependencies
console.log('Installing dependencies...');
let installOk = true;
try {
  execSync('npm install --omit=dev', { cwd: dir, stdio: 'inherit' });
} catch {
  installOk = false;
  console.error('\nnpm install failed. Run it manually:');
  console.error(`  cd ${name} && npm install && node scripts/setup.js`);
}

// Run setup to generate token (only if install succeeded)
if (installOk) {
  console.log('');
  try {
    execSync('node scripts/setup.js', { cwd: dir, stdio: 'inherit' });
  } catch {
    console.error('Setup failed. Run it manually:');
    console.error(`  cd ${name} && node scripts/setup.js`);
  }
}

console.log(`
Done! Your blog is ready.

  cd ${name}
  npm start

Your blog will be at http://localhost:1911
`);
