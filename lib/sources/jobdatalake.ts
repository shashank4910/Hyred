import type { RawJob } from '../types';
import { getJobdatalakeApiKeys } from '../jobdatalake-keys';
import { logApiRequest, maskKey } from '../api-tracker-log';

/**
 * JobDataLake — enriched job listings API.
 * https://www.jobdatalake.com/docs
 *
 * GET https://api.jobdatalake.com/v1/jobs
 * Auth: X-API-Key header
 *
 * Free tier: 1,000 credits/month (1 credit per search request).
 * Keys: JOBDATALAKE_API_KEYS env or Admin Center → api_keys.jobdatalake
 */

const BASE = 'https://api.jobdatalake.com/v1/jobs';

type JobDataLakeJob = {
  title?: string;
  company_name?: string;
  domain_name?: string;
  posted_at?: number;
  locations?: string[];
  countries?: string[];
  remote_type?: string | null;
  job_function?: string | null;
  seniority?: string[];
  salary_min_usd?: number | null;
  salary_max_usd?: number | null;
  required_skills?: string[];
  employment_type?: string | null;
  url?: string | null;
  job_handle?: string;
  description?: string | null;
};

type JobDataLakeResponse = {
  found?: number;
  page?: number;
  per_page?: number;
  jobs?: JobDataLakeJob[];
};

const exhaustedKeys = new Set<string>();

function formatSalary(job: JobDataLakeJob): string | null {
  if (!job.salary_min_usd && !job.salary_max_usd) return null;
  const fmt = (k: number) => `$${k}k`;
  if (job.salary_min_usd && job.salary_max_usd) {
    return `${fmt(job.salary_min_usd)} – ${fmt(job.salary_max_usd)}/yr USD`;
  }
  return `${fmt(job.salary_min_usd || job.salary_max_usd!)}/yr USD`;
}

function buildLocation(job: JobDataLakeJob): string | null {
  if (job.locations?.length) return job.locations.join(' · ');
  if (job.countries?.length) return job.countries.join(', ');
  return null;
}

function postedAtIso(ts?: number): string | null {
  if (!ts) return null;
  // API returns seconds or ms — normalize
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toISOString();
}

async function searchWithKey(
  key: string,
  params: URLSearchParams,
): Promise<JobDataLakeJob[] | null> {
  const url = `${BASE}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      'X-API-Key': key,
      'user-agent': 'hyred/0.1',
    },
    cache: 'no-store',
  });

  const queryLabel = params.get('q') ?? 'search';

  if (res.status === 401 || res.status === 402 || res.status === 429) {
    exhaustedKeys.add(key);
    console.warn(`[jobdatalake] Key ${key.slice(0, 8)}... exhausted (HTTP ${res.status})`);
    logApiRequest({
      source: 'jobdatalake',
      key_identifier: maskKey(key),
      status: res.status === 429 ? 'rate_limited' : 'error',
      http_status: res.status,
      query: queryLabel,
      error_message:
        res.status === 402
          ? 'Credits exhausted'
          : res.status === 401
            ? 'Invalid API key'
            : 'Rate limited',
    });
    return null;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logApiRequest({
      source: 'jobdatalake',
      key_identifier: maskKey(key),
      status: 'error',
      http_status: res.status,
      query: queryLabel,
      error_message: text.slice(0, 200),
    });
    throw new Error(`JobDataLake HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as JobDataLakeResponse;
  const jobs = data.jobs ?? [];
  logApiRequest({
    source: 'jobdatalake',
    key_identifier: maskKey(key),
    status: 'success',
    http_status: 200,
    query: queryLabel,
    jobs_returned: jobs.length,
  });
  return jobs;
}

async function searchWithRotation(params: URLSearchParams): Promise<JobDataLakeJob[]> {
  const allKeys = await getJobdatalakeApiKeys();
  const keys = allKeys.filter((k) => !exhaustedKeys.has(k));

  if (keys.length === 0) {
    throw new Error(
      'All JobDataLake API keys exhausted. Add keys in Admin Center or JOBDATALAKE_API_KEYS.',
    );
  }

  for (const key of keys) {
    const result = await searchWithKey(key, params);
    if (result !== null) return result;
  }

  throw new Error(`All ${allKeys.length} JobDataLake keys exhausted this run.`);
}

export type JobDataLakeFetchOpts = {
  queries?: string[];
  countryCodes?: string[];
  perPage?: number;
};

/**
 * Fetch jobs from JobDataLake.
 * Budget: 1 credit per query (one GET per title).
 */
export async function fetchJobDataLake(opts?: JobDataLakeFetchOpts): Promise<RawJob[]> {
  const keys = await getJobdatalakeApiKeys();
  if (keys.length === 0) {
    console.log('[jobdatalake] Skipped — no API keys (JOBDATALAKE_API_KEYS or Admin Center).');
    return [];
  }

  const titleQueries = opts?.queries?.length
    ? opts.queries.slice(0, 5)
    : ['performance engineer', 'performance test engineer'];

  const seenIds = new Set<string>();
  const allJobs: JobDataLakeJob[] = [];

  for (const title of titleQueries) {
    try {
      const params = new URLSearchParams({
        q: title,
        per_page: String(Math.min(opts?.perPage ?? 50, 100)),
        page: '1',
        sort_by: 'posted_at:desc',
      });
      const codes = opts?.countryCodes ?? [];
      if (codes.length > 0) params.set('countries', codes.join(','));

      const jobs = await searchWithRotation(params);
      for (const j of jobs) {
        const id = j.job_handle || `${j.company_name}-${j.title}`;
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          allJobs.push(j);
        }
      }
    } catch (e) {
      console.warn(`[jobdatalake] Query "${title}" failed:`, (e as Error).message);
      if ((e as Error).message.includes('exhausted')) break;
    }
  }

  return allJobs
    .filter((j) => j.title && (j.job_handle || j.url))
    .map((j) => ({
      source: 'jobdatalake',
      source_id: j.job_handle || `${j.company_name}-${j.title}`,
      title: j.title!,
      company: j.company_name ?? null,
      location: buildLocation(j),
      remote: j.remote_type === 'fully_remote' || j.remote_type === 'hybrid',
      url: j.url || '',
      description: j.description ?? null,
      salary: formatSalary(j),
      tags: j.required_skills?.length ? j.required_skills : null,
      posted_at: postedAtIso(j.posted_at),
    } satisfies RawJob));
}
