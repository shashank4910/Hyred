import { NextRequest, NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/lib/current-user';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/admin/jobs-control
 * Returns counts of active jobs, matches, and backup status.
 */
export async function GET(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();

  try {
    // 1. Fetch active counts
    const { count: jobsCount, error: jobsErr } = await sb
      .from('jobs')
      .select('*', { count: 'exact', head: true });

    const { count: matchesCount, error: matchesErr } = await sb
      .from('matches')
      .select('*', { count: 'exact', head: true });

    if (jobsErr || matchesErr) {
      throw new Error(jobsErr?.message || matchesErr?.message || 'Failed to fetch active counts');
    }

    // 2. Fetch backup status
    const { data: backupData, error: backupErr } = await sb
      .from('admin_settings')
      .select('value, updated_at')
      .eq('key', 'system_backup')
      .maybeSingle();

    if (backupErr) {
      throw new Error(backupErr.message);
    }

    const backupVal = backupData?.value as { jobs?: any[]; matches?: any[] } | null;
    const hasBackup = !!backupVal;
    const backupJobsCount = backupVal?.jobs?.length ?? 0;
    const backupMatchesCount = backupVal?.matches?.length ?? 0;
    const backupUpdatedAt = backupData?.updated_at || null;

    return NextResponse.json({
      jobsCount: jobsCount ?? 0,
      matchesCount: matchesCount ?? 0,
      hasBackup,
      backupJobsCount,
      backupMatchesCount,
      backupUpdatedAt,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/admin/jobs-control
 * Handles backup, delete, and restore actions.
 */
export async function POST(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();

  try {
    const body = await req.json();
    const { action } = body as { action: 'backup_delete' | 'restore' | 'delete_only' | 'delete_backup' | 'get_debug_logs' };

    if (!action || !['backup_delete', 'restore', 'delete_only', 'delete_backup', 'get_debug_logs'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (action === 'get_debug_logs') {
      const { data: runs } = await sb
        .from('ingest_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      const { count: missingEmbedCount } = await sb
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .is('embedding', null);

      const { data: profiles } = await sb
        .from('profiles')
        .select('id, email, resume_text, insights');

      return NextResponse.json({
        runs,
        missingEmbedCount: missingEmbedCount ?? 0,
        profiles,
      });
    }

    if (action === 'backup_delete') {
      // 1. Fetch all active jobs
      const { data: jobs, error: jobsErr } = await sb
        .from('jobs')
        .select('*');
      if (jobsErr) throw new Error(`Fetch jobs failed: ${jobsErr.message}`);

      // 2. Fetch all active matches
      const { data: matches, error: matchesErr } = await sb
        .from('matches')
        .select('*');
      if (matchesErr) throw new Error(`Fetch matches failed: ${matchesErr.message}`);

      // 3. Save backup to admin_settings
      const { error: backupErr } = await sb
        .from('admin_settings')
        .upsert({
          key: 'system_backup',
          value: { jobs: jobs ?? [], matches: matches ?? [] },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
      if (backupErr) throw new Error(`Save backup failed: ${backupErr.message}`);

      // 4. Delete active records (matches first to respect FK, though cascade is set)
      const { error: delMatchesErr } = await sb
        .from('matches')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (delMatchesErr) throw new Error(`Delete matches failed: ${delMatchesErr.message}`);

      const { error: delJobsErr } = await sb
        .from('jobs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (delJobsErr) throw new Error(`Delete jobs failed: ${delJobsErr.message}`);

      return NextResponse.json({
        ok: true,
        message: `Successfully backed up and deleted ${jobs?.length ?? 0} jobs and ${matches?.length ?? 0} matches.`,
      });
    }

    if (action === 'restore') {
      // 1. Fetch backup
      const { data: backupData, error: backupErr } = await sb
        .from('admin_settings')
        .select('value')
        .eq('key', 'system_backup')
        .maybeSingle();
      if (backupErr) throw new Error(`Fetch backup failed: ${backupErr.message}`);

      const backupVal = backupData?.value as { jobs?: any[]; matches?: any[] } | null;
      if (!backupVal || (!backupVal.jobs && !backupVal.matches)) {
        return NextResponse.json({ error: 'No backup found to restore' }, { status: 400 });
      }

      const jobsToRestore = backupVal.jobs ?? [];
      const matchesToRestore = backupVal.matches ?? [];

      // 2. Restore jobs in chunks of 100
      const jobChunkSize = 100;
      for (let i = 0; i < jobsToRestore.length; i += jobChunkSize) {
        const chunk = jobsToRestore.slice(i, i + jobChunkSize);
        // Upsert to handle any overlapping records
        const { error: restoreJobsErr } = await sb
          .from('jobs')
          .upsert(chunk, { onConflict: 'source,source_id' });
        if (restoreJobsErr) throw new Error(`Restoring jobs chunk failed: ${restoreJobsErr.message}`);
      }

      // 3. Restore matches in chunks of 100
      const matchChunkSize = 100;
      for (let i = 0; i < matchesToRestore.length; i += matchChunkSize) {
        const chunk = matchesToRestore.slice(i, i + matchChunkSize);
        // Upsert matches
        const { error: restoreMatchesErr } = await sb
          .from('matches')
          .upsert(chunk, { onConflict: 'profile_id,job_id' });
        if (restoreMatchesErr) throw new Error(`Restoring matches chunk failed: ${restoreMatchesErr.message}`);
      }

      return NextResponse.json({
        ok: true,
        message: `Successfully restored ${jobsToRestore.length} jobs and ${matchesToRestore.length} matches from backup.`,
      });
    }

    if (action === 'delete_only') {
      const { error: delMatchesErr } = await sb
        .from('matches')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (delMatchesErr) throw new Error(`Delete matches failed: ${delMatchesErr.message}`);

      const { error: delJobsErr } = await sb
        .from('jobs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (delJobsErr) throw new Error(`Delete jobs failed: ${delJobsErr.message}`);

      return NextResponse.json({
        ok: true,
        message: 'Successfully deleted all jobs and matches without backing up.',
      });
    }

    if (action === 'delete_backup') {
      const { error: delBackupErr } = await sb
        .from('admin_settings')
        .delete()
        .eq('key', 'system_backup');
      if (delBackupErr) throw new Error(`Delete backup failed: ${delBackupErr.message}`);

      return NextResponse.json({
        ok: true,
        message: 'Successfully deleted the backup file.',
      });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
