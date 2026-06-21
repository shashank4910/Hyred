import { NextRequest, NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/lib/current-user';
import { getJobApiUsageReport } from '@/lib/api-tracker';
import { JOB_API_SOURCES, type JobApiSource } from '@/lib/job-api-keys';

export const runtime = 'nodejs';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * GET /api/admin/job-api-usage
 * Query: from, to (YYYY-MM-DD), source (all|jsearch|jobspipe|adzuna_in),
 *        page, pageSize, eventsPage, eventsPageSize
 */
export async function GET(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from') || monthStartIso();
  const to = url.searchParams.get('to') || todayIso();
  const sourceParam = url.searchParams.get('source') || 'all';
  const source =
    sourceParam === 'all' || JOB_API_SOURCES.includes(sourceParam as JobApiSource)
      ? (sourceParam as JobApiSource | 'all')
      : 'all';

  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(url.searchParams.get('pageSize') ?? '10', 10);
  const eventsPage = parseInt(url.searchParams.get('eventsPage') ?? '1', 10);
  const eventsPageSize = parseInt(url.searchParams.get('eventsPageSize') ?? '15', 10);

  if (from > to) {
    return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 });
  }

  try {
    const report = await getJobApiUsageReport({
      from,
      to,
      source,
      keysPage: page,
      keysPageSize: pageSize,
      eventsPage,
      eventsPageSize,
    });
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
