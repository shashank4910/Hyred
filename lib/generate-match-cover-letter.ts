import type { SupabaseClient } from '@supabase/supabase-js';
import { generateCoverLetter } from '@/lib/gemini';
import { ensureFullDescription } from '@/lib/jd-fetcher';

/**
 * Generate a tailored cover letter for a match and persist it on matches.cover_letter.
 * Used by the web app and the browser extension (same LLM + JD fetch path).
 */
export async function generateAndSaveCoverLetterForMatch(
  sb: SupabaseClient,
  matchId: string,
  profileId: string,
): Promise<string> {
  const { data: match, error: matchErr } = await sb
    .from('matches')
    .select(
      `id, profile_id, job_id,
       profile:profiles(full_name, resume_text),
       job:jobs(id, title, company, description, url)`,
    )
    .eq('id', matchId)
    .eq('profile_id', profileId)
    .single();

  if (matchErr || !match) {
    throw new Error(matchErr?.message || 'Match not found');
  }

  const profile = match.profile as unknown as {
    full_name: string | null;
    resume_text: string | null;
  };
  const job = match.job as unknown as {
    id: string;
    title: string;
    company: string | null;
    description: string | null;
    url: string | null;
  };

  if (!profile?.resume_text) {
    throw new Error('Profile has no resume_text');
  }

  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  const coverLetter = await generateCoverLetter({
    resume: profile.resume_text,
    candidateName: profile.full_name,
    jobTitle: job.title,
    jobCompany: job.company,
    jobDescription: fullDescription,
  });

  const { error: updateErr } = await sb
    .from('matches')
    .update({ cover_letter: coverLetter })
    .eq('id', match.id)
    .eq('profile_id', profileId);

  if (updateErr) {
    throw new Error(updateErr.message);
  }

  return coverLetter;
}
