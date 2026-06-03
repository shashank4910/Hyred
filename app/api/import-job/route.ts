import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { embed, scoreJob } from '@/lib/gemini';
import { mergeInsightsForScoring } from '@/lib/experience-match';
import { jobToEmbeddingText } from '@/lib/matcher';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = {
  url?: string;
  manual_jd?: string;
  manual_title?: string;
  manual_company?: string;
};

/** Decode common HTML entities back to plain text. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/** Strip HTML tags and collapse whitespace. */
function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim(),
  );
}

/**
 * Find a JSON-LD JobPosting block. Almost every modern job site emits
 * one for Google Jobs SEO — Naukri, Indeed, Wellfound, Glassdoor,
 * Greenhouse, Lever, Workable, ZipRecruiter, Monster, Jobvite, etc.
 *
 * This is the most reliable extraction path for SPA-style sites whose
 * visible HTML is rendered by JS after page load.
 */
function extractJsonLdJob(html: string): {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  postedAt?: string;
  salary?: string;
} | null {
  const blockRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const candidates: Record<string, unknown>[] = [];
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    const raw = match[1].trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const flatten = (v: unknown): void => {
      if (!v) return;
      if (Array.isArray(v)) {
        v.forEach(flatten);
        return;
      }
      if (typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        candidates.push(obj);
        if (obj['@graph']) flatten(obj['@graph']);
      }
    };
    flatten(parsed);
  }

  for (const c of candidates) {
    const t = c['@type'];
    const isJobPosting =
      t === 'JobPosting' ||
      (Array.isArray(t) && (t as string[]).includes('JobPosting'));
    if (!isJobPosting) continue;

    const title = typeof c.title === 'string' ? c.title : undefined;
    const description =
      typeof c.description === 'string' ? htmlToText(c.description) : undefined;

    const org = c.hiringOrganization as Record<string, unknown> | undefined;
    const company =
      typeof org?.name === 'string' ? (org.name as string) : undefined;

    const loc = c.jobLocation as Record<string, unknown> | undefined;
    let location: string | undefined;
    if (loc) {
      const addr = loc.address as Record<string, unknown> | undefined;
      location =
        (addr?.addressLocality as string | undefined) ??
        (addr?.addressRegion as string | undefined) ??
        (loc.name as string | undefined);
    }

    const postedAt =
      typeof c.datePosted === 'string' ? (c.datePosted as string) : undefined;

    let salary: string | undefined;
    const baseSalary = c.baseSalary as Record<string, unknown> | undefined;
    if (baseSalary) {
      const value = baseSalary.value as Record<string, unknown> | undefined;
      const currency = (baseSalary.currency as string | undefined) ?? '';
      if (value) {
        const min = value.minValue ?? value.value;
        const max = value.maxValue;
        if (min && max && min !== max) {
          salary = `${currency} ${min}–${max}`.trim();
        } else if (min) {
          salary = `${currency} ${min}`.trim();
        }
      }
    }

    return { title, company, location, description, postedAt, salary };
  }

  return null;
}

function extractMetaTag(html: string, names: string[]): string | undefined {
  for (const n of names) {
    const re = new RegExp(
      `<meta\\s+(?:property|name)=["']${n}["']\\s+content=["']([^"']+)["']`,
      'i',
    );
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/** Detect login walls. Conservative — only flag when we have strong signals. */
function isLoginWall(text: string): boolean {
  if (text.length > 3000) return false;
  const lower = text.toLowerCase();
  const signals = [
    'sign in to view',
    'join linkedin',
    'log in to continue',
    'sign in to continue',
    'create your free profile',
    'please enable javascript',
    'this content is only available',
  ];
  for (const s of signals) {
    if (lower.includes(s)) return text.length < 1500;
  }
  return false;
}

/**
 * Strip markdown navigation noise so what's left is closer to actual JD prose.
 * Jina output for big sites (Naukri, LinkedIn) is ~30KB and mostly nav links;
 * this can drop it down to <10KB of mostly-relevant text.
 */
function cleanMarkdown(md: string): string {
  return md
    // Remove image markdown entirely: ![alt](src) and ![alt](blob:...)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Convert link markdown to plain text: [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Drop bullet lines that are basically empty after link removal
    .replace(/^[\s\-*]+$/gm, '')
    // Collapse 3+ newlines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Heuristic: locate the start of the actual JD content within a long
 * cleaned markdown document. We look for the first occurrence of any
 * job-content marker; if found, slice from a bit before that marker
 * onwards. Otherwise return the full text unchanged.
 */
function focusOnJobContent(text: string): string {
  if (text.length < 6000) return text;
  const markers = [
    /\bjob description\b/i,
    /\brole\s*&?\s*responsibilities\b/i,
    /\bresponsibilities\b/i,
    /\brequired skills\b/i,
    /\bkey skills\b/i,
    /\babout the role\b/i,
    /\babout the job\b/i,
    /\bwhat you('|\u2019)ll do\b/i,
    /\bwhat we're looking for\b/i,
    /\bqualifications\b/i,
    /\bminimum requirements\b/i,
    /\byears of experience\b/i,
  ];
  let earliest = -1;
  for (const re of markers) {
    const m = text.match(re);
    if (!m) continue;
    const idx = m.index ?? -1;
    if (idx >= 0 && (earliest < 0 || idx < earliest)) earliest = idx;
  }
  if (earliest > 800) {
    // Slice from a bit before the marker to keep some context (heading, etc).
    return text.slice(Math.max(0, earliest - 200));
  }
  return text;
}

async function fetchViaJinaReader(url: string): Promise<
  | { ok: true; title?: string; text: string }
  | { ok: false; reason: string }
> {
  // Jina Reader (https://jina.ai/reader/) renders JS-heavy pages with
  // headless Chrome and returns clean Markdown. Free tier, no API key
  // required for basic use. We hint it to drop nav/header/footer.
  const jinaUrl = `https://r.jina.ai/${url}`;
  try {
    const res = await fetch(jinaUrl, {
      headers: {
        accept: 'text/plain',
        'X-Return-Format': 'markdown',
        'X-Remove-Selector': 'nav,header,footer,aside,form,.advertisement,.ad,.sidebar,#sidebar,[role="navigation"],[role="banner"],[role="contentinfo"]',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      return { ok: false, reason: `Reader API returned HTTP ${res.status}` };
    }
    const raw = await res.text();
    if (raw.length < 200) {
      return { ok: false, reason: 'Reader API returned almost no text' };
    }
    // Strip the "Title: ...\nURL Source: ...\nMarkdown Content:\n" header.
    const titleMatch = raw.match(/Title:\s*([^\n]+)/);
    const title = titleMatch?.[1]?.trim();
    let body = raw;
    const m = raw.match(/Markdown Content:\s*\n([\s\S]+)$/);
    if (m) body = m[1];

    const cleaned = cleanMarkdown(body);
    const focused = focusOnJobContent(cleaned);

    if (focused.length < 200) {
      return { ok: false, reason: 'Cleaned text was too short after stripping nav' };
    }

    return { ok: true, title, text: focused.slice(0, 12000) };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

async function tryFetchUrl(url: string): Promise<
  | {
      ok: true;
      title?: string;
      company?: string;
      location?: string;
      text: string;
      via: 'json-ld' | 'meta' | 'body' | 'reader';
    }
  | { ok: false; reason: string }
> {
  // ---------- A. Direct fetch attempt ----------
  let directReason = '';
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('html') || ct.includes('text')) {
        const html = await res.text();

        // 1. JSON-LD JobPosting (most reliable)
        const jsonLd = extractJsonLdJob(html);
        if (jsonLd?.description && jsonLd.description.length >= 100) {
          return {
            ok: true,
            title: jsonLd.title,
            company: jsonLd.company,
            location: jsonLd.location,
            text: jsonLd.description.slice(0, 8000),
            via: 'json-ld',
          };
        }

        // 2. og:description / meta description / body — pick longest
        const ogTitle =
          extractMetaTag(html, ['og:title', 'twitter:title']) ??
          html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
        const cleanTitle = ogTitle?.replace(
          /\s*[\|\-–—]\s*(LinkedIn|Naukri|Naukri\.com|Indeed|Glassdoor|Wellfound|AngelList|Greenhouse|Lever|Workable)[^]*$/i,
          '',
        );
        const metaDesc = extractMetaTag(html, [
          'og:description',
          'twitter:description',
          'description',
        ]);
        const bodyText = htmlToText(html);

        type Candidate = { text: string; via: 'meta' | 'body' | 'json-ld' };
        const candidates: Candidate[] = [];
        if (jsonLd?.description)
          candidates.push({ text: jsonLd.description, via: 'json-ld' });
        if (metaDesc) candidates.push({ text: metaDesc, via: 'meta' });
        if (bodyText) candidates.push({ text: bodyText, via: 'body' });
        candidates.sort((a, b) => b.text.length - a.text.length);
        const best = candidates[0];

        if (best && best.text.length >= 100) {
          if (best.via === 'body' && isLoginWall(best.text)) {
            directReason = 'login wall on body text';
          } else {
            return {
              ok: true,
              title: jsonLd?.title ?? cleanTitle,
              company: jsonLd?.company,
              location: jsonLd?.location,
              text: best.text.slice(0, 8000),
              via: best.via,
            };
          }
        } else {
          directReason = 'page contained almost no text';
        }
      } else {
        directReason = `unsupported content-type ${ct}`;
      }
    } else {
      directReason = `HTTP ${res.status}`;
    }
  } catch (e) {
    directReason = (e as Error).message;
  }

  // ---------- B. Fallback: Jina Reader (handles JS-rendered SPAs) ----------
  const reader = await fetchViaJinaReader(url);
  if (reader.ok) {
    return {
      ok: true,
      title: reader.title,
      text: reader.text,
      via: 'reader',
    };
  }

  return {
    ok: false,
    reason: `Page contained almost no text (likely a JS-rendered SPA without JobPosting structured data) [direct: ${directReason}; reader: ${reader.reason}]`,
  };
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const url = body.url?.trim() || '';
  const hasValidUrl = !!url && /^https?:\/\//i.test(url);
  const hasManualJd = !!(body.manual_jd?.trim()) && body.manual_jd!.trim().length >= 100;

  // Require either a valid URL or a manual JD
  if (!hasValidUrl && !hasManualJd) {
    return NextResponse.json(
      { error: 'Provide a valid http(s) URL or paste a JD (at least 100 chars)' },
      { status: 400 },
    );
  }

  let title: string = body.manual_title?.trim() ?? '';
  let company: string | null = body.manual_company?.trim() || null;
  let location: string | null = null;
  let description: string = body.manual_jd?.trim() ?? '';

  // If user didn't paste the JD manually, try to fetch + extract from URL.
  if (!description && hasValidUrl) {
    const fetched = await tryFetchUrl(url);
    if (fetched.ok) {
      description = fetched.text;
      if (!title && fetched.title) title = fetched.title;
      if (!company && fetched.company) company = fetched.company;
      if (fetched.location) location = fetched.location;
    } else {
      return NextResponse.json(
        {
          error: `Could not auto-fetch this URL: ${fetched.reason}. Paste the JD text manually below.`,
          needs_manual: true,
        },
        { status: 422 },
      );
    }
  }

  if (description.length < 100) {
    return NextResponse.json(
      { error: 'Job description is too short (need at least 100 chars)' },
      { status: 400 },
    );
  }
  if (!title) title = 'Imported job';

  const sb = supabaseAdmin();

  const profile = await getCurrentProfile();
  if (!profile?.resume_text) {
    return NextResponse.json(
      { error: 'No profile/resume found. Complete onboarding first.' },
      { status: 400 },
    );
  }

  const { data: applyProfileRow } = await sb
    .from('apply_profiles')
    .select('years_experience')
    .eq('profile_id', profile.id)
    .maybeSingle();
  const scoringInsights = mergeInsightsForScoring(
    profile.insights,
    applyProfileRow?.years_experience,
  );

  // Upsert the job (URL is the unique id for source='manual')
  // When no URL is provided (manual JD only), use a hash of the description as source_id
  const jobUrl = hasValidUrl ? url : `manual://${Date.now()}`;
  const { data: jobRow, error: jobErr } = await sb
    .from('jobs')
    .upsert(
      {
        source: 'manual',
        source_id: jobUrl,
        title,
        company,
        location,
        remote: /\b(remote|wfh|work from home)\b/i.test(`${title} ${description}`),
        url: hasValidUrl ? url : '',
        description,
        salary: null,
        tags: null,
        posted_at: null,
      },
      { onConflict: 'source,source_id' },
    )
    .select('id')
    .single();
  if (jobErr || !jobRow) {
    return NextResponse.json(
      { error: jobErr?.message ?? 'Could not save job' },
      { status: 500 },
    );
  }

  // Embed + score in parallel.
  let scoreOut = {
    score: 0,
    reason: '',
    matchedSkills: [] as string[],
    missingSkills: [] as string[],
  };
  let vec: number[] | null = null;
  try {
    const [v, s] = await Promise.all([
      embed(
        jobToEmbeddingText({
          title,
          company,
          location,
          description,
          tags: null,
        }),
      ),
      scoreJob({
        resume: profile.resume_text,
        insights: scoringInsights,
        jobTitle: title,
        jobCompany: company,
        jobLocation: location,
        jobDescription: description,
      }),
    ]);
    vec = v;
    scoreOut = s;
  } catch (e) {
    return NextResponse.json(
      {
        error: `Saved the job, but AI scoring failed: ${(e as Error).message}`,
        partial: true,
      },
      { status: 500 },
    );
  }

  if (vec) {
    await sb.from('jobs').update({ embedding: vec }).eq('id', jobRow.id);
  }

  const { data: match, error: matchErr } = await sb
    .from('matches')
    .upsert(
      {
        profile_id: profile.id,
        job_id: jobRow.id,
        similarity: 1,
        llm_score: scoreOut.score,
        reason: scoreOut.reason,
        matched_skills: scoreOut.matchedSkills,
        missing_skills: scoreOut.missingSkills,
        status: 'new',
      },
      { onConflict: 'profile_id,job_id' },
    )
    .select('id')
    .single();
  if (matchErr || !match) {
    return NextResponse.json(
      { error: matchErr?.message ?? 'Could not save match' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    match_id: match.id,
    score: scoreOut.score,
    reason: scoreOut.reason,
    title,
  });
}
