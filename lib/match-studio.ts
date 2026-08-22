/**
 * Ready-to-Apply engine (Session 46) — the Two-Gate optimizer backend.
 *
 * Gate 1 (robot): a requirement checklist extracted from the JD (cached per
 *   job in `jd_requirements`, shared across users) graded against the user's
 *   resume with three evidence states:
 *     proven   — keyword verbatim in the resume (deterministic, no LLM)
 *     inferred — not written down, but adjacent evidence exists (LLM judges,
 *                must cite the evidence; enables the "Garbage Collection"
 *                case: heap/leak analysis present ⇒ GC likely)
 *     absent   — no signal; honestly flagged, never fabricated
 *   Robot score is deterministic from weights (must=2, nice=1) × states.
 *
 * Gate 2 (human): one recruiter-verdict pass (human score, one-line verdict,
 *   hooks, watch-outs) in the SAME LLM call as inference — steady state is
 *   ONE cached call per job + ONE per (user, job).
 */

import { supabaseAdmin } from './supabase/server';
import { getCurrentProfile } from './current-user';
import { chat, keywordInText } from './gemini';
import { sanitizeJobDescriptionForAI } from './jd-fetcher';

export type RequirementState = 'proven' | 'inferred' | 'absent';

export interface StudioRequirement {
  keyword: string;
  type: string; // tool | activity | concept | education | experience | soft
  weight: 'must' | 'nice';
  state: RequirementState;
  /** Why we believe it (inferred: adjacent evidence from the resume). */
  evidence?: string;
  /** A bullet rewrite suggestion, only for inferred items. */
  suggestion?: string;
}

export interface StudioAnalysis {
  robotScore: number | null;
  humanScore: number | null;
  verdictLine: string;
  hooks: string[];
  watchOuts: string[];
  requirements: StudioRequirement[];
  /** Smart pre-ticks for generation: proven + inferred, capped at 8. */
  preselected: string[];
  analyzedAt: string;
}

interface CachedRequirement {
  keyword: string;
  type: string;
  weight: 'must' | 'nice';
}

const MAX_REQUIREMENTS = 16;
const PRESELECT_CAP = 8;

/** Per-JOB requirement extraction with DB cache (shared across users). */
async function getJobRequirements(
  sb: ReturnType<typeof supabaseAdmin>,
  job: { id: string; title: string; description: string | null },
): Promise<CachedRequirement[]> {
  const { data: cached, error: cacheErr } = await sb
    .from('jd_requirements')
    .select('requirements')
    .eq('job_id', job.id)
    .maybeSingle();
  if (!cacheErr && cached?.requirements) {
    const list = cached.requirements as CachedRequirement[];
    // Self-heal pre-v2 caches: sentence-length or garbled keywords mean the
    // row was extracted by the old prompt — re-extract instead of trusting it.
    const sane =
      Array.isArray(list) &&
      list.length >= 8 &&
      list.every((r) => {
        const kw = String(r?.keyword ?? '');
        return kw && kw.length <= 60 && kw.split(/\s+/).length <= 5;
      });
    if (sane) return list;
  }
  // 42P01 (table missing pre-migration) or cache miss → extract once.
  if (cacheErr && cacheErr.code !== '42P01') {
    console.warn('[match-studio] jd_requirements read failed:', cacheErr.message);
  }

  const jd = sanitizeJobDescriptionForAI(job.description ?? '').slice(0, 5000);
  const raw = await chat(
    'You extract structured hiring requirements from job descriptions. Output strict JSON only.',
    `Extract the real requirements from this job posting. Return JSON:
{"requirements":[{"keyword":"...","type":"tool|activity|concept|education|experience|soft","weight":"must|nice"}]}
Rules:
- 8 to ${MAX_REQUIREMENTS} items.
- keyword MUST be a short canonical noun phrase of 1-4 words that a resume could contain verbatim: "JMeter", "thread dump analysis", "distributed systems", "capacity planning", "Bachelor degree", "performance testing".
- NEVER extract verbs, clauses, or full sentences ("recognize performance issues in..." is WRONG — "performance issue analysis" is right).
- Extract experience as a SHORT phrase like "performance testing experience" (the years live in the JD, not the keyword); education as "Bachelor degree" or "Bachelor degree in Computer Science".
- "must" only when the JD clearly requires it (must-have section, explicit "required"); otherwise "nice".
- No duplicates, no garbled fragments, no soft-skill soup (at most 2 soft skills).

JOB TITLE: ${job.title}

JOB DESCRIPTION:
${jd}`,
    0.2,
    true,
    'match_studio_requirements',
  );
  const parsed = safeJson<{ requirements?: CachedRequirement[] }>(raw);
  const seen = new Set<string>();
  const list: CachedRequirement[] = [];
  for (const r of parsed?.requirements ?? []) {
    const kw = String(r?.keyword ?? '').trim();
    if (!kw || kw.length > 60) continue;
    const key = kw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      keyword: kw,
      type: String(r?.type ?? 'concept'),
      weight: r?.weight === 'nice' ? 'nice' : 'must',
    });
    if (list.length >= MAX_REQUIREMENTS) break;
  }
  if (list.length === 0) throw new Error('Could not read job requirements');

  if (!cacheErr) {
    const { error: upErr } = await sb
      .from('jd_requirements')
      .upsert({ job_id: job.id, requirements: list }, { onConflict: 'job_id' });
    if (upErr) console.warn('[match-studio] jd_requirements write failed:', upErr.message);
  }
  return list;
}

function safeJson<T>(raw: string): T | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * Full analysis for one (user, job). One cached call per job + one per user.
 */
export async function analyzeMatchStudio(matchId: string): Promise<StudioAnalysis> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error('Not authenticated');
  if (!profile.resume_text) throw new Error('no_resume');

  const sb = supabaseAdmin();
  const { data: match, error } = await sb
    .from('matches')
    .select(
      `id,
       job:jobs!inner(id, title, description)`,
    )
    .eq('id', matchId)
    .eq('profile_id', profile.id)
    .maybeSingle();
  if (error || !match) throw new Error('Match not found');

  const job = match.job as unknown as { id: string; title: string; description: string | null };
  const checklist = await getJobRequirements(sb, job);

  // Deterministic gate first: verbatim presence needs no LLM.
  const reqs: StudioRequirement[] = checklist.map((r) => ({
    ...r,
    state: keywordInText(r.keyword, profile.resume_text!) ? 'proven' : 'absent',
  }));
  const open = reqs.filter((r) => r.state === 'absent');

  let humanScore: number | null = null;
  let verdictLine = '';
  let hooks: string[] = [];
  let watchOuts: string[] = [];

  if (open.length > 0 || reqs.length > 0) {
    const resumeExcerpt = profile.resume_text!.slice(0, 9000);
    const raw = await chat(
      'You are a strict but fair hiring panel: a technical recruiter and an ATS in one. Output strict JSON only. Never invent resume facts.',
      `A candidate's resume and a job's requirement checklist are below.

TASK A — resolve each OPEN requirement (not found verbatim in the resume). Classify honestly:
- "met": the resume CLEARLY satisfies it in different words. Example: JD asks "performance testing experience" / resume shows 7.7 years of performance engineering. Or JD asks "Bachelor degree in Computer Science" / resume has B.Tech in Information Technology.
- "inferred": the exact activity is never written down, but adjacent work strongly suggests it. Example: resume shows heap/memory-leak analysis with JProfiler ⇒ "Garbage Collection" is likely.
- neither: return NO entry — the requirement is genuinely absent.
Each returned entry: {"keyword":"...","kind":"met|inferred","evidence":"one sentence citing the actual resume work","suggestion":"one full resume bullet in past tense"}
Rules for "suggestion":
- Build it ONLY from the candidate's real work and real numbers — no new tools, employers, or metrics.
- The suggestion text MUST contain the requirement keyword VERBATIM. If you cannot write such a bullet truthfully, return the entry without a suggestion.
- Only tool/activity/concept requirements get suggestions. Soft skills, education, and experience never do — they don't belong in bullets.

TASK B — recruiter verdict. Scan the resume as a busy recruiter (7 seconds): {"human_score":0-100,"verdict_line":"one sentence: would you call this person?","hooks":["top 2-3 things that jump out"],"watch_outs":["0-2 honest concerns"]}
- human_score below 70 when seniority/fit gaps are real. Be honest, not polite.

JOB TITLE: ${job.title}

CHECKLIST (state marks OPEN or PROVEN):
${reqs.map((r) => `- ${r.keyword} [${r.weight}] [type: ${r.type}] — ${r.state === 'proven' ? 'PROVEN' : 'OPEN'}`).join('\n')}

RESUME:
${resumeExcerpt}

Return JSON: {"resolved":[{"keyword":"...","kind":"met|inferred","evidence":"...","suggestion":"..."}],"recruiter":{"human_score":N,"verdict_line":"...","hooks":["..."],"watch_outs":["..."]}}`,
      0.25,
      true,
      'match_studio_grade',
      profile.id,
    );

    const parsed = safeJson<{
      resolved?: Array<{
        keyword?: string;
        kind?: string;
        evidence?: string;
        suggestion?: string;
      }>;
      recruiter?: {
        human_score?: number;
        verdict_line?: string;
        hooks?: string[];
        watch_outs?: string[];
      };
    }>(raw);

    if (parsed?.resolved?.length) {
      const byKw = new Map(
        parsed.resolved
          .filter((i) => typeof i.keyword === 'string' && i.keyword.trim())
          .map((i) => [
            String(i.keyword).trim().toLowerCase(),
            {
              kind: i.kind === 'met' ? 'met' : 'inferred',
              evidence: String(i.evidence ?? '').slice(0, 220),
              suggestion: String(i.suggestion ?? '').slice(0, 320),
            },
          ]),
      );
      for (const r of reqs) {
        if (r.state !== 'absent') continue;
        const hit = byKw.get(r.keyword.toLowerCase());
        if (!hit) continue;
        if (hit.kind === 'met') {
          // Paraphrase match: the resume satisfies it in different words.
          r.state = 'proven';
          r.evidence = hit.evidence;
        } else {
          r.state = 'inferred';
          r.evidence = hit.evidence;
          // Deterministic guard: a suggestion that doesn't contain its own
          // keyword is a mismatched bullet (observed in beta) — drop it and
          // keep the evidence line only.
          r.suggestion =
            hit.suggestion && keywordInText(r.keyword, hit.suggestion)
              ? hit.suggestion
              : undefined;
        }
      }
    }
    if (parsed?.recruiter) {
      const h = Number(parsed.recruiter.human_score);
      if (Number.isFinite(h)) humanScore = Math.max(0, Math.min(100, Math.round(h)));
      verdictLine = String(parsed.recruiter.verdict_line ?? '').slice(0, 200);
      hooks = (parsed.recruiter.hooks ?? []).slice(0, 3).map(String);
      watchOuts = (parsed.recruiter.watch_outs ?? []).slice(0, 2).map(String);
    }
  }

  // Deterministic robot score: must=2, nice=1; soft skills count half (ATS
  // matchers weight hard skills — Jobscan's own priority order); proven=1,
  // inferred=0.7.
  let earned = 0;
  let possible = 0;
  for (const r of reqs) {
    const base = r.weight === 'must' ? 2 : 1;
    const w = r.type === 'soft' ? base * 0.5 : base;
    possible += w;
    if (r.state === 'proven') earned += w;
    else if (r.state === 'inferred') earned += w * 0.7;
  }
  const robotScore = possible > 0 ? Math.round((earned / possible) * 100) : null;

  // Smart pre-ticks: must-haves first, proven before inferred, capped.
  const preselected = reqs
    .filter((r) => r.state === 'proven' || r.state === 'inferred')
    .sort((a, b) => {
      const rank = (r: StudioRequirement) =>
        (r.weight === 'must' ? 0 : 2) + (r.state === 'proven' ? 0 : 1);
      return rank(a) - rank(b);
    })
    .slice(0, PRESELECT_CAP)
    .map((r) => r.keyword);

  return {
    robotScore,
    humanScore,
    verdictLine,
    hooks,
    watchOuts,
    requirements: reqs,
    preselected,
    analyzedAt: new Date().toISOString(),
  };
}
