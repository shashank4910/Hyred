import type { RawJob } from '../types';

/**
 * Adzuna public API — https://developer.adzuna.com/
 * Free tier: 250 calls/month.
 *
 * IMPROVEMENTS over previous version:
 *  - Fetches MULTIPLE PAGES (up to 3) to get more results
 *  - Performs MULTIPLE SEARCHES using the user's target roles as queries
 *  - Removes hardcoded 'it-jobs' category restriction — searches all categories
 *  - Uses `what` param (broader) instead of `what_phrase` (exact match only)
 *  - Also searches without category filter when using role-based queries
 *
 * Requires env: ADZUNA_APP_ID, ADZUNA_APP_KEY
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
  const res = await fetch(url, {
    headers: { 'user-agent': 'jobradar/0.4' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Adzuna ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as AdzunaResponse;
  return data.results ?? [];
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

/**
 * Fetch jobs from Adzuna. Supports:
 *  - Multiple search queries (each produces separate API calls)
 *  - Pagination (fetches up to maxPages per query)
 *  - Deduplication across queries
 *
 * API budget: each query × pages = 1 API call per page.
 * With 4 queries × 2 pages × 4 runs/day = 32 calls/day = ~960/month.
 * Stay within 250/month free tier by limiting queries or using paid.
 */
export async function fetchAdzuna(opts?: AdzunaFetchOpts): Promise<RawJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    throw new Error('Missing ADZUNA_APP_ID or ADZUNA_APP_KEY env vars');
  }

  const country = (opts?.country ?? 'in').toLowerCase();
  const maxPages = opts?.maxPages ?? 2;
  const resultsPerPage = 50; // Adzuna max per page

  // Build list of queries to search
  const queries: string[] = [];

  if (opts?.queries?.length) {
    queries.push(...opts.queries); // Use ALL queries from buildSearchQueries
  } else if (opts?.whatPhrase) {
    queries.push(opts.whatPhrase);
  }

  // Always do a general IT jobs fetch too (no specific query, category filter)
  const seenIds = new Set<string>();
  const allJobs: AdzunaJob[] = [];

  // --- Role-specific searches (no category filter, broader results) ---
  for (const query of queries) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const jobs = await fetchPage({
          appId,
          appKey,
          country,
          page,
          resultsPerPage,
          what: query,
          // No category filter — search all categories for broader results
        });
        for (const j of jobs) {
          if (j.id && !seenIds.has(String(j.id))) {
            seenIds.add(String(j.id));
            allJobs.push(j);
          }
        }
        // If page returned fewer results than requested, no more pages
        if (jobs.length < resultsPerPage) break;
      } catch (e) {
        // Log but continue — one query failing shouldn't stop others
        console.warn(`[adzuna] Query "${query}" page ${page} failed:`, (e as Error).message);
        break;
      }
    }
  }

  // --- General IT category fetch (catches jobs that don't match specific queries) ---
  for (let page = 1; page <= maxPages; page++) {
    try {
      const jobs = await fetchPage({
        appId,
        appKey,
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
