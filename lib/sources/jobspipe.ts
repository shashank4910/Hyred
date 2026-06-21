import type { RawJob } from '../types';
import { stripHtml } from '../jd-fetcher';
import { getJobspipeApiKeys } from '../jobspipe-keys';
import { logApiRequest, maskKey } from '../api-tracker';

/**
 * JobsPipe — unified job search API (30+ ATS/board sources).
 * https://jobspipe.dev/docs
 *
 * Primary: GET  https://api.jobspipe.dev/v1/jobs?query=…&country=IN
 * Fallback: POST https://api.jobspipe.dev/v1/jobs/search  { job_title_or, limit }
 *
 * Keys: JOBSPIPE_API_KEYS env or Admin Center → api_keys.jobspipe
 */

const POST_SEARCH = 'https://api.jobspipe.dev/v1/jobs/search';
const GET_JOBS = 'https://api.jobspipe.dev/v1/jobs';

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
  job_title?: string;
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
  description_md?: string | null;
  salary_string?: string | null;
  salary?: JobsPipeSalary;
  compensation?: JobsPipeSalary;
  min_annual_salary?: number | null;
  max_annual_salary?: number | null;
  salary_currency?: string | null;
  technology_slugs?: string[];
  keyword_slugs?: string[];
};

type JobsPipeResponse = {
  data?: JobsPipeJob[];
  jobs?: JobsPipeJob[];
  results?: JobsPipeJob[];
  metadata?: {
    total_results?: number;
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
    if (Array.isArray(o.results)) return o.results;
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

function jobDescription(j: JobsPipeJob): string | null {
  const raw = j.description ?? j.description_md ?? '';
  if (!raw) return null;
  return raw.includes('<') ? stripHtml(raw) : raw;
}

function isRemote(j: JobsPipeJob): boolean {
  if (j.remote === true) return true;
  if (j.location && typeof j.location === 'object' && j.location.remote) return true;
  return false;
}

function formatSalary(job: JobsPipeJob): string | null {
  if (job.salary_string?.trim()) return job.salary_string.trim();
  const comp = job.salary ?? job.compensation;
  if (comp && typeof comp === 'object') {
    const s = comp;
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

  const tags = [...(j.technology_slugs ?? []), ...(j.keyword_slugs ?? [])].filter(Boolean);

  return {
    source: 'jobspipe',
    source_id: String(j.id),
    title,
    company: j.company ?? null,
    location: jobLocation(j),
    remote: isRemote(j),
    url: jobUrl(j),
    description: jobDescription(j),
    salary: formatSalary(j),
    tags: tags.length > 0 ? tags : null,
    posted_at: jobPostedAt(j),
  };
}

function logJobsPipeSuccess(
  key: string,
  queryLabel: string,
  jobs: JobsPipeJob[],
  meta?: JobsPipeResponse['metadata'],
): void {
  if (jobs.length === 0 && meta?.total_results) {
    console.log(
      `[jobspipe] "${queryLabel}" → 0 rows in page (metadata.total_results=${meta.total_results})`,
    );
  }
  logApiRequest({
    source: 'jobspipe',
    status: 'success',
    http_status: 200,
    key_identifier: maskKey(key),
    query: queryLabel,
    jobs_returned: jobs.length,
  });
}

async function requestWithKey(
  key: string,
  url: string,
  init: RequestInit,
  queryLabel: string,
): Promise<{ jobs: JobsPipeJob[]; meta?: JobsPipeResponse['metadata'] } | null> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'user-agent': 'hyred/0.1',
      ...(init.headers ?? {}),
    },
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
      query: queryLabel,
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

  const payload = (await res.json()) as JobsPipeResponse;
  const jobs = parseJobsPayload(payload);
  logJobsPipeSuccess(key, queryLabel, jobs, payload.metadata);
  return { jobs, meta: payload.metadata };
}

async function searchGet(
  key: string,
  params: Record<string, string>,
): Promise<JobsPipeJob[] | null> {
  const qs = new URLSearchParams(params);
  const queryLabel = `GET ${params.query ?? ''}${params.country ? ` @${params.country}` : ''}`;
  const result = await requestWithKey(
    key,
    `${GET_JOBS}?${qs.toString()}`,
    { method: 'GET' },
    queryLabel,
  );
  return result?.jobs ?? null;
}

async function searchPost(
  key: string,
  body: Record<string, unknown>,
): Promise<JobsPipeJob[] | null> {
  const queryLabel = `POST ${JSON.stringify(body.job_title_or ?? [])}`;
  const result = await requestWithKey(key, POST_SEARCH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, queryLabel);
  return result?.jobs ?? null;
}

async function searchWithRotation(
  fetcher: (key: string) => Promise<JobsPipeJob[] | null>,
): Promise<JobsPipeJob[]> {
  const allKeys = await getJobspipeApiKeys();
  const keys = allKeys.filter((k) => !exhaustedKeys.has(k));

  if (keys.length === 0) {
    throw new Error(
      'All JobsPipe API keys exhausted. Add keys in Admin Center or JOBSPIPE_API_KEYS.',
    );
  }

  for (const key of keys) {
    const result = await fetcher(key);
    if (result !== null) return result;
  }

  throw new Error(`All ${allKeys.length} JobsPipe keys exhausted this run.`);
}

export type JobsPipeFetchOpts = {
  queries?: string[];
  countryCodes?: string[];
  /** Max age in days (default 30) */
  maxAgeDays?: number;
  limit?: number;
};

function buildTitleQueries(opts?: JobsPipeFetchOpts): string[] {
  if (opts?.queries?.length) return opts.queries.slice(0, 6);
  return ['performance engineer', 'performance test engineer', 'software engineer'];
}

/** Try GET /v1/jobs then POST /v1/jobs/search for one query phrase. */
async function fetchForQuery(
  title: string,
  opts: JobsPipeFetchOpts,
): Promise<JobsPipeJob[]> {
  const limit = String(Math.min(opts.limit ?? 25, 25));
  const maxAge = opts.maxAgeDays ?? 30;
  const country = opts.countryCodes?.[0];

  // 1) Native JobsPipe GET (documented: query + country + posted_after)
  const getParams: Record<string, string> = {
    query: title,
    limit,
    posted_after: `${maxAge}d`,
  };
  if (country) getParams.country = country;

  let jobs = await searchWithRotation((key) => searchGet(key, getParams));
  if (jobs.length > 0) return jobs;

  // 2) GET without country (India filter can be too sparse for niche titles)
  if (country) {
    const globalParams = { ...getParams };
    delete globalParams.country;
    jobs = await searchWithRotation((key) => searchGet(key, globalParams));
    if (jobs.length > 0) return jobs;
  }

  // 3) POST search — minimal body only (extra TheirStack filters often return empty pages)
  jobs = await searchWithRotation((key) =>
    searchPost(key, {
      job_title_or: [title],
      limit: Number(limit),
    }),
  );
  return jobs;
}

/**
 * Fetch jobs from JobsPipe.
 * Uses GET /v1/jobs first, then POST /v1/jobs/search as fallback.
 */
export async function fetchJobsPipe(opts?: JobsPipeFetchOpts): Promise<RawJob[]> {
  const keys = await getJobspipeApiKeys();
  if (keys.length === 0) {
    console.log('[jobspipe] Skipped — no API keys (JOBSPIPE_API_KEYS or Admin Center).');
    return [];
  }

  const titleQueries = buildTitleQueries(opts);
  const seenIds = new Set<string>();
  const allJobs: JobsPipeJob[] = [];

  const absorb = (jobs: JobsPipeJob[]) => {
    for (const j of jobs) {
      const id = String(j.id ?? '');
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        allJobs.push(j);
      }
    }
  };

  // One batched POST with all titles OR'd — often best recall per credit.
  try {
    absorb(
      await searchWithRotation((key) =>
        searchPost(key, {
          job_title_or: titleQueries,
          limit: Math.min(opts?.limit ?? 25, 25),
        }),
      ),
    );
  } catch (e) {
    console.warn('[jobspipe] Batched POST failed:', (e as Error).message);
  }

  // Per-title GET (+ POST fallback) only if batch was thin.
  if (allJobs.length < 10) {
    for (const title of titleQueries) {
      try {
        absorb(await fetchForQuery(title, opts ?? {}));
        if (allJobs.length >= 25) break;
      } catch (e) {
        console.warn(`[jobspipe] Query "${title}" failed:`, (e as Error).message);
        if ((e as Error).message.includes('exhausted')) break;
      }
    }
  }

  const mapped = allJobs
    .map((j) => toRawJob(j))
    .filter((j): j is RawJob => j !== null);

  if (allJobs.length > 0 && mapped.length === 0) {
    console.warn(
      `[jobspipe] API returned ${allJobs.length} rows but none mapped — sample keys: ${Object.keys(allJobs[0] ?? {}).join(', ')}`,
    );
  }

  console.log(`[jobspipe] Done — ${mapped.length} jobs from ${allJobs.length} raw rows`);
  return mapped;
}

export async function describeJobsPipeFetchFailure(): Promise<string> {
  const keys = await getJobspipeApiKeys();
  if (keys.length === 0) {
    return 'No JobsPipe API key configured. Add one in Admin → API Key Management.';
  }
  return 'JobsPipe API was called (usage shows on jobspipe.dev) but 0 jobs matched your title keywords. Check Admin → Job API usage: if jobs_returned is 0, try broader roles in your profile; if jobs_returned > 0 but Fetched is 0, report a mapping bug.';
}
