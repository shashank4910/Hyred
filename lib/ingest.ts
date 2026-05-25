import { supabaseAdmin } from './supabase/server';
import { fetchAllSources } from './sources';
import { embed, scoreJob } from './gemini';
import { cosineSimilarity, jobToEmbeddingText } from './matcher';
import type { Job, Profile, RawJob } from './types';

export type IngestResult = {
  fetched: number;
  newJobs: number;
  embedded: number;
  scored: number;
  matchesCreated: number;
  errors: { source: string; error: string }[];
};

/**
 * Full ingest pipeline:
 *  1. Fetch jobs from all sources
 *  2. Upsert new jobs to DB
 *  3. Embed any jobs missing embeddings
 *  4. Compute cosine similarity vs profile resume embedding
 *  5. LLM-score top N similar jobs
 *  6. Persist matches with score >= MIN_SCORE_TO_KEEP
 */
const SIMILARITY_TOP_N = 25; // how many jobs we send to LLM per run
const MIN_SCORE_TO_KEEP = 60; // minimum LLM score to keep as a match

export async function runIngest(opts?: {
  profileEmail?: string;
}): Promise<IngestResult> {
  const sb = supabaseAdmin();

  // ---------- 1. Pick the profile ----------
  const profileQuery = opts?.profileEmail
    ? sb.from('profiles').select('*').eq('email', opts.profileEmail).single()
    : sb.from('profiles').select('*').order('created_at').limit(1).maybeSingle();

  const { data: profile, error: profileErr } = await profileQuery;
  if (profileErr) throw new Error(`Profile lookup failed: ${profileErr.message}`);
  if (!profile) throw new Error('No profile found. Complete onboarding first.');
  if (!profile.resume_text || !profile.resume_embedding) {
    throw new Error('Profile is missing resume_text or resume_embedding.');
  }
  const p = profile as Profile;
  const minScore = p.preferences?.min_score ?? MIN_SCORE_TO_KEEP;

  // ---------- 2. Fetch from sources ----------
  const { jobs: rawJobs, errors } = await fetchAllSources();

  // ---------- 3. Upsert jobs ----------
  const newJobIds = await upsertJobs(rawJobs);

  // ---------- 4. Embed jobs missing embeddings ----------
  const { data: needEmbed } = await sb
    .from('jobs')
    .select('id, title, company, location, description, tags')
    .is('embedding', null)
    .order('fetched_at', { ascending: false })
    .limit(120);

  let embedded = 0;
  for (const j of needEmbed ?? []) {
    try {
      const text = jobToEmbeddingText(j);
      const vec = await embed(text);
      await sb.from('jobs').update({ embedding: vec }).eq('id', j.id);
      embedded++;
    } catch (e) {
      errors.push({ source: 'embed', error: `${j.id}: ${(e as Error).message}` });
    }
  }

  // ---------- 5. Score top similar jobs the profile hasn't seen yet ----------
  // Pull recently fetched jobs that have an embedding and no match yet.
  const { data: existingMatches } = await sb
    .from('matches')
    .select('job_id')
    .eq('profile_id', p.id);
  const seen = new Set((existingMatches ?? []).map((m) => m.job_id));

  const { data: candidates } = await sb
    .from('jobs')
    .select('id, title, company, location, description, embedding')
    .not('embedding', 'is', null)
    .order('fetched_at', { ascending: false })
    .limit(300);

  const resumeVec = p.resume_embedding!;
  const ranked = (candidates ?? [])
    .filter((c) => !seen.has(c.id))
    .map((c) => ({
      ...c,
      similarity: cosineSimilarity(resumeVec, c.embedding as number[]),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, SIMILARITY_TOP_N);

  // ---------- 6. LLM score ----------
  const prefsStr = formatPreferences(p.preferences);
  let scored = 0;
  let kept = 0;
  for (const c of ranked) {
    try {
      const { score, reason } = await scoreJob({
        resume: p.resume_text!,
        preferences: prefsStr,
        jobTitle: c.title,
        jobCompany: c.company,
        jobLocation: c.location,
        jobDescription: c.description,
      });
      scored++;
      if (score < minScore) continue;
      const { error } = await sb.from('matches').upsert(
        {
          profile_id: p.id,
          job_id: c.id,
          similarity: c.similarity,
          llm_score: score,
          reason,
          status: 'new',
        },
        { onConflict: 'profile_id,job_id' },
      );
      if (!error) kept++;
    } catch (e) {
      errors.push({ source: 'score', error: `${c.id}: ${(e as Error).message}` });
    }
  }

  return {
    fetched: rawJobs.length,
    newJobs: newJobIds.length,
    embedded,
    scored,
    matchesCreated: kept,
    errors,
  };
}

function formatPreferences(prefs: Profile['preferences']): string {
  if (!prefs) return '';
  const parts: string[] = [];
  if (prefs.roles?.length) parts.push(`Target roles: ${prefs.roles.join(', ')}`);
  if (prefs.locations?.length)
    parts.push(`Preferred locations: ${prefs.locations.join(', ')}`);
  if (prefs.remote_only) parts.push('Remote-only');
  if (prefs.exclude_keywords?.length)
    parts.push(`Avoid roles mentioning: ${prefs.exclude_keywords.join(', ')}`);
  return parts.join('\n');
}

async function upsertJobs(rawJobs: RawJob[]): Promise<string[]> {
  if (!rawJobs.length) return [];
  const sb = supabaseAdmin();
  // We chunk to stay under Supabase row limits.
  const ids: string[] = [];
  for (let i = 0; i < rawJobs.length; i += 100) {
    const chunk = rawJobs.slice(i, i + 100);
    const { data, error } = await sb
      .from('jobs')
      .upsert(chunk, { onConflict: 'source,source_id', ignoreDuplicates: false })
      .select('id');
    if (error) throw new Error(`Upsert jobs failed: ${error.message}`);
    if (data) ids.push(...data.map((d) => d.id as string));
  }
  return ids;
}

export { upsertJobs };
