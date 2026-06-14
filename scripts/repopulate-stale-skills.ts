import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabase/server';
import { isSkillPresentInJd } from '../lib/gemini';

async function main() {
  console.log('[backfill] Starting local skill repopulation...');
  const sb = supabaseAdmin();

  // Fetch all matches along with their jobs and profiles
  const { data: matches, error } = await sb
    .from('matches')
    .select(`
      id,
      matched_skills,
      missing_skills,
      profile_id,
      profile:profiles (
        id,
        insights
      ),
      job:jobs (
        title,
        description
      )
    `);

  if (error) {
    console.error('[backfill] Failed to fetch matches:', error.message);
    process.exit(1);
  }

  if (!matches || matches.length === 0) {
    console.log('[backfill] No matches found in database.');
    return;
  }

  console.log(`[backfill] Found ${matches.length} matches to analyze.`);

  let updatedCount = 0;
  for (const m of matches) {
    const job = m.job as unknown as { title: string; description: string | null };
    const profile = m.profile as unknown as { id: string; insights: any };
    if (!job || !profile) continue;

    // Get candidate's top skills from profile insights
    const candidateSkills = profile.insights?.top_skills as string[] | undefined;
    if (!candidateSkills || !Array.isArray(candidateSkills)) {
      continue;
    }

    // Check which candidate skills are present in the JD using the new improved logic
    const matchedSkills = candidateSkills.filter((s: string) =>
      isSkillPresentInJd(s, job.description, job.title)
    );

    // If the list changed (e.g. was empty but now has matches), update the database
    const currentMatched = m.matched_skills ?? [];
    const diff = currentMatched.length !== matchedSkills.length ||
      currentMatched.some((s: string, idx: number) => s !== matchedSkills[idx]);

    if (diff) {
      console.log(`\n[backfill] Updating Match ID: ${m.id} | Job: "${job.title}"`);
      console.log(`  - Matched Skills: [${currentMatched.join(', ')}] -> [${matchedSkills.join(', ')}]`);

      const { error: updateErr } = await sb
        .from('matches')
        .update({
          matched_skills: matchedSkills
        })
        .eq('id', m.id);

      if (updateErr) {
        console.error(`  [ERROR] Failed to update match ${m.id}:`, updateErr.message);
      } else {
        updatedCount++;
      }
    }
  }

  console.log(`\n[backfill] Done. Repopulated ${updatedCount} matches with corrected skills.`);
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err);
  process.exit(1);
});
