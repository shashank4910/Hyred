'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  JOB_API_MONTHLY_QUOTA,
  JOB_API_SOURCE_LABELS,
  type JobApiSource,
} from '@/lib/job-api-keys';
import type { JobApiKeyUsageRow, JobApiUsageEvent } from '@/lib/api-tracker';

type UsageReport = {
  from: string;
  to: string;
  source: string;
  keys: { page: number; pageSize: number; total: number; rows: JobApiKeyUsageRow[] };
  events: { page: number; pageSize: number; total: number; rows: JobApiUsageEvent[] };
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function statusBadge(status: JobApiKeyUsageRow['status']) {
  const map = {
    ok: 'bg-match-success/15 text-match-success',
    warning: 'bg-warning/15 text-warning',
    exhausted: 'bg-error/15 text-error',
    unused: 'bg-surface-container text-on-surface-variant',
  };
  const label = {
    ok: 'OK',
    warning: 'Near limit',
    exhausted: 'Exhausted',
    unused: 'No usage',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${map[status]}`}>
      {label[status]}
    </span>
  );
}

export function JobApiUsagePanel() {
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIso);
  const [source, setSource] = useState<'all' | JobApiSource>('all');
  const [keysPage, setKeysPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<UsageReport | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from,
        to,
        source,
        page: String(keysPage),
        pageSize: '10',
        eventsPage: String(eventsPage),
        eventsPageSize: '15',
      });
      const res = await fetch(`/api/admin/job-api-usage?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load usage');
      setReport(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to, source, keysPage, eventsPage]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const keysTotalPages = report ? Math.max(1, Math.ceil(report.keys.total / report.keys.pageSize)) : 1;
  const eventsTotalPages = report
    ? Math.max(1, Math.ceil(report.events.total / report.events.pageSize))
    : 1;

  return (
    <section className="glass-card p-6" style={{ contentVisibility: 'auto', containIntrinsicSize: '400px' }}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-headline text-headline-md font-bold text-on-background flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Job API key usage
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Track JSearch, JobsPipe, and Adzuna keys by date range. Add more keys below when a key hits its monthly limit.
          </p>
        </div>
        <button type="button" onClick={fetchReport} disabled={loading} className="btn text-xs">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: 'This month', f: monthStartIso(), t: todayIso() },
          { label: 'Last 7 days', f: daysAgoIso(6), t: todayIso() },
          { label: 'Last 30 days', f: daysAgoIso(29), t: todayIso() },
        ].map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              setFrom(preset.f);
              setTo(preset.t);
              setKeysPage(1);
              setEventsPage(1);
            }}
            className="px-3 py-1 rounded-full text-xs border border-outline-variant hover:border-primary/40 hover:bg-primary/5"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <label className="text-xs">
          <span className="text-on-surface-variant block mb-1">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setKeysPage(1);
              setEventsPage(1);
            }}
            className="input text-xs"
          />
        </label>
        <label className="text-xs">
          <span className="text-on-surface-variant block mb-1">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setKeysPage(1);
              setEventsPage(1);
            }}
            className="input text-xs"
          />
        </label>
        <label className="text-xs">
          <span className="text-on-surface-variant block mb-1">Source</span>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as 'all' | JobApiSource);
              setKeysPage(1);
              setEventsPage(1);
            }}
            className="input text-xs min-w-[140px]"
          >
            <option value="all">All sources</option>
            {(Object.keys(JOB_API_SOURCE_LABELS) as JobApiSource[]).map((s) => (
              <option key={s} value={s}>
                {JOB_API_SOURCE_LABELS[s]} ({JOB_API_MONTHLY_QUOTA[s]}/mo)
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && !report && <div className="skeleton h-40 w-full" />}

      {report && (
        <>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-muted text-left text-xs text-on-surface-variant uppercase tracking-wide">
                  <th className="pb-2 pr-3">Source</th>
                  <th className="pb-2 pr-3">Key</th>
                  <th className="pb-2 pr-3">Calls</th>
                  <th className="pb-2 pr-3">OK</th>
                  <th className="pb-2 pr-3">Limited</th>
                  <th className="pb-2 pr-3">Jobs</th>
                  <th className="pb-2 pr-3">Quota</th>
                  <th className="pb-2 pr-3">Last used</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.keys.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-on-surface-variant text-xs">
                      No keys configured or no calls in this range. Add keys in API Key Management below.
                    </td>
                  </tr>
                ) : (
                  report.keys.rows.map((row) => (
                    <tr key={`${row.source}-${row.keyIdentifier}`} className="border-b border-border-muted/40">
                      <td className="py-2 pr-3 font-medium">{JOB_API_SOURCE_LABELS[row.source]}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.keyIdentifier}</td>
                      <td className="py-2 pr-3 font-semibold">{row.total}</td>
                      <td className="py-2 pr-3 text-match-success">{row.success}</td>
                      <td className="py-2 pr-3 text-warning">{row.rateLimited}</td>
                      <td className="py-2 pr-3">{row.jobsReturned}</td>
                      <td className="py-2 pr-3 text-xs">
                        <div>{row.quotaPercent}%</div>
                        <div className="text-on-surface-variant">
                          {row.total} / {row.monthlyQuota}
                        </div>
                        <div className="mt-1 h-1.5 w-20 rounded-full bg-surface-container overflow-hidden">
                          <div
                            className={`h-full ${row.quotaPercent >= 100 ? 'bg-error' : row.quotaPercent >= 80 ? 'bg-warning' : 'bg-match-success'}`}
                            style={{ width: `${Math.min(row.quotaPercent, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-on-surface-variant">
                        {row.lastUsed ? new Date(row.lastUsed).toLocaleString() : '—'}
                      </td>
                      <td className="py-2">{statusBadge(row.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-on-surface-variant mb-6">
            <span>
              Keys {report.keys.page} / {keysTotalPages} ({report.keys.total} total)
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={keysPage <= 1 || loading}
                onClick={() => setKeysPage((p) => Math.max(1, p - 1))}
                className="btn p-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={keysPage >= keysTotalPages || loading}
                onClick={() => setKeysPage((p) => p + 1)}
                className="btn p-1.5"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-on-background mb-2">Recent API calls</h3>
          <div className="space-y-2 max-h-[320px] overflow-y-auto mb-3">
            {report.events.rows.length === 0 ? (
              <p className="text-xs text-on-surface-variant">No calls logged in this range.</p>
            ) : (
              report.events.rows.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg border border-border-muted p-2.5 bg-surface-card text-xs"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{JOB_API_SOURCE_LABELS[e.source as JobApiSource] ?? e.source}</span>
                    <span className="text-on-surface-variant">{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1 text-on-surface-variant">
                    {e.key_identifier && <span className="font-mono">{e.key_identifier}</span>}
                    <span
                      className={
                        e.status === 'success'
                          ? 'text-match-success'
                          : e.status === 'rate_limited'
                            ? 'text-warning'
                            : 'text-error'
                      }
                    >
                      {e.status}
                    </span>
                    {e.jobs_returned > 0 && <span>{e.jobs_returned} jobs</span>}
                    {e.query && <span className="truncate max-w-[240px]">{e.query}</span>}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span>
              Events {report.events.page} / {eventsTotalPages} ({report.events.total} total)
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={eventsPage <= 1 || loading}
                onClick={() => setEventsPage((p) => Math.max(1, p - 1))}
                className="btn p-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={eventsPage >= eventsTotalPages || loading}
                onClick={() => setEventsPage((p) => p + 1)}
                className="btn p-1.5"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
