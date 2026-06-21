import { companyCatalogKey, getCompanyCatalog } from '@/lib/top-companies';
import type { CatalogRegion, CatalogSeedEntry, CatalogSource } from './types';
import { patternsFromDisplayName } from './match';
import {
  AMERICAS_LISTED_NAMES,
  APAC_LISTED_NAMES,
  EUROPE_LISTED_NAMES,
  INDIA_LISTED_NAMES,
  LATAM_LISTED_NAMES,
  MEA_LISTED_NAMES,
  UNLISTED_MAJOR_NAMES,
} from './exchange-name-lists';

function mapLegacyCategory(
  category: string,
): { region: CatalogRegion; source: CatalogSource } {
  switch (category) {
    case 'indian_mnc':
    case 'unicorn_india':
      return { region: 'india', source: 'static' };
    case 'fortune500_finance':
      return { region: 'americas', source: 'static' };
    case 'big4_consulting':
      return { region: 'global', source: 'static' };
    case 'global_product':
      return { region: 'global', source: 'static' };
    default:
      return { region: 'americas', source: 'static' };
  }
}

function entryFromName(
  name: string,
  region: CatalogRegion,
  source: CatalogSource,
  exchange?: string,
  listed = source !== 'unlisted',
): CatalogSeedEntry {
  return {
    slug: companyCatalogKey(name),
    display_name: name,
    region,
    source,
    patterns: patternsFromDisplayName(name),
    exchange: exchange ?? null,
    ticker: null,
    is_listed: listed,
  };
}

function bulkEntries(
  names: string[],
  region: CatalogRegion,
  source: CatalogSource,
  exchange?: string,
): CatalogSeedEntry[] {
  const seen = new Set<string>();
  const out: CatalogSeedEntry[] = [];
  for (const name of names) {
    const slug = companyCatalogKey(name);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(entryFromName(name, region, source, exchange, source !== 'unlisted'));
  }
  return out;
}

/** All seed entries (~500–800) — Tier A legacy list + Tier B exchange/unlisted buckets. */
export function buildCompanyCatalogSeed(): CatalogSeedEntry[] {
  const seen = new Set<string>();
  const merged: CatalogSeedEntry[] = [];

  function add(entry: CatalogSeedEntry) {
    if (seen.has(entry.slug)) return;
    seen.add(entry.slug);
    merged.push(entry);
  }

  for (const c of getCompanyCatalog()) {
    const { region, source } = mapLegacyCategory(c.category);
    add({
      slug: companyCatalogKey(c.name),
      display_name: c.name,
      region,
      source,
      patterns: c.patterns.map((p) => p.toLowerCase().trim()),
      is_listed: source !== 'unlisted',
    });
  }

  for (const e of bulkEntries(INDIA_LISTED_NAMES, 'india', 'exchange', 'NSE/BSE')) add(e);
  for (const e of bulkEntries(AMERICAS_LISTED_NAMES, 'americas', 'exchange', 'NYSE/NASDAQ')) add(e);
  for (const e of bulkEntries(EUROPE_LISTED_NAMES, 'europe', 'exchange', 'LSE/Euronext/DAX')) add(e);
  for (const e of bulkEntries(APAC_LISTED_NAMES, 'apac', 'exchange', 'APAC')) add(e);
  for (const e of bulkEntries(MEA_LISTED_NAMES, 'mea', 'exchange', 'MEA')) add(e);
  for (const e of bulkEntries(LATAM_LISTED_NAMES, 'latam', 'exchange', 'LatAm')) add(e);
  for (const e of bulkEntries(UNLISTED_MAJOR_NAMES, 'unlisted', 'unlisted')) add(e);

  return merged;
}

export function getSeedEntryCount(): number {
  return buildCompanyCatalogSeed().length;
}
