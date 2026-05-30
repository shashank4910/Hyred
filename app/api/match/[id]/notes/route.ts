import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { notes?: string };
  if (typeof body.notes !== 'string') {
    return NextResponse.json({ error: 'notes required' }, { status: 400 });
  }

  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from('matches')
    .update({ notes: body.notes.slice(0, 5000) })
    .eq('id', id)
    .eq('profile_id', profile.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
