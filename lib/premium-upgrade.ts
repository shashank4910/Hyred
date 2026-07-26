/** Shared Premium upgrade destinations (Stripe plugs in later behind this URL). */
export const PREMIUM_UPGRADE_PATH = '/settings?upgrade=resume_studio';

export type ResumeStudioUsage = {
  used: number;
  limit: number | null;
  remaining: number | null;
};

export function formatResumeStudioMeter(usage: ResumeStudioUsage, plan: string = 'free'): string {
  if (usage.limit == null) return 'Unlimited Resume Studio credits';
  const remaining = usage.remaining ?? Math.max(usage.limit - usage.used, 0);
  if (plan === 'free') {
    return remaining === 1
      ? '1 of 3 free Resume Studio credits left'
      : `${remaining} of ${usage.limit} free Resume Studio credits left`;
  }
  return `${remaining} of ${usage.limit} Resume Studio credits left`;
}
