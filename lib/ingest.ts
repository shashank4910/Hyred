import { supabaseAdmin } from './supabase/server';
import {
  assertNoActiveIngest,
  patchIngestRun,
} from './ingest-runs';
import { fetchAllSources } from './sources';
import { embed, scoreJob } from './gemini';
import { cosineSimilarity, jobToEmbeddingText } from './matcher';
import { isTopCompany } from './top-companies';
import {
  generateSearchProfile,
  isProfileFresh,
  classifyByTitle,
  aiRelevanceFilter,
  type SearchProfile,
} from './search-profile';
import type { Profile, RawJob } from './types';

export type IngestResult = {
  fetched: number;
  newJobs: number;
  embedded: number;
  scored: number;
  matchesCreated: number;
  errors: { source: string; error: string }[];
  runId?: string;
  /** Diagnostic — populated only when AI pre-filter ran */
  prefilter?: {
    profileGenerated: boolean;
    titleAccepted: number;
    titleRejected: number;
    titleMaybe: number;
    aiKept: number;
    aiDropped: number;
  };
};

const SIMILARITY_TOP_N = 80;
const MIN_SCORE_TO_KEEP = 40;

/**
 * Maximum age (in days) for a job to be ingested. Any job whose posted_at
 * date is older than this threshold gets dropped before upsert. This prevents
 * stale listings (e.g. Adzuna indexing jobs from 11 months ago) from polluting
 * the dashboard.
 */
const MAX_JOB_AGE_DAYS = 45;

/**
 * Full ingest pipeline:
 *  1. Open ingest_runs row
 *  2. Pick profile, ensure fresh AI-generated SearchProfile
 *  3. Fetch jobs from sources (Adzuna queries come from SearchProfile)
 *  4. Upsert jobs to DB
 *  5. Embed jobs missing embeddings
 *  6. Build candidate pool (recently fetched, unseen)
 *  7. Pre-filter by title patterns from SearchProfile (cheap regex)
 *  8. AI relevance filter on "maybe" candidates (batched, cheap)
 *  9. LLM-score the relevant candidates (existing detailed scoring)
 *  10. Persist matches and close run
 */
export async function runIngest(opts?: {
  profileId?: string;
  profileEmail?: string;
  triggeredBy?: 'manual' | 'cron' | 'api' | 'onboarding';
  sources?: import('./sources').SourceName[];
}): Promise<IngestResult> {
  const sb = supabaseAdmin();
  const startedAt = Date.now();

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
  let fatalError: Error | null = null;
  let runFinalized = false;

  const finalizeRun = async () => {
    if (!runId || runFinalized) return;
    runFinalized = true;
    const status = fatalError ? 'failed' : runErrors.length ? 'partial' : 'success';
    const errors = fatalError
      ? [...runErrors, { source: 'fatal', error: fatalError.message }]
      : runErrors;
    await patchIngestRun(sb, runId, {
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      fetched,
      new_jobs: newJobsCount,
      embedded,
      scored,
      matches_created: kept,
      errors,
      status,
    });
  };

  const prefilter: IngestResult['prefilter'] = {
    profileGenerated: false,
    titleAccepted: 0,
    titleRejected: 0,
    titleMaybe: 0,
    aiKept: 0,
    aiDropped: 0,
  };

  try {
    // ---------- 1. Pick the profile ----------
    // Preferred: explicit profileId (multi-user: the signed-in user). Then
    // profileEmail (legacy cron). Last resort: the first/only profile.
    let profile: Profile | null = null;

    if (opts?.profileId) {
      const { data, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', opts.profileId)
        .maybeSingle();
      if (error) throw new Error(`Profile lookup failed: ${error.message}`);
      profile = (data as Profile | null) ?? null;
      if (!profile) throw new Error(`No profile found for id ${opts.profileId}.`);
    }

    const wantedEmail = opts?.profileEmail?.trim().toLowerCase();
    if (!profile && wantedEmail) {
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

    if (!profile) throw new Error('No profile found. Complete onboarding first.');
    if (!profile.resume_text || !profile.resume_embedding) {
      throw new Error('Profile is missing resume_text or resume_embedding.');
    }
    const p = profile;
    // Tag this run with the owning profile so the dashboard "last scan" and
    // Stats can be scoped per-user.
    if (runId) {
      await sb.from('ingest_runs').update({ profile_id: p.id }).eq('id', runId);
    }
    await assertNoActiveIngest(sb, p.id, runId);
    const minScore = p.preferences?.min_score ?? MIN_SCORE_TO_KEEP;
    const blacklist = new Set(
      (p.preferences?.blacklist_companies ?? []).map((s) =>
        s.toLowerCase().trim(),
      ),
    );

    // ---------- 2. Ensure fresh SearchProfile ----------
    // The SearchProfile is AI-generated from the resume. It contains:
    //  - searchKeywords for Adzuna queries
    //  - titlePatterns / antiPatterns for cheap pre-filtering
    //  - primaryDomain / adjacentDomains for AI relevance filter
    // Cached for 7 days in profiles.insights.search_profile.
    const insightsAny = (p.insights ?? {}) as Record<string, unknown>;
    let searchProfile: SearchProfile | null =
      (insightsAny.search_profile as SearchProfile | undefined) ?? null;

    if (!isProfileFresh(searchProfile)) {
      console.log('[ingest] Generating fresh SearchProfile via AI...');
      try {
        searchProfile = await generateSearchProfile({
          resumeText: p.resume_text!,
          preferences: p.preferences,
          insights: p.insights,
        });
        prefilter.profileGenerated = true;

        // Persist back to profiles.insights.search_profile
        const updatedInsights = {
          ...(p.insights ?? {}),
          search_profile: searchProfile,
        };
        await sb
          .from('profiles')
          .update({ insights: updatedInsights })
          .eq('id', p.id);

        console.log(
          `[ingest] SearchProfile: domain="${searchProfile.primaryDomain}", keywords=${searchProfile.searchKeywords.length}, titlePatterns=${searchProfile.titlePatterns.length}, antiPatterns=${searchProfile.antiPatterns.length}`,
        );
      } catch (e) {
        runErrors.push({
          source: 'search_profile',
          error: (e as Error).message,
        });
        searchProfile = null;
      }
    }

    // ---------- 3. Fetch from sources (using AI-generated keywords) ----------
    const { jobs: rawJobs, errors } = await fetchAllSources(
      opts?.sources ?? undefined,
      searchProfile,
      p.preferences,
    );
    runErrors = [...runErrors, ...errors];
    fetched = rawJobs.length;

    // ---------- 3.5. Filter out stale jobs (older than MAX_JOB_AGE_DAYS) ----------
    const maxAgeMs = MAX_JOB_AGE_DAYS * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - maxAgeMs);
    const freshJobs = rawJobs.filter((j) => {
      if (!j.posted_at) return true; // No date = keep (can't tell age)
      try {
        const postedDate = new Date(j.posted_at);
        return postedDate >= cutoffDate;
      } catch {
        return true; // Unparseable date = keep
      }
    });
    const staleDropped = rawJobs.length - freshJobs.length;
    if (staleDropped > 0) {
      console.log(
        `[ingest] Staleness filter: dropped ${staleDropped} jobs older than ${MAX_JOB_AGE_DAYS} days (cutoff: ${cutoffDate.toISOString().slice(0, 10)})`,
      );
    }

    // ---------- 4. Upsert jobs ----------
    const newJobIds = await upsertJobs(freshJobs);
    newJobsCount = newJobIds.length;
    if (runId) {
      await patchIngestRun(sb, runId, {
        fetched,
        new_jobs: newJobsCount,
        errors: runErrors,
      });
    }

    // ---------- 5. Embed jobs missing embeddings ----------
    const { data: needEmbed } = await sb
      .from('jobs')
      .select('id, title, company, location, description, tags')
      .is('embedding', null)
      .order('fetched_at', { ascending: false })
      .limit(300);

    // Defensive early-bail. If the very first embed call fails with what
    // looks like a config error (missing API key, invalid key, model not
    // available), we abort the entire embed phase with ONE descriptive
    // error rather than letting all ~300 jobs each push their own
    // identical error into runErrors. That keeps ingest_runs.errors
    // small and the dashboard's "partial (N)" count meaningful.
    let embedAborted: string | null = null;

    for (const j of needEmbed ?? []) {
      if (embedAborted) break;
      try {
        const text = jobToEmbeddingText(j);
        const vec = await embed(text);
        await sb.from('jobs').update({ embedding: vec }).eq('id', j.id);
        embedded++;
      } catch (e) {
        const msg = (e as Error).message || String(e);
        // First failure: decide whether this is a fatal config error
        // (abort the loop) or a transient one (keep going).
        const isConfigError =
          embedded === 0 &&
          /missing\s+\w+_API_KEY|invalid api key|api key not valid|unauthor|forbid/i.test(msg);
        if (isConfigError) {
          embedAborted = msg;
          runErrors.push({
            source: 'embed',
            error: `Embed phase aborted on first job (${needEmbed?.length ?? 0} pending). Config error: ${msg}`,
          });
          break;
        }
        runErrors.push({
          source: 'embed',
          error: `${j.id}: ${msg}`,
        });
      }
    }
    if (runId) {
      await patchIngestRun(sb, runId, {
        embedded,
        errors: runErrors,
      });
    }

    // ---------- 6. Build candidate pool (recently fetched, unseen) ----------
    const oneDayAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: recentMatches } = await sb
      .from('matches')
      .select('job_id')
      .eq('profile_id', p.id)
      .gte('created_at', oneDayAgo);
    const recentlySeen = new Set(
      (recentMatches ?? []).map((m) => m.job_id),
    );

    const { data: candidates } = await sb
      .from('jobs')
      .select('id, title, company, location, description, embedding')
      .not('embedding', 'is', null)
      .order('fetched_at', { ascending: false })
      .limit(800);

    type Cand = {
      id: string;
      title: string;
      company: string | null;
      location: string | null;
      description: string | null;
      embedding: number[] | null;
    };

    const eligible = (candidates ?? [])
      .filter((c) => !recentlySeen.has(c.id))
      .filter(
        (c) => !c.company || !blacklist.has(c.company.toLowerCase().trim()),
      )
      .map(
        (c) =>
          ({
            id: c.id,
            title: c.title ?? '',
            company: c.company,
            location: c.location,
            description: c.description,
            embedding: c.embedding,
          }) as Cand,
      );

    // ---------- 7. AI-driven pre-filter (title patterns + AI relevance) ----------
    let toScore: Cand[] = [];

    if (searchProfile) {
      // Cheap regex filter using AI-generated patterns
      const { keep, maybe, drop } = classifyByTitle(eligible, searchProfile);
      prefilter.titleAccepted = keep.length;
      prefilter.titleRejected = drop.length;
      prefilter.titleMaybe = maybe.length;

      console.log(
        `[ingest] Title pre-filter: ${keep.length} kept, ${maybe.length} maybe, ${drop.length} rejected (out of ${eligible.length})`,
      );

      // Cap "maybe" to avoid running AI on too many — take the most similar by cosine
      const resumeVec = p.resume_embedding!;
      const maybeWithSim = maybe
        .map((c) => ({
          ...c,
          similarity: cosineSimilarity(resumeVec, c.embedding as number[]),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 60);

      // Run AI relevance filter on the "maybe" set (batched)
      let aiKeptIds = new Set<string>();
      if (maybeWithSim.length > 0) {
        const { relevantIds } = await aiRelevanceFilter({
          profile: searchProfile,
          jobs: maybeWithSim,
        });
        aiKeptIds = relevantIds;
        prefilter.aiKept = relevantIds.size;
        prefilter.aiDropped = maybeWithSim.length - relevantIds.size;
        console.log(
          `[ingest] AI relevance filter: ${relevantIds.size}/${maybeWithSim.length} kept`,
        );
      }

      // Combine: title-keeps + ai-keeps from "maybe"
      const finalSet = [
        ...keep,
        ...maybeWithSim.filter((c) => aiKeptIds.has(c.id)),
      ];
      toScore = finalSet.slice(0, SIMILARITY_TOP_N);
    } else {
      // Fallback: no SearchProfile available, use cosine similarity only
      const resumeVec = p.resume_embedding!;
      toScore = eligible
        .map((c) => ({
          ...c,
          similarity: cosineSimilarity(resumeVec, c.embedding as number[]),
        }))
        .sort(
          (a, b) =>
            (b as Cand & { similarity: number }).similarity -
            (a as Cand & { similarity: number }).similarity,
        )
        .slice(0, SIMILARITY_TOP_N);
    }

    // ---------- 7.5. Force-include TOP MNC company jobs ----------
    // Premium "Top MNC Hiring" jobs (TCS, Infosys, Levi Strauss, Google, etc.)
    // must ALWAYS get scored so they appear in both general matches AND the
    // Top MNC page — even if the title pre-filter/AI relevance dropped them or
    // they fell outside the SIMILARITY_TOP_N cut. We add any eligible job from
    // a recognised top company that isn't already queued, capped to avoid
    // blowing up scan time.
    const alreadyQueued = new Set(toScore.map((c) => c.id));
    const topCompanyExtras = eligible.filter(
      (c) => !alreadyQueued.has(c.id) && isTopCompany(c.company),
    );
    if (topCompanyExtras.length > 0) {
      const TOP_COMPANY_CAP = 40;
      toScore = [...toScore, ...topCompanyExtras.slice(0, TOP_COMPANY_CAP)];
      console.log(
        `[ingest] Force-included ${Math.min(topCompanyExtras.length, TOP_COMPANY_CAP)} top-MNC company jobs into scoring (${topCompanyExtras.length} found)`,
      );
    }

    // ---------- 8. Compute similarity for the final scoring set ----------
    const resumeVec = p.resume_embedding!;
    const ranked = toScore.map((c) => ({
      ...c,
      similarity: cosineSimilarity(resumeVec, c.embedding as number[]),
    }));

    // ---------- 9. LLM score ----------
    const prefsStr = formatPreferences(p.preferences);
    for (const c of ranked) {
      try {
        const { score, reason, matchedSkills, missingSkills } = await scoreJob({
          resume: p.resume_text!,
          preferences: prefsStr,
          jobTitle: c.title,
          jobCompany: c.company,
          jobLocation: c.location,
          jobDescription: c.description,
        });
        scored++;
        const { error } = await sb.from('matches').upsert(
          {
            profile_id: p.id,
            job_id: c.id,
            similarity: c.similarity,
            llm_score: score,
            reason,
            matched_skills: matchedSkills,
            missing_skills: missingSkills,
            status: 'new',
          },
          { onConflict: 'profile_id,job_id' },
        );
        if (!error && score >= minScore) kept++;
        if (runId && scored % 5 === 0) {
          await patchIngestRun(sb, runId, {
            scored,
            matches_created: kept,
            errors: runErrors,
          });
        }
      } catch (e) {
        runErrors.push({
          source: 'score',
          error: `${c.id}: ${(e as Error).message}`,
        });
      }
    }
  } catch (e) {
    fatalError = e as Error;
  } finally {
    await finalizeRun();
  }

  if (fatalError) throw fatalError;

  return {
    fetched,
    newJobs: newJobsCount,
    embedded,
    scored,
    matchesCreated: kept,
    errors: runErrors,
    runId,
    prefilter,
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
      .upsert(chunk, {
        onConflict: 'source,source_id',
        ignoreDuplicates: true,
      })
      .select('id');
    if (error) throw new Error(`Upsert jobs failed: ${error.message}`);
    if (data) ids.push(...data.map((d) => d.id as string));
  }
  return ids;
}

export { upsertJobs };

/**
 * Multi-user cron entry point: run the per-user ingest for EVERY profile that
 * has completed onboarding (resume_text + resume_embedding present).
 *
 * NOTE (Phase 3 optimization): this currently fetches + embeds jobs once PER
 * profile, which is wasteful at scale. The planned split is a single shared
 * fetch/embed pass followed by per-user scoring. For the current small
 * multi-user/testing phase, the simple per-profile loop is correct and clear.
 */
export async function runIngestForAllProfiles(opts?: {
  triggeredBy?: 'manual' | 'cron' | 'api' | 'onboarding';
  sources?: import('./sources').SourceName[];
}): Promise<{
  profiles: number;
  results: { profileId: string; email: string; result?: IngestResult; error?: string }[];
}> {
  const sb = supabaseAdmin();
  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, email')
    .not('resume_text', 'is', null)
    .not('resume_embedding', 'is', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to list profiles: ${error.message}`);

  const results: {
    profileId: string;
    email: string;
    result?: IngestResult;
    error?: string;
  }[] = [];

  for (const prof of profiles ?? []) {
    try {
      const result = await runIngest({
        profileId: prof.id as string,
        triggeredBy: opts?.triggeredBy ?? 'cron',
        sources: opts?.sources,
      });
      results.push({ profileId: prof.id as string, email: prof.email as string, result });
    } catch (e) {
      results.push({
        profileId: prof.id as string,
        email: prof.email as string,
        error: (e as Error).message,
      });
    }
  }

  return { profiles: (profiles ?? []).length, results };
}
