import { supabaseAdmin } from './supabase/server';
import {
  assertNoActiveIngest,
  isRunCancelled,
  patchIngestRun,
} from './ingest-runs';
import { fetchAllSources } from './sources';
import { embed, scoreJob } from './gemini';
import { mergeInsightsForScoring } from './experience-match';
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
import { dashboardMinScore } from './match-stats';

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

const SIMILARITY_TOP_N = 45;
const TOP_COMPANY_CAP = 12;
const EMBED_PER_RUN = 50;
const EMBED_CONCURRENCY = 6;
const SCORE_CONCURRENCY = 5; // Matches free-tier RPM (one call per key per batch cycle)
/** Vercel `/api/ingest` maxDuration is 300s — stop heavy work before hard kill. */
const INGEST_WALL_BUDGET_MS = 260_000;
/** Delay between scoring batches to respect RPM limits across providers. */
const SCORE_BATCH_DELAY_MS = 3_000; // 3 seconds between batches → ~20 RPM effective

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
 *  6. Build candidate pool (jobs not yet scored for this profile)
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
      profile_id: opts?.profileId ?? null,
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
    const { data: applyProfileRow } = await sb
      .from('apply_profiles')
      .select('years_experience')
      .eq('profile_id', profile.id)
      .maybeSingle();
    const scoringInsights = mergeInsightsForScoring(
      profile.insights,
      applyProfileRow?.years_experience,
    );
    const p = { ...profile, insights: scoringInsights };
    // Tag this run with the owning profile so the dashboard "last scan" and
    // Stats can be scoped per-user.
    if (runId) {
      await sb.from('ingest_runs').update({ profile_id: p.id }).eq('id', runId);
    }
    await assertNoActiveIngest(sb, p.id, runId);
    const minScore = dashboardMinScore(p.preferences);
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

    // ---------- 5. Embed jobs missing embeddings (bounded per run) ----------
    // Check for cancellation before expensive embedding stage
    if (runId && await isRunCancelled(sb, runId)) {
      console.log('[ingest] Scan cancelled by user before embedding stage.');
      return { fetched, newJobs: newJobsCount, embedded, scored, matchesCreated: kept, errors: runErrors, runId, prefilter };
    }
    const { data: needEmbed } = await sb
      .from('jobs')
      .select('id, title, company, location, description, tags')
      .is('embedding', null)
      .order('fetched_at', { ascending: false })
      .limit(EMBED_PER_RUN);

    // Defensive early-bail. If the very first embed call fails with what
    // looks like a config error (missing API key, invalid key, model not
    // available), we abort the entire embed phase with ONE descriptive
    // error rather than letting every pending job push the same message.
    let embedAborted: string | null = null;

    type EmbedRow = NonNullable<typeof needEmbed>[number];

    async function embedOne(j: EmbedRow): Promise<boolean> {
      if (embedAborted) return false;
      try {
        const text = jobToEmbeddingText(j);
        const vec = await embed(text);
        await sb.from('jobs').update({ embedding: vec }).eq('id', j.id);
        return true;
      } catch (e) {
        const msg = (e as Error).message || String(e);
        const isConfigError =
          embedded === 0 &&
          /missing\s+\w+_API_KEY|invalid api key|api key not valid|unauthor|forbid/i.test(msg);
        if (isConfigError) {
          embedAborted = msg;
          runErrors.push({
            source: 'embed',
            error: `Embed phase aborted on first job (${needEmbed?.length ?? 0} pending). Config error: ${msg}`,
          });
          return false;
        }
        runErrors.push({
          source: 'embed',
          error: `${j.id}: ${msg}`,
        });
        return false;
      }
    }

    const embedJobs = needEmbed ?? [];
    for (let i = 0; i < embedJobs.length; i += EMBED_CONCURRENCY) {
      if (Date.now() - startedAt > INGEST_WALL_BUDGET_MS) break;
      if (embedAborted) break;
      const batch = embedJobs.slice(i, i + EMBED_CONCURRENCY);
      const ok = await Promise.all(batch.map((j) => embedOne(j)));
      embedded += ok.filter(Boolean).length;
    }
    if (runId) {
      await patchIngestRun(sb, runId, {
        embedded,
        errors: runErrors,
      });
    }

    // ---------- 6. Build candidate pool (skip jobs already scored for this resume) ----------
    // Any job that already has a match row for this profile is skipped — no
    // repeat LLM scoring on re-scans (saves cost). After a resume upload, the
    // profile API clears non-protected matches so the next scan can re-score.
    const { data: existingMatches } = await sb
      .from('matches')
      .select('job_id')
      .eq('profile_id', p.id);
    const alreadyScored = new Set(
      (existingMatches ?? []).map((m) => m.job_id as string),
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
      .filter((c) => !alreadyScored.has(c.id))
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
      toScore = [...toScore, ...topCompanyExtras.slice(0, TOP_COMPANY_CAP)];
      console.log(
        `[ingest] Force-included ${Math.min(topCompanyExtras.length, TOP_COMPANY_CAP)} top-MNC company jobs into scoring (${topCompanyExtras.length} found)`,
      );
    }

    // Hard cap — pre-filter can still queue more than SIMILARITY_TOP_N + MNC extras.
    toScore = toScore.slice(0, SIMILARITY_TOP_N + TOP_COMPANY_CAP);

    // ---------- 8. Compute similarity for the final scoring set ----------
    const resumeVec = p.resume_embedding!;
    const ranked = toScore.map((c) => ({
      ...c,
      similarity: cosineSimilarity(resumeVec, c.embedding as number[]),
    }));

    // ---------- 9. LLM score (parallel batches + wall-clock budget) ----------
    // Check for cancellation before expensive LLM scoring stage
    if (runId && await isRunCancelled(sb, runId)) {
      console.log('[ingest] Scan cancelled by user before scoring stage.');
      if (runId) await patchIngestRun(sb, runId, { fetched, new_jobs: newJobsCount, embedded, scored, matches_created: kept, errors: runErrors });
      return { fetched, newJobs: newJobsCount, embedded, scored, matchesCreated: kept, errors: runErrors, runId, prefilter };
    }
    const prefsStr = formatPreferences(p.preferences);
    let budgetStopped = false;

    for (let i = 0; i < ranked.length; i += SCORE_CONCURRENCY) {
      if (Date.now() - startedAt > INGEST_WALL_BUDGET_MS) {
        budgetStopped = true;
        break;
      }
      // Check cancellation every 3 batches during scoring
      if (runId && i > 0 && i % (SCORE_CONCURRENCY * 3) === 0) {
        if (await isRunCancelled(sb, runId)) {
          console.log(`[ingest] Scan cancelled by user mid-scoring (${scored} scored so far).`);
          break;
        }
      }
      // Delay between batches to spread RPM across free-tier keys
      if (i > 0) {
        await new Promise((r) => setTimeout(r, SCORE_BATCH_DELAY_MS));
      }
      const batch = ranked.slice(i, i + SCORE_CONCURRENCY);
      await Promise.all(
        batch.map(async (c) => {
          try {
            const { score, reason, matchedSkills, missingSkills } = await scoreJob({
              resume: p.resume_text!,
              insights: p.insights,
              preferences: prefsStr,
              jobTitle: c.title,
              jobCompany: c.company,
              jobLocation: c.location,
              jobDescription: c.description,
            });
            if (score < minScore) {
              return { scored: 1, kept: 0 };
            }
            const { error } = await sb.from('matches').upsert(
              {
                profile_id: p.id,
                job_id: c.id,
                similarity: c.similarity,
                llm_score: score,
                reason,
                matched_skills: matchedSkills,
                missing_skills: missingSkills,
                // Omit status — new rows default to 'new'; updates keep viewed/saved/applied.
              },
              { onConflict: 'profile_id,job_id' },
            );
            return { scored: 1, kept: !error ? 1 : 0 };
          } catch (e) {
            runErrors.push({
              source: 'score',
              error: `${c.id}: ${(e as Error).message}`,
            });
            return { scored: 0, kept: 0 };
          }
        }),
      ).then((results) => {
        for (const r of results) {
          scored += r.scored;
          kept += r.kept;
        }
      });
      if (runId) {
        await patchIngestRun(sb, runId, {
          scored,
          matches_created: kept,
          errors: runErrors,
        });
      }
    }

    if (budgetStopped) {
      runErrors.push({
        source: 'budget',
        error: `Scoring stopped after ${scored}/${ranked.length} jobs (time budget under Vercel limit)`,
      });
      console.warn(`[ingest] Scoring stopped early: ${scored}/${ranked.length} scored`);
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
