import { describe, expect, it } from 'vitest';
import {
  MAX_JOB_AGE_DAYS,
  dashboardMinScore,
  staleJobCutoffIso,
  DEFAULT_DASHBOARD_MIN_SCORE,
} from '@/lib/match-stats';

describe('PR #33 #92 stats/dashboard alignment', () => {
  it('PR #033 MAX_JOB_AGE_DAYS is 45', () => {
    expect(MAX_JOB_AGE_DAYS).toBe(45);
  });

  it('PR #033 staleJobCutoffIso is roughly 45 days ago', () => {
    const cutoff = new Date(staleJobCutoffIso()).getTime();
    const expected = Date.now() - 45 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff - expected)).toBeLessThan(60_000);
  });

  it('PR #092 dashboardMinScore uses preference or default 50', () => {
    expect(dashboardMinScore(null)).toBe(DEFAULT_DASHBOARD_MIN_SCORE);
    expect(dashboardMinScore({ min_score: 70 } as never)).toBe(70);
  });
});
