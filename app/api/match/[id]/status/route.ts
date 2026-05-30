import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';

export const runtime = 'nodejs';

const ALLOWED = new Set([
  'new',
  'viewed',
  'applied',
  'rejected',
  'interviewing',
  'offer',
  'closed',
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const status = body.status;
  if (!status || !ALLOWED.has(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const update: Record<string, unknown> = { status };
  if (status === 'applied') update.applied_at = new Date().toISOString();

  const { error } = await sb
    .from('matches')
    .update(update)
    .eq('id', id)
    .eq('profile_id', profile.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
