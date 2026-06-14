import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabase/server';
import { isSkillPresentInJd } from '../lib/gemini';

async function main() {
  console.log('[cleanup] Starting database check for hallucinated skills...');
  const sb = supabaseAdmin();

  // Fetch all matches that have skills
  const { data: matches, error } = await sb
    .from('matches')
    .select(`
      id,
      matched_skills,
      missing_skills,
      job:jobs (
        title,
        description
      )
    `);

  if (error) {
    console.error('[cleanup] Failed to fetch matches:', error.message);
    process.exit(1);
  }

  if (!matches || matches.length === 0) {
    console.log('[cleanup] No matches found in database.');
    return;
  }

  console.log(`[cleanup] Found ${matches.length} matches to check.`);

  let updatedCount = 0;
  for (const m of matches) {
    const job = m.job as unknown as { title: string; description: string | null };
    if (!job) continue;

    const currentMatched = m.matched_skills ?? [];
    const currentMissing = m.missing_skills ?? [];

    const cleanedMatched = currentMatched.filter((s: string) =>
      isSkillPresentInJd(s, job.description, job.title)
    );
    const cleanedMissing = currentMissing.filter((s: string) =>
      isSkillPresentInJd(s, job.description, job.title)
    );

    const matchedDiff = currentMatched.length !== cleanedMatched.length ||
      currentMatched.some((s: string, idx: number) => s !== cleanedMatched[idx]);

    const missingDiff = currentMissing.length !== cleanedMissing.length ||
      currentMissing.some((s: string, idx: number) => s !== cleanedMissing[idx]);

    if (matchedDiff || missingDiff) {
      console.log(`\n[cleanup] Match ID: ${m.id} | Job: "${job.title}"`);
      if (matchedDiff) {
        console.log(`  - Matched Skills: [${currentMatched.join(', ')}] -> [${cleanedMatched.join(', ')}]`);
      }
      if (missingDiff) {
        console.log(`  - Missing Skills: [${currentMissing.join(', ')}] -> [${cleanedMissing.join(', ')}]`);
      }

      // Update the DB
      const { error: updateErr } = await sb
        .from('matches')
        .update({
          matched_skills: cleanedMatched,
          missing_skills: cleanedMissing
        })
        .eq('id', m.id);

      if (updateErr) {
        console.error(`  [ERROR] Failed to update match ${m.id}:`, updateErr.message);
      } else {
        updatedCount++;
      }
    }
  }

  console.log(`\n[cleanup] Done. Cleaned up ${updatedCount} matches.`);
}

main().catch((err) => {
  console.error('[cleanup] Fatal error:', err);
  process.exit(1);
});
