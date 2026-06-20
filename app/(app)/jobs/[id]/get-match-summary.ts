import { supabaseAdmin } from '@/lib/supabase/server';

export type MatchSummary = {
  id: string;
  llm_score: number | null;
  job: {
    id: string;
    title: string;
    company: string | null;
    location: string | null;
  };
};

export async function getMatchSummary(
  matchId: string,
  profileId: string,
): Promise<MatchSummary | null> {
  const sb = supabaseAdmin();
  const { data: match } = await sb
    .from('matches')
    .select(
      `id, llm_score,
       job:jobs(id, title, company, location)`,
    )
    .eq('id', matchId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (!match) return null;

  const job = match.job as unknown as MatchSummary['job'];
  return {
    id: match.id,
    llm_score: match.llm_score,
    job,
  };
}
