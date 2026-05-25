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

/**
 * Decode common HTML entities back to plain text.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function isLoginWall(text: string): boolean {
  const lower = text.toLowerCase();
  // Heuristic: short pages with multiple login-related phrases are walls.
  const signals = [
    'sign in to view',
    'join linkedin',
    'log in to continue',
    'sign in to continue',
    'create your free profile',
    'enable javascript',
  ];
  let hits = 0;
  for (const s of signals) if (lower.includes(s)) hits++;
  if (text.length < 1500 && hits >= 1) return true;
  return hits >= 2;
}

function extractFromHtml(html: string): {
  title?: string;
  company?: string;
  text: string;
} {
  const meta = (name: string) => {
    const re = new RegExp(
      `<meta\\s+(?:property|name)=["']${name}["']\\s+content=["']([^"']+)["']`,
      'i',
    );
    return html.match(re)?.[1]?.trim();
  };

  let title =
    meta('og:title') ??
    meta('twitter:title') ??
    html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ??
    '';
  // Strip trailing site names like " - LinkedIn" or " | Naukri.com"
  title = title.replace(
    /\s*[\|\-–—]\s*(LinkedIn|Naukri|Indeed|Glassdoor|Wellfound|AngelList|Greenhouse|Lever|Workable)[^]*$/i,
    '',
  );

  const company = meta('og:site_name') ?? meta('application-name');

  const cleaned = decodeHtmlEntities(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<form[\s\S]*?<\/form>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim(),
  );

  return { title, company, text: cleaned };
}

async function tryFetchUrl(url: string): Promise<
  | { ok: true; title?: string; company?: string; text: string }
  | { ok: false; reason: string }
> {
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
    if (!res.ok) {
      return { ok: false, reason: `Fetch returned HTTP ${res.status}` };
    }
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('html') && !ct.includes('text')) {
      return { ok: false, reason: `Unsupported content-type: ${ct}` };
    }
    const html = await res.text();
    const extracted = extractFromHtml(html);

    if (extracted.text.length < 200) {
      return { ok: false, reason: 'Page contained almost no text' };
    }
    if (isLoginWall(extracted.text)) {
      return { ok: false, reason: 'Page requires login (login wall detected)' };
    }
    return {
      ok: true,
      title: extracted.title,
      company: extracted.company,
      text: extracted.text.slice(0, 8000),
    };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
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
  let description: string = body.manual_jd?.trim() ?? '';

  // If user didn't paste the JD manually, try to fetch + extract from URL.
  if (!description) {
    const fetched = await tryFetchUrl(url);
    if (fetched.ok) {
      description = fetched.text;
      if (!title && fetched.title) title = fetched.title;
      if (!company && fetched.company) company = fetched.company;
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
        location: null,
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
          location: null,
          description,
          tags: null,
        }),
      ),
      scoreJob({
        resume: profile.resume_text,
        jobTitle: title,
        jobCompany: company,
        jobLocation: null,
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
