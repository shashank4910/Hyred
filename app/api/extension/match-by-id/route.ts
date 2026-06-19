import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/extension/match-by-id?match_id=<uuid>
 * Load a Hyred match for the extension (apply handoff from job detail page).
 */
export async function GET(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth?.profile_id) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }

  const matchId = new URL(req.url).searchParams.get('match_id');
  if (!matchId) {
    return corsResponse({ error: 'match_id query required' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: match } = await sb
    .from('matches')
    .select(
      `id, llm_score, reason, status, cover_letter, matched_skills, missing_skills, tailored_resume_url, tailored_resume_text,
       job:jobs!inner(id, title, company, url, description)`,
    )
    .eq('id', matchId)
    .eq('profile_id', auth.profile_id)
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
