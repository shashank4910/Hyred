import type { JobApiSource } from './job-api-keys';

/** Client-safe types for Admin Job API usage panel (no server imports). */

export type JobApiKeyUsageRow = {
  source: JobApiSource;
  keyIdentifier: string;
  configured: boolean;
  total: number;
  success: number;
  rateLimited: number;
  errors: number;
  jobsReturned: number;
  lastUsed: string | null;
  monthlyQuota: number;
  quotaPercent: number;
  status: 'ok' | 'warning' | 'exhausted' | 'unused';
};

export type JobApiUsageEvent = {
  id: string;
  source: string;
  key_identifier: string | null;
  status: string;
  http_status: number | null;
  error_message: string | null;
  query: string | null;
  jobs_returned: number;
  created_at: string;
};
