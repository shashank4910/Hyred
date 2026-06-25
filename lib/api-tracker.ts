/**
 * API Request Tracker — logs every outbound API call to Supabase
 * so the Admin Center can show usage stats, errors, and rate limit status.
 *
 * Table: api_request_logs
 * Columns:
 *   id (uuid, default gen_random_uuid())
 *   source (text) — e.g. 'jsearch', 'adzuna_in', 'himalayas'
 *   key_identifier (text) — masked key like 'abc1...xy9z' for tracking per-key usage
 *   status (text) — 'success', 'rate_limited', 'error'
 *   http_status (int, nullable)
 *   error_message (text, nullable)
 *   query (text, nullable) — the search query used
 *   jobs_returned (int, default 0)
 *   created_at (timestamptz, default now())
 *
 * Migration SQL (run in Supabase SQL Editor):
 *
 * CREATE TABLE IF NOT EXISTS api_request_logs (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   source text NOT NULL,
 *   key_identifier text,
 *   status text NOT NULL DEFAULT 'success',
 *   http_status int,
 *   error_message text,
 *   query text,
 *   jobs_returned int DEFAULT 0,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * CREATE INDEX idx_api_request_logs_source ON api_request_logs(source);
 * CREATE INDEX idx_api_request_logs_created ON api_request_logs(created_at DESC);
 * CREATE INDEX idx_api_request_logs_status ON api_request_logs(status);
 */

import 'server-only';

import { supabaseAdmin } from './supabase/admin';
import {
  JOB_API_MONTHLY_QUOTA,
  JOB_API_SOURCES,
  type JobApiSource,
} from './job-api-keys';
import { getConfiguredJobApiKeys } from './job-api-keys-server';
import type { JobApiKeyUsageRow, JobApiUsageEvent } from './job-api-usage-types';

export type { ApiLogEntry } from './api-tracker-log';
export { logApiRequest } from './api-tracker-log';
export type { JobApiKeyUsageRow, JobApiUsageEvent } from './job-api-usage-types';

export { maskKey } from './job-api-keys';

/**
 * Get usage summary for the admin dashboard.
 * Returns per-source, per-key stats for the given time range.
 */
export async function getUsageSummary(daysBack = 30): Promise<{
  bySource: Record<string, { total: number; success: number; rateLimited: number; errors: number }>;
  byKey: Record<string, { source: string; total: number; success: number; rateLimited: number; lastUsed: string }>;
  recentErrors: Array<{ source: string; key_identifier: string; error_message: string; created_at: string; http_status: number | null }>;
  totalRequests: number;
}> {
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  const { data: logs } = await sb
    .from('api_request_logs')
    .select('source, key_identifier, status, http_status, error_message, created_at, jobs_returned')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000);

  const entries = logs ?? [];

  // Aggregate by source
  const bySource: Record<string, { total: number; success: number; rateLimited: number; errors: number }> = {};
  const byKey: Record<string, { source: string; total: number; success: number; rateLimited: number; lastUsed: string }> = {};

  for (const e of entries) {
    // By source
    if (!bySource[e.source]) {
      bySource[e.source] = { total: 0, success: 0, rateLimited: 0, errors: 0 };
    }
    bySource[e.source].total++;
    if (e.status === 'success') bySource[e.source].success++;
    else if (e.status === 'rate_limited') bySource[e.source].rateLimited++;
    else bySource[e.source].errors++;

    // By key
    const keyId = e.key_identifier || '(no key)';
    const keyLabel = `${e.source}::${keyId}`;
    if (!byKey[keyLabel]) {
      byKey[keyLabel] = { source: e.source, total: 0, success: 0, rateLimited: 0, lastUsed: e.created_at };
    }
    byKey[keyLabel].total++;
    if (e.status === 'success') byKey[keyLabel].success++;
    else if (e.status === 'rate_limited') byKey[keyLabel].rateLimited++;
    if (e.created_at > byKey[keyLabel].lastUsed) byKey[keyLabel].lastUsed = e.created_at;
  }

  // Recent errors (last 20)
  const recentErrors = entries
    .filter((e) => e.status !== 'success')
    .slice(0, 20)
    .map((e) => ({
      source: e.source,
      key_identifier: e.key_identifier ?? '',
      error_message: e.error_message ?? 'Unknown error',
      created_at: e.created_at,
      http_status: e.http_status,
    }));

  return {
    bySource,
    byKey,
    recentErrors,
    totalRequests: entries.length,
  };
}

function usageStatus(row: {
  total: number;
  rateLimited: number;
  quotaPercent: number;
}): JobApiKeyUsageRow['status'] {
  if (row.total === 0) return 'unused';
  if (row.rateLimited > 0 || row.quotaPercent >= 100) return 'exhausted';
  if (row.quotaPercent >= 80) return 'warning';
  return 'ok';
}

/**
 * Paginated job API key usage for Admin dashboard (date range + source filter).
 */
export async function getJobApiUsageReport(opts: {
  from: string;
  to: string;
  source?: JobApiSource | 'all';
  keysPage?: number;
  keysPageSize?: number;
  eventsPage?: number;
  eventsPageSize?: number;
}): Promise<{
  from: string;
  to: string;
  source: string;
  keys: { page: number; pageSize: number; total: number; rows: JobApiKeyUsageRow[] };
  events: { page: number; pageSize: number; total: number; rows: JobApiUsageEvent[] };
}> {
  const keysPage = Math.max(1, opts.keysPage ?? 1);
  const keysPageSize = Math.min(50, Math.max(5, opts.keysPageSize ?? 10));
  const eventsPage = Math.max(1, opts.eventsPage ?? 1);
  const eventsPageSize = Math.min(50, Math.max(5, opts.eventsPageSize ?? 15));

  const fromIso = new Date(`${opts.from}T00:00:00.000Z`).toISOString();
  const toIso = new Date(`${opts.to}T23:59:59.999Z`).toISOString();

  const sources =
    opts.source && opts.source !== 'all' ? [opts.source] : [...JOB_API_SOURCES];

  const sb = supabaseAdmin();

  const { data: logs } = await sb
    .from('api_request_logs')
    .select('source, key_identifier, status, http_status, error_message, created_at, jobs_returned')
    .in('source', sources)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(15000);

  const entries = logs ?? [];
  const agg = new Map<
    string,
    {
      source: JobApiSource;
      keyIdentifier: string;
      total: number;
      success: number;
      rateLimited: number;
      errors: number;
      jobsReturned: number;
      lastUsed: string | null;
    }
  >();

  for (const e of entries) {
    const src = e.source as JobApiSource;
    if (!JOB_API_SOURCES.includes(src)) continue;
    const keyId = e.key_identifier || '(unknown)';
    const mapKey = `${src}::${keyId}`;
    if (!agg.has(mapKey)) {
      agg.set(mapKey, {
        source: src,
        keyIdentifier: keyId,
        total: 0,
        success: 0,
        rateLimited: 0,
        errors: 0,
        jobsReturned: 0,
        lastUsed: null,
      });
    }
    const row = agg.get(mapKey)!;
    row.total++;
    if (e.status === 'success') row.success++;
    else if (e.status === 'rate_limited') row.rateLimited++;
    else row.errors++;
    row.jobsReturned += e.jobs_returned ?? 0;
    if (!row.lastUsed || e.created_at > row.lastUsed) row.lastUsed = e.created_at;
  }

  const configured = await getConfiguredJobApiKeys();
  for (const src of sources) {
    for (const { identifier } of configured[src as JobApiSource] ?? []) {
      const mapKey = `${src}::${identifier}`;
      if (!agg.has(mapKey)) {
        agg.set(mapKey, {
          source: src as JobApiSource,
          keyIdentifier: identifier,
          total: 0,
          success: 0,
          rateLimited: 0,
          errors: 0,
          jobsReturned: 0,
          lastUsed: null,
        });
      }
    }
  }

  const allRows: JobApiKeyUsageRow[] = Array.from(agg.values())
    .map((r) => {
      const monthlyQuota = JOB_API_MONTHLY_QUOTA[r.source];
      const quotaPercent = monthlyQuota > 0 ? Math.round((r.total / monthlyQuota) * 100) : 0;
      const configuredIds = new Set(
        (configured[r.source] ?? []).map((k) => k.identifier),
      );
      const row = {
        source: r.source,
        keyIdentifier: r.keyIdentifier,
        configured: configuredIds.has(r.keyIdentifier),
        total: r.total,
        success: r.success,
        rateLimited: r.rateLimited,
        errors: r.errors,
        jobsReturned: r.jobsReturned,
        lastUsed: r.lastUsed,
        monthlyQuota,
        quotaPercent,
        status: 'ok' as const,
      };
      return { ...row, status: usageStatus(row) };
    })
    .sort((a, b) => b.total - a.total || a.source.localeCompare(b.source));

  const keysTotal = allRows.length;
  const keysOffset = (keysPage - 1) * keysPageSize;
  const keysRows = allRows.slice(keysOffset, keysOffset + keysPageSize);

  const eventsOffset = (eventsPage - 1) * eventsPageSize;
  const { count: eventsTotal } = await sb
    .from('api_request_logs')
    .select('id', { count: 'exact', head: true })
    .in('source', sources)
    .gte('created_at', fromIso)
    .lte('created_at', toIso);

  const { data: eventRows } = await sb
    .from('api_request_logs')
    .select(
      'id, source, key_identifier, status, http_status, error_message, query, jobs_returned, created_at',
    )
    .in('source', sources)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .range(eventsOffset, eventsOffset + eventsPageSize - 1);

  return {
    from: opts.from,
    to: opts.to,
    source: opts.source ?? 'all',
    keys: {
      page: keysPage,
      pageSize: keysPageSize,
      total: keysTotal,
      rows: keysRows,
    },
    events: {
      page: eventsPage,
      pageSize: eventsPageSize,
      total: eventsTotal ?? 0,
      rows: (eventRows ?? []) as JobApiUsageEvent[],
    },
  };
}
