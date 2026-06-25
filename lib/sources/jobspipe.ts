import type { RawJob } from '../types';
import { stripHtml } from '../jd-fetcher';
import { getJobspipeApiKeys } from '../jobspipe-keys';
import { logApiRequest, maskKey } from '../api-tracker-log';

/**
 * JobsPipe — unified job search API (30+ ATS/board sources).
 * https://jobspipe.dev/docs
 *
 * POST https://api.jobspipe.dev/v1/jobs/search
 *   { job_title_or, job_country_code_or?, posted_at_max_age_days?, limit }
 *
 * Keys: JOBSPIPE_API_KEYS env or Admin Center → api_keys.jobspipe
 */

const POST_SEARCH = 'https://api.jobspipe.dev/v1/jobs/search';

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

function formatPostQueryLabel(body: Record<string, unknown>): string {
  const titles = Array.isArray(body.job_title_or) ? body.job_title_or.join('|') : '';
  const countries = Array.isArray(body.job_country_code_or)
    ? `@${body.job_country_code_or.join(',')}`
    : '@global';
  return `POST ${titles}${countries}`;
}

async function searchPost(
  key: string,
  body: Record<string, unknown>,
): Promise<JobsPipeJob[] | null> {
  const queryLabel = formatPostQueryLabel(body);
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

/** Build POST body — always applies user country codes when onboarding resolved them. */
function buildSearchBody(
  titles: string[],
  opts: JobsPipeFetchOpts,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    job_title_or: titles,
    limit: Math.min(opts.limit ?? 25, 25),
    posted_at_max_age_days: opts.maxAgeDays ?? 30,
  };

  const codes = (opts.countryCodes ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (codes.length > 0) {
    body.job_country_code_or = codes;
  }

  return body;
}

async function fetchForQuery(title: string, opts: JobsPipeFetchOpts): Promise<JobsPipeJob[]> {
  return searchWithRotation((key) => searchPost(key, buildSearchBody([title], opts)));
}

/**
 * Fetch jobs from JobsPipe via POST /v1/jobs/search.
 * Country filter comes from user onboarding locations (job_country_code_or).
 */
export async function fetchJobsPipe(opts?: JobsPipeFetchOpts): Promise<RawJob[]> {
  const keys = await getJobspipeApiKeys();
  if (keys.length === 0) {
    console.log('[jobspipe] Skipped — no API keys (JOBSPIPE_API_KEYS or Admin Center).');
    return [];
  }

  const fetchOpts = opts ?? {};
  const titleQueries = buildTitleQueries(fetchOpts);
  const countryLabel = fetchOpts.countryCodes?.length
    ? fetchOpts.countryCodes.join(',')
    : 'global';
  console.log(`[jobspipe] Scan — titles: ${titleQueries.join(' | ')} · countries: ${countryLabel}`);

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

  // Batched POST with user country filter (matches manual jobspipe.dev tests).
  try {
    absorb(
      await searchWithRotation((key) =>
        searchPost(key, buildSearchBody(titleQueries, fetchOpts)),
      ),
    );
  } catch (e) {
    console.warn('[jobspipe] Batched POST failed:', (e as Error).message);
  }

  // Per-title POST only if batch was thin — still keeps country filter.
  if (allJobs.length < 10) {
    for (const title of titleQueries) {
      try {
        absorb(await fetchForQuery(title, fetchOpts));
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
  return 'JobsPipe was queried with your location country filter but returned 0 jobs for your role titles. Check Admin → Job API usage; try broader titles or confirm JobsPipe has listings in your country.';
}
