import type { RawJob } from '../types';
import { logApiRequest, maskKey } from '../api-tracker-log';

/**
 * Adzuna public API — https://developer.adzuna.com/
 * Free tier: 250 calls/month per account.
 *
 * MULTI-CREDENTIAL ROTATION:
 * Set env var ADZUNA_CREDENTIALS as a comma-separated list of id:key pairs.
 * Example: ADZUNA_CREDENTIALS=appId1:appKey1,appId2:appKey2,appId3:appKey3
 *
 * Falls back to legacy ADZUNA_APP_ID + ADZUNA_APP_KEY if ADZUNA_CREDENTIALS
 * is not set (backward compatible).
 *
 * On 401/403/429, the current credential is marked exhausted and the next
 * one is tried. This gives you 250 × N calls/month with N free accounts.
 *
 * IMPROVEMENTS over previous version:
 *  - Fetches MULTIPLE PAGES (up to 3) to get more results
 *  - Performs MULTIPLE SEARCHES using the user's target roles as queries
 *  - Removes hardcoded 'it-jobs' category restriction — searches all categories
 *  - Uses `what` param (broader) instead of `what_phrase` (exact match only)
 *  - Also searches without category filter when using role-based queries
 */
const BASE = 'https://api.adzuna.com/v1/api/jobs';

type AdzunaJob = {
  id: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  description?: string;
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  created?: string;
  category?: { label?: string; tag?: string };
  contract_type?: string;
};

type AdzunaResponse = {
  results: AdzunaJob[];
  count: number;
};

function stripHtml(s: string): string {
  return s
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function formatSalary(min?: number, max?: number, country?: string): string | null {
  if (!min && !max) return null;
  const cur = country === 'in' ? '₹' : country === 'us' ? '$' : '£';
  const fmt = (n: number) => n.toLocaleString('en-US');
  if (min && max && min !== max) return `${cur}${fmt(min)} – ${cur}${fmt(max)}`;
  return `${cur}${fmt(min || max!)}`;
}

/**
 * Fetch a single page from Adzuna search.
 */
async function fetchPage(opts: {
  appId: string;
  appKey: string;
  country: string;
  page: number;
  resultsPerPage: number;
  what?: string;
  whatPhrase?: string;
  category?: string;
}): Promise<AdzunaJob[]> {
  const params = new URLSearchParams({
    app_id: opts.appId,
    app_key: opts.appKey,
    results_per_page: String(opts.resultsPerPage),
    'content-type': 'application/json',
    sort_by: 'date',
  });

  if (opts.category) params.set('category', opts.category);
  if (opts.what) params.set('what', opts.what);
  if (opts.whatPhrase) params.set('what_phrase', opts.whatPhrase);

  const url = `${BASE}/${opts.country}/search/${opts.page}?${params.toString()}`;
  const source = `adzuna_${opts.country.toLowerCase()}`;
  const keyId = maskKey(`${opts.appId}:${opts.appKey}`);
  const queryLabel = opts.what || opts.whatPhrase || opts.category || 'search';

  const res = await fetch(url, {
    headers: { 'user-agent': 'jobradar/0.4' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const status =
      res.status === 429 ? 'rate_limited' : 'error';
    logApiRequest({
      source,
      key_identifier: keyId,
      status,
      http_status: res.status,
      query: queryLabel,
      error_message: body.slice(0, 200),
    });
    throw new Error(`Adzuna ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as AdzunaResponse;
  const results = data.results ?? [];
  logApiRequest({
    source,
    key_identifier: keyId,
    status: 'success',
    http_status: 200,
    query: queryLabel,
    jobs_returned: results.length,
  });
  return results;
}

/**
 * Convert raw Adzuna jobs into our RawJob format, deduplicating by ID.
 */
function toRawJobs(jobs: AdzunaJob[], country: string): RawJob[] {
  return jobs
    .filter((j) => j.id && j.title && j.redirect_url)
    .map((j) => {
      const desc = stripHtml(j.description ?? '');
      const isRemote = /\b(remote|wfh|work from home)\b/i.test(
        `${j.title} ${desc}`,
      );
      return {
        source: `adzuna_${country}`,
        source_id: String(j.id),
        title: j.title!,
        company: j.company?.display_name ?? null,
        location: j.location?.display_name ?? null,
        remote: isRemote,
        url: j.redirect_url!,
        description: desc,
        salary: formatSalary(j.salary_min, j.salary_max, country),
        tags: j.category?.tag ? [j.category.tag] : null,
        posted_at: j.created ?? null,
      } satisfies RawJob;
    });
}

export type AdzunaFetchOpts = {
  country?: string;
  /** Legacy single query */
  whatPhrase?: string;
  /** Multiple search queries (e.g. user's target roles + key skills) */
  queries?: string[];
  /** Max results per query (will paginate to get this many) */
  limit?: number;
  /** Max pages to fetch per query (default 3) */
  maxPages?: number;
};

type AdzunaCredential = { appId: string; appKey: string };

/**
 * Get all configured Adzuna credentials.
 * Merges from TWO sources:
 *   1. Env vars: ADZUNA_CREDENTIALS or legacy ADZUNA_APP_ID + ADZUNA_APP_KEY
 *   2. admin_settings DB table (added via Admin Center UI)
 * Deduplicates by appId.
 */
let _dbCredCache: string[] | null = null;
let _dbCredCacheTime = 0;

async function loadDbCredentials(): Promise<string[]> {
  if (_dbCredCache && Date.now() - _dbCredCacheTime < 5 * 60 * 1000) {
    return _dbCredCache;
  }
  try {
    const { supabaseAdmin: getSb } = await import('../supabase/server');
    const sb = getSb();
    const { data } = await sb
      .from('admin_settings')
      .select('value')
      .eq('key', 'api_keys')
      .maybeSingle();
    const creds = (data?.value as Record<string, string[]> | null)?.adzuna ?? [];
    _dbCredCache = creds;
    _dbCredCacheTime = Date.now();
    return creds;
  } catch {
    return _dbCredCache ?? [];
  }
}

function getEnvCredentials(): AdzunaCredential[] {
  const multi = process.env.ADZUNA_CREDENTIALS ?? '';
  if (multi.trim()) {
    return multi
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [appId, appKey] = pair.split(':');
        return { appId: appId?.trim(), appKey: appKey?.trim() };
      })
      .filter((c) => c.appId && c.appKey);
  }
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (appId && appKey) return [{ appId, appKey }];
  return [];
}

async function getCredentials(): Promise<AdzunaCredential[]> {
  const envCreds = getEnvCredentials();
  const dbRaw = await loadDbCredentials();
  const dbCreds = dbRaw
    .map((pair) => {
      const [appId, appKey] = pair.split(':');
      return { appId: appId?.trim(), appKey: appKey?.trim() };
    })
    .filter((c) => c.appId && c.appKey);

  // Merge and deduplicate by appId
  const seen = new Set<string>();
  const all: AdzunaCredential[] = [];
  for (const c of [...envCreds, ...dbCreds]) {
    if (!seen.has(c.appId)) {
      seen.add(c.appId);
      all.push(c);
    }
  }
  return all;
}

/** Track exhausted credentials this run */
const exhaustedCreds = new Set<string>();

/**
 * Get the next available credential (not yet exhausted this run).
 * Returns null if all are exhausted.
 */
async function getActiveCred(): Promise<AdzunaCredential | null> {
  const creds = await getCredentials();
  for (const c of creds) {
    const key = `${c.appId}:${c.appKey}`;
    if (!exhaustedCreds.has(key)) return c;
  }
  return null;
}

/**
 * Mark a credential as exhausted (rate limited).
 */
function markExhausted(c: AdzunaCredential): void {
  exhaustedCreds.add(`${c.appId}:${c.appKey}`);
  console.warn(`[adzuna] Credential ${c.appId.slice(0, 6)}... exhausted, rotating...`);
}

/**
 * Fetch jobs from Adzuna. Supports:
 *  - Multiple search queries (each produces separate API calls)
 *  - Pagination (fetches up to maxPages per query)
 *  - Deduplication across queries
 *  - MULTI-CREDENTIAL ROTATION on rate limit
 *
 * API budget: each query × pages = 1 API call per page.
 * With multi-account rotation, you get 250 × N calls/month.
 */
export async function fetchAdzuna(opts?: AdzunaFetchOpts): Promise<RawJob[]> {
  const creds = await getCredentials();
  if (creds.length === 0) {
    throw new Error('Missing Adzuna credentials. Set ADZUNA_CREDENTIALS env var or add via Admin Center.');
  }

  const country = (opts?.country ?? 'in').toLowerCase();
  const maxPages = opts?.maxPages ?? 2;
  const resultsPerPage = 50; // Adzuna max per page

  // Build list of queries to search
  const queries: string[] = [];

  if (opts?.queries?.length) {
    queries.push(...opts.queries);
  } else if (opts?.whatPhrase) {
    queries.push(opts.whatPhrase);
  }

  const seenIds = new Set<string>();
  const allJobs: AdzunaJob[] = [];

  /**
   * Helper: fetch a page with automatic credential rotation.
   * If current cred is rate-limited (401/403/429), rotates to next.
   */
  async function fetchPageWithRotation(pageOpts: Omit<Parameters<typeof fetchPage>[0], 'appId' | 'appKey'>): Promise<AdzunaJob[]> {
    let attempts = 0;
    const maxAttempts = creds.length;
    while (attempts < maxAttempts) {
      const cred = await getActiveCred();
      if (!cred) break;
      try {
        return await fetchPage({ ...pageOpts, appId: cred.appId, appKey: cred.appKey });
      } catch (e) {
        const msg = (e as Error).message;
        if (/401|403|429|quota|limit|unauthor/i.test(msg)) {
          markExhausted(cred);
          attempts++;
          continue;
        }
        throw e; // Non-auth error, don't retry
      }
    }
    throw new Error('All Adzuna credentials exhausted this run');
  }

  // --- Role-specific searches (no category filter, broader results) ---
  for (const query of queries) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const jobs = await fetchPageWithRotation({
          country,
          page,
          resultsPerPage,
          what: query,
        });
        for (const j of jobs) {
          if (j.id && !seenIds.has(String(j.id))) {
            seenIds.add(String(j.id));
            allJobs.push(j);
          }
        }
        if (jobs.length < resultsPerPage) break;
      } catch (e) {
        console.warn(`[adzuna] Query "${query}" page ${page} failed:`, (e as Error).message);
        if ((e as Error).message.includes('exhausted')) break;
        break;
      }
    }
  }

  // --- General IT category fetch ---
  for (let page = 1; page <= maxPages; page++) {
    try {
      const jobs = await fetchPageWithRotation({
        country,
        page,
        resultsPerPage,
        category: 'it-jobs',
      });
      for (const j of jobs) {
        if (j.id && !seenIds.has(String(j.id))) {
          seenIds.add(String(j.id));
          allJobs.push(j);
        }
      }
      if (jobs.length < resultsPerPage) break;
    } catch (e) {
      console.warn(`[adzuna] IT-jobs page ${page} failed:`, (e as Error).message);
      break;
    }
  }

  return toRawJobs(allJobs, country);
}
