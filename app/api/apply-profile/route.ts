import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';

export const runtime = 'nodejs';

/** GET — load the apply profile for the signed-in user */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 404 });

  const sb = supabaseAdmin();
  const { data } = await sb
    .from('apply_profiles')
    .select('*')
    .eq('profile_id', profile.id)
    .maybeSingle();

  // First visit: no apply_profiles row yet — seed identity from the user's profile
  // (never hard-coded owner defaults; those leaked PII in the client form).
  if (!data) {
    return NextResponse.json({
      profile_id: profile.id,
      email: profile.email ?? '',
      full_name: profile.full_name ?? '',
    });
  }

  return NextResponse.json(data);
}

/** POST — upsert the apply profile for the signed-in user */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 404 });

  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  // Strip client-side fields that should not be written directly
  // (id is auto-generated, created_at is immutable, profile_id is server-set)
  const {
    id: _id,
    created_at: _ca,
    updated_at: _ua,
    profile_id: _pid,
    ...rest
  } = body as Record<string, unknown>;

  const { error } = await sb
    .from('apply_profiles')
    .upsert(
      { ...rest, profile_id: profile.id, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
