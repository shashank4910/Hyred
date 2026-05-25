import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { embed, scoreJob } from '@/lib/gemini';
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

async function fetchViaJinaReader(url: string): Promise<
  | { ok: true; title?: string; text: string }
  | { ok: false; reason: string }
> {
  // Jina Reader (https://jina.ai/reader/) renders JS-heavy pages with
  // headless Chrome and returns clean Markdown. Free tier, no API key
  // required for basic use.
  const jinaUrl = `https://r.jina.ai/${url}`;
  try {
    const res = await fetch(jinaUrl, {
      headers: {
        accept: 'text/plain',
        'X-Return-Format': 'markdown',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      return { ok: false, reason: `Reader API returned HTTP ${res.status}` };
    }
    const text = await res.text();
    if (text.length < 200) {
      return { ok: false, reason: 'Reader API returned almost no text' };
    }
    // Jina returns "Title: ...\nURL Source: ...\n\nMarkdown Content: ...\n<body>"
    // Strip the metadata header to keep just the body.
    let body = text;
    const m = text.match(/Markdown Content:\s*\n([\s\S]+)$/);
    if (m) body = m[1];
    const titleMatch = text.match(/Title:\s*([^\n]+)/);
    const title = titleMatch?.[1]?.trim();

    return { ok: true, title, text: body.trim().slice(0, 8000) };
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

  const url = body.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: 'A valid http(s) URL is required' },
      { status: 400 },
    );
  }

  let title: string = body.manual_title?.trim() ?? '';
  let company: string | null = body.manual_company?.trim() || null;
  let location: string | null = null;
  let description: string = body.manual_jd?.trim() ?? '';

  // If user didn't paste the JD manually, try to fetch + extract from URL.
  if (!description) {
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

  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('id, resume_text, resume_embedding')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (profileErr || !profile?.resume_text) {
    return NextResponse.json(
      { error: 'No profile/resume found. Complete onboarding first.' },
      { status: 400 },
    );
  }

  // Upsert the job (URL is the unique id for source='manual')
  const { data: jobRow, error: jobErr } = await sb
    .from('jobs')
    .upsert(
      {
        source: 'manual',
        source_id: url,
        title,
        company,
        location,
        remote: /\b(remote|wfh|work from home)\b/i.test(`${title} ${description}`),
        url,
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
  let scoreOut = { score: 0, reason: '' };
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
