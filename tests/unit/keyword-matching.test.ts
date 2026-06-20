import { describe, expect, it } from 'vitest';
import {
  ensureCompetencyKeywordsPresent,
  keywordInText,
} from '@/lib/gemini';

describe('keywordInText (resume ATS matching)', () => {
  it('matches exact multi-word phrases', () => {
    expect(keywordInText('performance bottlenecks', 'Identified performance bottlenecks in prod.')).toBe(true);
  });

  it('accepts singular/plural on the last token of multi-word phrases', () => {
    expect(keywordInText('performance bottlenecks', 'Resolved a critical performance bottleneck.')).toBe(true);
    expect(keywordInText('performance bottleneck', 'Resolved performance bottlenecks in prod.')).toBe(true);
  });

  it('does not match unrelated substrings', () => {
    expect(keywordInText('performance bottlenecks', 'performance metrics and load testing')).toBe(false);
  });
});

describe('ensureCompetencyKeywordsPresent', () => {
  it('appends missing activity keywords verbatim so keywordInText matches', () => {
    const resume = 'Jane Doe\nPerformance Engineer\n\nPROFESSIONAL SUMMARY\nQA lead.\n';
    const { text, added } = ensureCompetencyKeywordsPresent(resume, ['performance bottlenecks']);
    expect(added).toEqual(['performance bottlenecks']);
    expect(keywordInText('performance bottlenecks', text)).toBe(true);
  });
});
