import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';

export const runtime = 'nodejs';

/**
 * Cancel a running ingest scan for the current user.
 * Sets the ingest_run status to 'cancelled' — the pipeline checks this
 * flag between stages and aborts early if set.
 */
export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const sb = supabaseAdmin();

  // Find the currently running scan for this user
  const { data: activeRun } = await sb
    .from('ingest_runs')
    .select('id, started_at')
    .eq('profile_id', profile.id)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeRun) {
    return NextResponse.json({ error: 'No active scan to cancel' }, { status: 404 });
  }

  const startedMs = new Date(activeRun.started_at).getTime();

  // Mark as cancelled — the ingest pipeline checks for this status between steps
  const { error } = await sb
    .from('ingest_runs')
    .update({
      status: 'cancelled',
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedMs,
      errors: [{ source: 'user', error: 'Scan cancelled by user.' }],
    })
    .eq('id', activeRun.id)
    .eq('status', 'running'); // Only cancel if still running (race-safe)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cancelled_run_id: activeRun.id });
}
