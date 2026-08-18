import { describe, expect, it } from 'vitest';
import {
  jobListingTime,
  matchListingTime,
  sortMatchesByFreshness,
} from '@/lib/job-listing-time';
import { DEFAULT_MATCH_SORT, resolveMatchSort } from '@/lib/ui';

describe('dashboard match sort', () => {
  it('defaults to score when sort param is missing', () => {
    expect(resolveMatchSort(undefined)).toBe('score');
    expect(resolveMatchSort(null)).toBe('score');
    expect(resolveMatchSort('')).toBe('score');
    expect(DEFAULT_MATCH_SORT).toBe('score');
  });

  it('honours score and posted, drops company A-Z', () => {
    expect(resolveMatchSort('posted')).toBe('posted');
    expect(resolveMatchSort('score')).toBe('score');
    expect(resolveMatchSort('company')).toBe('score');
  });

  it('maps legacy sort params', () => {
    expect(resolveMatchSort('newest')).toBe('posted');
    expect(resolveMatchSort('activity')).toBe('score');
    expect(resolveMatchSort('az')).toBe('score');
  });
});

describe('job listing freshness (product: later of sane post date and discovery)', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  it('uses discovery when posted_at is missing', () => {
    const fetched = new Date(now - 2 * day).toISOString();
    expect(jobListingTime({ posted_at: null, fetched_at: fetched })).toBe(new Date(fetched).getTime());
  });

  it('uses the later of posted and fetched when posted is real', () => {
    const posted = new Date(now - 1 * day).toISOString();
    const fetched = new Date(now - 10 * day).toISOString();
    expect(jobListingTime({ posted_at: posted, fetched_at: fetched })).toBe(new Date(posted).getTime());
  });

  it('ignores ancient posted_at in favor of a recent discovery', () => {
    const posted = '2019-01-01T00:00:00.000Z';
    const fetched = new Date(now - 1 * day).toISOString();
    expect(jobListingTime({ posted_at: posted, fetched_at: fetched })).toBe(new Date(fetched).getTime());
  });

  it('ignores future posted_at', () => {
    const posted = new Date(now + 400 * day).toISOString();
    const fetched = new Date(now - 1 * day).toISOString();
    expect(jobListingTime({ posted_at: posted, fetched_at: fetched })).toBe(new Date(fetched).getTime());
  });

  it('orders matches by when they were added to the dashboard (Newest)', () => {
    const matches = [
      { id: 'old-scan', llm_score: 92, created_at: new Date(now - 3 * day).toISOString(), job: { posted_at: new Date(now - 5 * day).toISOString(), fetched_at: new Date(now - 3 * day).toISOString() } },
      { id: 'fresh-scan', llm_score: 62, created_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(), job: { posted_at: null, fetched_at: new Date(now - 1 * day).toISOString() } },
      { id: 'mid-scan', llm_score: 80, created_at: new Date(now - 1 * day).toISOString(), job: { posted_at: new Date(now - 2 * day).toISOString(), fetched_at: new Date(now - 2 * day).toISOString() } },
    ];
    expect(sortMatchesByFreshness(matches).map((m) => m.id)).toEqual([
      'fresh-scan',
      'mid-scan',
      'old-scan',
    ]);
  });

  it('breaks ties by score', () => {
    const t = new Date(now - 60 * 60 * 1000).toISOString();
    const matches = [
      { id: 'low', llm_score: 55, created_at: t, job: {} },
      { id: 'high', llm_score: 88, created_at: t, job: {} },
    ];
    expect(sortMatchesByFreshness(matches).map((m) => m.id)).toEqual(['high', 'low']);
  });
});

describe('match listing time (card clock: newer of listing and when the match was added)', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  it('shows the match creation time when it is newer than the job listing', () => {
    const created = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    const job = { posted_at: null, fetched_at: new Date(now - 1 * day).toISOString() };
    expect(matchListingTime({ created_at: created, job })).toBe(new Date(created).getTime());
  });

  it('falls back to the job listing time when the match is older', () => {
    const created = new Date(now - 10 * day).toISOString();
    const job = { posted_at: null, fetched_at: new Date(now - 1 * day).toISOString() };
    expect(matchListingTime({ created_at: created, job })).toBe(new Date(job.fetched_at).getTime());
  });

  it('ignores a missing created_at', () => {
    const job = { posted_at: new Date(now - 1 * day).toISOString(), fetched_at: null };
    expect(matchListingTime({ created_at: null, job })).toBe(new Date(job.posted_at).getTime());
  });
});
