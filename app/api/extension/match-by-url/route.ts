import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/extension/match-by-url?url=<encoded>
 * Find a JobRadar match for the given posting URL (so the extension can
 * inject the existing AI cover letter and auto-update status).
 * Scoped to the authenticated user's profile.
 *
 * Strategy: prefix-match the URL up to the query string. Many ATS career
 * pages include tracking params we don't want to dedupe on.
 */
export async function GET(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url).searchParams.get('url');
  if (!url) {
    return corsResponse({ error: 'url query required' }, { status: 400 });
  }
  // Strip query/fragment to get the canonical URL prefix.
  const canonical = url.split(/[?#]/)[0].replace(/\/+$/, '');

  const sb = supabaseAdmin();

  const selectCols =
    `id, llm_score, reason, status, cover_letter, matched_skills, missing_skills, tailored_resume_url, tailored_resume_text,
       job:jobs!inner(id, title, company, url, description)`;

  const baseQuery = () => {
    let q = sb.from('matches').select(selectCols);
    if (auth.profile_id) q = q.eq('profile_id', auth.profile_id);
    return q;
  };

  // 1) Exact prefix match (posting URL stored as-is).
  let { data: match } = await baseQuery()
    .ilike('job.url', `${canonical}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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
      tailored_resume_url: match.tailored_resume_url ?? null,
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
