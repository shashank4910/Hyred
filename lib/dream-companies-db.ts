import { supabaseAdmin } from '@/lib/supabase/server';
import { findSeedEntryBySlug } from '@/lib/company-catalog/catalog-snapshot';
import {
  patternsFromDisplayName,
  type DreamCompanyRow,
  type DreamCompanySource,
} from '@/lib/dream-companies';

type InsertArgs = {
  profile_id: string;
  company_key: string;
  company_display_name: string;
  notify_email: boolean;
  notify_sms: boolean;
  source?: DreamCompanySource;
  custom_patterns?: string[] | null;
  catalog_id?: string | null;
};

function isMissingColumnError(message: string): boolean {
  return /schema cache|column.*does not exist|Could not find the/i.test(message);
}

/** Insert dream company — works with migration 0016 only or 0016+0017. */
export async function insertDreamCompanyPick(
  args: InsertArgs,
): Promise<{ data: DreamCompanyRow | null; error: string | null }> {
  const sb = supabaseAdmin();
  const base = {
    profile_id: args.profile_id,
    company_key: args.company_key,
    company_display_name: args.company_display_name,
    notify_email: args.notify_email,
    notify_sms: args.notify_sms,
  };

  const extended = {
    ...base,
    source: args.source ?? 'catalog',
    custom_patterns: args.custom_patterns ?? null,
    catalog_id: args.catalog_id ?? null,
  };

  let { data, error } = await sb.from('dream_companies').insert(extended).select('*').single();

  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await sb.from('dream_companies').insert(base).select('*').single());
  }

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data as DreamCompanyRow, error: null };
}

/** Load picks with patterns — no join required (0016-safe). */
export async function loadDreamPicksWithPatterns(profileId: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('dream_companies')
    .select('id, company_key, company_display_name')
    .eq('profile_id', profileId);

  if (error) {
    console.error('[dream-alerts] load picks failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const seed = findSeedEntryBySlug(row.company_key);
    const patterns =
      seed?.patterns ?? patternsFromDisplayName(row.company_display_name as string);
    return {
      id: row.id as string,
      company_key: row.company_key as string,
      company_display_name: row.company_display_name as string,
      source: (seed ? 'catalog' : 'manual') as DreamCompanySource,
      custom_patterns: seed ? null : patterns,
      catalog_patterns: seed ? patterns : null,
    };
  });
}
