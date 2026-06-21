import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { matchSkills } from '@/lib/gemini';
import { ensureFullDescription } from '@/lib/jd-fetcher';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const viewer = await getCurrentProfile();
  if (!viewer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();

  // We need full job + url so we can fetch the complete JD if it's truncated.
  const { data: m } = await sb
    .from('matches')
    .select(
      `id, profile_id, job_id,
       profile:profiles(resume_text, insights),
       job:jobs(id, description, url)`,
    )
    .eq('id', id)
    .eq('profile_id', viewer.id)
    .maybeSingle();

  if (!m) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const profile = m.profile as unknown as {
    resume_text: string | null;
    insights: { top_skills?: string[] } | null;
  };
  const job = m.job as unknown as {
    id: string;
    description: string | null;
    url: string | null;
  };

  const topSkills = profile?.insights?.top_skills ?? [];
  const resumeText = profile?.resume_text ?? '';

  if (!resumeText && topSkills.length === 0) {
    return NextResponse.json({ matched: [], missing: [], allSkills: [] });
  }

  // CRITICAL: Adzuna's search API truncates JDs to ~500 chars. Before
  // running skill matching, ensure we have the full description by fetching
  // from the original posting URL. This persists back to the DB so subsequent
  // calls are instant.
  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  if (!fullDescription) {
    return NextResponse.json({
      matched: [],
      missing: [],
      allSkills: topSkills,
    });
  }

  try {
    const result = await matchSkills({
      jobDescription: fullDescription,
      resumeText,
      topSkills,
      profileId: viewer.id,
    });
    return NextResponse.json({ ...result, allSkills: topSkills });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
