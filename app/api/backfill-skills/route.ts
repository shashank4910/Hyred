import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isSkillPresentInJd } from '@/lib/gemini';
import { isCurrentUserAdmin } from '@/lib/current-user';

export async function GET() {
  try {
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = supabaseAdmin();
    console.log('[API backfill] Fetching matches...');

    const { data: matches, error } = await sb
      .from('matches')
      .select(`
        id,
        matched_skills,
        missing_skills,
        llm_score,
        reason,
        profile:profiles (
          id,
          insights
        ),
        job:jobs (
          id,
          title,
          company,
          description
        )
      `);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const report: any[] = [];
    let updatedCount = 0;

    for (const m of matches ?? []) {
      const job = m.job as any;
      const profile = m.profile as any;
      if (!job || !profile) continue;

      const candidateSkills = profile.insights?.top_skills;
      if (!candidateSkills || !Array.isArray(candidateSkills)) continue;

      const matchedSkills = candidateSkills.filter((s: string) =>
        isSkillPresentInJd(s, job.description, job.title)
      );

      const missingSkills = candidateSkills.filter((s: string) =>
        !matchedSkills.includes(s)
      );

      const currentMatched = m.matched_skills ?? [];
      const currentMissing = m.missing_skills ?? [];
      
      const matchedDiff = currentMatched.length !== matchedSkills.length ||
        currentMatched.some((s: string, idx: number) => s !== matchedSkills[idx]);
        
      const missingDiff = currentMissing.length !== missingSkills.length ||
        currentMissing.some((s: string, idx: number) => s !== missingSkills[idx]);

      if (matchedDiff || missingDiff) {
        // Run update in DB
        const { error: updateErr } = await sb
          .from('matches')
          .update({
            matched_skills: matchedSkills,
            missing_skills: missingSkills
          })
          .eq('id', m.id);

        report.push({
          matchId: m.id,
          company: job.company,
          title: job.title,
          score: m.llm_score,
          candidateSkills,
          before: {
            matched: currentMatched,
            missing: currentMissing
          },
          after: {
            matched: matchedSkills,
            missing: missingSkills
          },
          updated: !updateErr,
          updateError: updateErr?.message
        });

        if (!updateErr) updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      report
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
