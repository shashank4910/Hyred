import { describe, expect, it } from 'vitest';
import { checkAtsCompatibility } from '@/lib/ats-checker';
import { ATS_SAMPLE_RESUME } from '@/lib/ats-checker-samples';
import {
  buildAtsReport,
  extractContactInfo,
  findEssentialSections,
  findRepeatedWords,
  findSpellingIssues,
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

  it('detects repeated verbs with synonym suggestions — only when actually repeated', () => {
    const repetitive = `EXPERIENCE
- Managed a team of engineers
- Managed vendor relationships
- Managed the release calendar
- Managed budget planning
`;
    const reps = findRepeatedWords(repetitive);
    expect(reps.length).toBeGreaterThan(0);
    expect(reps[0].word).toBe('managed');
    expect(reps[0].count).toBe(4);
    expect(reps[0].suggestions.length).toBeGreaterThan(0);

    const varied = `EXPERIENCE
- Managed a team of engineers
- Built the release pipeline
- Directed budget planning
`;
    expect(findRepeatedWords(varied)).toEqual([]);
  });

  it('finds misspellings with context and skips clean text', () => {
    const withTypos = `SUMMARY
Strong knowledege of cloud systems and project managment.
`;
    const issues = findSpellingIssues(withTypos);
    expect(issues.map((i) => i.suggestion)).toEqual(
      expect.arrayContaining(['knowledge', 'management']),
    );
    expect(issues[0].context).toContain('knowledege');

    expect(findSpellingIssues('Strong knowledge of cloud systems.')).toEqual([]);
  });

  it('extracts per-user contact fields', () => {
    const text = `Jane Doe
Bengaluru, India
jane@example.com | +91 98765 43210
linkedin.com/in/janedoe
`;
    const items = extractContactInfo(text);
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i]));
    expect(byLabel['Email address'].ok).toBe(true);
    expect(byLabel['Email address'].value).toBe('jane@example.com');
    expect(byLabel['Phone number'].ok).toBe(true);
    expect(byLabel['LinkedIn profile'].ok).toBe(true);

    const missing = extractContactInfo('Jane Doe\nSoftware Engineer');
    const byLabel2 = Object.fromEntries(missing.map((i) => [i.label, i]));
    expect(byLabel2['Email address'].ok).toBe(false);
    expect(byLabel2['LinkedIn profile'].ok).toBe(false);
  });

  it('detects which essential sections exist per resume', () => {
    const text = `JANE DOE
EXPERIENCE
- Did things
EDUCATION
B.Tech
`;
    const items = findEssentialSections(text);
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i.ok]));
    expect(byLabel['Experience']).toBe(true);
    expect(byLabel['Education']).toBe(true);
    expect(byLabel['Skills']).toBe(false);
  });

  it('includes dynamic repetition and spelling checks in the report', () => {
    const result = checkAtsCompatibility(ATS_SAMPLE_RESUME);
    const report = buildAtsReport(result, ATS_SAMPLE_RESUME, { isPremium: false });
    const content = report.categories.find((c) => c.id === 'content')!;
    const ids = content.checks.map((c) => c.id);
    expect(ids).toContain('content-repetition');
    expect(ids).toContain('content-spelling');
    for (const check of content.checks) {
      expect(check.education).toBeTruthy();
    }
  });
});
