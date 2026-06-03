import { describe, expect, it } from 'vitest';
import {
  experienceIneligibilityReason,
  isExperienceEligible,
  mergeInsightsForScoring,
  parseRequiredYearsFromText,
  resolveCandidateYears,
  resolveRequiredYears,
} from '@/lib/experience-match';

describe('parseRequiredYearsFromText', () => {
  it('parses range requirements using the upper bound', () => {
    const jd =
      '10-12 years of relevant experience with proficiency in DevOps and APM performance engineering.';
    expect(parseRequiredYearsFromText(jd)).toBe(12);
  });

  it('parses plus and minimum forms', () => {
    expect(parseRequiredYearsFromText('Minimum 10 years experience required')).toBe(10);
    expect(parseRequiredYearsFromText('18+ years of professional experience')).toBe(18);
  });

  it('uses the highest requirement when multiple appear', () => {
    const jd = '5+ years overall. Must have 10-12 years in performance engineering.';
    expect(parseRequiredYearsFromText(jd)).toBe(12);
  });
});

describe('resolveRequiredYears', () => {
  it('prefers parsed JD text over a low LLM parse', () => {
    const jd = '10-12 years of relevant experience with DevOps and APM.';
    expect(
      resolveRequiredYears({
        jdText: jd,
        jobTitle: 'Senior Performance Engineer',
        llmRequiredYears: 0,
      }),
    ).toBe(12);
  });
});

describe('resolveCandidateYears', () => {
  it('prefers apply-profile years over resume insights', () => {
    expect(
      resolveCandidateYears({
        insightsYears: 10,
        applyProfileYears: 7,
      }),
    ).toBe(7);
  });
});

describe('isExperienceEligible', () => {
  it('rejects a 7-year candidate for a 10-12 year role', () => {
    expect(isExperienceEligible(7, 12)).toBe(false);
    expect(isExperienceEligible(7, 10)).toBe(false);
  });

  it('allows small shortfalls within two years', () => {
    expect(isExperienceEligible(7, 8)).toBe(true);
    expect(isExperienceEligible(7, 9)).toBe(true);
  });
});

describe('mergeInsightsForScoring', () => {
  it('overlays apply-profile years onto insights', () => {
    expect(
      mergeInsightsForScoring({ years_experience: 10, seniority: 'senior' }, 7),
    ).toEqual({ years_experience: 7, seniority: 'senior' });
  });
});

describe('experienceIneligibilityReason', () => {
  it('explains the gap clearly', () => {
    expect(experienceIneligibilityReason(7, 12)).toContain('7 years');
    expect(experienceIneligibilityReason(7, 12)).toContain('5-year gap');
  });
});
