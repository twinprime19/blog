#!/usr/bin/env node
// First-run setup: generates an admin token and writes it to tokens.json.
// Usage: node scripts/setup.js [--agent Name] [--role admin|writer]

import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(__dirname, '..', 'tokens.json');

// Parse CLI flags
function parseArgs(args) {
  const opts = { agent: 'Admin', role: 'admin', name: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) opts.agent = args[++i];
    if (args[i] === '--role' && args[i + 1]) opts.role = args[++i];
    if (args[i] === '--name' && args[i + 1]) opts.name = args[++i];
  }
  return opts;
}

const { agent, role, name: blogName } = parseArgs(process.argv.slice(2));

if (!['admin', 'writer'].includes(role)) {
  console.error('Error: --role must be "admin" or "writer"');
  process.exit(1);
}

// Load existing tokens
let data;
try {
  data = JSON.parse(readFileSync(tokensPath, 'utf-8'));
} catch {
  data = { tokens: {} };
}
if (!data.tokens) data.tokens = {};

// Generate 256-bit cryptographically random token
const token = randomBytes(32).toString('base64url');
data.tokens[token] = { agent, role };

writeFileSync(tokensPath, JSON.stringify(data, null, 2) + '\n');

// Write blog name to settings.json only when --name is passed
const settingsPath = join(__dirname, '..', 'settings.json');
if (blogName) {
  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    settings = {};
  }
  settings.blogName = blogName;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

console.log('--- Setup Complete ---');
if (blogName) console.log(`Blog:  ${blogName}`);
console.log(`Agent: ${agent}`);
console.log(`Role:  ${role}`);
console.log(`Token: ${token}`);
console.log('');
console.log('Saved to tokens.json. The server will pick it up automatically.');
console.log('');
console.log('Test with:');
console.log(`  curl -H "Authorization: Bearer ${token}" http://localhost:1911/api/posts`);
