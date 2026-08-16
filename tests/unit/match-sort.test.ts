import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_SORT, resolveMatchSort } from '@/lib/ui';

describe('dashboard match sort', () => {
  it('defaults to score when sort param is missing (refresh / bare /)', () => {
    expect(resolveMatchSort(undefined)).toBe('score');
    expect(resolveMatchSort(null)).toBe('score');
    expect(resolveMatchSort('')).toBe('score');
    expect(DEFAULT_MATCH_SORT).toBe('score');
  });

  it('honours explicit sort query params', () => {
    expect(resolveMatchSort('posted')).toBe('posted');
    expect(resolveMatchSort('company')).toBe('company');
    expect(resolveMatchSort('score')).toBe('score');
  });

  it('maps legacy sort params to the new modes', () => {
    expect(resolveMatchSort('newest')).toBe('posted');
    expect(resolveMatchSort('activity')).toBe('score');
    expect(resolveMatchSort('az')).toBe('company');
  });
});
