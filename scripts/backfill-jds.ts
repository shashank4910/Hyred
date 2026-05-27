/**
 * Backfill full job descriptions for truncated Adzuna jobs.
 *
 * Adzuna's search API truncates descriptions to ~500 chars. This script:
 *   1. Finds jobs with `source LIKE '<prefix>%'` whose stored description is
 *      shorter than TRUNCATED_LENGTH_THRESHOLD chars (default 1000).
 *   2. Fetches the full JD from each job's redirect URL using
 *      `fetchFullJobDescription` (JSON-LD → og:description → meta).
 *   3. Persists upgraded descriptions back to the `jobs` table.
 *   4. Re-embeds upgraded jobs (better description → better embedding).
 *   5. Re-scores upgraded jobs against the configured profile and upserts
 *      into the `matches` table.
 *
 * Usage:
 *   npm run backfill:jds
 *
 * Env / inputs:
 *   INGEST_PROFILE_EMAIL    Profile to re-score against. Defaults to oldest profile.
 *   BACKFILL_LIMIT          Max jobs to process this run. Default 100.
 *   BACKFILL_SOURCE_PREFIX  Source prefix filter. Default 'adzuna_'.
 *   BACKFILL_THRESHOLD      Length below which a job is considered truncated. Default 1000.
 *   BACKFILL_CONCURRENCY    Parallel JD fetches. Default 4.
 *   BACKFILL_DRY_RUN        'true' = no DB writes. Default 'false'.
 *   BACKFILL_RESCORE        'true' = re-embed and re-score. Default 'true'.
 *
 * Idempotent: re-running it skips jobs already substantial.
 */
import 'dotenv/config';

import { supabaseAdmin } from '../lib/supabase/server';
import { fetchFullJobDescription } from '../lib/jd-fetcher';
import { embed, scoreJob } from '../lib/gemini';
import { cosineSimilarity, jobToEmbeddingText } from '../lib/matcher';
import type { Profile } from '../lib/types';

// ---------- Config ----------
const DEFAULT_THRESHOLD = 1000;
const DEFAULT_LIMIT = 100;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_SOURCE_PREFIX = 'adzuna_';
// Outer fetch budget — how many adzuna rows to scan to find truncated ones.
// We page in 1000-row chunks until we've collected `limit` candidates.
const SCAN_PAGE_SIZE = 1000;
const SCAN_MAX_ROWS = 10_000;

type JobRow = {
  id: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  description: string | null;
  tags: string[] | null;
};

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null) return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Bounded-concurrency map. Preserves input order in the result.
 */
async function pMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        results[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return results;
}

/**
 * Find candidate jobs whose description is null or shorter than `threshold`.
 *
 * Postgrest can't filter on `length(description)` directly, so we paginate
 * through `source LIKE prefix%` rows ordered by fetched_at desc and filter
 * client-side. Adzuna inventory is bounded (a few hundred jobs typically),
 * so this stays cheap.
 */
async function findTruncatedJobs(opts: {
  sourcePrefix: string;
  threshold: number;
  limit: number;
}): Promise<JobRow[]> {
  const sb = supabaseAdmin();
  const out: JobRow[] = [];
  let scanned = 0;

  for (let offset = 0; offset < SCAN_MAX_ROWS; offset += SCAN_PAGE_SIZE) {
    const { data, error } = await sb
      .from('jobs')
      .select('id, source, title, company, location, url, description, tags')
      .like('source', `${opts.sourcePrefix}%`)
      .order('fetched_at', { ascending: false })
      .range(offset, offset + SCAN_PAGE_SIZE - 1);

    if (error) throw new Error(`Job scan failed: ${error.message}`);
    const page = (data ?? []) as JobRow[];
    if (page.length === 0) break;
    scanned += page.length;

    for (const j of page) {
      const len = j.description?.length ?? 0;
      if (len < opts.threshold && j.url) {
        out.push(j);
        if (out.length >= opts.limit) {
          console.log(
            `[backfill] Scanned ${scanned} rows, collected ${out.length} candidates (limit reached).`,
          );
          return out;
        }
      }
    }

    if (page.length < SCAN_PAGE_SIZE) break;
  }

  console.log(
    `[backfill] Scanned ${scanned} rows, collected ${out.length} candidates.`,
  );
  return out;
}

/**
 * Pick the profile to re-score against. Mirrors lib/ingest.ts logic.
 */
async function pickProfile(profileEmail?: string): Promise<Profile | null> {
  const sb = supabaseAdmin();
  const wanted = profileEmail?.trim().toLowerCase();

  if (wanted) {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .ilike('email', wanted)
      .maybeSingle();
    if (error) throw new Error(`Profile lookup failed: ${error.message}`);
    if (data) return data as Profile;
    console.warn(
      `[backfill] No profile matched "${wanted}", falling back to oldest profile.`,
    );
  }

  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  return (data as Profile | null) ?? null;
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

// ---------- Main ----------
async function main() {
  const profileEmail = process.env.INGEST_PROFILE_EMAIL || undefined;
  const limit = envInt('BACKFILL_LIMIT', DEFAULT_LIMIT);
  const sourcePrefix =
    process.env.BACKFILL_SOURCE_PREFIX?.trim() || DEFAULT_SOURCE_PREFIX;
  const threshold = envInt('BACKFILL_THRESHOLD', DEFAULT_THRESHOLD);
  const concurrency = envInt('BACKFILL_CONCURRENCY', DEFAULT_CONCURRENCY);
  const dryRun = envBool('BACKFILL_DRY_RUN', false);
  const doRescore = envBool('BACKFILL_RESCORE', true);

  console.log('[backfill] Config:', {
    profileEmail: profileEmail ?? '(oldest profile)',
    limit,
    sourcePrefix,
    threshold,
    concurrency,
    dryRun,
    doRescore,
  });

  const startedAt = Date.now();
  const sb = supabaseAdmin();

  // ---------- Phase 1: find candidates ----------
  const candidates = await findTruncatedJobs({
    sourcePrefix,
    threshold,
    limit,
  });
  if (candidates.length === 0) {
    console.log('[backfill] Nothing to backfill — all jobs already substantial.');
    process.exit(0);
  }
  console.log(`[backfill] ${candidates.length} candidate(s) to process.`);

  // ---------- Phase 2: fetch full JDs ----------
  type FetchResult = {
    job: JobRow;
    upgraded: boolean;
    oldLen: number;
    newLen: number;
    error?: string;
    newDescription?: string;
  };

  let processed = 0;
  const fetchResults = await pMap(candidates, concurrency, async (job) => {
    const oldLen = job.description?.length ?? 0;
    try {
      const full = await fetchFullJobDescription(job.url);
      const newLen = full?.length ?? 0;
      processed++;
      if (processed % 10 === 0 || processed === candidates.length) {
        console.log(
          `[backfill] Fetched ${processed}/${candidates.length}...`,
        );
      }
      if (full && newLen > oldLen) {
        return {
          job,
          upgraded: true,
          oldLen,
          newLen,
          newDescription: full,
        } satisfies FetchResult;
      }
      return { job, upgraded: false, oldLen, newLen } satisfies FetchResult;
    } catch (e) {
      processed++;
      return {
        job,
        upgraded: false,
        oldLen,
        newLen: 0,
        error: (e as Error).message,
      } satisfies FetchResult;
    }
  });

  const upgrades = fetchResults.filter((r) => r.upgraded);
  const fetchErrors = fetchResults.filter((r) => r.error);
  console.log(
    `[backfill] Fetch phase: ${upgrades.length} upgraded, ${fetchResults.length - upgrades.length - fetchErrors.length} unchanged, ${fetchErrors.length} errors.`,
  );

  if (upgrades.length === 0) {
    console.log(
      JSON.stringify(
        {
          candidates: candidates.length,
          upgraded: 0,
          embedded: 0,
          rescored: 0,
          errors: fetchErrors.map((r) => ({ id: r.job.id, error: r.error })),
          durationMs: Date.now() - startedAt,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  // ---------- Phase 3: persist upgraded descriptions ----------
  if (dryRun) {
    console.log(
      `[backfill] DRY RUN — would persist ${upgrades.length} upgraded descriptions.`,
    );
  } else {
    let persisted = 0;
    for (const r of upgrades) {
      const { error } = await sb
        .from('jobs')
        .update({ description: r.newDescription })
        .eq('id', r.job.id);
      if (error) {
        console.warn(
          `[backfill] Failed to persist ${r.job.id}: ${error.message}`,
        );
      } else {
        persisted++;
      }
    }
    console.log(`[backfill] Persisted ${persisted}/${upgrades.length}.`);
  }

  // ---------- Phase 4: re-embed and re-score ----------
  let embedded = 0;
  let rescored = 0;
  let kept = 0;
  const rescoreErrors: { id: string; phase: string; error: string }[] = [];

  if (!doRescore) {
    console.log('[backfill] Skipping re-embed/re-score (BACKFILL_RESCORE=false).');
  } else if (dryRun) {
    console.log('[backfill] DRY RUN — skipping re-embed/re-score.');
  } else {
    const profile = await pickProfile(profileEmail);
    if (!profile) {
      console.warn(
        '[backfill] No profile found — skipping re-embed/re-score. Complete onboarding first.',
      );
    } else if (!profile.resume_text || !profile.resume_embedding) {
      console.warn(
        `[backfill] Profile ${profile.email} missing resume_text/resume_embedding — skipping re-score.`,
      );
    } else {
      console.log(
        `[backfill] Re-scoring against profile: ${profile.email} (${profile.id})`,
      );
      const prefsStr = formatPreferences(profile.preferences);
      const resumeVec = profile.resume_embedding;

      // Re-embed sequentially. OpenAI embeddings are fast; serial keeps the
      // cost trace clean and avoids tripping rate limits on small accounts.
      for (const r of upgrades) {
        const enriched = { ...r.job, description: r.newDescription! };
        try {
          const text = jobToEmbeddingText(enriched);
          const vec = await embed(text);
          const { error: embedErr } = await sb
            .from('jobs')
            .update({ embedding: vec })
            .eq('id', r.job.id);
          if (embedErr) {
            rescoreErrors.push({
              id: r.job.id,
              phase: 'embed-persist',
              error: embedErr.message,
            });
            continue;
          }
          embedded++;

          // Re-score with the freshly upgraded description.
          const { score, reason } = await scoreJob({
            resume: profile.resume_text!,
            preferences: prefsStr,
            jobTitle: enriched.title,
            jobCompany: enriched.company,
            jobLocation: enriched.location,
            jobDescription: enriched.description,
          });

          const similarity = cosineSimilarity(resumeVec, vec);
          const { error: matchErr } = await sb.from('matches').upsert(
            {
              profile_id: profile.id,
              job_id: r.job.id,
              similarity,
              llm_score: score,
              reason,
              // Note: we deliberately don't reset status here. If a user already
              // moved this match to 'applied'/'saved'/etc., we keep that state.
              // Postgres upsert with onConflict will only update the columns we
              // pass — but `status` has a default of 'new', and Supabase upsert
              // will overwrite NULL-able columns. To preserve existing status,
              // we omit it here. The DB-level default of 'new' applies only on
              // INSERT (new rows), not UPDATE.
            },
            { onConflict: 'profile_id,job_id' },
          );
          if (matchErr) {
            rescoreErrors.push({
              id: r.job.id,
              phase: 'match-upsert',
              error: matchErr.message,
            });
            continue;
          }
          rescored++;
          const minScore = profile.preferences?.min_score ?? 40;
          if (score >= minScore) kept++;
        } catch (e) {
          rescoreErrors.push({
            id: r.job.id,
            phase: 'rescore',
            error: (e as Error).message,
          });
        }
      }
      console.log(
        `[backfill] Re-embed/re-score: embedded=${embedded}, rescored=${rescored}, kept(≥minScore)=${kept}.`,
      );
    }
  }

  // ---------- Summary ----------
  const summary = {
    candidates: candidates.length,
    upgraded: upgrades.length,
    embedded,
    rescored,
    keptAboveMinScore: kept,
    fetchErrors: fetchErrors.length,
    rescoreErrors: rescoreErrors.length,
    durationMs: Date.now() - startedAt,
    dryRun,
  };
  console.log('[backfill] Done.');
  console.log(JSON.stringify(summary, null, 2));

  if (rescoreErrors.length || fetchErrors.length) {
    console.log(
      JSON.stringify(
        {
          fetchErrors: fetchErrors
            .slice(0, 20)
            .map((r) => ({ id: r.job.id, error: r.error })),
          rescoreErrors: rescoreErrors.slice(0, 20),
        },
        null,
        2,
      ),
    );
  }
}

main().catch((e) => {
  console.error('[backfill] Fatal:', (e as Error).message);
  console.error((e as Error).stack);
  process.exit(1);
});
