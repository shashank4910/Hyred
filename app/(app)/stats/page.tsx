import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
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
  const profile = await getCurrentProfile();
  const profileId = profile?.id ?? '__none__';

  const [
    { count: totalJobs },
    { count: totalMatches },
    { count: appliedCount },
    { data: runs },
    { data: bySourceRaw },
  ] = await Promise.all([
    sb.from('jobs').select('id', { count: 'exact', head: true }),
    sb
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId),
    sb
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('status', 'applied'),
    sb
      .from('ingest_runs')
      .select(
        'id, started_at, finished_at, duration_ms, fetched, new_jobs, embedded, scored, matches_created, errors, status, triggered_by',
      )
      .eq('profile_id', profileId)
      .order('started_at', { ascending: false })
      .limit(20),
    sb.from('jobs').select('source'),
  ]);

  const bySource: Record<string, number> = {};
  for (const r of bySourceRaw ?? []) {
    bySource[r.source as string] = (bySource[r.source as string] ?? 0) + 1;
  }


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-sm font-semibold text-ink">Stats</h1>
        <p className="text-body-sm text-stone mt-1">
          Pipeline activity and source coverage.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <BigStat label="Jobs in DB" value={totalJobs ?? 0} icon={<Database className="h-4 w-4" />} />
        <BigStat label="Total matches" value={totalMatches ?? 0} icon={<Briefcase className="h-4 w-4" />} />
        <BigStat label="Applied" value={appliedCount ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} accent />
        <BigStat label="Sources active" value={Object.keys(bySource).length} icon={<Activity className="h-4 w-4" />} />
      </div>

      <section className="card">
        <h2 className="font-semibold text-ink mb-3">Jobs by source</h2>
        {Object.keys(bySource).length === 0 ? (
          <p className="text-sm text-stone">No jobs yet. Run a scan.</p>
        ) : (
          <ul className="space-y-2.5">
            {Object.entries(bySource)
              .sort((a, b) => b[1] - a[1])
              .map(([source, count]) => {
                const total = totalJobs ?? 1;
                const pct = (count / total) * 100;
                return (
                  <li key={source}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink">{SOURCE_LABELS[source] ?? source}</span>
                      <span className="text-stone">
                        {count.toLocaleString()} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-off-white overflow-hidden">
                      <div className="h-full bg-amber rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>


      <section className="card">
        <h2 className="font-semibold text-ink mb-1 flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber" /> Recent ingest runs
        </h2>
        <p className="text-xs text-stone mb-3">
          Pipeline time = fetch + embed + score + persist. GitHub Actions
          adds ~20–30s overhead for checkout, setup-node, and npm install.
        </p>
        {(runs ?? []).length === 0 ? (
          <p className="text-sm text-stone">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-stone text-xs border-b border-border">
                  <th className="py-2 text-left font-medium">When</th>
                  <th className="py-2 text-left font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Fetched</th>
                  <th className="py-2 text-right font-medium">New</th>
                  <th className="py-2 text-right font-medium">Scored</th>
                  <th className="py-2 text-right font-medium">Kept</th>
                  <th className="py-2 text-right font-medium" title="Pipeline execution time">Pipeline time</th>
                  <th className="py-2 text-left font-medium">Trigger</th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-faded-stone/50 last:border-0">
                    <td className="py-2 text-xs text-stone">{relativeTime(r.started_at)}</td>
                    <td className="py-2"><RunStatus status={r.status} errors={r.errors} /></td>
                    <td className="py-2 text-right tabular-nums text-ink">{r.fetched}</td>
                    <td className="py-2 text-right tabular-nums text-ink">{r.new_jobs}</td>
                    <td className="py-2 text-right tabular-nums text-ink">{r.scored}</td>
                    <td className="py-2 text-right tabular-nums text-amber font-medium">{r.matches_created}</td>
                    <td className="py-2 text-right tabular-nums text-stone">
                      {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="py-2 text-xs text-stone">{r.triggered_by}</td>
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
      <div className="flex items-center justify-between text-caption text-stone">
        <span>{label}</span>
        <span className={accent ? 'text-amber' : 'text-shadow-tint'}>{icon}</span>
      </div>
      <div className={`mt-1.5 text-heading-sm font-semibold ${accent ? 'text-amber' : 'text-ink'}`}>
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
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        success
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-amber-hover font-medium"
        title={(errors ?? []).map((e) => `${e.source}: ${e.error}`).join('\n')}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        partial ({(errors ?? []).length})
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warning-red font-medium">
        <XCircle className="h-3.5 w-3.5" />
        failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-stone">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      running
    </span>
  );
}
