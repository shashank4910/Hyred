import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_SORT, resolveMatchSort } from '@/lib/ui';

describe('PR #110 default dashboard sort', () => {
  it('defaults to score when sort param is missing (refresh / bare /)', () => {
    expect(resolveMatchSort(undefined)).toBe('score');
    expect(resolveMatchSort(null)).toBe('score');
    expect(resolveMatchSort('')).toBe('score');
    expect(DEFAULT_MATCH_SORT).toBe('score');
  });

  it('honours explicit sort query params', () => {
    expect(resolveMatchSort('newest')).toBe('newest');
    expect(resolveMatchSort('posted')).toBe('posted');
    expect(resolveMatchSort('activity')).toBe('activity');
  });
});
