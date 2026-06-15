/**
 * Backfill matched_skills for all matches in the DB.
 *
 * This script fixes the two root-cause bugs found in June 2026:
 *   1. isSkillPresentInJd was called on raw HTML JD text — HTML tags broke word-boundary
 *      matching, causing skills like "JMeter" inside <li>JMeter</li> to not match.
 *   2. The dashboard enrichment was computing missingSkills as "resume skills not in JD"
 *      which is the OPPOSITE of the correct definition ("JD skills not in resume").
 *
 * What this script does:
 *   - Recomputes matched_skills from profile.insights.top_skills × JD (HTML stripped).
 *   - Does NOT touch missing_skills — the LLM computed those at ingest time and they
 *     are correct (skills the JD requires that the candidate's resume lacks).
 *   - Only updates rows where matched_skills changed.
 *
 * Flags:
 *   --delete   Instead of backfilling, DELETE all matches for every profile
 *              so you can run a clean scan to test the fixed pipeline end-to-end.
 *   --profile  Only process matches for this profile email (default: all profiles).
 *   --dry-run  Log what would change but don't write to DB.
 *
 * Usage:
 *   npm run backfill:skills               # fix matched_skills for all profiles
 *   npm run backfill:skills -- --delete   # wipe all matches (triggers fresh scan)
 *   npm run backfill:skills -- --profile shashank@example.com
 *   npm run backfill:skills -- --dry-run
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
// Try .env.local first (Next.js convention), then fall back to .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { supabaseAdmin } from '../lib/supabase/server';
import { isSkillPresentInJd } from '../lib/gemini';
import { sanitizeJobDescriptionForAI } from '../lib/jd-fetcher';

// ---------- CLI args ----------
const args = process.argv.slice(2);
const DELETE_MODE = args.includes('--delete');
const DRY_RUN = args.includes('--dry-run');
const profileEmailArg = (() => {
  const idx = args.indexOf('--profile');
  return idx !== -1 ? args[idx + 1] : null;
})();

async function main() {
  const sb = supabaseAdmin();

  // ── DELETE MODE ────────────────────────────────────────────────────────────
  if (DELETE_MODE) {
    console.log('\n🗑  DELETE MODE — wiping all matches so you can run a fresh scan.\n');

    let matchQuery = sb.from('matches').select('id, profile_id, profile:profiles(email)');

    if (profileEmailArg) {
      console.log(`  Filtering to profile: ${profileEmailArg}`);
      const { data: profile } = await sb
        .from('profiles')
        .select('id')
        .eq('email', profileEmailArg)
        .maybeSingle();
      if (!profile) {
        console.error(`  ✗ No profile found for email: ${profileEmailArg}`);
        process.exit(1);
      }
      const { data: deleted, error } = await sb
        .from('matches')
        .delete()
        .eq('profile_id', profile.id)
        .select('id');
      if (error) {
        console.error('  ✗ Delete failed:', error.message);
        process.exit(1);
      }
      console.log(`  ✓ Deleted ${deleted?.length ?? 0} matches for ${profileEmailArg}`);
    } else {
      const { data: deleted, error } = await sb
        .from('matches')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // delete all rows
        .select('id');
      if (error) {
        console.error('  ✗ Delete failed:', error.message);
        process.exit(1);
      }
      console.log(`  ✓ Deleted ${deleted?.length ?? 0} matches across all profiles`);
    }

    console.log('\n  Now go to the dashboard and click "Run scan" to rebuild with the fixed pipeline.\n');
    return;
  }

  // ── BACKFILL MODE ──────────────────────────────────────────────────────────
  console.log('\n🔧 BACKFILL MODE — recomputing matched_skills with fixed HTML-aware logic.\n');
  if (DRY_RUN) console.log('  [DRY RUN] No DB writes will happen.\n');

  // Build query
  let query = sb.from('matches').select(`
    id,
    matched_skills,
    missing_skills,
    profile_id,
    profile:profiles (
      id,
      email,
      insights
    ),
    job:jobs (
      id,
      title,
      description
    )
  `);

  if (profileEmailArg) {
    const { data: profile } = await sb
      .from('profiles')
      .select('id')
      .eq('email', profileEmailArg)
      .maybeSingle();
    if (!profile) {
      console.error(`  ✗ No profile found for email: ${profileEmailArg}`);
      process.exit(1);
    }
    query = query.eq('profile_id', profile.id);
    console.log(`  Scoped to profile: ${profileEmailArg}`);
  }

  const { data: matches, error } = await query;
  if (error) {
    console.error('  ✗ Failed to fetch matches:', error.message);
    process.exit(1);
  }
  if (!matches || matches.length === 0) {
    console.log('  No matches found.');
    return;
  }

  console.log(`  Found ${matches.length} matches to analyse.\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const m of matches) {
    const job = m.job as unknown as { id: string; title: string; description: string | null } | null;
    const profile = m.profile as unknown as { id: string; email: string; insights: any } | null;
    if (!job || !profile) { skippedCount++; continue; }

    const topSkills: string[] = Array.isArray(profile.insights?.top_skills)
      ? profile.insights.top_skills
      : [];

    if (topSkills.length === 0) { skippedCount++; continue; }

    // Strip HTML from JD before matching — this is the core fix.
    const jdPlain = sanitizeJobDescriptionForAI(job.description);

    // matched_skills = candidate's top_skills that appear in the JD (green ✓)
    const recomputedMatched = topSkills
      .filter((s) => isSkillPresentInJd(s, jdPlain, job.title))
      .slice(0, 5);

    // missing_skills: do NOT recompute here — the LLM computed this at ingest time.
    // It means "skills in JD required but absent from resume". Trust the LLM.
    // (New scans will use the fixed cleanMissingSkills which also doesn't re-filter.)

    const currentMatched: string[] = (m.matched_skills as string[] | null) ?? [];

    const hasChanged =
      currentMatched.length !== recomputedMatched.length ||
      currentMatched.some((s, i) => s !== recomputedMatched[i]);

    if (!hasChanged) { skippedCount++; continue; }

    const profile_email = profile.email ?? profile.id;
    console.log(`  Match ${m.id} | "${job.title}" | ${profile_email}`);
    console.log(`    matched_skills: [${currentMatched.join(', ') || '(empty)'}] → [${recomputedMatched.join(', ') || '(empty)'}]`);

    if (!DRY_RUN) {
      const { error: updateErr } = await sb
        .from('matches')
        .update({ matched_skills: recomputedMatched })
        .eq('id', m.id);

      if (updateErr) {
        console.error(`    ✗ Update failed: ${updateErr.message}`);
      } else {
        updatedCount++;
      }
    } else {
      updatedCount++;
    }
  }

  console.log(`\n  ✓ Done.`);
  console.log(`    Updated : ${updatedCount}`);
  console.log(`    Skipped : ${skippedCount} (no change or missing data)`);
  if (DRY_RUN) console.log(`    [DRY RUN] No writes performed.`);
  console.log();
}

main().catch((err) => {
  console.error('[backfill] Fatal:', err);
  process.exit(1);
});
