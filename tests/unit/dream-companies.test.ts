import { describe, expect, it } from 'vitest';
import {
  companyCatalogKey,
  findCatalogCompanyByKey,
  resolveDreamPicksForJob,
} from '@/lib/dream-companies';
import { matchJobToCatalogEntry } from '@/lib/top-companies';

describe('dream-companies', () => {
  it('companyCatalogKey slugifies names', () => {
    expect(companyCatalogKey('Google')).toBe('google');
    expect(companyCatalogKey('Twitter/X')).toBe('twitter-x');
  });

  it('findCatalogCompanyByKey resolves catalog entries', () => {
    const entry = findCatalogCompanyByKey('google');
    expect(entry?.name).toBe('Google');
  });

  it('matchJobToCatalogEntry uses word boundaries', () => {
    const google = findCatalogCompanyByKey('google')!;
    expect(matchJobToCatalogEntry('Google India Pvt Ltd', google)).toBe(true);
    expect(matchJobToCatalogEntry('Matchstics Inc', findCatalogCompanyByKey('tcs')!)).toBe(false);
  });

  it('resolveDreamPicksForJob filters user picks only', () => {
    const picks = [
      {
        id: '1',
        company_key: 'google',
        company_display_name: 'Google',
      },
      {
        id: '2',
        company_key: 'microsoft',
        company_display_name: 'Microsoft',
      },
    ];
    const hits = resolveDreamPicksForJob('Google LLC', picks);
    expect(hits).toHaveLength(1);
    expect(hits[0].company_display_name).toBe('Google');
  });
});
