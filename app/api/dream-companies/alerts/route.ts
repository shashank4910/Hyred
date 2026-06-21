import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';

export const runtime = 'nodejs';

/** GET — recent dream-company alerts with match links */
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 30), 100);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('dream_company_alerts')
    .select(
      `id, job_id, match_id, job_title, company_name, read_at, created_at,
       dream_company:dream_companies!inner(company_display_name, company_key)`,
    )
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ alerts: data ?? [] });
}

/** PATCH — mark alerts read `{ alert_ids: string[], read?: boolean }` */
export async function PATCH(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.alert_ids)
    ? body.alert_ids.filter((x: unknown) => typeof x === 'string')
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'alert_ids required' }, { status: 400 });
  }

  const markRead = body.read !== false;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('dream_company_alerts')
    .update({ read_at: markRead ? new Date().toISOString() : null })
    .eq('profile_id', profile.id)
    .in('id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
