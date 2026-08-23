import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Public job detail API — no authentication required.
 * Enables AI agents to fetch full job details including description.
 *
 * GET /api/explore/job/{id}
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: job, error } = await sb
    .from('jobs')
    .select('id, title, company, location, remote, url, source, salary, description, posted_at, fetched_at, tags')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, job });
}
