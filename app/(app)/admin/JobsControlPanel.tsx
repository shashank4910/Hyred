'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Database, Trash2, Archive, RotateCcw, Loader2,
  AlertTriangle, CheckCircle2, RefreshCw,
} from 'lucide-react';

type ControlStats = {
  jobsCount: number;
  matchesCount: number;
  hasBackup: boolean;
  backupJobsCount: number;
  backupMatchesCount: number;
  backupUpdatedAt: string | null;
};

export function JobsControlPanel() {
  const [stats, setStats] = useState<ControlStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/jobs-control');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load control stats');
      setStats(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  async function handleAction(action: 'backup_delete' | 'restore' | 'delete_only' | 'delete_backup') {
    let confirmationMsg = '';
    if (action === 'backup_delete') {
      confirmationMsg = 'Are you sure you want to BACKUP and DELETE all jobs and matches? This will empty all user dashboard feeds, but you can restore them anytime.';
    } else if (action === 'restore') {
      confirmationMsg = 'Are you sure you want to RESTORE all jobs and matches from the backup? This will merge them back into the active tables.';
    } else if (action === 'delete_only') {
      confirmationMsg = '⚠️ DANGER: Are you sure you want to delete all jobs and matches WITHOUT a backup? This is permanent unless you run a fresh scan.';
    } else if (action === 'delete_backup') {
      confirmationMsg = 'Are you sure you want to delete the backup file permanently?';
    }

    if (confirmationMsg && !confirm(confirmationMsg)) return;

    setActionLoading(action);
    try {
      const res = await fetch('/api/admin/jobs-control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      toast.success(data.message || 'Action executed successfully');
      fetchStats();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <section className="glass-card p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h2 className="font-headline text-headline-md font-bold text-on-background flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" /> Database Lifecycle & Scan Controls
        </h2>
        <button
          onClick={fetchStats}
          disabled={loading || !!actionLoading}
          className="btn text-xs"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh Status
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-error-container text-on-error-container text-sm mb-4">
          <p className="font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Failed to load status
          </p>
          <p className="text-xs mt-1 font-mono">{error}</p>
        </div>
      )}

      {!error && stats && (
        <div className="space-y-6">
          {/* Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Active System State */}
            <div className="rounded-xl border border-border-muted p-4 bg-surface-card space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success-green animate-pulse" /> Active Environment
              </h3>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <div className="text-[10px] text-on-surface-variant">Active Jobs</div>
                  <div className="text-2xl font-bold text-on-background">{stats.jobsCount}</div>
                </div>
                <div>
                  <div className="text-[10px] text-on-surface-variant">Active Matches</div>
                  <div className="text-2xl font-bold text-primary">{stats.matchesCount}</div>
                </div>
              </div>
              <p className="text-[10px] text-on-surface-variant pt-1">
                These are the live jobs and matches fetched from JSearch/Adzuna and scored via LLM.
              </p>
            </div>

            {/* Backup Status */}
            <div className="rounded-xl border border-border-muted p-4 bg-surface-card space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
                <Archive className="h-3.5 w-3.5 text-secondary" /> Backup Status
              </h3>
              {stats.hasBackup ? (
                <>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <div className="text-[10px] text-on-surface-variant">Backed Up Jobs</div>
                      <div className="text-2xl font-bold text-on-background">{stats.backupJobsCount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-on-surface-variant">Backed Up Matches</div>
                      <div className="text-2xl font-bold text-secondary">{stats.backupMatchesCount}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-on-surface-variant pt-1 flex items-center justify-between">
                    <span>Last Saved: {new Date(stats.backupUpdatedAt!).toLocaleString()}</span>
                    <button
                      onClick={() => handleAction('delete_backup')}
                      disabled={!!actionLoading}
                      className="text-error hover:underline"
                    >
                      Delete Backup
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-4 flex flex-col items-center justify-center text-center">
                  <Archive className="h-8 w-8 text-outline mb-1 opacity-50" />
                  <p className="text-xs text-on-surface-variant font-medium">No Backup Found</p>
                  <p className="text-[10px] text-on-surface-variant mt-0.5">
                    Click &quot;Backup and Delete All&quot; to save current state.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={() => handleAction('backup_delete')}
              disabled={!!actionLoading || stats.jobsCount === 0}
              className="btn-error text-xs flex items-center gap-1.5"
            >
              {actionLoading === 'backup_delete' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Backup and Delete All Jobs/Matches
            </button>

            <button
              onClick={() => handleAction('restore')}
              disabled={!!actionLoading || !stats.hasBackup}
              className="btn-primary text-xs flex items-center gap-1.5"
              style={{ backgroundColor: stats.hasBackup ? 'var(--md-sys-color-primary)' : undefined }}
            >
              {actionLoading === 'restore' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Restore Backup to Active
            </button>

            <button
              onClick={() => handleAction('delete_only')}
              disabled={!!actionLoading || stats.jobsCount === 0}
              className="btn text-xs border-error/50 text-error hover:bg-error-container/20 flex items-center gap-1.5"
            >
              {actionLoading === 'delete_only' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              Delete Active (No Backup)
            </button>
          </div>

          <div className="rounded-lg bg-surface-container border border-border-muted p-4 text-xs text-on-surface-variant space-y-2">
            <div className="font-semibold text-on-background flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success-green" /> Testing Workflow Guidelines
            </div>
            <p>
              To safely test scan adjustments or skill matching bugs:
            </p>
            <ol className="list-decimal pl-5 space-y-1 mt-1">
              <li>Click <strong>Backup and Delete All Jobs/Matches</strong> to store current records safely.</li>
              <li>Active tables are now completely cleared.</li>
              <li>Perform your test scan from the dashboard (this will generate fresh records using the updated code).</li>
              <li>Once verification is done, click <strong>Restore Backup to Active</strong> to return back to your original data.</li>
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
