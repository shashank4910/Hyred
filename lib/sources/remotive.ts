import type { RawJob } from '../types';
import { stripHtml } from '../jd-fetcher';

// Remotive public API - https://remotive.com/api-documentation
const ENDPOINT = 'https://remotive.com/api/remote-jobs';

type RemotiveJob = {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
};

/**
 * Strip HTML tags from a string. Remotive returns description as HTML.
 * Uses the shared stripHtml from jd-fetcher (imported above).
 */

export async function fetchRemotive(opts?: { limit?: number }): Promise<RawJob[]> {
  const limit = opts?.limit ?? 50;
  const url = `${ENDPOINT}?limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'jobradar/0.1' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Remotive ${res.status}`);
  const data = (await res.json()) as { jobs: RemotiveJob[] };
  return (data.jobs ?? []).map((j) => ({
    source: 'remotive',
    source_id: String(j.id),
    title: j.title,
    company: j.company_name ?? null,
    location: j.candidate_required_location || null,
    remote: true,
    url: j.url,
    description: stripHtml(j.description ?? ''),
    salary: j.salary || null,
    tags: j.tags ?? null,
    posted_at: j.publication_date ?? null,
  }));
}
