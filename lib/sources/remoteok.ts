import type { RawJob } from '../types';
import { stripHtml } from '../jd-fetcher';

// RemoteOK public JSON feed - https://remoteok.com/api
const ENDPOINT = 'https://remoteok.com/api';

type RemoteOkJob = {
  id?: string;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  url?: string;
  apply_url?: string;
  description?: string;
  salary_min?: number;
  salary_max?: number;
  tags?: string[];
  date?: string;
};

export async function fetchRemoteOk(): Promise<RawJob[]> {
  const res = await fetch(ENDPOINT, {
    headers: { 'user-agent': 'jobradar/0.1 (contact: shashank)' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RemoteOK ${res.status}`);
  const raw = (await res.json()) as RemoteOkJob[];
  // First element is metadata, rest are jobs
  const jobs = raw.filter((j) => j.id && j.position);
  return jobs.map((j) => {
    const salary =
      j.salary_min || j.salary_max
        ? `${j.salary_min ?? ''}${j.salary_min && j.salary_max ? ' - ' : ''}${j.salary_max ?? ''} USD`.trim()
        : null;
    return {
      source: 'remoteok',
      source_id: String(j.id),
      title: j.position ?? '',
      company: j.company ?? null,
      location: j.location || null,
      remote: true,
      url: j.url || j.apply_url || `https://remoteok.com/remote-jobs/${j.slug ?? j.id}`,
      description: stripHtml(j.description ?? ''),
      salary,
      tags: j.tags ?? null,
      posted_at: j.date ?? null,
    } satisfies RawJob;
  });
}
