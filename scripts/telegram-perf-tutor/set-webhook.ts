/**
 * Point Telegram at the always-on Vercel webhook.
 *
 * Usage: npm run telegram:set-webhook
 * Requires TELEGRAM_BOT_TOKEN + NEXT_PUBLIC_APP_URL (or TELEGRAM_WEBHOOK_URL)
 * Optional: TELEGRAM_WEBHOOK_SECRET (recommended)
 */
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const repoRoot = process.cwd();
  for (const name of ['.env.local', '.env']) {
    const envPath = path.join(repoRoot, name);
    if (fs.existsSync(envPath)) loadEnv({ path: envPath, override: false });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.error('Missing TELEGRAM_BOT_TOKEN');
    process.exit(1);
  }

  const base =
    process.env.TELEGRAM_WEBHOOK_URL?.trim() ||
    (process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') ?? '');
  if (!base) {
    console.error('Set NEXT_PUBLIC_APP_URL or TELEGRAM_WEBHOOK_URL (e.g. https://hyred.in)');
    process.exit(1);
  }

  const webhookUrl = `${base}/api/telegram/perf-tutor`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  };
  if (secret) body.secret_token = secret;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok?: boolean; description?: string; result?: unknown };
  console.log(JSON.stringify(json, null, 2));
  if (!json.ok) process.exit(1);

  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const info = await infoRes.json();
  console.log('Webhook info:', JSON.stringify(info, null, 2));
  console.log(`\nAlways-on URL: ${webhookUrl}`);
  console.log('Stop any local npm run telegram:tutor (polling fights the webhook).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
