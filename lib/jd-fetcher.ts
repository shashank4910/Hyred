/**
 * Fetches the full job description from a job posting's redirect URL.
 *
 * WHY: Adzuna's search API truncates job descriptions to ~500 chars. To do
 * accurate skill matching, ATS resume generation, and scoring, we need the
 * complete JD content. This module fetches the redirect URL and extracts
 * the full description using SEO-friendly markup that most job sites expose.
 *
 * STRATEGIES (in order of reliability):
 *   1. JSON-LD JobPosting schema (used by LinkedIn, Naukri, Indeed, Greenhouse,
 *      Lever, etc. for SEO — most reliable, returns full structured content)
 *   2. og:description meta tag (Open Graph standard)
 *   3. name=description meta tag (HTML standard)
 *
 * No new dependencies — uses regex-based extraction.
 */

import { supabaseAdmin } from './supabase/server';

const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; JobRadarBot/1.0; +https://github.com/shashank4910/JobRadar)';

/** Threshold below which we consider a description "truncated" and worth refetching. */
const TRUNCATED_LENGTH_THRESHOLD = 1000;

/**
 * Strip HTML to plain text.
 */
function stripHtml(s: string): string {
  return s
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Find JSON-LD JobPosting blocks. Most major job sites embed structured
 * job data here for Google's job search SEO. The full description is
 * always present.
 */
function extractFromJsonLd(html: string): string | null {
  const scriptRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    // The JSON-LD value can be an object, an array of objects, or have a
    // @graph wrapper. Walk all of those structures looking for JobPosting.
    const queue: unknown[] = [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      const obj = node as Record<string, unknown>;

      const type = obj['@type'];
      const isJobPosting =
        type === 'JobPosting' ||
        (Array.isArray(type) && type.includes('JobPosting'));

      if (isJobPosting && typeof obj.description === 'string') {
        const desc = stripHtml(obj.description);
        if (desc.length >= 200) return desc;
      }

      // Walk into nested structures
      if (Array.isArray(obj['@graph'])) queue.push(...obj['@graph']);
      if (Array.isArray(parsed) && node === parsed) {
        // Already handled by initial queue
      }
      // Walk all object values that might contain nested JobPosting
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) queue.push(...value);
        else if (value && typeof value === 'object') queue.push(value);
      }
    }
  }

  return null;
}

/**
 * Find a meta tag like:
 *   <meta property="og:description" content="...">
 *   <meta name="description" content="...">
 * Tolerant of attribute order and quote style.
 */
function extractFromMeta(
  html: string,
  attrName: string,
  attrValue: string,
): string | null {
  // Pattern 1: <meta {attr}="..." content="...">
  const re1 = new RegExp(
    `<meta\\s+[^>]*${attrName}=["']${attrValue}["'][^>]*content=["']([^"']+)["']`,
    'i',
  );
  const m1 = re1.exec(html);
  if (m1) return stripHtml(m1[1]);

  // Pattern 2: <meta content="..." {attr}="...">
  const re2 = new RegExp(
    `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${attrValue}["']`,
    'i',
  );
  const m2 = re2.exec(html);
  if (m2) return stripHtml(m2[1]);

  return null;
}

/**
 * Fetch the full job description from a posting URL. Returns null if any
 * step fails — the caller should fall back to whatever description it has.
 */
export async function fetchFullJobDescription(
  url: string,
): Promise<string | null> {
  if (!url) return null;

  let html: string;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('html')) {
      return null;
    }
    html = await res.text();
  } catch {
    return null;
  }

  if (!html || html.length < 200) return null;

  // Strategy 1: JSON-LD (best — usually contains the full HTML JD content)
  const jsonLd = extractFromJsonLd(html);
  if (jsonLd && jsonLd.length >= 500) return jsonLd;

  // Strategy 2: og:description (varies — sometimes short, sometimes full)
  const og = extractFromMeta(html, 'property', 'og:description');
  if (og && og.length >= 500) return og;

  // Strategy 3: name=description meta tag (usually short, but check)
  const desc = extractFromMeta(html, 'name', 'description');
  if (desc && desc.length >= 500) return desc;

  // Last-resort: return whatever we got, even if shorter than ideal —
  // the caller compares against current and only persists if longer.
  return jsonLd ?? og ?? desc ?? null;
}

/**
 * Ensure a job has a substantive description. If the stored description
 * is short (typical of Adzuna-sourced jobs which are truncated to 500 chars),
 * fetch the full JD from the redirect URL and persist it.
 *
 * Returns the best-available description text.
 *
 * Idempotent and safe to call multiple times — no-op if the description
 * is already long enough.
 */
export async function ensureFullDescription(args: {
  jobId: string;
  currentDescription: string | null;
  url: string | null;
}): Promise<string> {
  const current = args.currentDescription ?? '';

  // Already substantial — no need to fetch
  if (current.length >= TRUNCATED_LENGTH_THRESHOLD) return current;
  if (!args.url) return current;

  console.log(
    `[jd-fetcher] Fetching full JD for job ${args.jobId} (current: ${current.length} chars)`,
  );

  const full = await fetchFullJobDescription(args.url);

  // No improvement — keep the current one
  if (!full || full.length <= current.length) {
    if (full == null) {
      console.log(`[jd-fetcher] Fetch returned null for job ${args.jobId}`);
    } else {
      console.log(
        `[jd-fetcher] Fetched ${full.length} chars but not better than current ${current.length} for job ${args.jobId}`,
      );
    }
    return current;
  }

  // Persist the upgraded description back to DB so subsequent calls are fast.
  try {
    const sb = supabaseAdmin();
    const { error } = await sb
      .from('jobs')
      .update({ description: full })
      .eq('id', args.jobId);
    if (error) {
      console.warn(
        `[jd-fetcher] Failed to persist for job ${args.jobId}:`,
        error.message,
      );
      // Still return the full description for this request
    } else {
      console.log(
        `[jd-fetcher] Job ${args.jobId} description: ${current.length} → ${full.length} chars`,
      );
    }
  } catch (e) {
    console.warn(
      `[jd-fetcher] Persist threw for job ${args.jobId}:`,
      (e as Error).message,
    );
  }

  return full;
}
