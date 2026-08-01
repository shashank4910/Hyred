import { describe, expect, it } from 'vitest';
import { checkAtsCompatibility } from '@/lib/ats-checker';
import { ATS_SAMPLE_RESUME } from '@/lib/ats-checker-samples';
import {
  buildAtsReport,
  findThinBullets,
  findUnquantifiedBullets,
} from '@/lib/ats-report';

describe('ats-report', () => {
  it('builds free categories with Content / Sections / ATS Essentials unlocked', () => {
    const result = checkAtsCompatibility(ATS_SAMPLE_RESUME);
    const report = buildAtsReport(result, ATS_SAMPLE_RESUME, { isPremium: false });

    expect(report.overallScore).toBe(result.overallScore);
    expect(report.categories.map((c) => c.id)).toEqual([
      'content',
      'sections',
      'ats_essentials',
      'hr',
      'discrimination',
      'seniority',
      'tailoring',
    ]);

    const free = report.categories.filter((c) => c.tier === 'free');
    expect(free.every((c) => !c.locked)).toBe(true);

    const premium = report.categories.filter((c) => c.tier === 'premium');
    expect(premium.every((c) => c.locked)).toBe(true);
    expect(premium.every((c) => c.checks.some((ch) => ch.status === 'locked'))).toBe(true);
  });

  it('unlocks premium categories when isPremium is true', () => {
    const result = checkAtsCompatibility(ATS_SAMPLE_RESUME);
    const report = buildAtsReport(result, ATS_SAMPLE_RESUME, { isPremium: true });
    const premium = report.categories.filter((c) => c.tier === 'premium');
    expect(premium.every((c) => !c.locked)).toBe(true);
    expect(premium.every((c) => c.checks.every((ch) => ch.status !== 'locked'))).toBe(true);
  });

  it('extracts unquantified and thin bullets for quotes', () => {
    const text = `NAME
email@test.com

EXPERIENCE
- Participated in daily standup meetings
- Ran tests
- Improved pass rates by 12% across 3 teams
`;
    expect(findUnquantifiedBullets(text)).toContain('Participated in daily standup meetings');
    expect(findThinBullets(text)).toContain('Ran tests');
  });
});
