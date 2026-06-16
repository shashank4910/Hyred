import { describe, expect, it } from 'vitest';
import { parseYearsExperience } from '@/lib/apply-profile';

describe('parseYearsExperience', () => {
  it('accepts one decimal year', () => {
    expect(parseYearsExperience('7.7')).toBe(7.7);
    expect(parseYearsExperience(7.7)).toBe(7.7);
  });

  it('rejects invalid values', () => {
    expect(parseYearsExperience('')).toBeNull();
    expect(parseYearsExperience('abc')).toBeNull();
    expect(parseYearsExperience(-1)).toBeNull();
    expect(parseYearsExperience(99)).toBeNull();
  });
});
