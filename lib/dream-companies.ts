import {
  companyCatalogKey,
  findCatalogCompanyByKey,
  getCompanyCatalog,
  matchJobToCatalogEntry,
  type CompanyEntry,
} from '@/lib/top-companies';
import { getPremiumAccess } from '@/lib/premium';

export const FREE_DREAM_COMPANY_LIMIT = 1;
export const PREMIUM_DREAM_COMPANY_LIMIT = 10;

export type DreamCompanyRow = {
  id: string;
  profile_id: string;
  company_key: string;
  company_display_name: string;
  notify_email: boolean;
  notify_sms: boolean;
  created_at: string;
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

export { companyCatalogKey, findCatalogCompanyByKey, getCompanyCatalog, matchJobToCatalogEntry };
export type { CompanyEntry };

export async function dreamCompanyLimitForProfile(profileId: string): Promise<number> {
  const { plan } = await getPremiumAccess(profileId);
  return plan === 'free' ? FREE_DREAM_COMPANY_LIMIT : PREMIUM_DREAM_COMPANY_LIMIT;
}

export function resolveDreamPicksForJob(
  jobCompany: string | null | undefined,
  picks: Pick<DreamCompanyRow, 'id' | 'company_key' | 'company_display_name'>[],
): Pick<DreamCompanyRow, 'id' | 'company_key' | 'company_display_name'>[] {
  if (!jobCompany?.trim() || picks.length === 0) return [];
  const matched: typeof picks = [];
  for (const pick of picks) {
    const entry = findCatalogCompanyByKey(pick.company_key);
    if (entry && matchJobToCatalogEntry(jobCompany, entry)) {
      matched.push(pick);
    }
  }
  return matched;
}
