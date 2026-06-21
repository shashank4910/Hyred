import { supabaseAdmin } from '@/lib/supabase/server';
import { normalizeDreamPickRow, resolveDreamPicksForJob, type DreamPickForMatch } from '@/lib/dream-companies';

export type DreamAlertJobInput = {
  profileId: string;
  jobId: string;
  company: string | null | undefined;
  jobTitle: string | null | undefined;
  matchId?: string | null;
  dreamPicks?: DreamPickForMatch[];
};

export async function loadDreamPicksForProfile(profileId: string): Promise<DreamPickForMatch[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('dream_companies')
    .select(
      `id, company_key, company_display_name, source, custom_patterns,
       company_catalog(patterns)`,
    )
    .eq('profile_id', profileId);
  if (error) {
    console.error('[dream-alerts] load picks failed:', error.message);
    return [];
  }
  return (data ?? []).map((row) => normalizeDreamPickRow(row as Record<string, unknown>));
}

export async function processDreamCompanyAlertsForJob(
  input: DreamAlertJobInput,
): Promise<number> {
  const picks = input.dreamPicks ?? (await loadDreamPicksForProfile(input.profileId));
  if (picks.length === 0) return 0;

  const hits = resolveDreamPicksForJob(input.company, picks);
  if (hits.length === 0) return 0;

  const sb = supabaseAdmin();
  let created = 0;

  for (const pick of hits) {
    const { error } = await sb.from('dream_company_alerts').upsert(
      {
        profile_id: input.profileId,
        dream_company_id: pick.id,
        job_id: input.jobId,
        match_id: input.matchId ?? null,
        job_title: input.jobTitle ?? null,
        company_name: input.company ?? null,
      },
      { onConflict: 'profile_id,job_id,dream_company_id', ignoreDuplicates: true },
    );
    if (!error) created += 1;
  }

  if (created > 0) {
    console.log(
      `[dream-alerts] ${created} alert(s) for profile ${input.profileId} — ${input.company} / ${input.jobTitle}`,
    );
  }

  return created;
}

export async function countUnreadDreamAlerts(profileId: string): Promise<number> {
  const sb = supabaseAdmin();
  const { count, error } = await sb
    .from('dream_company_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .is('read_at', null);
  if (error) return 0;
  return count ?? 0;
}
