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
  const canonical = url.split(/[?#]/)[0];

  const sb = supabaseAdmin();

  // Build query, scoped to user's profile if available
  let query = sb
    .from('matches')
    .select(
      `id, llm_score, reason, status, cover_letter, matched_skills, missing_skills, tailored_resume_url,
       job:jobs!inner(id, title, company, url, description)`,
    )
    .ilike('job.url', `${canonical}%`);

  if (auth.profile_id) {
    query = query.eq('profile_id', auth.profile_id);
  }

  const { data: match } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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
