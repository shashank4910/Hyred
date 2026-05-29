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

import { supabaseAdmin } from './supabase/server';

export type ApiLogEntry = {
  source: string;
  key_identifier?: string;
  status: 'success' | 'rate_limited' | 'error';
  http_status?: number;
  error_message?: string;
  query?: string;
  jobs_returned?: number;
};

/**
 * Mask an API key for display: show first 4 and last 4 chars.
 * e.g. "abc12345xyz" → "abc1...xyz"
 */
export function maskKey(key: string): string {
  if (!key || key.length < 10) return key ? '***' : '';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Log an API request. Fire-and-forget — never blocks the caller.
 * If the table doesn't exist yet, the insert silently fails (no crash).
 */
export function logApiRequest(entry: ApiLogEntry): void {
  try {
    const sb = supabaseAdmin();
    // Fire and forget — don't await
    sb.from('api_request_logs').insert({
      source: entry.source,
      key_identifier: entry.key_identifier ?? null,
      status: entry.status,
      http_status: entry.http_status ?? null,
      error_message: entry.error_message?.slice(0, 500) ?? null,
      query: entry.query?.slice(0, 200) ?? null,
      jobs_returned: entry.jobs_returned ?? 0,
    }).then(() => {});
  } catch {
    // Never crash the ingest pipeline for logging failures
  }
}

/**
 * Get usage summary for the admin dashboard.
 * Returns per-source, per-key stats for the given time range.
 */
export async function getUsageSummary(daysBack = 30): Promise<{
  bySource: Record<string, { total: number; success: number; rateLimited: number; errors: number }>;
  byKey: Record<string, { source: string; total: number; success: number; rateLimited: number; lastUsed: string }>;
  recentErrors: Array<{ source: string; key_identifier: string; error_message: string; created_at: string; http_status: number | null }>;
  totalRequests: number;
  quota: {
    jsearch: { used: number; limit: number; keys: number; perKeyLimit: number };
    adzuna: { used: number; limit: number; keys: number; perKeyLimit: number };
  };
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

  // Quota calculation — count this calendar month's usage
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEntries = entries.filter((e) => new Date(e.created_at) >= monthStart);

  const jsearchThisMonth = monthEntries.filter((e) => e.source === 'jsearch').length;
  const adzunaThisMonth = monthEntries.filter((e) => e.source === 'adzuna_in').length;

  // Count keys to compute total monthly limit
  const jsearchKeyCount = new Set(
    entries.filter((e) => e.source === 'jsearch' && e.key_identifier).map((e) => e.key_identifier)
  ).size || 1;
  const adzunaKeyCount = new Set(
    entries.filter((e) => e.source === 'adzuna_in' && e.key_identifier).map((e) => e.key_identifier)
  ).size || 1;

  const JSEARCH_PER_KEY_LIMIT = 200; // Free tier per account/month
  const ADZUNA_PER_KEY_LIMIT = 250;  // Free tier per account/month

  return {
    bySource,
    byKey,
    recentErrors,
    totalRequests: entries.length,
    quota: {
      jsearch: {
        used: jsearchThisMonth,
        limit: jsearchKeyCount * JSEARCH_PER_KEY_LIMIT,
        keys: jsearchKeyCount,
        perKeyLimit: JSEARCH_PER_KEY_LIMIT,
      },
      adzuna: {
        used: adzunaThisMonth,
        limit: adzunaKeyCount * ADZUNA_PER_KEY_LIMIT,
        keys: adzunaKeyCount,
        perKeyLimit: ADZUNA_PER_KEY_LIMIT,
      },
    },
  };
}
