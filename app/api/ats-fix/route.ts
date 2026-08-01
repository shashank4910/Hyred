import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current-user';
import { requireFeatureAccess, recordFeatureUsage } from '@/lib/premium';
import { suggestAtsFixes } from '@/lib/ats-fix-suggest';
import type { AtsCriterionKey, AtsFixWeaknessId } from '@/lib/ats-fix';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/ats-fix
 * Suggest patch-level ATS fixes for one weakness.
 * Shares resume_studio premium quota.
 *
 * Body: {
 *   resume_text, weakness_id, criterion_key, feedback,
 *   missing_keyword?, job_description?, avoid_proposed?: string[]
 * }
 */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const access = await requireFeatureAccess({
    profileId: profile.id,
    feature: 'resume_studio',
  });
  if (!access.ok) {
    return NextResponse.json(
      {
        error: access.error,
        message: 'Resume Studio quota used up. Upgrade for more AI resume fixes.',
        usage: access.usage,
      },
      { status: 402 },
    );
  }

  let body: {
    resume_text?: string;
    weakness_id?: string;
    criterion_key?: string;
    feedback?: string;
    missing_keyword?: string;
    job_description?: string;
    avoid_proposed?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const resumeText = (body.resume_text ?? '').trim();
  if (resumeText.length < 50) {
    return NextResponse.json({ error: 'Resume text too short.' }, { status: 400 });
  }

  const weaknessId = body.weakness_id as AtsFixWeaknessId | undefined;
  const criterionKey = body.criterion_key as AtsCriterionKey | 'jdKeywords' | undefined;
  if (!weaknessId || !criterionKey) {
    return NextResponse.json({ error: 'weakness_id and criterion_key are required.' }, { status: 400 });
  }

  try {
    const suggestions = await suggestAtsFixes({
      resumeText,
      weaknessId,
      criterionKey,
      feedback: (body.feedback ?? '').slice(0, 500),
      missingKeyword: body.missing_keyword,
      jobDescription: body.job_description,
      avoidProposed: Array.isArray(body.avoid_proposed)
        ? body.avoid_proposed.map(String).slice(0, 8)
        : undefined,
      profileId: profile.id,
    });

    await recordFeatureUsage({
      profileId: profile.id,
      feature: 'resume_studio',
      eventKey: `ats_fix:${weaknessId}:${Date.now()}`,
    });

    return NextResponse.json({
      suggestions,
      usage: {
        used: (access.usage.used ?? 0) + 1,
        limit: access.usage.limit,
        remaining:
          access.usage.remaining == null ? null : Math.max(access.usage.remaining - 1, 0),
      },
    });
  } catch (e) {
    console.error('[ats-fix]', e);
    return NextResponse.json(
      { error: (e as Error).message || 'Failed to suggest fixes.' },
      { status: 500 },
    );
  }
}
