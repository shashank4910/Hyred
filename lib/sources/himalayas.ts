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
 * Supports multiple queries for broader coverage — deduplicates by ID.
 */
export async function fetchHimalayas(opts?: HimalayasFetchOpts): Promise<RawJob[]> {
  const limit = opts?.limit ?? 50;
  const seenIds = new Set<string>();
  const allJobs: HimalayasJob[] = [];

  // Build list of fetches to make
  const queries = opts?.queries?.length ? opts.queries : [opts?.query ?? ''];

  for (const q of queries) {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (q) params.set('query', q);
      if (opts?.country) params.set('country', opts.country);

      const endpoint = q ? `${BASE}/search` : BASE;
      const url = `${endpoint}?${params.toString()}`;

      const res = await fetch(url, {
        headers: { 'user-agent': 'jobradar/0.5' },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.warn(`[himalayas] Query "${q}" returned HTTP ${res.status}`);
        continue;
      }

      const data = (await res.json()) as HimalayasResponse;
      for (const j of data.jobs ?? []) {
        const uid = j.guid || j.applicationLink || `${j.companySlug}-${j.title}`;
        if (!seenIds.has(uid)) {
          seenIds.add(uid);
          allJobs.push(j);
        }
      }
    } catch (e) {
      console.warn(`[himalayas] Query "${q}" failed:`, (e as Error).message);
    }
  }

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
