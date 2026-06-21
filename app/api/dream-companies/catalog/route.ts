import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/current-user';
import { ensureCompanyCatalogSeeded, searchCompanyCatalog } from '@/lib/company-catalog/db';
import { REGION_LABELS, SOURCE_LABELS, type CatalogRegion } from '@/lib/company-catalog/types';

export const runtime = 'nodejs';

const REGIONS = new Set(Object.keys(REGION_LABELS));

/** GET ?q=google&region=india&limit=40 */
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') ?? undefined;
  const regionRaw = sp.get('region');
  const region = regionRaw && REGIONS.has(regionRaw) ? (regionRaw as CatalogRegion) : undefined;
  const limit = Number(sp.get('limit') ?? 40);

  const { total } = await ensureCompanyCatalogSeeded();
  const results = await searchCompanyCatalog({ q, region, limit });

  return NextResponse.json({
    total,
    results: results.map((r) => ({
      key: r.slug,
      name: r.display_name,
      region: r.region,
      region_label: REGION_LABELS[r.region as CatalogRegion] ?? r.region,
      source: r.source,
      source_label: SOURCE_LABELS[r.source as keyof typeof SOURCE_LABELS] ?? r.source,
      is_listed: r.is_listed,
      exchange: r.exchange,
      ticker: r.ticker,
    })),
    regions: Object.entries(REGION_LABELS).map(([id, label]) => ({ id, label })),
  });
}
