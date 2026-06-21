import type { RawJob } from '../types';
import { stripHtml } from '../jd-fetcher';
import { getJobspipeApiKeys } from '../jobspipe-keys';
import { logApiRequest, maskKey } from '../api-tracker';

/**
 * JobsPipe — unified job search API (30+ ATS/board sources).
 * https://jobspipe.dev/docs
 *
 * POST https://api.jobspipe.dev/v1/jobs/search
 * Auth: Authorization: Bearer <key>
 *
 * Free tier: 5,000 requests/month, max 25 results per call.
 * Keys: JOBSPIPE_API_KEYS env or Admin Center → api_keys.jobspipe
 */

const BASE = 'https://api.jobspipe.dev/v1/jobs/search';

type JobsPipeLocation =
  | string
  | {
      city?: string | null;
      region?: string | null;
      country?: string | null;
      remote?: boolean | null;
    }
  | null;

type JobsPipeSalary =
  | string
  | {
      min?: number | null;
      max?: number | null;
      currency?: string | null;
      period?: string | null;
    }
  | null;

type JobsPipeJob = {
  id: string | number;
  /** Legacy TheirStack-style field */
  job_title?: string;
  /** JobsPipe normalized schema */
  title?: string;
  company?: string | null;
  location?: JobsPipeLocation;
  country_code?: string | null;
  remote?: boolean | null;
  date_posted?: string | null;
  posted_at?: string | null;
  final_url?: string | null;
  apply_url?: string | null;
  url?: string | null;
  source_url?: string | null;
  description?: string | null;
  salary_string?: string | null;
  salary?: JobsPipeSalary;
  min_annual_salary?: number | null;
  max_annual_salary?: number | null;
  salary_currency?: string | null;
  technology_slugs?: string[];
  keyword_slugs?: string[];
};

type JobsPipeResponse = {
  data?: JobsPipeJob[];
  jobs?: JobsPipeJob[];
  metadata?: {
    truncated_results?: number;
    next_cursor?: string | null;
  };
};

const exhaustedKeys = new Set<string>();

function parseJobsPayload(data: unknown): JobsPipeJob[] {
  if (Array.isArray(data)) return data as JobsPipeJob[];
  if (data && typeof data === 'object') {
    const o = data as JobsPipeResponse;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.jobs)) return o.jobs;
  }
  return [];
}

function jobTitle(j: JobsPipeJob): string | null {
  const t = (j.job_title ?? j.title)?.trim();
  return t || null;
}

function jobLocation(j: JobsPipeJob): string | null {
  if (typeof j.location === 'string' && j.location.trim()) return j.location.trim();
  if (j.location && typeof j.location === 'object') {
    const parts = [j.location.city, j.location.region, j.location.country]
      .map((p) => (p ?? '').trim())
      .filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }
  return j.country_code?.trim() || null;
}

function jobUrl(j: JobsPipeJob): string {
  return j.final_url || j.apply_url || j.url || j.source_url || '';
}

function jobPostedAt(j: JobsPipeJob): string | null {
  const raw = j.date_posted ?? j.posted_at;
  if (!raw) return null;
  if (raw.includes('T')) return raw;
  return `${raw}T00:00:00Z`;
}

function isRemote(j: JobsPipeJob): boolean {
  if (j.remote === true) return true;
  if (j.location && typeof j.location === 'object' && j.location.remote) return true;
  return false;
}

function formatSalary(job: JobsPipeJob): string | null {
  if (job.salary_string?.trim()) return job.salary_string.trim();
  if (job.salary && typeof job.salary === 'object') {
    const s = job.salary;
    if (s.min || s.max) {
      const cur = s.currency || 'USD';
      const fmt = (n: number) => n.toLocaleString('en-US');
      if (s.min && s.max) return `${cur} ${fmt(s.min)} – ${fmt(s.max)}/${s.period ?? 'yr'}`;
      return `${cur} ${fmt(s.min || s.max!)}/${s.period ?? 'yr'}`;
    }
  }
  if (!job.min_annual_salary && !job.max_annual_salary) return null;
  const cur = job.salary_currency || 'USD';
  const fmt = (n: number) => n.toLocaleString('en-US');
  if (job.min_annual_salary && job.max_annual_salary) {
    return `${cur} ${fmt(job.min_annual_salary)} – ${fmt(job.max_annual_salary)}/yr`;
  }
  return `${cur} ${fmt(job.min_annual_salary || job.max_annual_salary!)}/yr`;
}

function toRawJob(j: JobsPipeJob): RawJob | null {
  const title = jobTitle(j);
  if (j.id == null || !title) return null;

  const rawDesc = j.description ?? '';
  const cleanDesc =
    rawDesc && rawDesc.includes('<') ? stripHtml(rawDesc) : rawDesc || null;
  const tags = [...(j.technology_slugs ?? []), ...(j.keyword_slugs ?? [])].filter(Boolean);

  return {
    source: 'jobspipe',
    source_id: String(j.id),
    title,
    company: j.company ?? null,
    location: jobLocation(j),
    remote: isRemote(j),
    url: jobUrl(j),
    description: cleanDesc,
    salary: formatSalary(j),
    tags: tags.length > 0 ? tags : null,
    posted_at: jobPostedAt(j),
  };
}

async function searchWithKey(
  key: string,
  body: Record<string, unknown>,
): Promise<JobsPipeJob[] | null> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'user-agent': 'hyred/0.1',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (res.status === 401 || res.status === 402 || res.status === 429) {
    exhaustedKeys.add(key);
    console.warn(`[jobspipe] Key ${key.slice(0, 8)}... exhausted (HTTP ${res.status})`);
    logApiRequest({
      source: 'jobspipe',
      status: res.status === 429 ? 'rate_limited' : 'error',
      http_status: res.status,
      key_identifier: maskKey(key),
      query: JSON.stringify(body.job_title_or ?? []),
      error_message:
        res.status === 402
          ? 'Monthly quota exceeded'
          : res.status === 401
            ? 'Invalid API key'
            : 'Rate limited',
    });
    return null;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`JobsPipe HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const payload = (await res.json()) as unknown;
  const jobs = parseJobsPayload(payload);
  logApiRequest({
    source: 'jobspipe',
    status: 'success',
    http_status: 200,
    key_identifier: maskKey(key),
    query: JSON.stringify(body.job_title_or ?? []),
    jobs_returned: jobs.length,
  });
  return jobs;
}

async function searchWithRotation(body: Record<string, unknown>): Promise<JobsPipeJob[]> {
  const allKeys = await getJobspipeApiKeys();
  const keys = allKeys.filter((k) => !exhaustedKeys.has(k));

  if (keys.length === 0) {
    throw new Error(
      'All JobsPipe API keys exhausted. Add keys in Admin Center or JOBSPIPE_API_KEYS.',
    );
  }

  for (const key of keys) {
    const result = await searchWithKey(key, body);
    if (result !== null) return result;
  }

  throw new Error(`All ${allKeys.length} JobsPipe keys exhausted this run.`);
}

export type JobsPipeFetchOpts = {
  /** Title phrases (OR). Defaults to performance-engineering style queries. */
  queries?: string[];
  /** ISO country codes, e.g. IN, US */
  countryCodes?: string[];
  /** Max age in days (default 14) */
  maxAgeDays?: number;
  /** Results per query (free plan caps at 25) */
  limit?: number;
};

/**
 * Fetch jobs from JobsPipe.
 * Budget: 1 API request per query string batch (titles OR'd in one call).
 */
export async function fetchJobsPipe(opts?: JobsPipeFetchOpts): Promise<RawJob[]> {
  const keys = await getJobspipeApiKeys();
  if (keys.length === 0) {
    console.log('[jobspipe] Skipped — no API keys (JOBSPIPE_API_KEYS or Admin Center).');
    return [];
  }

  const titleQueries = opts?.queries?.length
    ? opts.queries.slice(0, 5)
    : ['performance engineer', 'performance test engineer'];

  const seenIds = new Set<string>();
  const allJobs: JobsPipeJob[] = [];

  for (const title of titleQueries) {
    try {
      const body: Record<string, unknown> = {
        job_title_or: [title],
        posted_at_max_age_days: opts?.maxAgeDays ?? 14,
        limit: Math.min(opts?.limit ?? 25, 25),
      };
      const codes = opts?.countryCodes ?? ['IN'];
      if (codes.length > 0) body.job_country_code_or = codes;

      let jobs = await searchWithRotation(body);

      // India-only can be sparse — retry globally if nothing matched.
      if (jobs.length === 0 && codes.length > 0) {
        const globalBody = { ...body };
        delete globalBody.job_country_code_or;
        jobs = await searchWithRotation(globalBody);
      }

      for (const j of jobs) {
        const id = String(j.id ?? '');
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          allJobs.push(j);
        }
      }
    } catch (e) {
      console.warn(`[jobspipe] Query "${title}" failed:`, (e as Error).message);
      if ((e as Error).message.includes('exhausted')) break;
    }
  }

  const mapped = allJobs
    .map((j) => toRawJob(j))
    .filter((j): j is RawJob => j !== null);

  if (allJobs.length > 0 && mapped.length === 0) {
    console.warn(
      `[jobspipe] API returned ${allJobs.length} rows but none mapped — check schema fields.`,
    );
  }

  return mapped;
}

/** Used when a JobsPipe-only scan returns nothing. */
export async function describeJobsPipeFetchFailure(): Promise<string> {
  const keys = await getJobspipeApiKeys();
  if (keys.length === 0) {
    return 'No JobsPipe API key configured. Add one in Admin → API Key Management.';
  }
  return 'JobsPipe returned 0 jobs for your keywords (tried India, then global). Check Admin → Job API usage for API errors.';
}
