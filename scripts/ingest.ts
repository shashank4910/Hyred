/**
 * Standalone ingest runner for GitHub Actions cron.
 * Loads .env.local in dev, expects env vars in CI.
 */
import 'dotenv/config';
import { runIngest } from '../lib/ingest';

async function main() {
  const profileEmail = process.env.INGEST_PROFILE_EMAIL || undefined;
  console.log('Starting ingest...', profileEmail ? `profile=${profileEmail}` : '');
  const start = Date.now();
  try {
    const result = await runIngest({ profileEmail, triggeredBy: 'cron' });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Done in ${elapsed}s`);
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) {
      console.log(`Completed with ${result.errors.length} non-fatal errors.`);
    }
    process.exit(0);
  } catch (e) {
    console.error('Ingest failed:', (e as Error).message);
    process.exit(1);
  }
}

main();
