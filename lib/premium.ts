import { supabaseAdmin } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/current-user';

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

/** Owner/admin testing: no credit cap (Resume Studio, Fix Studio, etc.). */
async function isUnlimitedPremiumTester(profileId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('profiles')
    .select('email, is_admin')
    .eq('id', profileId)
    .maybeSingle();
  if (!data) return false;
  if ((data as { is_admin?: boolean }).is_admin === true) return true;
  return isAdminEmail((data as { email?: string }).email);
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
  if (await isUnlimitedPremiumTester(profileId)) {
    const now = new Date();
    const end = new Date(now);
    end.setFullYear(end.getFullYear() + 10);
    return {
      plan: 'premium_monthly',
      cycleStart: now.toISOString(),
      cycleEnd: end.toISOString(),
    };
  }

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
  if (await isUnlimitedPremiumTester(profileId)) {
    return summarizeUsage({ used: 0, limit: null });
  }

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
