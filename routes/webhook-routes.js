import { Hono } from 'hono';
import crypto from 'crypto';
import { appendFileSync, unlinkSync } from 'fs';
import { execFile } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRateLimiter } from '../middleware/rate-limit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const DEPLOY_SCRIPT = join(projectRoot, 'scripts', 'deploy.sh');
const FAILURE_LOG = join(projectRoot, 'deploy-failure.log');

const webhook = new Hono();
const webhookLimit = createRateLimiter({ windowMs: 60_000, max: 20 });

function verifySignature(payload, signature) {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch { return false; }
}

webhook.post('/webhook/deploy', webhookLimit, async (c) => {
  const body = await c.req.text();
  const sig = c.req.header('x-hub-signature-256');
  if (!verifySignature(body, sig)) return c.json({ error: 'Invalid signature' }, 401);

  // C2: Wrap JSON.parse in try/catch
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  if (payload.ref !== 'refs/heads/main') {
    return c.json({ ok: true, skipped: true, reason: 'not main branch' });
  }

  const commitShort = payload.head_commit?.id?.slice(0, 7) || 'unknown';
  const commitMsg = payload.head_commit?.message?.split('\n')[0] || '';
  console.log(`[webhook] Deploy triggered by push to main (${commitShort}: ${commitMsg})`);

  execFile('bash', [DEPLOY_SCRIPT], { cwd: projectRoot, timeout: 120_000 }, (err, stdout, stderr) => {
    if (err) {
      const failMsg = `Blog auto-deploy FAILED\nCommit: ${commitShort} — ${commitMsg}\nError: ${err.message}\n${stderr ? `Stderr: ${stderr.slice(-500)}` : ''}`;
      console.error(`[webhook]`, failMsg);
      appendFileSync(FAILURE_LOG, `[${new Date().toISOString()}] ${failMsg}\n---\n`);
    } else {
      console.log(`[webhook] Deploy succeeded (${commitShort})`);
      try { unlinkSync(FAILURE_LOG); } catch {}
    }
  });

  return c.json({ ok: true, deploying: true });
});

export default webhook;
