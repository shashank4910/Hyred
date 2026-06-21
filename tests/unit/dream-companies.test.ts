import { describe, expect, it } from 'vitest';
import {
  companyCatalogKey,
  jobMatchesDreamPick,
  patternsFromDisplayName,
  resolveDreamPicksForJob,
} from '@/lib/dream-companies';
import { jobCompanyMatchesPatterns } from '@/lib/company-catalog/match';
import { buildCompanyCatalogSeed } from '@/lib/company-catalog/build-seed';

describe('dream-companies', () => {
  it('companyCatalogKey slugifies names', () => {
    expect(companyCatalogKey('Google')).toBe('google');
    expect(companyCatalogKey('Twitter/X')).toBe('twitter-x');
  });

  it('patternsFromDisplayName builds match tokens', () => {
    const p = patternsFromDisplayName('Reliance Industries');
    expect(p).toContain('reliance industries');
    expect(p.some((x) => x.includes('reliance'))).toBe(true);
  });

  it('jobCompanyMatchesPatterns uses word boundaries', () => {
    expect(jobCompanyMatchesPatterns('Google India Pvt Ltd', ['google'])).toBe(true);
    expect(jobCompanyMatchesPatterns('Matchstics Inc', ['tcs'])).toBe(false);
  });

  it('resolveDreamPicksForJob matches manual patterns', () => {
    const picks = [
      {
        id: '1',
        company_key: 'acme',
        company_display_name: 'Acme Corp',
        source: 'manual' as const,
        custom_patterns: ['acme corp', 'acme'],
        catalog_patterns: null,
      },
    ];
    expect(resolveDreamPicksForJob('Acme Corp India', picks)).toHaveLength(1);
  });

  it('jobMatchesDreamPick falls back to display name', () => {
    expect(
      jobMatchesDreamPick('Toyota Motor Corporation', {
        id: '1',
        company_key: 'toyota',
        company_display_name: 'Toyota Motor',
        source: 'catalog',
        custom_patterns: null,
        catalog_patterns: null,
      }),
    ).toBe(true);
  });
});

describe('company-catalog seed', () => {
  it('builds 400+ unique catalog entries', () => {
    const entries = buildCompanyCatalogSeed();
    expect(entries.length).toBeGreaterThanOrEqual(400);
    const slugs = new Set(entries.map((e) => e.slug));
    expect(slugs.size).toBe(entries.length);
  });
});
