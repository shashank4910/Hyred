import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current-user';
import {
  getFeatureUsage,
  getPremiumAccess,
  type PremiumFeatureKey,
} from '@/lib/premium';

export const runtime = 'nodejs';

const FEATURES: PremiumFeatureKey[] = [
  'resume_studio',
  'interview_prep',
  'match_intelligence',
];

/**
 * GET /api/premium/usage
 * Returns plan + per-feature usage for the signed-in user.
 */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const access = await getPremiumAccess(profile.id);
  const usages = await Promise.all(
    FEATURES.map(async (feature) => {
      const usage = await getFeatureUsage(profile.id, feature);
      return [feature, usage] as const;
    }),
  );

  const byFeature = Object.fromEntries(usages) as Record<
    PremiumFeatureKey,
    { used: number; limit: number | null; remaining: number | null }
  >;

  return NextResponse.json({
    plan: access.plan,
    cycleStart: access.cycleStart,
    cycleEnd: access.cycleEnd,
    features: byFeature,
    /** Convenience alias — Fix Studio + job-detail tailored resumes share this. */
    resume_studio: byFeature.resume_studio,
  });
}
