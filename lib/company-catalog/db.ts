import { supabaseAdmin } from '@/lib/supabase/server';
import { companyCatalogKey } from '@/lib/top-companies';
import { buildCompanyCatalogSeed } from './build-seed';
import type { CatalogRegion, CompanyCatalogRow } from './types';

const SEED_MIN_COUNT = 200;

/** Lazy seed: upsert full catalog when DB is empty or stale. */
export async function ensureCompanyCatalogSeeded(): Promise<{ seeded: number; total: number }> {
  const sb = supabaseAdmin();
  const { count } = await sb
    .from('company_catalog')
    .select('id', { count: 'exact', head: true });

  const entries = buildCompanyCatalogSeed();
  if ((count ?? 0) >= SEED_MIN_COUNT && (count ?? 0) >= entries.length - 50) {
    return { seeded: 0, total: count ?? 0 };
  }

  const chunkSize = 100;
  let seeded = 0;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize).map((e) => ({
      slug: e.slug,
      display_name: e.display_name,
      region: e.region,
      source: e.source,
      patterns: e.patterns,
      ticker: e.ticker ?? null,
      exchange: e.exchange ?? null,
      is_listed: e.is_listed ?? true,
    }));
    const { error } = await sb.from('company_catalog').upsert(chunk, { onConflict: 'slug' });
    if (error) {
      console.error('[company-catalog] seed chunk failed:', error.message);
      break;
    }
    seeded += chunk.length;
  }

  const { count: after } = await sb
    .from('company_catalog')
    .select('id', { count: 'exact', head: true });

  console.log(`[company-catalog] seeded ${seeded} entries, total ${after ?? 0}`);
  return { seeded, total: after ?? 0 };
}

export async function searchCompanyCatalog(args: {
  q?: string;
  region?: CatalogRegion;
  limit?: number;
}): Promise<CompanyCatalogRow[]> {
  await ensureCompanyCatalogSeeded();

  const sb = supabaseAdmin();
  const limit = Math.min(args.limit ?? 40, 80);
  let query = sb
    .from('company_catalog')
    .select('*')
    .order('display_name', { ascending: true })
    .limit(limit);

  if (args.region) query = query.eq('region', args.region);
  if (args.q?.trim()) {
    const q = args.q.trim().replace(/[%_]/g, '');
    query = query.or(`display_name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[company-catalog] search failed:', error.message);
    return [];
  }
  return (data ?? []) as CompanyCatalogRow[];
}

export async function findCatalogBySlug(slug: string): Promise<CompanyCatalogRow | null> {
  await ensureCompanyCatalogSeeded();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('company_catalog')
    .select('*')
    .eq('slug', slug.toLowerCase())
    .maybeSingle();
  return (data as CompanyCatalogRow | null) ?? null;
}

export async function insertCatalogEntry(entry: {
  display_name: string;
  region: CatalogRegion;
  source: 'approved_request' | 'manual';
  patterns: string[];
  is_listed?: boolean;
}): Promise<CompanyCatalogRow | null> {
  const slug = companyCatalogKey(entry.display_name);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('company_catalog')
    .upsert(
      {
        slug,
        display_name: entry.display_name,
        region: entry.region,
        source: entry.source,
        patterns: entry.patterns,
        is_listed: entry.is_listed ?? false,
      },
      { onConflict: 'slug' },
    )
    .select('*')
    .single();
  if (error) {
    console.error('[company-catalog] insert failed:', error.message);
    return null;
  }
  return data as CompanyCatalogRow;
}
