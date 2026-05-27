/**
 * POST /api/match/[id]/apply-callback
 *
 * Called by the Python browser agent when an application completes.
 * Updates the match row with the final status and log.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Simple secret check to prevent random POSTs
  const secret = req.headers.get('x-api-secret');
  const expectedSecret = process.env.INGEST_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { success, result, error, logs } = body as {
    success?: boolean;
    result?: string;
    error?: string;
    logs?: string[];
  };

  const sb = supabaseAdmin();

  const update: Record<string, unknown> = {
    auto_apply_finished_at: new Date().toISOString(),
    auto_apply_log: logs ? logs.join('\n') : (result ?? error ?? ''),
    auto_apply_status: success ? 'done' : 'failed',
  };

  // If successful, also mark the match as applied
  if (success) {
    update.status = 'applied';
    update.applied_at = new Date().toISOString();
  }

  const { error: dbErr } = await sb.from('matches').update(update).eq('id', id);
  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
