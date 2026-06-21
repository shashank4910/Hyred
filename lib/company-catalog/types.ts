export type CatalogRegion =
  | 'india'
  | 'americas'
  | 'europe'
  | 'apac'
  | 'mea'
  | 'latam'
  | 'global'
  | 'unlisted';

export type CatalogSource = 'static' | 'exchange' | 'unlisted' | 'approved_request' | 'manual';

export type CatalogSeedEntry = {
  slug: string;
  display_name: string;
  region: CatalogRegion;
  source: CatalogSource;
  patterns: string[];
  ticker?: string | null;
  exchange?: string | null;
  is_listed?: boolean;
};

export type CompanyCatalogRow = CatalogSeedEntry & {
  id: string;
  created_at: string;
};

export const REGION_LABELS: Record<CatalogRegion, string> = {
  india: 'India',
  americas: 'Americas',
  europe: 'Europe',
  apac: 'Asia-Pacific',
  mea: 'Middle East & Africa',
  latam: 'Latin America',
  global: 'Global',
  unlisted: 'Major unlisted',
};

export const SOURCE_LABELS: Record<CatalogSource, string> = {
  static: 'Curated',
  exchange: 'Listed (exchange)',
  unlisted: 'Major private',
  approved_request: 'Community approved',
  manual: 'Manual',
};
