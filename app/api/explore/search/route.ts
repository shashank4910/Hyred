import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Public job search API — no authentication required.
 * Enables AI agents, ChatGPT plugins, and external tools to search Hyred's job database.
 *
 * GET /api/explore/search?q=performance+test&source=linkedin&page=1
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const query = sp.get('q')?.trim() || '';
  const source = sp.get('source')?.trim() || '';
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = 24;
  const offset = (page - 1) * pageSize;

  const sb = supabaseAdmin();

  let queryBuilder = sb
    .from('jobs')
    .select('id, title, company, location, remote, source, salary, posted_at, tags, url', { count: 'exact' })
    .order('posted_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (query) {
    queryBuilder = queryBuilder.or(
      `title.ilike.%${query}%,company.ilike.%${query}%,description.ilike.%${query}%`,
    );
  }
  if (source) {
    queryBuilder = queryBuilder.eq('source', source);
  }

  const { data: jobs, count, error } = await queryBuilder;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const totalPages = Math.ceil((count ?? 0) / pageSize);

  return NextResponse.json({
    ok: true,
    jobs: jobs ?? [],
    total: count ?? 0,
    page,
    totalPages,
  });
}
