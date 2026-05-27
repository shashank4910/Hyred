import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { matchSkills } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseAdmin();

  // Fetch BOTH resume_text and insights — we need the full resume for accurate
  // matching, not just the distilled top_skills (which is capped at 12).
  const { data: m } = await sb
    .from('matches')
    .select(
      `id, profile_id, job_id,
       profile:profiles(resume_text, insights),
       job:jobs(description)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!m) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const profile = m.profile as unknown as {
    resume_text: string | null;
    insights: { top_skills?: string[] } | null;
  };
  const job = m.job as unknown as { description: string | null };

  const topSkills = profile?.insights?.top_skills ?? [];
  const resumeText = profile?.resume_text ?? '';

  // We need either a resume or some skills to compare against
  if (!resumeText && topSkills.length === 0) {
    return NextResponse.json({ matched: [], missing: [], allSkills: [] });
  }
  if (!job?.description) {
    return NextResponse.json({ matched: [], missing: [], allSkills: topSkills });
  }

  try {
    const result = await matchSkills({
      jobDescription: job.description,
      resumeText,
      topSkills,
    });
    return NextResponse.json({ ...result, allSkills: topSkills });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
