import { supabaseAdmin } from '@/lib/supabase/server';
import { relativeTime, SOURCE_LABELS } from '@/lib/ui';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Clock,
  Activity,
  Database,
  Briefcase,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stats · JobRadar' };

export default async function StatsPage() {
  const sb = supabaseAdmin();

  const [
    { count: totalJobs },
    { count: totalMatches },
    { count: appliedCount },
    { data: runs },
    { data: bySourceRaw },
  ] = await Promise.all([
    sb.from('jobs').select('id', { count: 'exact', head: true }),
    sb.from('matches').select('id', { count: 'exact', head: true }),
    sb.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'applied'),
    sb.from('ingest_runs')
      .select('id, started_at, finished_at, duration_ms, fetched, new_jobs, embedded, scored, matches_created, errors, status, triggered_by')
      .order('started_at', { ascending: false })
      .limit(20),
    sb.from('jobs').select('source'),
  ]);

  const bySource: Record<string, number> = {};
  for (const r of bySourceRaw ?? []) {
    bySource[r.source as string] = (bySource[r.source as string] ?? 0) + 1;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-heading-sm font-semibold text-ink">Stats</h1>
        <p className="text-body-sm text-stone mt-1">Pipeline activity and source coverage.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Jobs in DB" value={totalJobs ?? 0} icon={<Database className="h-4 w-4" />} />
        <StatCard label="Total matches" value={totalMatches ?? 0} icon={<Briefcase className="h-4 w-4" />} />
        <StatCard label="Applied" value={appliedCount ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} accent />
        <StatCard label="Sources active" value={Object.keys(bySource).length} icon={<Activity className="h-4 w-4" />} />
      </div>

      {/* Jobs by source */}
      <div className="card">
        <h2 className="text-body font-semibold text-ink mb-5">Jobs by source</h2>
        {Object.keys(bySource).length === 0 ? (
          <p className="text-body-sm text-stone">No jobs yet. Run a scan.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(bySource)
              .sort((a, b) => b[1] - a[1])
              .map(([source, count]) => {
                const total = totalJobs ?? 1;
                const pct = (count / total) * 100;
                return (
                  <div key={source}>
                    <div className="flex items-center justify-between text-body-sm mb-1">
                      <span className="text-ink font-medium">{SOURCE_LABELS[source] ?? source}</span>
                      <span className="text-stone tabular-nums">{count.toLocaleString()} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 rounded-badge bg-off-white overflow-hidden">
                      <div className="h-full bg-amber rounded-badge transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Ingest runs table */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-4 w-4 text-amber" />
          <h2 className="text-body font-semibold text-ink">Recent ingest runs</h2>
        </div>
        <p className="text-caption text-stone mb-5">
          Pipeline time excludes GitHub Actions overhead (checkout, setup, npm install).
        </p>

        {(runs ?? []).length === 0 ? (
          <p className="text-body-sm text-stone">No runs yet.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Status</th>
                  <th className="text-right">Fetched</th>
                  <th className="text-right">New</th>
                  <th className="text-right">Scored</th>
                  <th className="text-right">Kept</th>
                  <th className="text-right">Duration</th>
                  <th>Trigger</th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="text-stone whitespace-nowrap">{relativeTime(r.started_at)}</td>
                    <td><RunStatus status={r.status} errors={r.errors} /></td>
                    <td className="text-right tabular-nums">{r.fetched}</td>
                    <td className="text-right tabular-nums">{r.new_jobs}</td>
                    <td className="text-right tabular-nums">{r.scored}</td>
                    <td className="text-right tabular-nums font-medium text-amber">{r.matches_created}</td>
                    <td className="text-right tabular-nums text-stone">
                      {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="text-stone">{r.triggered_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label, value, icon, accent,
}: {
  label: string; value: number; icon: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <span className="text-caption text-stone">{label}</span>
        <span className={accent ? 'text-amber' : 'text-shadow-tint'}>{icon}</span>
      </div>
      <div className={`mt-2 text-heading-sm font-semibold tabular-nums ${accent ? 'text-amber' : 'text-ink'}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function RunStatus({ status, errors }: { status: string; errors: { source: string; error: string }[] | null }) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption font-medium text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" /> Success
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-caption font-medium text-sunset-orange"
        title={(errors ?? []).map((e) => `${e.source}: ${e.error}`).join('\n')}
      >
        <AlertTriangle className="h-3.5 w-3.5" /> Partial ({(errors ?? []).length})
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption font-medium text-warning-red">
        <XCircle className="h-3.5 w-3.5" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-stone">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running
    </span>
  );
}
