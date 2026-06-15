import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/extension/apply
 * Body: { match_id: string }
 * Marks the match as 'applied' and stamps applied_at.
 * Idempotent: re-running on an already-applied match is a no-op.
 */
export async function POST(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { match_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return corsResponse({ error: 'invalid body' }, { status: 400 });
  }
  const id = body.match_id;
  if (!id) {
    return corsResponse({ error: 'match_id required' }, { status: 400 });
  }
  const sb = supabaseAdmin();
  let updateQuery = sb
    .from('matches')
    .update({ status: 'applied', applied_at: new Date().toISOString() })
    .eq('id', id);
  if (auth.profile_id) {
    updateQuery = updateQuery.eq('profile_id', auth.profile_id);
  }
  const { error } = await updateQuery;
  if (error) {
    return corsResponse({ error: error.message }, { status: 500 });
  }
  return corsResponse({ ok: true });
}
