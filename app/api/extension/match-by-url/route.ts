import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import { signResumeUrl } from '@/lib/resume-storage';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

function extractReqCode(text: string): string | null {
  const m = text.match(/\b(IRC\d+|JR[\s-]?\d+|REQ[\s-]?\d+|R\d{5,})\b/i);
  return m ? m[0].replace(/\s+/g, '').toUpperCase() : null;
}

function titleSearchPattern(titleHint: string): string | null {
  const normalized = titleHint
    .split('|')[0]
    .replace(/\b(IRC\d+|JR[\s-]?\d+|REQ[\s-]?\d+)\b/gi, '')
    .replace(/\b(careers?|jobs?|apply|hiring)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = normalized
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(the|and|for|with|engg|engineer)$/i.test(w))
    .slice(0, 5);
  if (words.length < 2) return null;
  return `%${words.join('%')}%`;
}

/**
 * GET /api/extension/match-by-url?url=<encoded>&title=&company=&code=
 * Find a JobRadar match for the given posting URL (so the extension can
 * inject the existing AI cover letter and auto-update status).
 * Scoped to the authenticated user's profile.
 *
 * Strategy: prefix-match the URL up to the query string. Many ATS career
 * pages include tracking params we don't want to dedupe on. When the apply
 * URL differs (generic company career sites), fall back to requisition code
 * or title hints from the page.
 */
export async function GET(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const url = params.get('url');
  const titleHint = (params.get('title') || '').trim();
  const companyHint = (params.get('company') || '').trim().toLowerCase();
  const codeHint = (
    params.get('code') ||
    extractReqCode(titleHint) ||
    (url ? extractReqCode(url) : null) ||
    ''
  )
    .trim()
    .toUpperCase();

  if (!url && !titleHint && !codeHint) {
    return corsResponse({ error: 'url or title/code hint required' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const selectCols =
    `id, llm_score, reason, status, cover_letter, matched_skills, missing_skills, tailored_resume_url, tailored_resume_text,
       job:jobs!inner(id, title, company, url, description)`;

  const baseQuery = () => {
    let q = sb.from('matches').select(selectCols);
    if (auth.profile_id) q = q.eq('profile_id', auth.profile_id);
    return q;
  };

  let match: Record<string, unknown> | null = null;

  function pickBestHintMatch(
    rows: Record<string, unknown>[] | null | undefined,
  ): Record<string, unknown> | null {
    if (!rows?.length) return null;
    const withTailored = rows.find((row) => {
      const r = row as { tailored_resume_text?: string | null; tailored_resume_url?: string | null };
      return !!(r.tailored_resume_text?.trim() || r.tailored_resume_url);
    });
    return (withTailored ?? rows[0]) as Record<string, unknown>;
  }

  if (url) {
    // Strip query/fragment to get the canonical URL prefix.
    const canonical = url.split(/[?#]/)[0].replace(/\/+$/, '');

    // 1) Exact prefix match (posting URL stored as-is).
    ({ data: match } = await baseQuery()
      .ilike('job.url', `${canonical}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle());

    // 2) Workday: apply URL often differs from listing URL — match on job slug / req id.
    if (!match && auth.profile_id) {
      const slug = canonical.match(/\/([^/?#]+)$/)?.[1];
      if (slug && slug.length >= 6) {
        const { data: slugMatch } = await baseQuery()
          .ilike('job.url', `%${slug}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        match = slugMatch;
      }
    }

    // 3) Reverse prefix: stored job URL is shorter than apply wizard URL.
    if (!match && auth.profile_id) {
      const { data: rows } = await baseQuery()
        .order('created_at', { ascending: false })
        .limit(40);
      match =
        (rows ?? []).find((row) => {
          const jobUrl = (
            row.job as unknown as { url?: string }
          )?.url?.split(/[?#]/)[0]?.replace(/\/+$/, '');
          return jobUrl && (canonical.startsWith(jobUrl) || jobUrl.startsWith(canonical));
        }) ?? null;
    }
  }

  // 4) Requisition / IRC code in title or stored URL (generic career sites).
  if (!match && codeHint && auth.profile_id) {
    const { data: codeRows } = await baseQuery()
      .or(`job.title.ilike.%${codeHint}%,job.url.ilike.%${codeHint}%`)
      .order('created_at', { ascending: false })
      .limit(5);
    match = pickBestHintMatch(codeRows ?? []);
  }

  // 5) Fuzzy title match from page heading (company career pages).
  if (!match && titleHint && auth.profile_id) {
    const pattern = titleSearchPattern(titleHint);
    if (pattern) {
      let q = baseQuery().ilike('job.title', pattern);
      if (companyHint) {
        q = q.ilike('job.company', `%${companyHint}%`);
      }
      const { data: titleRows } = await q
        .order('created_at', { ascending: false })
        .limit(5);
      match = pickBestHintMatch(titleRows ?? []);
    }
  }

  // 6) Company-only fallback when title is very short but code wasn't in DB title.
  if (!match && companyHint && titleHint && auth.profile_id) {
    const shortTitle = titleHint.slice(0, 40);
    const { data: companyMatch } = await baseQuery()
      .ilike('job.company', `%${companyHint}%`)
      .ilike('job.title', `%${shortTitle.split(/\s+/).slice(0, 3).join('%')}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    match = companyMatch;
  }

  if (!match) {
    return corsResponse({ ok: true, match: null });
  }

  const job = match.job as unknown as {
    id: string;
    title: string;
    company: string | null;
    url: string;
    description: string | null;
  };

  const hasTailored = !!(
    (match as { tailored_resume_text?: string | null }).tailored_resume_text ||
    match.tailored_resume_url
  );

  const signedResumeUrl = await signResumeUrl(
    sb,
    (match as { tailored_resume_url?: string | null }).tailored_resume_url,
  );

  return corsResponse({
    ok: true,
    match: {
      id: match.id,
      score: match.llm_score,
      reason: match.reason,
      status: match.status,
      cover_letter: match.cover_letter,
      matched_skills: match.matched_skills ?? [],
      missing_skills: match.missing_skills ?? [],
      tailored_resume_url: signedResumeUrl,
      has_tailored_resume: hasTailored,
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        url: job.url,
        description: job.description?.slice(0, 6000),
      },
    },
  });
}
