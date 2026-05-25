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
    sb
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'applied'),
    sb
      .from('ingest_runs')
      .select(
        'id, started_at, finished_at, duration_ms, fetched, new_jobs, embedded, scored, matches_created, errors, status, triggered_by',
      )
      .order('started_at', { ascending: false })
      .limit(20),
    sb.from('jobs').select('source'),
  ]);

  // Aggregate jobs by source in JS (small dataset)
  const bySource: Record<string, number> = {};
  for (const r of bySourceRaw ?? []) {
    bySource[r.source as string] = (bySource[r.source as string] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Stats</h1>
        <p className="text-sm text-muted">
          Pipeline activity and source coverage.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <BigStat
          label="Jobs in DB"
          value={totalJobs ?? 0}
          icon={<Database className="h-4 w-4" />}
        />
        <BigStat
          label="Total matches"
          value={totalMatches ?? 0}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <BigStat
          label="Applied"
          value={appliedCount ?? 0}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent
        />
        <BigStat
          label="Sources active"
          value={Object.keys(bySource).length}
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      <section className="card">
        <h2 className="font-semibold mb-3">Jobs by source</h2>
        {Object.keys(bySource).length === 0 ? (
          <p className="text-sm text-muted">No jobs yet. Run a scan.</p>
        ) : (
          <ul className="space-y-2">
            {Object.entries(bySource)
              .sort((a, b) => b[1] - a[1])
              .map(([source, count]) => {
                const total = totalJobs ?? 1;
                const pct = (count / total) * 100;
                return (
                  <li key={source}>
                    <div className="flex items-center justify-between text-sm">
                      <span>{SOURCE_LABELS[source] ?? source}</span>
                      <span className="text-muted">
                        {count.toLocaleString()} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-bg overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Recent ingest runs
        </h2>
        {(runs ?? []).length === 0 ? (
          <p className="text-sm text-muted">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-muted text-xs border-b border-border">
                  <th className="py-2 text-left font-normal">When</th>
                  <th className="py-2 text-left font-normal">Status</th>
                  <th className="py-2 text-right font-normal">Fetched</th>
                  <th className="py-2 text-right font-normal">New</th>
                  <th className="py-2 text-right font-normal">Scored</th>
                  <th className="py-2 text-right font-normal">Kept</th>
                  <th className="py-2 text-right font-normal">Duration</th>
                  <th className="py-2 text-left font-normal">Trigger</th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 text-xs">
                      {relativeTime(r.started_at)}
                    </td>
                    <td className="py-2">
                      <RunStatus status={r.status} errors={r.errors} />
                    </td>
                    <td className="py-2 text-right tabular-nums">{r.fetched}</td>
                    <td className="py-2 text-right tabular-nums">{r.new_jobs}</td>
                    <td className="py-2 text-right tabular-nums">{r.scored}</td>
                    <td className="py-2 text-right tabular-nums text-primary">
                      {r.matches_created}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {r.duration_ms
                        ? `${(r.duration_ms / 1000).toFixed(1)}s`
                        : '—'}
                    </td>
                    <td className="py-2 text-xs text-muted">{r.triggered_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function BigStat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className={accent ? 'text-primary' : ''}>{icon}</span>
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${accent ? 'text-primary' : 'text-fg'}`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function RunStatus({
  status,
  errors,
}: {
  status: string;
  errors: { source: string; error: string }[] | null;
}) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        success
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-amber-400"
        title={(errors ?? []).map((e) => `${e.source}: ${e.error}`).join('\n')}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        partial ({(errors ?? []).length})
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-400">
        <XCircle className="h-3.5 w-3.5" />
        failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      running
    </span>
  );
}
