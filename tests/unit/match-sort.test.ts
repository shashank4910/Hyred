import { describe, expect, it } from 'vitest';
import { jobListingTime, sortMatchesByFreshness } from '@/lib/job-listing-time';
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

  it('orders matches newest-first', () => {
    const matches = [
      { id: 'old-post', llm_score: 90, job: { posted_at: '2019-01-01T00:00:00.000Z', fetched_at: new Date(now - 20 * day).toISOString() } },
      { id: 'fresh-find', llm_score: 70, job: { posted_at: null, fetched_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() } },
      { id: 'posted-yesterday', llm_score: 80, job: { posted_at: new Date(now - 1 * day).toISOString(), fetched_at: new Date(now - 12 * day).toISOString() } },
    ];
    expect(sortMatchesByFreshness(matches).map((m) => m.id)).toEqual([
      'fresh-find',
      'posted-yesterday',
      'old-post',
    ]);
  });
});
