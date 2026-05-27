import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** GET — load the apply profile for the first/only user */
export async function GET() {
  const sb = supabaseAdmin();
  const { data: profile } = await sb
    .from('profiles')
    .select('id')
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 404 });

  const { data } = await sb
    .from('apply_profiles')
    .select('*')
    .eq('profile_id', profile.id)
    .maybeSingle();

  return NextResponse.json(data ?? { profile_id: profile.id });
}

/** POST — upsert the apply profile */
export async function POST(req: NextRequest) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const { data: profile } = await sb
    .from('profiles')
    .select('id')
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 404 });

  // Strip client-side fields that should not be written directly
  // (id is auto-generated, created_at is immutable)
  const { id: _id, created_at: _ca, ...rest } = body as Record<string, unknown>;

  const { error } = await sb
    .from('apply_profiles')
    .upsert(
      { ...rest, profile_id: profile.id, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
