import { supabaseAdmin } from '@/lib/supabase/server';
import { companyCatalogKey } from '@/lib/top-companies';
import { buildCompanyCatalogSeed } from './build-seed';
import { filterCatalogSnapshot, findSeedEntryBySlug } from './catalog-snapshot';
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
  // Prefer in-memory seed (instant, always available even before migration 0017).
  const seedHits = filterCatalogSnapshot({
    q: args.q,
    region: args.region,
    limit: args.limit ?? 40,
  });

  const seedRows: CompanyCatalogRow[] = seedHits.map((c) => ({
    id: c.key,
    slug: c.key,
    display_name: c.name,
    region: c.region,
    source: 'static',
    patterns: c.patterns,
    ticker: null,
    exchange: c.exchange ?? null,
    is_listed: c.is_listed,
    created_at: '',
  }));

  // Merge DB-only entries (admin-approved) when table exists.
  try {
    await ensureCompanyCatalogSeeded();
    const sb = supabaseAdmin();
    const limit = Math.min(args.limit ?? 40, 80);
    let query = sb
      .from('company_catalog')
      .select('*')
      .eq('source', 'approved_request')
      .order('display_name', { ascending: true })
      .limit(limit);

    if (args.region) query = query.eq('region', args.region);
    if (args.q?.trim()) {
      const q = args.q.trim().replace(/[%_]/g, '');
      query = query.or(`display_name.ilike.%${q}%,slug.ilike.%${q}%`);
    }

    const { data } = await query;
    const extra = (data ?? []) as CompanyCatalogRow[];
    const seen = new Set(seedRows.map((r) => r.slug));
    for (const row of extra) {
      if (!seen.has(row.slug)) seedRows.push(row);
    }
  } catch {
    // DB unavailable — seed-only is fine for search.
  }

  return seedRows.slice(0, Math.min(args.limit ?? 40, 80));
}

export async function findCatalogBySlug(slug: string): Promise<CompanyCatalogRow | null> {
  const normalized = slug.trim().toLowerCase();
  const seed = findSeedEntryBySlug(normalized);
  if (seed) {
    return {
      id: seed.slug,
      slug: seed.slug,
      display_name: seed.display_name,
      region: seed.region,
      source: seed.source,
      patterns: seed.patterns,
      ticker: seed.ticker ?? null,
      exchange: seed.exchange ?? null,
      is_listed: seed.is_listed ?? true,
      created_at: '',
    };
  }

  try {
    await ensureCompanyCatalogSeeded();
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('company_catalog')
      .select('*')
      .eq('slug', normalized)
      .maybeSingle();
    return (data as CompanyCatalogRow | null) ?? null;
  } catch {
    return null;
  }
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
