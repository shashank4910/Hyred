/**
 * Standalone ingest runner for GitHub Actions cron.
 * Loads .env.local in dev, expects env vars in CI.
 *
 * Multi-user: by default scans EVERY onboarded profile. Set
 * INGEST_PROFILE_EMAIL to restrict the run to a single profile (legacy/debug).
 */
import 'dotenv/config';
import { runIngest, runIngestForAllProfiles } from '../lib/ingest';

async function main() {
  const profileEmail = process.env.INGEST_PROFILE_EMAIL || undefined;
  const start = Date.now();
  try {
    if (profileEmail) {
      console.log(`Starting ingest for single profile=${profileEmail}...`);
      const result = await runIngest({ profileEmail, triggeredBy: 'cron' });
      console.log(JSON.stringify(result, null, 2));
      if (result.errors.length) {
        console.log(`Completed with ${result.errors.length} non-fatal errors.`);
      }
    } else {
      console.log('Starting ingest for ALL onboarded profiles...');
      const summary = await runIngestForAllProfiles({ triggeredBy: 'cron' });
      console.log(
        `Scanned ${summary.profiles} profile(s):`,
        JSON.stringify(
          summary.results.map((r) => ({
            email: r.email,
            ...(r.error
              ? { error: r.error }
              : { kept: r.result?.matchesCreated, scored: r.result?.scored }),
          })),
          null,
          2,
        ),
      );
    }
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Done in ${elapsed}s`);
    process.exit(0);
  } catch (e) {
    console.error('Ingest failed:', (e as Error).message);
    process.exit(1);
  }
}

main();
