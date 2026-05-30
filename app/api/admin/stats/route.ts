import { NextRequest, NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/lib/current-user';
import { getUsageSummary } from '@/lib/api-tracker';

export const runtime = 'nodejs';

/**
 * GET /api/admin/stats — API usage stats for admin dashboard.
 * Returns per-source totals, per-key breakdown, and recent errors.
 */
export async function GET(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') ?? '30', 10);

  try {
    const summary = await getUsageSummary(Math.min(days, 90));
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, hint: 'Run the migration SQL to create api_request_logs table' },
      { status: 500 },
    );
  }
}
