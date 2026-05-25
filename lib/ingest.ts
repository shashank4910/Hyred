import { supabaseAdmin } from './supabase/server';
import { fetchAllSources } from './sources';
import { embed, scoreJob } from './gemini';
import { cosineSimilarity, jobToEmbeddingText } from './matcher';
import type { Profile, RawJob } from './types';

export type IngestResult = {
  fetched: number;
  newJobs: number;
  embedded: number;
  scored: number;
  matchesCreated: number;
  errors: { source: string; error: string }[];
  runId?: string;
};

const SIMILARITY_TOP_N = 25;
const MIN_SCORE_TO_KEEP = 60;

/**
 * Full ingest pipeline:
 *  1. Open an ingest_runs row (status=running)
 *  2. Fetch jobs from all sources
 *  3. Upsert new jobs to DB
 *  4. Embed any jobs missing embeddings
 *  5. Compute cosine similarity vs profile resume embedding
 *  6. LLM-score top N similar jobs
 *  7. Persist matches above threshold (skipping blacklisted companies)
 *  8. Close the ingest_runs row with stats
 */
export async function runIngest(opts?: {
  profileEmail?: string;
  triggeredBy?: 'manual' | 'cron' | 'api';
}): Promise<IngestResult> {
  const sb = supabaseAdmin();
  const startedAt = Date.now();

  // Open run record
  const { data: runRow } = await sb
    .from('ingest_runs')
    .insert({
      triggered_by: opts?.triggeredBy ?? 'manual',
      status: 'running',
    })
    .select('id')
    .single();
  const runId = runRow?.id as string | undefined;

  let fetched = 0;
  let newJobsCount = 0;
  let embedded = 0;
  let scored = 0;
  let kept = 0;
  let runErrors: { source: string; error: string }[] = [];

  try {
    // ---------- 1. Pick the profile ----------
    // Case-insensitive email match with whitespace trim, with a graceful
    // fallback to the first profile if no match is found. This makes the
    // INGEST_PROFILE_EMAIL secret forgiving of typos / casing differences.
    const wantedEmail = opts?.profileEmail?.trim().toLowerCase();
    let profile: Profile | null = null;

    if (wantedEmail) {
      const { data, error } = await sb
        .from('profiles')
        .select('*')
        .ilike('email', wantedEmail)
        .maybeSingle();
      if (error) throw new Error(`Profile lookup failed: ${error.message}`);
      profile = (data as Profile | null) ?? null;
      if (!profile) {
        console.warn(
          `[ingest] No profile matched email "${wantedEmail}", falling back to first profile.`,
        );
      }
    }

    if (!profile) {
      const { data, error } = await sb
        .from('profiles')
        .select('*')
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Profile lookup failed: ${error.message}`);
      profile = (data as Profile | null) ?? null;
    }

    if (!profile) {
      throw new Error('No profile found. Complete onboarding first.');
    }
    if (!profile.resume_text || !profile.resume_embedding) {
      throw new Error('Profile is missing resume_text or resume_embedding.');
    }
    const p = profile;
    const minScore = p.preferences?.min_score ?? MIN_SCORE_TO_KEEP;
    const blacklist = new Set(
      (p.preferences?.blacklist_companies ?? []).map((s) => s.toLowerCase().trim()),
    );

    // ---------- 2. Fetch from sources ----------
    const { jobs: rawJobs, errors } = await fetchAllSources();
    runErrors = errors;
    fetched = rawJobs.length;

    // ---------- 3. Upsert jobs ----------
    const newJobIds = await upsertJobs(rawJobs);
    newJobsCount = newJobIds.length;

    // ---------- 4. Embed jobs missing embeddings ----------
    const { data: needEmbed } = await sb
      .from('jobs')
      .select('id, title, company, location, description, tags')
      .is('embedding', null)
      .order('fetched_at', { ascending: false })
      .limit(120);

    for (const j of needEmbed ?? []) {
      try {
        const text = jobToEmbeddingText(j);
        const vec = await embed(text);
        await sb.from('jobs').update({ embedding: vec }).eq('id', j.id);
        embedded++;
      } catch (e) {
        runErrors.push({ source: 'embed', error: `${j.id}: ${(e as Error).message}` });
      }
    }

    // ---------- 5. Score top similar jobs the profile hasn't seen yet ----------
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
      .filter(
        (c) => !c.company || !blacklist.has(c.company.toLowerCase().trim()),
      )
      .map((c) => ({
        ...c,
        similarity: cosineSimilarity(resumeVec, c.embedding as number[]),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, SIMILARITY_TOP_N);

    // ---------- 6. LLM score ----------
    const prefsStr = formatPreferences(p.preferences);
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
        runErrors.push({ source: 'score', error: `${c.id}: ${(e as Error).message}` });
      }
    }
  } catch (e) {
    // Fatal: close run as failed and rethrow
    if (runId) {
      await sb
        .from('ingest_runs')
        .update({
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          fetched,
          new_jobs: newJobsCount,
          embedded,
          scored,
          matches_created: kept,
          errors: [...runErrors, { source: 'fatal', error: (e as Error).message }],
          status: 'failed',
        })
        .eq('id', runId);
    }
    throw e;
  }

  // Close run as success/partial
  if (runId) {
    await sb
      .from('ingest_runs')
      .update({
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        fetched,
        new_jobs: newJobsCount,
        embedded,
        scored,
        matches_created: kept,
        errors: runErrors,
        status: runErrors.length ? 'partial' : 'success',
      })
      .eq('id', runId);
  }

  return {
    fetched,
    newJobs: newJobsCount,
    embedded,
    scored,
    matchesCreated: kept,
    errors: runErrors,
    runId,
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
