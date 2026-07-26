import { describe, expect, it } from 'vitest';
import { quotaLimitForPlan, quotaWindowKind, summarizeUsage } from '@/lib/premium';

describe('quotaLimitForPlan', () => {
  it('returns free limits for free users', () => {
    expect(quotaLimitForPlan('free', 'interview_prep')).toBe(1);
    expect(quotaLimitForPlan('free', 'resume_studio')).toBe(3);
    expect(quotaLimitForPlan('free', 'match_intelligence')).toBe(0);
  });

  it('returns premium limits for paid users', () => {
    expect(quotaLimitForPlan('premium_monthly', 'interview_prep')).toBe(8);
    expect(quotaLimitForPlan('premium_sprint', 'resume_studio')).toBe(40);
  });
});

describe('quotaWindowKind', () => {
  it('uses lifetime for free Resume Studio / Fix Studio credits', () => {
    expect(quotaWindowKind('free', 'resume_studio')).toBe('lifetime');
  });

  it('uses lifetime for the free interview prep sample', () => {
    expect(quotaWindowKind('free', 'interview_prep')).toBe('lifetime');
  });

  it('uses billing_cycle for paid features', () => {
    expect(quotaWindowKind('premium_monthly', 'interview_prep')).toBe('billing_cycle');
    expect(quotaWindowKind('premium_sprint', 'resume_studio')).toBe('billing_cycle');
  });
});

describe('summarizeUsage', () => {
  it('caps remaining at zero', () => {
    expect(summarizeUsage({ used: 9, limit: 8 })).toEqual({ used: 9, limit: 8, remaining: 0 });
  });
});

describe('resume studio quotas', () => {
  it('reports remaining resume generations clearly', () => {
    expect(summarizeUsage({ used: 2, limit: 3 })).toEqual({ used: 2, limit: 3, remaining: 1 });
  });
});
