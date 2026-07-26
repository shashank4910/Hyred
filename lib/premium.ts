import { supabaseAdmin } from '@/lib/supabase/server';

export type PremiumFeatureKey = 'interview_prep' | 'match_intelligence' | 'resume_studio';
export type PremiumPlan = 'free' | 'premium_monthly' | 'premium_sprint';
export type QuotaWindowKind = 'lifetime' | 'billing_cycle';

export function quotaLimitForPlan(plan: PremiumPlan, feature: PremiumFeatureKey): number {
  const freeLimits: Record<PremiumFeatureKey, number> = {
    interview_prep: 1,
    match_intelligence: 0,
    resume_studio: 3,
  };
  const premiumLimits: Record<PremiumFeatureKey, number> = {
    interview_prep: 8,
    match_intelligence: 9999,
    resume_studio: 40,
  };
  return plan === 'free' ? freeLimits[feature] : premiumLimits[feature];
}

export function quotaWindowKind(plan: PremiumPlan, feature: PremiumFeatureKey): QuotaWindowKind {
  // Free Resume Studio / Fix Studio: 3 lifetime credits until Stripe billing
  // cycles exist. Paid plans use the subscription cycle window.
  if (plan === 'free' && feature === 'resume_studio') return 'lifetime';
  if (plan === 'free' && feature === 'interview_prep') return 'lifetime';
  if (plan === 'free' && feature === 'match_intelligence') return 'lifetime';
  return 'billing_cycle';
}

export function summarizeUsage(args: { used: number; limit: number | null }) {
  return {
    used: args.used,
    limit: args.limit,
    remaining: args.limit == null ? null : Math.max(args.limit - args.used, 0),
  };
}

export async function getPremiumAccess(profileId: string): Promise<{
  plan: PremiumPlan;
  cycleStart: string | null;
  cycleEnd: string | null;
}> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('premium_subscriptions')
    .select('plan, cycle_start, cycle_end')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle();

  return {
    plan: (data?.plan as PremiumPlan | undefined) ?? 'free',
    cycleStart: data?.cycle_start ?? null,
    cycleEnd: data?.cycle_end ?? null,
  };
}

export async function getFeatureUsage(
  profileId: string,
  feature: PremiumFeatureKey,
): Promise<{ used: number; limit: number | null; remaining: number | null }> {
  const access = await getPremiumAccess(profileId);
  const limit = quotaLimitForPlan(access.plan, feature);
  const windowKind = quotaWindowKind(access.plan, feature);
  const sb = supabaseAdmin();

  let query = sb
    .from('premium_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('feature_key', feature);

  if (windowKind === 'billing_cycle' && access.cycleStart) {
    query = query.gte('created_at', access.cycleStart);
  }

  const { count } = await query;
  return summarizeUsage({ used: count ?? 0, limit });
}

export async function requireFeatureAccess(args: {
  profileId: string;
  feature: PremiumFeatureKey;
  consumeOnSuccess?: boolean;
}): Promise<
  | { ok: true; usage: { used: number; limit: number | null; remaining: number | null } }
  | { ok: false; status: 402; error: string; usage: { used: number; limit: number | null; remaining: number | null } }
> {
  const usage = await getFeatureUsage(args.profileId, args.feature);
  if (usage.limit !== null && usage.used >= usage.limit) {
    return {
      ok: false as const,
      status: 402 as const,
      error: 'premium_upgrade_required',
      usage,
    };
  }
  return { ok: true as const, usage };
}

export async function recordFeatureUsage(args: {
  profileId: string;
  feature: PremiumFeatureKey;
  eventKey: string;
}): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('premium_usage_events').insert({
    profile_id: args.profileId,
    feature_key: args.feature,
    event_key: args.eventKey,
  });
}
