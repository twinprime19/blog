#!/usr/bin/env node
// Scaffolder for The Chair blog engine.
// Usage: npx create-the-chair [directory]

import { execFileSync, execSync, spawn } from 'child_process';
import { existsSync, rmSync, cpSync } from 'fs';
import { resolve, basename, join } from 'path';
import { homedir } from 'os';

const REPO = 'https://github.com/twinprime19/blog.git';
// Runtime files to include via sparse checkout (everything else is excluded)
const RUNTIME = [
  '/server.js', '/app.js', '/config.js', '/seed.js', '/helpers.js',
  '/content-store.js', '/analytics-store.js', '/feed.js',
  '/validation.js', '/validation-attachments.js', '/process-content-images.js',
  '/middleware/', '/routes/', '/scripts/', '/public/',
  '/package.json', '/package-lock.json',
  '/.env.example', '/.gitignore',
  '/Dockerfile', '/docker-compose.yml',
  '/LICENSE', '/README.md', '/README.vi.md',
];

const arg = process.argv[2];

if (arg === '--help' || arg === '-h') {
  console.log('Usage: npx create-the-chair [directory]\n');
  console.log('Scaffolds a new blog powered by The Chair.\n');
  console.log('  directory  Target folder (default: ~/the-chair)');
  process.exit(0);
}

const dir = resolve(arg || join(homedir(), 'the-chair'));
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

// Sparse checkout: clone only runtime files (no dev/test/docs)
console.log(`Creating ${name}...`);
try {
  execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', REPO, dir], { stdio: 'ignore' });
  execFileSync('git', ['sparse-checkout', 'init', '--no-cone'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['sparse-checkout', 'set', ...RUNTIME], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['checkout'], { cwd: dir, stdio: 'ignore' });
} catch {
  console.error('Error: failed to clone repository. Check your network connection.');
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}

// Remove .git — this is a standalone deploy, not a working repo
rmSync(resolve(dir, '.git'), { recursive: true, force: true });

// Copy .env.example to .env
const envExample = resolve(dir, '.env.example');
if (existsSync(envExample)) cpSync(envExample, resolve(dir, '.env'));

// Install dependencies
console.log('Installing dependencies...');
let installOk = true;
try {
  execFileSync('npm', ['install', '--omit=dev'], { cwd: dir, stdio: 'inherit', shell: true });
} catch {
  installOk = false;
  console.error('\nnpm install failed. Run it manually:');
  console.error(`  cd ${name} && npm install && node scripts/setup.js`);
}

// Run setup to generate token (only if install succeeded)
if (installOk) {
  console.log('');
  try {
    execFileSync('node', ['scripts/setup.js'], { cwd: dir, stdio: 'inherit' });
  } catch {
    console.error('Setup failed. Run it manually:');
    console.error(`  cd ${name} && node scripts/setup.js`);
  }
}

if (!installOk) process.exit(1);

console.log(`\nDone! Starting your blog...\n`);

// Start the blog server (foreground — Ctrl+C to stop)
const child = spawn('node', ['server.js'], { cwd: dir, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
