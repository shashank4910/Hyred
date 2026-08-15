import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile, isCurrentUserAdmin } from '@/lib/current-user';
import { closeStaleIngestRuns } from '@/lib/ingest-runs';
import {
  countAllTracked,
  countByStatus,
  countVisibleInbox,
  countVisibleOnDashboard,
  dashboardMinScore,
} from '@/lib/match-stats';
import { relativeTime, SOURCE_LABELS, formatScanDuration } from '@/lib/ui';
import { PageHeader } from '../_components/PageHeader';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Clock,
  Sparkles,
  Briefcase,
  Inbox,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stats' };

export default async function StatsPage() {
  noStore();

  const sb = supabaseAdmin();
  const profile = await getCurrentProfile();
  const isAdmin = await isCurrentUserAdmin();
  const profileId = profile?.id ?? '__none__';

  if (profile?.id) {
    await closeStaleIngestRuns(sb, profile.id);
  }

  const minScore = dashboardMinScore(profile?.preferences);

  const [
    { count: totalTracked },
    { count: visibleCount },
    { count: inboxCount },
    { count: appliedCount },
    { data: runs },
    userMatchJobsResult,
    { data: lastRun },
    { data: activeRun },
  ] = await Promise.all([
    countAllTracked(sb, profileId).then((count) => ({ count })),
    countVisibleOnDashboard(sb, profileId, minScore).then((count) => ({
      count,
    })),
    countVisibleInbox(sb, profileId, minScore).then((count) => ({ count })),
    countByStatus(sb, profileId, 'applied').then((count) => ({ count })),
    sb
      .from('ingest_runs')
      .select(
        'id, started_at, finished_at, duration_ms, fetched, new_jobs, embedded, scored, matches_created, errors, status, triggered_by',
      )
      .eq('profile_id', profileId)
      .order('started_at', { ascending: false })
      .limit(20),
    isAdmin
      ? sb
          .from('matches')
          .select('job:jobs!inner(source)')
          .eq('profile_id', profileId)
      : Promise.resolve({ data: null }),
    sb
      .from('ingest_runs')
      .select('finished_at, matches_created')
      .eq('profile_id', profileId)
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('ingest_runs')
      .select('started_at, fetched, scored, matches_created')
      .eq('profile_id', profileId)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const userMatchJobs = userMatchJobsResult.data;
  const bySource: Record<string, number> = {};
  for (const row of userMatchJobs ?? []) {
    const job = row.job as unknown as { source: string };
    bySource[job.source] = (bySource[job.source] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stats"
        description={`Your personal matches and scan history${isAdmin ? ' — including admin diagnostics' : ''}.`}
      />

      {/* === Quick stats that matter to everyone === */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <BigStat
          label="Total tracked"
          value={totalTracked ?? 0}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <BigStat
          label="On Matches page"
          value={visibleCount ?? 0}
          icon={<Sparkles className="h-4 w-4" />}
          accent
        />
        <BigStat
          label="In inbox"
          value={inboxCount ?? 0}
          icon={<Inbox className="h-4 w-4" />}
        />
        <BigStat label="Applied" value={appliedCount ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      {/* === Last scan status — simple and clear === */}
      <div className="card text-sm text-on-surface-variant">
        <span className="font-medium text-on-surface">Last scan: </span>
        {activeRun
          ? `In progress (started ${relativeTime(activeRun.started_at)}) · ${activeRun.matches_created ?? 0} kept so far`
          : lastRun?.finished_at
            ? `${relativeTime(lastRun.finished_at)}${
                lastRun.matches_created != null ? ` · ${lastRun.matches_created} matches kept` : ''
              }`
            : 'No scan yet — run one from Matches.'}
      </div>

      {/* === Scan history — simplified for everyone, detailed for admin === */}
      <section className="card">
        <h2 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Recent scans
        </h2>
        <p className="text-xs text-on-surface-variant mb-3">
          {isAdmin
            ? 'Each scan fetches jobs from sources, scores them against your resume, and keeps the best matches. Pipeline time = fetch + embed + score + persist.'
            : 'Each scan checks job boards, scores roles against your resume, and surfaces the best matches.'}
        </p>
        {(runs ?? []).length === 0 ? (
          <p className="text-sm text-on-surface-variant">No scans yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="text-on-surface-variant text-xs border-b border-outline-variant">
                  <th className="py-2 text-left font-medium">When</th>
                  <th className="py-2 text-left font-medium">Result</th>
                  <th className="py-2 text-right font-medium">Fetched</th>
                  <th className="py-2 text-right font-medium">Scored</th>
                  <th className="py-2 text-right font-medium">Kept</th>
                  <th className="py-2 text-right font-medium" title="How long the scan took">Duration</th>
                  <th className="py-2 text-left font-medium">Trigger</th>
                  {isAdmin && (
                    <th className="py-2 text-left font-medium min-w-[200px]">Notes</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-outline-variant/50 last:border-0 align-top">
                    <td className="py-2 text-xs text-on-surface-variant whitespace-nowrap">{relativeTime(r.started_at)}</td>
                    <td className="py-2">
                      <RunStatus status={r.status} errors={r.errors} isAdmin={isAdmin} />
                    </td>
                    <td className="py-2 text-right tabular-nums text-on-surface">{r.fetched}</td>
                    <td className="py-2 text-right tabular-nums text-on-surface">{r.scored}</td>
                    <td className="py-2 text-right tabular-nums text-primary font-medium">{r.matches_created}</td>
                    <td className="py-2 text-right tabular-nums text-on-surface-variant">
                      {formatScanDuration(r.duration_ms)}
                    </td>
                    <td className="py-2 text-xs text-on-surface-variant capitalize">{r.triggered_by}</td>
                    {isAdmin && (
                      <td className="py-2">
                        <RunErrorNotes errors={r.errors} status={r.status} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* === Admin: Matches by source === */}
      {isAdmin && (
        <section className="card">
          <h2 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" /> Your matches by source
          </h2>
          {Object.keys(bySource).length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              No matches yet. Run a scan from the Matches page.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {Object.entries(bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([source, count]) => {
                  const total = visibleCount ?? 1;
                  const pct = (count / total) * 100;
                  return (
                    <li key={source}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-on-surface">{SOURCE_LABELS[source] ?? source}</span>
                        <span className="text-on-surface-variant">
                          {count.toLocaleString()} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-surface-container overflow-hidden">
                        <div className="h-full teal-gradient rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      )}

      {/* === Admin: Scan details collapsible === */}
      {isAdmin && (runs ?? []).length > 0 && (
        <details className="card group">
          <summary className="cursor-pointer list-none flex items-center justify-between">
            <h2 className="font-semibold text-on-surface flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-secondary" /> Pipeline diagnostics
            </h2>
            <ChevronDown className="h-4 w-4 text-on-surface-variant group-open:hidden" />
            <ChevronUp className="h-4 w-4 text-on-surface-variant hidden group-open:block" />
          </summary>
          <div className="mt-4 overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-on-surface-variant text-xs border-b border-outline-variant">
                  <th className="py-2 text-left font-medium">When</th>
                  <th className="py-2 text-left font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Fetched</th>
                  <th className="py-2 text-right font-medium">New</th>
                  <th className="py-2 text-right font-medium">Embedded</th>
                  <th className="py-2 text-right font-medium">Scored</th>
                  <th className="py-2 text-right font-medium">Kept</th>
                  <th className="py-2 text-right font-medium">Pipeline</th>
                  <th className="py-2 text-left font-medium">Trigger</th>
                  <th className="py-2 text-left font-medium min-w-[250px]">Errors</th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-outline-variant/50 last:border-0 align-top">
                    <td className="py-2 text-xs text-on-surface-variant whitespace-nowrap">{relativeTime(r.started_at)}</td>
                    <td className="py-2">
                      <RunStatus status={r.status} errors={r.errors} isAdmin={true} detailed />
                    </td>
                    <td className="py-2 text-right tabular-nums text-on-surface">{r.fetched}</td>
                    <td className="py-2 text-right tabular-nums text-on-surface">{r.new_jobs}</td>
                    <td className="py-2 text-right tabular-nums text-on-surface">{r.embedded}</td>
                    <td className="py-2 text-right tabular-nums text-on-surface">{r.scored}</td>
                    <td className="py-2 text-right tabular-nums text-primary font-medium">{r.matches_created}</td>
                    <td className="py-2 text-right tabular-nums text-on-surface-variant">
                      {formatScanDuration(r.duration_ms)}
                    </td>
                    <td className="py-2 text-xs text-on-surface-variant capitalize">{r.triggered_by}</td>
                    <td className="py-2">
                      <RunErrorNotes errors={r.errors} status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-on-surface-variant mt-3">
            GitHub Actions adds ~20–30s overhead for checkout and setup beyond the pipeline time shown above.
          </p>
        </details>
      )}
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
  value: string | number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between text-caption text-on-surface-variant">
        <span>{label}</span>
        <span className={accent ? 'text-primary' : 'text-text-muted'}>{icon}</span>
      </div>
      <div className={`mt-1.5 text-heading-sm font-semibold ${accent ? 'text-primary' : 'text-on-surface'}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

/**
 * Error notes — only rendered for admin users.
 * Shows a red/amber badge count with error details on hover.
 */
function RunErrorNotes({
  status,
  errors,
}: {
  status: string;
  errors: { source: string; error: string }[] | null;
}) {
  if (status === 'success' || !(errors?.length)) {
    return <span className="text-xs text-text-muted">—</span>;
  }

  return (
    <ul className="space-y-1 text-[11px] leading-snug text-on-surface-variant max-w-md">
      {errors.map((e) => (
        <li key={`${e.source}-${e.error.slice(0, 40)}`}>
          <span className="font-semibold text-primary-container">{e.source}</span>
          {': '}
          {e.error}
        </li>
      ))}
    </ul>
  );
}

/**
 * Run status badge.
 *
 * For end users (isAdmin=false): simple friendly labels — "Completed",
 * "Completed with issues", "Failed", "In progress". No error counts.
 *
 * For admin (isAdmin=true): detailed labels with error counts, tooltip with
 * full error breakdown. When detailed=true, shows the full internal status
 * name (success / partial / failed / running) with counts.
 */
function RunStatus({
  status,
  errors,
  isAdmin,
  detailed,
}: {
  status: string;
  errors: { source: string; error: string }[] | null;
  isAdmin: boolean;
  detailed?: boolean;
}) {
  const errCount = (errors ?? []).length;
  const hasErrors = errCount > 0;

  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {isAdmin && detailed ? 'success' : 'Completed'}
      </span>
    );
  }

  if (status === 'partial') {
    if (isAdmin && detailed) {
      return (
        <span
          className="inline-flex items-center gap-1 text-xs text-primary-container font-medium"
          title={(errors ?? []).map((e) => `${e.source}: ${e.error}`).join('\n')}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          partial ({errCount})
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium"
        title={isAdmin ? (errors ?? []).map((e) => `${e.source}: ${e.error}`).join('\n') : undefined}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Completed with issues
      </span>
    );
  }

  if (status === 'failed') {
    const timedOut = (errors ?? []).some((e) => e.source === 'timeout');
    if (isAdmin && detailed) {
      return (
        <span
          className="inline-flex items-center gap-1 text-xs text-error font-medium"
          title={(errors ?? []).map((e) => `${e.source}: ${e.error}`).join('\n')}
        >
          <XCircle className="h-3.5 w-3.5" />
          {timedOut ? 'timed out' : 'failed'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-error font-medium">
        <XCircle className="h-3.5 w-3.5" />
        {timedOut ? 'Timed out' : 'Failed'}
      </span>
    );
  }

  // running
  return (
    <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      In progress
    </span>
  );
}
