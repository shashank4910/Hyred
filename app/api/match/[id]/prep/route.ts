import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { ensureFullDescription } from '@/lib/jd-fetcher';
import { requireFeatureAccess, recordFeatureUsage } from '@/lib/premium';
import { generateInterviewPrep } from '@/lib/interview-prep';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const { data } = await sb
    .from('interview_prep_packs')
    .select('prep, generated_at')
    .eq('match_id', id)
    .eq('profile_id', profile.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    result: data?.prep ?? null,
    generatedAt: data?.generated_at ?? null,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const gate = await requireFeatureAccess({
    profileId: profile.id,
    feature: 'interview_prep',
  });
  if (!gate.ok) return NextResponse.json(gate, { status: gate.status });

  const sb = supabaseAdmin();
  const { data: match } = await sb
    .from('matches')
    .select(
      `reason, matched_skills, missing_skills, profile:profiles(resume_text), job:jobs(id, title, company, description, url)`,
    )
    .eq('id', id)
    .eq('profile_id', profile.id)
    .single();

  if (!match) {
    return NextResponse.json({ error: 'match_not_found' }, { status: 404 });
  }

  const job = match.job as unknown as { id: string; title: string; company: string | null; description: string | null; url: string | null } | null;
  const resumeText = (match.profile as unknown as { resume_text: string | null } | null)?.resume_text ?? '';

  if (!job) {
    return NextResponse.json({ error: 'job_not_found' }, { status: 404 });
  }

  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  const result = await generateInterviewPrep({
    jobTitle: job.title,
    company: job.company ?? null,
    jobDescription: fullDescription ?? job.description ?? '',
    matchedSkills: (match.matched_skills as string[] | null) ?? [],
    missingSkills: (match.missing_skills as string[] | null) ?? [],
    resumeText,
    reason: match.reason ?? null,
    profileId: profile.id,
  });

  await sb.from('interview_prep_packs').upsert({
    match_id: id,
    profile_id: profile.id,
    prep: result,
  });

  await recordFeatureUsage({
    profileId: profile.id,
    feature: 'interview_prep',
    eventKey: `${id}:${Date.now()}`,
  });

  return NextResponse.json({ ok: true, result, usage: gate.usage });
}
