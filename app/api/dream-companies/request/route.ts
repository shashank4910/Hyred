import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { patternsFromDisplayName } from '@/lib/company-catalog/match';

export const runtime = 'nodejs';

/** POST { requested_name, note? } — ask admin to add to global catalog (Tier C) */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const requestedName = typeof body.requested_name === 'string' ? body.requested_name.trim() : '';
  if (requestedName.length < 2 || requestedName.length > 120) {
    return NextResponse.json({ error: 'Enter a valid company name (2–120 chars)' }, { status: 400 });
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null;
  const patterns = patternsFromDisplayName(requestedName);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('company_catalog_requests')
    .insert({
      profile_id: profile.id,
      requested_name: requestedName,
      requested_patterns: patterns,
      note,
    })
    .select('id, requested_name, status, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    request: data,
    message: 'Request submitted. You can still add this company manually to your dream list now.',
  });
}

/** GET — user's own requests */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('company_catalog_requests')
    .select('id, requested_name, status, note, created_at, reviewed_at')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}
