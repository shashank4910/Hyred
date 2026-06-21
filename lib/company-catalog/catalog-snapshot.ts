import { buildCompanyCatalogSeed } from './build-seed';
import { REGION_LABELS, SOURCE_LABELS, type CatalogRegion, type CatalogSeedEntry } from './types';

export type CatalogUiItem = {
  key: string;
  name: string;
  region: CatalogRegion;
  region_label: string;
  source_label: string;
  is_listed: boolean;
  exchange?: string | null;
  /** Used for instant client search (aliases like tcs → TCS). */
  patterns: string[];
};

let snapshotCache: CatalogUiItem[] | null = null;

function seedToUi(entry: CatalogSeedEntry): CatalogUiItem {
  return {
    key: entry.slug,
    name: entry.display_name,
    region: entry.region,
    region_label: REGION_LABELS[entry.region],
    source_label: SOURCE_LABELS[entry.source],
    is_listed: entry.is_listed ?? true,
    exchange: entry.exchange,
    patterns: entry.patterns,
  };
}

/** Full catalog for UI — built once in memory (fast, no DB round-trip). */
export function getCatalogSnapshot(): CatalogUiItem[] {
  if (!snapshotCache) {
    snapshotCache = buildCompanyCatalogSeed().map(seedToUi);
  }
  return snapshotCache;
}

export function getCatalogRegionOptions() {
  return Object.entries(REGION_LABELS).map(([id, label]) => ({ id, label }));
}

/** Instant filter — matches display name, slug, and alias patterns. */
export function filterCatalogSnapshot(args: {
  catalog?: CatalogUiItem[];
  q?: string;
  region?: string;
  excludeKeys?: Set<string>;
  limit?: number;
}): CatalogUiItem[] {
  const catalog = args.catalog ?? getCatalogSnapshot();
  const limit = args.limit ?? 60;
  const q = args.q?.trim().toLowerCase() ?? '';

  let list = catalog;
  if (args.excludeKeys?.size) {
    list = list.filter((c) => !args.excludeKeys!.has(c.key));
  }
  if (args.region) {
    list = list.filter((c) => c.region === args.region);
  }
  if (q) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.key.includes(q) ||
        c.patterns.some((p) => p.includes(q)),
    );
  }
  return list.slice(0, limit);
}

export function findSeedEntryBySlug(slug: string): CatalogSeedEntry | null {
  const normalized = slug.trim().toLowerCase();
  return buildCompanyCatalogSeed().find((e) => e.slug === normalized) ?? null;
}
