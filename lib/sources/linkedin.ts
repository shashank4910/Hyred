import type { RawJob } from '../types';
import { logApiRequest } from '../api-tracker-log';

/**
 * LinkedIn — PUBLIC GUEST API (no auth, no API key, no login).
 *
 * Uses the same guest endpoints that search engines use to index LinkedIn
 * job listings. These return the exact data LinkedIn shows to logged-OUT
 * visitors — public data only. No member pages, no login, no ToS acceptance.
 *
 * Endpoints:
 *  - Search: /jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=&location=&start=
 *            Returns 10 job cards (HTML) per page. Paginate with start=0,10,20...
 *  - Detail: /jobs-guest/jobs/api/jobPosting/{jobId}
 *            Returns full job description (HTML).
 *
 * Legal basis: hiQ v LinkedIn established that scraping PUBLIC data (no login)
 * is not a CFAA violation. These guest endpoints are intentionally public for
 * search engine indexing. We stay respectful: low volume, realistic UA, delays.
 */

const SEARCH_BASE =
  'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const DETAIL_BASE = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type ParsedCard = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  postedAt: string | null;
};

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}


/**
 * Parse the search results HTML into structured job cards.
 * Each result is a <li> containing a base-card div.
 */
function parseSearchHtml(html: string): ParsedCard[] {
  const cards: ParsedCard[] = [];
  // Split on each job card's entity-urn marker
  const blocks = html.split('data-entity-urn="urn:li:jobPosting:');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const id = block.slice(0, block.indexOf('"'));
    if (!id || !/^\d+$/.test(id)) continue;

    const titleMatch = block.match(/base-search-card__title">\s*([^<]+)/);
    const companyMatch = block.match(
      /base-search-card__subtitle">\s*<a[^>]*>\s*([^<]+)/,
    );
    const locationMatch = block.match(/job-search-card__location">\s*([^<]+)/);
    const urlMatch = block.match(/(https:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^"?]+)/);
    const dateMatch = block.match(/datetime="([^"]+)"/);

    const title = titleMatch ? decode(titleMatch[1]) : '';
    if (!title) continue;

    cards.push({
      id,
      title,
      company: companyMatch ? decode(companyMatch[1]) : null,
      location: locationMatch ? decode(locationMatch[1]) : null,
      url: urlMatch ? urlMatch[1] : `https://www.linkedin.com/jobs/view/${id}`,
      postedAt: dateMatch ? dateMatch[1] : null,
    });
  }

  return cards;
}

/**
 * Fetch the full job description from the guest detail endpoint.
 * Returns empty string on any failure (non-fatal).
 */
async function fetchDescription(id: string): Promise<string> {
  try {
    const res = await fetch(`${DETAIL_BASE}/${id}`, {
      headers: { 'user-agent': UA, accept: 'text/html' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    const m = html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/);
    if (!m) return '';
    return decode(
      m[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n'),
    ).slice(0, 8000);
  } catch {
    return '';
  }
}


export type LinkedInFetchOpts = {
  /** Search queries (e.g. user's target roles / skills) */
  queries?: string[];
  /** Single location filter (legacy). Prefer `locations`. */
  location?: string;
  /**
   * Multiple locations to search. LinkedIn's country-level "India" search
   * MISSES many city-level jobs for broad keywords, so we search major cities
   * too. e.g. "QA Performance Tester" in Noida is invisible under location=India
   * but visible under location=Noida.
   */
  locations?: string[];
  /** Pages to fetch per (query x location). 10 jobs/page. Default 3. */
  maxPagesPerQuery?: number;
  /** Hard cap on total search requests per run (bounds scan time). Default 90. */
  maxSearchRequests?: number;
  /** Whether to fetch full descriptions (extra request per job). Default true. */
  fetchDescriptions?: boolean;
  /** Cap total descriptions fetched per run to bound request count. Default 70. */
  maxDescriptions?: number;
};

/** Small delay helper — LinkedIn returns cached/duplicate results for rapid
 *  identical-ish requests. A short pause between requests makes pagination
 *  actually return fresh jobs. */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch jobs from LinkedIn's public guest API.
 * Free, no auth, no API key. Paginates the search endpoint per keyword,
 * then optionally fetches full descriptions from the detail endpoint.
 *
 * IMPORTANT pagination note: the guest endpoint returns ~10 jobs per request
 * and honours the `start` offset, BUT only if requests are spaced out. Firing
 * start=0,10,20 back-to-back returns the SAME 10 jobs (server-side caching).
 * A ~300ms delay between requests fixes this and yields unique pages.
 */
export async function fetchLinkedIn(opts?: LinkedInFetchOpts): Promise<RawJob[]> {
  const queries = opts?.queries?.length ? opts.queries : ['performance testing'];
  const locations = opts?.locations?.length
    ? opts.locations
    : [opts?.location ?? 'India'];
  const maxPages = opts?.maxPagesPerQuery ?? 3;
  const maxSearchRequests = opts?.maxSearchRequests ?? 90;
  const fetchDesc = opts?.fetchDescriptions ?? true;
  const maxDesc = opts?.maxDescriptions ?? 70;

  const seen = new Set<string>();
  const cards: ParsedCard[] = [];
  let searchRequests = 0;

  // Iterate query x location. Location-first ordering would repeat keywords;
  // we go query-then-location so each keyword is tried across all cities.
  outer: for (const q of queries) {
    for (const location of locations) {
      let emptyStreak = 0;
      for (let page = 0; page < maxPages; page++) {
        if (searchRequests >= maxSearchRequests) break outer; // global budget
        const start = page * 10;
        const url = `${SEARCH_BASE}?keywords=${encodeURIComponent(q)}&location=${encodeURIComponent(location)}&start=${start}`;
        try {
          // Space out requests so LinkedIn returns fresh pages, not cached dupes.
          if (searchRequests > 0) await delay(300);
          searchRequests++;
          const res = await fetch(url, {
            headers: { 'user-agent': UA, accept: 'text/html' },
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) {
            logApiRequest({ source: 'linkedin', status: res.status === 429 ? 'rate_limited' : 'error', http_status: res.status, query: `${q} @ ${location}` });
            if (res.status === 429) break; // backoff this query/location
            continue;
          }
          const html = await res.text();
          const parsed = parseSearchHtml(html);
          logApiRequest({ source: 'linkedin', status: 'success', http_status: 200, query: `${q} @ ${location}`, jobs_returned: parsed.length });
          let newCount = 0;
          for (const c of parsed) {
            if (!seen.has(c.id)) {
              seen.add(c.id);
              cards.push(c);
              newCount++;
            }
          }
          // Stop this query/location after 2 consecutive no-new-jobs pages.
          if (parsed.length === 0) break;
          if (newCount === 0) {
            emptyStreak++;
            if (emptyStreak >= 2) break;
          } else {
            emptyStreak = 0;
          }
        } catch (e) {
          logApiRequest({ source: 'linkedin', status: 'error', error_message: (e as Error).message, query: `${q} @ ${location}` });
          break;
        }
      }
    }
  }

  // Fetch descriptions (bounded, with limited concurrency) so embedding +
  // scoring have real JD text. Without descriptions, jobs get scored on
  // title alone and good matches get filtered out — that was the quality bug.
  const descMap = new Map<string, string>();
  if (fetchDesc) {
    const toFetch = cards.slice(0, maxDesc);
    const CONCURRENCY = 6;
    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      const batch = toFetch.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (c) => ({ id: c.id, desc: await fetchDescription(c.id) })),
      );
      for (const r of results) {
        if (r.desc) descMap.set(r.id, r.desc);
      }
    }
  }

  console.log(`[linkedin] ${searchRequests} searches across ${locations.length} locations -> ${cards.length} unique jobs, ${descMap.size} with descriptions`);

  return cards.map((c) => ({
    source: 'linkedin',
    source_id: c.id,
    title: c.title,
    company: c.company,
    location: c.location,
    remote: /\b(remote|work from home|wfh)\b/i.test(`${c.title} ${c.location ?? ''}`),
    url: c.url.split('?')[0],
    description: descMap.get(c.id) ?? '',
    salary: null,
    tags: null,
    posted_at: c.postedAt,
  } satisfies RawJob));
}
