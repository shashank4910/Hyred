import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current-user';
import {
  filterCatalogSnapshot,
  getCatalogRegionOptions,
  getCatalogSnapshot,
} from '@/lib/company-catalog/catalog-snapshot';

export const runtime = 'nodejs';

const REGIONS = new Set(getCatalogRegionOptions().map((r) => r.id));

/** GET ?q=google&region=india&limit=40 — instant in-memory search */
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') ?? undefined;
  const regionRaw = sp.get('region');
  const region = regionRaw && REGIONS.has(regionRaw) ? regionRaw : undefined;
  const limit = Number(sp.get('limit') ?? 40);

  const catalog = getCatalogSnapshot();
  const results = filterCatalogSnapshot({ q, region, limit });

  return NextResponse.json({
    total: catalog.length,
    results: results.map((r) => ({
      key: r.key,
      name: r.name,
      region: r.region,
      region_label: r.region_label,
      source: r.source_label,
      source_label: r.source_label,
      is_listed: r.is_listed,
      exchange: r.exchange,
    })),
    regions: getCatalogRegionOptions(),
  });
}
