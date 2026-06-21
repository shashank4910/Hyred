import { getPremiumAccess } from '@/lib/premium';
import { jobCompanyMatchesPatterns } from '@/lib/company-catalog/match';
import { patternsFromDisplayName } from '@/lib/company-catalog/match';
import { findCatalogBySlug } from '@/lib/company-catalog/db';
import { companyCatalogKey } from '@/lib/top-companies';

export const FREE_DREAM_COMPANY_LIMIT = 1;
export const PREMIUM_DREAM_COMPANY_LIMIT = 10;

export type DreamCompanySource = 'catalog' | 'manual' | 'approved_request';

export type DreamCompanyRow = {
  id: string;
  profile_id: string;
  company_key: string;
  company_display_name: string;
  notify_email: boolean;
  notify_sms: boolean;
  catalog_id: string | null;
  source: DreamCompanySource;
  custom_patterns: string[] | null;
  created_at: string;
};

export type DreamPickForMatch = {
  id: string;
  company_key: string;
  company_display_name: string;
  source: DreamCompanySource;
  custom_patterns: string[] | null;
  catalog_patterns: string[] | null;
};

export type DreamCompanyAlertRow = {
  id: string;
  profile_id: string;
  dream_company_id: string;
  job_id: string;
  match_id: string | null;
  job_title: string | null;
  company_name: string | null;
  read_at: string | null;
  email_sent_at: string | null;
  sms_sent_at: string | null;
  created_at: string;
};

export { companyCatalogKey, patternsFromDisplayName };

export async function dreamCompanyLimitForProfile(profileId: string): Promise<number> {
  const { plan } = await getPremiumAccess(profileId);
  return plan === 'free' ? FREE_DREAM_COMPANY_LIMIT : PREMIUM_DREAM_COMPANY_LIMIT;
}

export function resolveDreamPicksForJob(
  jobCompany: string | null | undefined,
  picks: DreamPickForMatch[],
): DreamPickForMatch[] {
  if (!jobCompany?.trim() || picks.length === 0) return [];
  return picks.filter((pick) => jobMatchesDreamPick(jobCompany, pick));
}

export function jobMatchesDreamPick(
  jobCompany: string | null | undefined,
  pick: DreamPickForMatch,
): boolean {
  if (pick.custom_patterns?.length) {
    return jobCompanyMatchesPatterns(jobCompany, pick.custom_patterns);
  }
  if (pick.catalog_patterns?.length) {
    return jobCompanyMatchesPatterns(jobCompany, pick.catalog_patterns);
  }
  return jobCompanyMatchesPatterns(jobCompany, patternsFromDisplayName(pick.company_display_name));
}

/** Resolve catalog slug to row (DB). Legacy static fallback removed after seed. */
export async function resolveCatalogPick(slug: string) {
  return findCatalogBySlug(slug);
}

export function normalizeDreamPickRow(row: Record<string, unknown>): DreamPickForMatch {
  const catalog = row.company_catalog as { patterns?: string[] } | { patterns?: string[] }[] | null;
  const catalogPatterns = Array.isArray(catalog)
    ? catalog[0]?.patterns ?? null
    : catalog?.patterns ?? null;

  return {
    id: row.id as string,
    company_key: row.company_key as string,
    company_display_name: row.company_display_name as string,
    source: (row.source as DreamCompanySource) ?? 'catalog',
    custom_patterns: (row.custom_patterns as string[] | null) ?? null,
    catalog_patterns: catalogPatterns,
  };
}
