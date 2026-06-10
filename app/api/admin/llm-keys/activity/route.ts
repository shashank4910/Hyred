import { NextRequest, NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/lib/current-user';
import { getRecentLlmActivity } from '@/lib/llm-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/llm-keys/activity — recent per-call LLM key activity (live log).
 */
export async function GET(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

  try {
    const entries = await getRecentLlmActivity(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, hint: 'Run migration 0009_llm_keys.sql in the Supabase SQL editor.' },
      { status: 500 },
    );
  }
}
