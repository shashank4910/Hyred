import type { RawJob } from '../types';

/**
 * Himalayas.app — Free public JSON API, no authentication required.
 * https://himalayas.app/api
 *
 * Endpoints:
 *  - Browse all: https://himalayas.app/jobs/api?limit=50&offset=0
 *  - Search:     https://himalayas.app/jobs/api/search?query=...&country=...
 *
 * Returns high-quality remote jobs with salary, timezone, and full descriptions.
 * No rate limit documented — be respectful (one call per ingest run is fine).
 */

const BASE = 'https://himalayas.app/jobs/api';

type HimalayasJob = {
  title: string;
  companyName: string;
  companySlug?: string;
  companyLogo?: string;
  category?: string;
  categories?: string[];
  tags?: string[];
  seniority?: string[];
  salary?: string;
  minSalary?: number | null;
  maxSalary?: number | null;
  currency?: string;
  applicationLink?: string;
  url?: string;
  guid?: string;
  excerpt?: string;
  description?: string;
  pubDate?: number | string;
  publishedDate?: string;
  locationRestrictions?: string[];
  employmentType?: string;
};

type HimalayasResponse = {
  jobs: HimalayasJob[];
  totalCount?: number;
  offset?: number;
  limit?: number;
};

function formatSalary(job: HimalayasJob): string | null {
  if (job.salary) return job.salary;
  if (job.minSalary && job.maxSalary) {
    const cur = job.currency || 'USD';
    const fmt = (n: number) => n.toLocaleString('en-US');
    return `${cur} ${fmt(job.minSalary)} – ${fmt(job.maxSalary)}`;
  }
  if (job.minSalary) return `${job.currency || 'USD'} ${job.minSalary.toLocaleString('en-US')}+`;
  return null;
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

export type HimalayasFetchOpts = {
  /** Search keyword (optional — if omitted, fetches latest jobs) */
  query?: string;
  /** Country filter (e.g. "India", "United States") */
  country?: string;
  /** Max jobs to fetch (default 50, max ~100 per request) */
  limit?: number;
  /** Multiple search queries for broader coverage */
  queries?: string[];
};

/**
 * Fetch jobs from Himalayas.app.
 *
 * NOTE: The Himalayas /search endpoint is broken — it ignores the query
 * parameter and returns the full unfiltered feed regardless of keywords.
 * So we fetch a large batch of latest jobs and rely on the ingest
 * pipeline's AI pre-filter (title patterns + relevance scoring) to
 * filter down to relevant jobs. Same approach as Remotive/RemoteOK.
 */
export async function fetchHimalayas(opts?: HimalayasFetchOpts): Promise<RawJob[]> {
  const limit = opts?.limit ?? 100;
  const allJobs: HimalayasJob[] = [];
  const seenIds = new Set<string>();

  // Fetch latest jobs in pages (search endpoint is non-functional for keyword filtering)
  const pagesToFetch = 2;
  for (let page = 0; page < pagesToFetch; page++) {
    try {
      const offset = page * limit;
      const url = `${BASE}?limit=${limit}&offset=${offset}`;

      const res = await fetch(url, {
        headers: { 'user-agent': 'jobradar/0.5' },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.warn(`[himalayas] Page ${page} returned HTTP ${res.status}`);
        break;
      }

      const data = (await res.json()) as HimalayasResponse;
      const jobs = data.jobs ?? [];
      for (const j of jobs) {
        const uid = j.guid || j.applicationLink || `${j.companySlug}-${j.title}`;
        if (!seenIds.has(uid)) {
          seenIds.add(uid);
          allJobs.push(j);
        }
      }
      if (jobs.length < limit) break;
    } catch (e) {
      console.warn(`[himalayas] Page ${page} failed:`, (e as Error).message);
      break;
    }
  }

  console.log(`[himalayas] Fetched ${allJobs.length} jobs (will be filtered by AI pipeline)`);

  return allJobs
    .filter((j) => j.title && (j.guid || j.applicationLink))
    .map((j) => {
      const desc = j.description ? stripHtml(j.description) : (j.excerpt ?? '');
      const locationParts = j.locationRestrictions ?? [];
      const location = locationParts.length > 0 ? locationParts.join(', ') : null;
      // Use guid as unique ID (it's a URL like https://himalayas.app/companies/x/jobs/y)
      const sourceId = j.guid || j.applicationLink || `${j.companySlug}-${j.title}`;
      // pubDate can be a unix timestamp (number) or ISO string
      let postedAt: string | null = null;
      if (j.pubDate) {
        if (typeof j.pubDate === 'number') {
          postedAt = new Date(j.pubDate * 1000).toISOString();
        } else {
          postedAt = j.pubDate;
        }
      }

      return {
        source: 'himalayas',
        source_id: sourceId,
        title: j.title,
        company: j.companyName ?? null,
        location,
        remote: true,
        url: j.applicationLink || j.guid || `https://himalayas.app/companies/${j.companySlug}/jobs`,
        description: desc,
        salary: formatSalary(j),
        tags: j.categories?.slice(0, 5) ?? j.tags ?? null,
        posted_at: postedAt,
      } satisfies RawJob;
    });
}
