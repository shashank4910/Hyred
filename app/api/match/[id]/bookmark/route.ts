import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { bookmarked?: boolean };

  if (typeof body.bookmarked !== 'boolean') {
    return NextResponse.json({ error: 'bookmarked must be a boolean' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from('matches')
    .update({ bookmarked: body.bookmarked })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, bookmarked: body.bookmarked });
}
