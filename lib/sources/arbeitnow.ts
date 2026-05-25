import type { RawJob } from '../types';

// Arbeitnow public job board API - no key required
// https://documenter.getpostman.com/view/18545278/UVJbJdKh
const ENDPOINT = 'https://www.arbeitnow.com/api/job-board-api';

type ArbeitnowJob = {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
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
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export async function fetchArbeitnow(): Promise<RawJob[]> {
  const res = await fetch(ENDPOINT, {
    headers: { 'user-agent': 'jobradar/0.2' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Arbeitnow ${res.status}`);
  const data = (await res.json()) as { data: ArbeitnowJob[] };
  return (data.data ?? [])
    .filter((j) => j.slug && j.title)
    .map((j) => ({
      source: 'arbeitnow',
      source_id: j.slug!,
      title: j.title!,
      company: j.company_name ?? null,
      location: j.location || null,
      remote: !!j.remote,
      url: j.url || `https://www.arbeitnow.com/jobs/${j.slug}`,
      description: stripHtml(j.description ?? ''),
      salary: null,
      tags: j.tags ?? null,
      posted_at: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
    }));
}
