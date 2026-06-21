import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile, isCurrentUserAdmin } from '@/lib/current-user';
import { insertCatalogEntry } from '@/lib/company-catalog/db';
import type { CatalogRegion } from '@/lib/company-catalog/types';

export const runtime = 'nodejs';

/** GET — pending catalog requests (admin) */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('company_catalog_requests')
    .select(
      `id, requested_name, requested_patterns, note, status, created_at, profile_id,
       profiles(email, full_name)`,
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

/** PATCH — approve or reject `{ id, action: 'approve'|'reject', region?, reviewer_note? }` */
export async function PATCH(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile || !(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
  if (!id || !action) {
    return NextResponse.json({ error: 'id and action (approve|reject) required' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: reqRow, error: fetchErr } = await sb
    .from('company_catalog_requests')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending')
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  if (action === 'reject') {
    const { error } = await sb
      .from('company_catalog_requests')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewer_note: typeof body.reviewer_note === 'string' ? body.reviewer_note.slice(0, 500) : null,
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  const region = (typeof body.region === 'string' ? body.region : 'global') as CatalogRegion;
  const catalog = await insertCatalogEntry({
    display_name: reqRow.requested_name as string,
    region,
    source: 'approved_request',
    patterns: (reqRow.requested_patterns as string[]) ?? [],
    is_listed: false,
  });

  if (!catalog) {
    return NextResponse.json({ error: 'Failed to create catalog entry' }, { status: 500 });
  }

  const { error: updErr } = await sb
    .from('company_catalog_requests')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      catalog_id: catalog.id,
      reviewer_note: typeof body.reviewer_note === 'string' ? body.reviewer_note.slice(0, 500) : null,
    })
    .eq('id', id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: 'approved', catalog });
}
