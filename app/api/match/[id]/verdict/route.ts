import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { ensureFullDescription } from '@/lib/jd-fetcher';
import { requireFeatureAccess, recordFeatureUsage, getPremiumAccess, quotaLimitForPlan } from '@/lib/premium';
import { generateMatchIntelligence } from '@/lib/match-intelligence';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const { data } = await sb
    .from('match_verdicts')
    .select('verdict, seniority_fit, reasons, actions, generated_at')
    .eq('match_id', id)
    .eq('profile_id', profile.id)
    .maybeSingle();

  if (!data) {
    const access = await getPremiumAccess(profile.id);
    const canGenerate = quotaLimitForPlan(access.plan, 'match_intelligence') > 0;
    return NextResponse.json({
      ok: true,
      locked: !canGenerate,
      preview: 'Unlock Match Intelligence to see Apply / Stretch / Skip.',
    });
  }

  return NextResponse.json({
    ok: true,
    locked: false,
    result: {
      verdict: data.verdict,
      seniorityFit: data.seniority_fit,
      reasons: data.reasons,
      actions: data.actions,
      generatedAt: data.generated_at,
    },
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const gate = await requireFeatureAccess({ profileId: profile.id, feature: 'match_intelligence' });
  if (!gate.ok) return NextResponse.json(gate, { status: gate.status });

  const sb = supabaseAdmin();
  const { data: match } = await sb
    .from('matches')
    .select(
      `llm_score, reason, matched_skills, missing_skills,
       profile:profiles(insights, resume_text),
       job:jobs(id, title, description, url)`,
    )
    .eq('id', id)
    .eq('profile_id', profile.id)
    .single();

  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const insights = (match.profile as any)?.insights ?? {};
  const job = match.job as any;

  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  const result = await generateMatchIntelligence({
    score: match.llm_score ?? null,
    matchedSkills: (match as any).matched_skills ?? [],
    missingSkills: (match as any).missing_skills ?? [],
    yearsExperience: insights.years_experience ?? null,
    seniority: insights.seniority ?? null,
    jobTitle: job.title,
    jobDescription: fullDescription ?? job.description ?? '',
    reason: match.reason ?? null,
    profileId: profile.id,
  });

  await sb.from('match_verdicts').upsert({
    match_id: id,
    profile_id: profile.id,
    verdict: result.verdict,
    seniority_fit: result.seniorityFit,
    reasons: result.reasons,
    actions: result.actions,
  });

  await recordFeatureUsage({
    profileId: profile.id,
    feature: 'match_intelligence',
    eventKey: `${id}:${Date.now()}`,
  });

  return NextResponse.json({ ok: true, result });
}
