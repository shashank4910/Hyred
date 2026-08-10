import { describe, expect, it } from 'vitest';
import {
  MAX_JOB_AGE_DAYS,
  dashboardMinScore,
  staleJobCutoffIso,
  jobFreshnessOrFilter,
  includeExpiredJobs,
  isJobPastFreshnessWindow,
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

  it('jobFreshnessOrFilter keeps recently fetched jobs even with bad posted_at', () => {
    const cutoff = '2026-06-26T00:00:00.000Z';
    const filter = jobFreshnessOrFilter(cutoff);
    expect(filter).toContain(`posted_at.gte.${cutoff}`);
    expect(filter).toContain('posted_at.is.null');
    expect(filter).toContain(`fetched_at.gte.${cutoff}`);
  });

  it('includeExpiredJobs reads expired=1', () => {
    expect(includeExpiredJobs({ expired: '1' })).toBe(true);
    expect(includeExpiredJobs({ expired: '' })).toBe(false);
    expect(includeExpiredJobs(null)).toBe(false);
  });

  it('isJobPastFreshnessWindow flags old posted+fetched dates', () => {
    const cutoff = '2026-06-26T00:00:00.000Z';
    expect(
      isJobPastFreshnessWindow(
        { posted_at: '2025-01-01T00:00:00.000Z', fetched_at: '2025-01-02T00:00:00.000Z' },
        cutoff,
      ),
    ).toBe(true);
    expect(
      isJobPastFreshnessWindow(
        { posted_at: '2025-01-01T00:00:00.000Z', fetched_at: '2026-08-01T00:00:00.000Z' },
        cutoff,
      ),
    ).toBe(false);
  });

  it('PR #092 dashboardMinScore uses preference or default 50', () => {
    expect(dashboardMinScore(null)).toBe(DEFAULT_DASHBOARD_MIN_SCORE);
    expect(dashboardMinScore({ min_score: 70 } as never)).toBe(70);
  });
});
