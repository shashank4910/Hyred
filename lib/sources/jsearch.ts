import type { RawJob } from '../types';

/**
 * JSearch — RapidAPI job aggregator.
 * Aggregates from: Indeed, LinkedIn, Glassdoor, ZipRecruiter, Google Jobs, and more.
 * https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
 *
 * Free tier: ~200 requests/month per account.
 *
 * MULTI-KEY ROTATION:
 * Set env var JSEARCH_API_KEYS as a comma-separated list of RapidAPI keys.
 * The code rotates through them on 429 (rate limited) or 403 (quota exhausted).
 * Create as many free accounts as you want and add their keys.
 *
 * Example: JSEARCH_API_KEYS=key1,key2,key3,key4,key5
 */

const HOST = 'jsearch.p.rapidapi.com';
const BASE = `https://${HOST}/search`;

type JSearchJob = {
  job_id: string;
  job_title: string;
  employer_name: string | null;
  employer_logo: string | null;
  job_city: string | null;
  job_state: string | null;
  job_country: string | null;
  job_description: string | null;
  job_apply_link: string | null;
  job_google_link: string | null;
  job_is_remote: boolean;
  job_posted_at_datetime_utc: string | null;
  job_min_salary: number | null;
  job_max_salary: number | null;
  job_salary_currency: string | null;
  job_salary_period: string | null;
  job_employment_type: string | null;
  job_required_skills: string[] | null;
  job_highlights?: {
    Qualifications?: string[];
    Responsibilities?: string[];
  };
};

type JSearchResponse = {
  status: string;
  data: JSearchJob[];
  request_id?: string;
};

/**
 * Get all configured JSearch API keys.
 * Merges from TWO sources:
 *   1. JSEARCH_API_KEYS env var (Vercel config)
 *   2. admin_settings DB table (added via Admin Center UI)
 * Deduplicates so keys added in both places aren't used twice.
 */
let _dbKeysCache: string[] | null = null;
let _dbKeysCacheTime = 0;

async function loadDbKeys(): Promise<string[]> {
  // Cache DB keys for 5 minutes to avoid hitting Supabase on every API call
  if (_dbKeysCache && Date.now() - _dbKeysCacheTime < 5 * 60 * 1000) {
    return _dbKeysCache;
  }
  try {
    const { supabaseAdmin } = await import('../supabase/server');
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('admin_settings')
      .select('value')
      .eq('key', 'api_keys')
      .maybeSingle();
    const keys = (data?.value as Record<string, string[]> | null)?.jsearch ?? [];
    _dbKeysCache = keys;
    _dbKeysCacheTime = Date.now();
    return keys;
  } catch {
    return _dbKeysCache ?? [];
  }
}

function getEnvKeys(): string[] {
  const raw = process.env.JSEARCH_API_KEYS ?? '';
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

async function getApiKeys(): Promise<string[]> {
  const envKeys = getEnvKeys();
  const dbKeys = await loadDbKeys();
  // Merge and deduplicate
  const all = new Set([...envKeys, ...dbKeys]);
  return Array.from(all);
}

/**
 * Track which keys are exhausted this run to avoid retrying them.
 * Resets each time the module is freshly loaded (i.e. each ingest run).
 */
const exhaustedKeys = new Set<string>();

function formatSalary(job: JSearchJob): string | null {
  if (!job.job_min_salary && !job.job_max_salary) return null;
  const cur = job.job_salary_currency || 'USD';
  const period = job.job_salary_period ? `/${job.job_salary_period.toLowerCase()}` : '';
  const fmt = (n: number) => n.toLocaleString('en-US');
  if (job.job_min_salary && job.job_max_salary) {
    return `${cur} ${fmt(job.job_min_salary)} – ${fmt(job.job_max_salary)}${period}`;
  }
  return `${cur} ${fmt(job.job_min_salary || job.job_max_salary!)}${period}`;
}

function buildLocation(job: JSearchJob): string | null {
  const parts = [job.job_city, job.job_state, job.job_country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Make a single JSearch API call with a specific key.
 * Returns the jobs array or throws on non-retryable errors.
 * Returns null if rate limited (caller should rotate key).
 */
async function fetchWithKey(
  key: string,
  params: URLSearchParams,
): Promise<JSearchJob[] | null> {
  const url = `${BASE}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-host': HOST,
      'x-rapidapi-key': key,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 429 || res.status === 403) {
    // Rate limited or quota exhausted — mark key and return null
    exhaustedKeys.add(key);
    console.warn(`[jsearch] Key ${key.slice(0, 8)}... exhausted (HTTP ${res.status})`);
    return null;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`JSearch HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as JSearchResponse;
  return data.data ?? [];
}

/**
 * Fetch jobs with automatic key rotation.
 * Tries each available key until one works or all are exhausted.
 */
async function fetchWithRotation(params: URLSearchParams): Promise<JSearchJob[]> {
  const allKeys = await getApiKeys();
  const keys = allKeys.filter((k) => !exhaustedKeys.has(k));

  if (keys.length === 0) {
    throw new Error(
      'All JSearch API keys exhausted. Add more keys to JSEARCH_API_KEYS or via Admin Center.',
    );
  }

  for (const key of keys) {
    const result = await fetchWithKey(key, params);
    if (result !== null) return result;
    // null = rate limited, try next key
  }

  throw new Error(
    `All ${allKeys.length} JSearch keys exhausted this run. Add more accounts via Admin Center.`,
  );
}

export type JSearchFetchOpts = {
  /** Search queries (e.g. user's target roles) */
  queries?: string[];
  /** Country filter (e.g. "India", "United States") */
  country?: string;
  /** Number of results per query (default 10, max 20 on free tier) */
  numPages?: number;
  /** Only remote jobs */
  remoteOnly?: boolean;
  /** Date posted filter: "today", "3days", "week", "month", "all" */
  datePosted?: string;
};

/**
 * Fetch jobs from JSearch (Indeed + LinkedIn + Glassdoor + more).
 * Automatically rotates through multiple API keys on rate limit.
 *
 * Budget: each query = 1 API call.
 * With 5 queries × 4 runs/day = 20 calls/day = 600/month.
 * A single free account (200/month) covers ~10 days; 3 accounts = full month.
 */
export async function fetchJSearch(opts?: JSearchFetchOpts): Promise<RawJob[]> {
  const keys = await getApiKeys();
  if (keys.length === 0) {
    throw new Error('Missing JSearch API keys. Add via JSEARCH_API_KEYS env var or Admin Center.');
  }

  const queries = opts?.queries?.length ? opts.queries : ['performance engineer'];
  const seenIds = new Set<string>();
  const allJobs: JSearchJob[] = [];

  for (const q of queries) {
    try {
      const params = new URLSearchParams({
        query: q,
        num_pages: String(opts?.numPages ?? 1),
        date_posted: opts?.datePosted ?? 'week',
      });
      if (opts?.country) params.set('country', opts.country);
      if (opts?.remoteOnly) params.set('remote_jobs_only', 'true');

      const jobs = await fetchWithRotation(params);
      for (const j of jobs) {
        if (j.job_id && !seenIds.has(j.job_id)) {
          seenIds.add(j.job_id);
          allJobs.push(j);
        }
      }
    } catch (e) {
      console.warn(`[jsearch] Query "${q}" failed:`, (e as Error).message);
      // If all keys exhausted, stop trying more queries
      if ((e as Error).message.includes('exhausted')) break;
    }
  }

  return allJobs
    .filter((j) => j.job_id && j.job_title)
    .map((j) => {
      const description = j.job_description ?? '';
      const tags = j.job_required_skills ?? null;

      return {
        source: 'jsearch',
        source_id: j.job_id,
        title: j.job_title,
        company: j.employer_name ?? null,
        location: buildLocation(j),
        remote: j.job_is_remote ?? false,
        url: j.job_apply_link || j.job_google_link || '',
        description,
        salary: formatSalary(j),
        tags,
        posted_at: j.job_posted_at_datetime_utc ?? null,
      } satisfies RawJob;
    });
}
