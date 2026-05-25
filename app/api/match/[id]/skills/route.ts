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

  const { data: m } = await sb
    .from('matches')
    .select(
      `id, profile_id, job_id,
       profile:profiles(insights),
       job:jobs(description)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!m) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const profile = m.profile as unknown as {
    insights: { top_skills?: string[] } | null;
  };
  const job = m.job as unknown as { description: string | null };

  const skills = profile?.insights?.top_skills ?? [];
  if (!skills.length) {
    return NextResponse.json({ matched: [], missing: [], allSkills: [] });
  }
  if (!job?.description) {
    return NextResponse.json({ matched: [], missing: [], allSkills: skills });
  }

  try {
    const result = await matchSkills({
      jobDescription: job.description,
      candidateSkills: skills,
    });
    return NextResponse.json({ ...result, allSkills: skills });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
