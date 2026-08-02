import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current-user';
import {
  getFeatureUsage,
  recordFeatureUsage,
  requireFeatureAccess,
} from '@/lib/premium';
import { checkAtsCompatibility, type AtsCheckResult } from '@/lib/ats-checker';
import { planAtsUpgrade } from '@/lib/ats-upgrade';
import { upgradeAtsResume } from '@/lib/ats-upgrade-ai';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/ats-fix/upgrade
 * One-click AI resume upgrade. Intensity (and credit cost) scales with ATS score.
 */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: {
    resume_text?: string;
    job_description?: string;
    /** Optional precomputed result — recomputed if missing */
    result?: AtsCheckResult;
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

  const result =
    body.result ??
    checkAtsCompatibility(resumeText, undefined, body.job_description || undefined);
  const plan = planAtsUpgrade(result);

  const access = await requireFeatureAccess({
    profileId: profile.id,
    feature: 'resume_studio',
  });
  if (!access.ok) {
    return NextResponse.json(
      {
        error: access.error,
        message: 'Resume Studio quota used up. Upgrade for AI resume upgrades.',
        usage: access.usage,
      },
      { status: 402 },
    );
  }

  // Deep rebuild costs 2 credits — ensure enough remaining (null = unlimited).
  const usage = await getFeatureUsage(profile.id, 'resume_studio');
  if (usage.remaining != null && usage.remaining < plan.creditCost) {
    return NextResponse.json(
      {
        error: 'premium_upgrade_required',
        message: `This ${plan.label.toLowerCase()} needs ${plan.creditCost} credits; you have ${usage.remaining} left.`,
        usage,
        plan,
      },
      { status: 402 },
    );
  }

  try {
    const upgraded = await upgradeAtsResume({
      resumeText,
      result,
      jobDescription: body.job_description,
      profileId: profile.id,
    });

    const stamp = Date.now();
    for (let i = 0; i < plan.creditCost; i++) {
      await recordFeatureUsage({
        profileId: profile.id,
        feature: 'resume_studio',
        eventKey: `ats_upgrade:${plan.intensity}:${stamp}:${i}`,
      });
    }

    const afterUsage = await getFeatureUsage(profile.id, 'resume_studio');

    return NextResponse.json({
      ...upgraded,
      plan,
      usage: afterUsage,
    });
  } catch (e) {
    console.error('[ats-fix/upgrade]', e);
    return NextResponse.json(
      { error: (e as Error).message || 'Failed to upgrade resume.' },
      { status: 500 },
    );
  }
}
