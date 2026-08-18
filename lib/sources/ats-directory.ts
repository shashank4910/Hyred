/**
 * ATS-directory job source — Greenhouse, Lever, Ashby public boards.
 *
 * This is the pattern LinkedIn/Indeed use to reach high-volume inventory:
 * instead of scraping job boards, pull directly from the ATS systems where
 * companies publish their careers pages. All three expose keyless public
 * JSON endpoints (no API key, no OAuth, no partner approval):
 *
 *   Greenhouse: GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *   Lever:      GET https://api.lever.co/v0/postings/{site}?mode=json
 *   Ashby:      GET https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true
 *
 * There is no discovery endpoint — you must know each company's board slug.
 * ATS_BOARDS is a curated, LIVE-VERIFIED list (each entry was confirmed to
 * return jobs on Aug 18, 2026 against the Top-MNC catalog). Add companies by
 * appending their board slug; run scripts/tmp verify to confirm before shipping.
 *
 * Unlike the per-user-query sources (jsearch/jobspipe), this fetches each
 * company's FULL board every scan — volume comes from the company list, not
 * the user's search keywords. Upsert dedup (source, source_id) means re-scans
 * only insert genuinely-new postings.
 */

import type { RawJob } from '../types';
import { stripHtml } from '../jd-fetcher';

export type AtsName = 'greenhouse' | 'lever' | 'ashby';

export type AtsBoard = {
  /** Company display name (for RawJob.company). */
  company: string;
  ats: AtsName;
  /** Board slug/token on the ATS (e.g. greenhouse: 'stripe', ashby: 'notion'). */
  slug: string;
};

/**
 * Curated company → ATS board list, seeded from the Top-MNC catalog and
 * verified live on 2026-08-18 (each board returned ≥1 job). Board slugs are
 * case-sensitive company tokens — do NOT guess; verify before adding.
 */
export const ATS_BOARDS: AtsBoard[] = [
  // ===== Greenhouse =====
  { company: 'Twilio', ats: 'greenhouse', slug: 'twilio' },
  { company: 'Databricks', ats: 'greenhouse', slug: 'databricks' },
  { company: 'Elastic', ats: 'greenhouse', slug: 'elastic' },
  { company: 'Stripe', ats: 'greenhouse', slug: 'stripe' },
  { company: 'Airbnb', ats: 'greenhouse', slug: 'airbnb' },
  { company: 'Lyft', ats: 'greenhouse', slug: 'lyft' },
  { company: 'Cloudflare', ats: 'greenhouse', slug: 'cloudflare' },
  { company: 'Datadog', ats: 'greenhouse', slug: 'datadog' },
  { company: 'Figma', ats: 'greenhouse', slug: 'figma' },
  { company: 'Vercel', ats: 'greenhouse', slug: 'vercel' },
  { company: 'MongoDB', ats: 'greenhouse', slug: 'mongodb' },
  { company: 'GitLab', ats: 'greenhouse', slug: 'gitlab' },
  { company: 'BCG', ats: 'greenhouse', slug: 'bcg' },
  { company: 'TCS', ats: 'greenhouse', slug: 'tcs' },
  { company: 'Thoughtworks', ats: 'greenhouse', slug: 'thoughtworks' },
  { company: 'Druva', ats: 'greenhouse', slug: 'druva' },
  { company: 'Postman', ats: 'greenhouse', slug: 'postman' },
  { company: 'PhonePe', ats: 'greenhouse', slug: 'phonepe' },
  { company: 'Groww', ats: 'greenhouse', slug: 'groww' },
  { company: 'Slice', ats: 'greenhouse', slug: 'slice' },
  { company: 'Pure Storage', ats: 'greenhouse', slug: 'purestorage' },
  { company: 'Capco', ats: 'greenhouse', slug: 'capco' },

  // ===== Lever =====
  { company: 'Spotify', ats: 'lever', slug: 'spotify' },
  { company: 'Paytm', ats: 'lever', slug: 'paytm' },
  { company: 'CRED', ats: 'lever', slug: 'cred' },
  { company: 'Meesho', ats: 'lever', slug: 'meesho' },
  { company: 'Zeta', ats: 'lever', slug: 'zeta' },

  // ===== Ashby =====
  { company: 'Snowflake', ats: 'ashby', slug: 'snowflake' },
  { company: 'Confluent', ats: 'ashby', slug: 'confluent' },
  { company: 'Notion', ats: 'ashby', slug: 'notion' },
  { company: 'Supabase', ats: 'ashby', slug: 'supabase' },
  { company: 'Titan', ats: 'ashby', slug: 'titan' },
];

const UA = 'Mozilla/5.0 (jobradar/0.2; ATS directory fetch)';

/** Parallel GETs with a concurrency cap (be nice to the ATS endpoints). */
async function fetchAll(
  boards: AtsBoard[],
  concurrency = 6,
): Promise<{ board: AtsBoard; jobs: RawJob[] }[]> {
  const results: { board: AtsBoard; jobs: RawJob[] }[] = [];
  const queue = [...boards];
  async function worker() {
    while (queue.length) {
      const board = queue.shift()!;
      try {
        const jobs = await fetchBoard(board);
        results.push({ board, jobs });
      } catch {
        // A dead/changed board slug must not kill the whole scan — log and skip.
        results.push({ board, jobs: [] });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function fetchBoard(board: AtsBoard): Promise<RawJob[]> {
  if (board.ats === 'greenhouse') return fetchGreenhouseBoard(board.slug, board.company);
  if (board.ats === 'lever') return fetchLeverBoard(board.slug, board.company);
  return fetchAshbyBoard(board.slug, board.company);
}

// ---------- Greenhouse ----------
type GreenhouseJob = {
  id: number;
  title: string;
  content?: string;
  location?: { name?: string } | null;
  absolute_url?: string;
  company_name?: string;
  first_published?: string;
};

async function fetchGreenhouseBoard(slug: string, company: string): Promise<RawJob[]> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
    { headers: { 'user-agent': UA }, cache: 'no-store', signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) throw new Error(`Greenhouse ${slug} ${res.status}`);
  const data = (await res.json()) as { jobs?: GreenhouseJob[] };
  return (data.jobs ?? []).map((j) => ({
    source: 'greenhouse',
    source_id: String(j.id),
    title: j.title,
    company: j.company_name || company,
    location: j.location?.name ?? null,
    remote: /remote/i.test(j.location?.name ?? ''),
    url: j.absolute_url ?? `https://boards.greenhouse.io/${slug}/jobs/${j.id}`,
    description: j.content ? stripHtml(j.content) : null,
    salary: null,
    tags: null,
    posted_at: j.first_published ?? null,
  }));
}

// ---------- Lever ----------
type LeverJob = {
  id: string;
  text?: string;
  descriptionPlain?: string;
  additionalPlain?: string;
  hostedUrl?: string;
  categories?: { location?: string; commitment?: string };
  workplaceType?: string;
  salaryRange?: { currency?: string; min?: number; max?: number };
  createdAt?: number;
};

function leverSalary(r?: LeverJob['salaryRange']): string | null {
  if (!r || r.min == null || r.max == null) return null;
  const cur = r.currency ? `${r.currency} ` : '';
  return `${cur}${r.min.toLocaleString()} – ${r.max.toLocaleString()}`;
}

async function fetchLeverBoard(slug: string, company: string): Promise<RawJob[]> {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    { headers: { 'user-agent': UA }, cache: 'no-store', signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) throw new Error(`Lever ${slug} ${res.status}`);
  const data = (await res.json()) as LeverJob[];
  if (!Array.isArray(data)) return [];
  return data.map((j) => ({
    source: 'lever',
    source_id: String(j.id),
    title: j.text ?? '',
    company,
    location: j.categories?.location ?? null,
    remote:
      /remote/i.test(j.workplaceType ?? '') || /remote/i.test(j.categories?.location ?? ''),
    url: j.hostedUrl ?? `https://jobs.lever.co/${slug}/${j.id}`,
    description:
      [j.descriptionPlain, j.additionalPlain].filter(Boolean).join('\n\n') || null,
    salary: leverSalary(j.salaryRange),
    tags: null,
    posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
  }));
}

// ---------- Ashby ----------
type AshbyJob = {
  id: string;
  title?: string;
  location?: string;
  secondaryLocations?: string[];
  isRemote?: boolean;
  workplaceType?: string;
  employmentType?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  publishedAt?: string;
  compensation?: { compensationTierSummary?: string; scrapeableCompensationSalarySummary?: string };
};

async function fetchAshbyBoard(slug: string, company: string): Promise<RawJob[]> {
  const res = await fetch(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
    { headers: { 'user-agent': UA }, cache: 'no-store', signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) throw new Error(`Ashby ${slug} ${res.status}`);
  const data = (await res.json()) as { jobs?: AshbyJob[] };
  return (data.jobs ?? []).map((j) => {
    const locParts = [j.location, ...(j.secondaryLocations ?? [])].filter(Boolean);
    return {
      source: 'ashby',
      source_id: String(j.id),
      title: j.title ?? '',
      company,
      location: locParts.join(', ') || null,
      remote: j.isRemote === true || /remote/i.test(j.workplaceType ?? ''),
      url: j.jobUrl ?? j.applyUrl ?? `https://jobs.ashbyhq.com/${slug}`,
      description: j.descriptionPlain ?? null,
      salary:
        j.compensation?.scrapeableCompensationSalarySummary ??
        j.compensation?.compensationTierSummary ??
        null,
      tags: null,
      posted_at: j.publishedAt ?? null,
    };
  });
}

/**
 * All jobs from every board in ATS_BOARDS (skips dead boards, never throws).
 * Optionally filter to one ATS (used by the per-ATS source fns in
 * lib/sources/index.ts so each source only returns its own jobs).
 */
export async function fetchAtsDirectory(ats?: AtsName): Promise<RawJob[]> {
  const boards = ats ? ATS_BOARDS.filter((b) => b.ats === ats) : ATS_BOARDS;
  const results = await fetchAll(boards);
  return results.flatMap((r) => r.jobs);
}
