/**
 * Local polling mode (laptop must stay on).
 * For always-on (laptop off), use Vercel webhook:
 *   npm run telegram:set-webhook
 */
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPerfTutorBot } from '../../lib/telegram-perf-tutor/bot';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
for (const name of ['.env.local', '.env']) {
  const envPath = path.join(repoRoot, name);
  if (fs.existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
    console.log(`Loaded env: ${name}`);
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN in .env.local');
  process.exit(1);
}

const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());
const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
console.log(`LLM keys: groq=${hasGroq ? 'yes' : 'NO'} openai=${hasOpenAI ? 'yes' : 'NO'}`);
if (!hasGroq && !hasOpenAI) {
  console.error('Set GROQ_API_KEY or OPENAI_API_KEY in .env.local (non-empty).');
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (progress is stored in Supabase).');
  process.exit(1);
}

// Local polling cannot share the bot with a cloud webhook.
const del = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`);
const delJson = await del.json();
console.log('Cleared cloud webhook for local polling:', delJson);
console.warn('NOTE: Bot will ONLY work while this laptop process is running.');
console.warn('For always-on: stop this, deploy, then npm run telegram:set-webhook');

const bot = createPerfTutorBot();
console.log('Performance tutor bot starting (long polling)…');
await bot.launch();
console.log('Bot is LIVE on this machine. Ctrl+C to stop.');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
