import { describe, expect, it } from 'vitest';
import {
  ensureCompetencyKeywordsPresent,
  keywordCloseInText,
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

describe('keywordCloseInText (amber near-match)', () => {
  const sample = [
    'Developed and debugged automated performance scripts covering load, stress,',
    'endurance, and scalability scenarios for web-based insurance applications.',
    'Designed and executed comprehensive load, stress, endurance, and scalability tests on LoadRunner Cloud.',
    'Leveraged AppDynamics for real-time monitoring during load tests.',
    'Experienced in capacity planning, workload modeling, and root cause analysis.',
    'Programming: Core Java, MySQL, Groovy',
  ].join(' ');

  it('is not close when exact match already exists', () => {
    expect(keywordCloseInText('AppDynamics', sample)).toBe(false);
    expect(keywordInText('AppDynamics', sample)).toBe(true);
  });

  it('treats load tests / list form as close for load testing (not exact)', () => {
    expect(keywordInText('load testing', sample)).toBe(false);
    expect(keywordCloseInText('load testing', sample)).toBe(true);
  });

  it('treats stress / endurance / scalability testing as close via list or tests', () => {
    expect(keywordInText('stress testing', sample)).toBe(false);
    expect(keywordCloseInText('stress testing', sample)).toBe(true);
    expect(keywordCloseInText('endurance testing', sample)).toBe(true);
    expect(keywordCloseInText('scalability testing', sample)).toBe(true);
  });

  it('aliases AppD ↔ AppDynamics without substring false positive as exact', () => {
    expect(keywordInText('AppD', sample)).toBe(false);
    expect(keywordCloseInText('AppD', sample)).toBe(true);
  });

  it('aliases capacity analysis ↔ capacity planning', () => {
    expect(keywordInText('capacity analysis', sample)).toBe(false);
    expect(keywordCloseInText('capacity analysis', sample)).toBe(true);
  });

  it('leaves truly missing tools as no match', () => {
    expect(keywordInText('Datadog', sample)).toBe(false);
    expect(keywordCloseInText('Datadog', sample)).toBe(false);
    expect(keywordInText('Python', sample)).toBe(false);
    expect(keywordCloseInText('Python', sample)).toBe(false);
  });

  it('does not treat bare performance as close for performance tuning', () => {
    expect(keywordCloseInText('performance tuning', sample)).toBe(false);
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
