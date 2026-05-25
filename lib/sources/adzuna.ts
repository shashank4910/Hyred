import type { RawJob } from '../types';

/**
 * Adzuna public API — https://developer.adzuna.com/
 * Free tier: 250 calls/month (plenty for a 4x/day cron).
 *
 * Aggregates listings from 1000+ job boards including many India-specific
 * sites. Often surfaces Naukri-adjacent listings under category=it-jobs.
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

export async function fetchAdzuna(opts?: {
  country?: string;
  whatPhrase?: string;
  limit?: number;
}): Promise<RawJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    throw new Error('Missing ADZUNA_APP_ID or ADZUNA_APP_KEY env vars');
  }

  const country = (opts?.country ?? 'in').toLowerCase();
  const limit = Math.max(1, Math.min(opts?.limit ?? 50, 50));

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(limit),
    'content-type': 'application/json',
    category: 'it-jobs',
    sort_by: 'date',
  });
  if (opts?.whatPhrase) params.set('what_phrase', opts.whatPhrase);

  const url = `${BASE}/${country}/search/1?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'jobradar/0.3' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Adzuna ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as AdzunaResponse;

  return (data.results ?? [])
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
