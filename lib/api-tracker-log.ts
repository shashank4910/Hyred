/**
 * Fire-and-forget job-source API logging — safe for CLI ingest (no server-only).
 * Admin aggregations live in api-tracker.ts.
 */

import { supabaseAdmin } from './supabase/admin';

export { maskKey } from './job-api-keys';

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
 * Log an API request. Fire-and-forget — never blocks the caller.
 * If the table doesn't exist yet, the insert silently fails (no crash).
 */
export function logApiRequest(entry: ApiLogEntry): void {
  try {
    const sb = supabaseAdmin();
    sb.from('api_request_logs')
      .insert({
        source: entry.source,
        key_identifier: entry.key_identifier ?? null,
        status: entry.status,
        http_status: entry.http_status ?? null,
        error_message: entry.error_message?.slice(0, 500) ?? null,
        query: entry.query?.slice(0, 200) ?? null,
        jobs_returned: entry.jobs_returned ?? 0,
      })
      .then(() => {});
  } catch {
    // Never crash the ingest pipeline for logging failures
  }
}
