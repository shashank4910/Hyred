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

/**
 * A single proposed change in the story-first tailoring review. The review is
 * stateless on the server: it is built on demand from the cached analysis, and
 * Accept/Skip state lives client-side (same pattern as the existing keyword
 * chips) until the user hits Apply.
 */
export type ProposedChangeKind = 'reframe' | 'missing';

export interface ProposedChange {
  id: string;
  kind: ProposedChangeKind;
  keyword: string;
  type: string;
  weight: 'must' | 'nice';
  /**
   * Proposed new text (a reframed bullet) — only for `reframe` changes. The
   * engine never invents: this comes straight from the analysis's guarded
   * suggestion, so it always contains the keyword verbatim and no fabricated
   * metrics.
   */
  suggested?: string;
  /** Human-readable justification (from the analysis's evidence line). */
  evidence?: string;
  /**
   * Whether the change is pre-selected. Reframes are pre-selected when they
   * come from a proven/inferred requirement; missing warnings are NEVER
   * pre-selected — you do not auto-claim a tool you lack.
   */
  accepted: boolean;
  /** The change must be applied only if accepted. */
  required: boolean;
}

/**
 * Derive the list of proposed changes for the story-first review from a fit
 * analysis. This is a pure, deterministic transform of `analyzeMatchStudio`
 * output — no LLM, no DB, no quota.
 *
 * Rules (value honesty over keyword breadth):
 * - `proven` requirements need no change — dropped entirely.
 * - `inferred` requirements with a bullet suggestion become a `reframe` (the
 *   close-any wording you already have, but written to lead with the keyword).
 * - `absent` must-haves become a `missing` warning (never auto-accepted).
 * - `absent` nice-to-haves / soft skills / education are left out — they are
 *   not ATS tokens you should fabricate.
 */
export function buildProposedChanges(analysis: StudioAnalysis): ProposedChange[] {
  const changes: ProposedChange[] = [];

  for (const r of analysis.requirements) {
    if (r.state === 'proven') continue;

    if (r.state === 'inferred' && !!r.suggestion) {
      changes.push({
        id: `reframe-${r.keyword.toLowerCase().replace(/\s+/g, '-')}`,
        kind: 'reframe',
        keyword: r.keyword,
        type: r.type,
        weight: r.weight,
        suggested: r.suggestion,
        evidence: r.evidence,
        // Known-but-unwritten experience is safe to pre-tick (the skill is real).
        accepted: true,
        required: analysis.preselected.includes(r.keyword),
      });
      continue;
    }

    if (r.state === 'absent' && r.weight === 'must') {
      changes.push({
        id: `missing-${r.keyword.toLowerCase().replace(/\s+/g, '-')}`,
        kind: 'missing',
        keyword: r.keyword,
        type: r.type,
        weight: r.weight,
        // Never pre-select an absent skill — claiming it would be fabrication.
        accepted: false,
        required: true,
      });
    }
  }

  return changes;
}

interface CachedRequirement {
  keyword: string;
  type: string;
  weight: 'must' | 'nice';
}

/** Typed keyword for the chips UI (tool vs activity). */
export interface StudioKeyword {
  keyword: string;
  type: string;
}

/**
 * Cache row shape (v2): both the requirement checklist AND the full typed
 * keyword list from ONE extraction call. v1 rows (bare arrays) still read.
 */
interface JobAnalysisCache {
  v: number;
  requirements: CachedRequirement[];
  keywords: StudioKeyword[];
}

const MAX_REQUIREMENTS = 16;
const PRESELECT_CAP = 8;

function parseCacheRow(raw: unknown): JobAnalysisCache | null {
  if (Array.isArray(raw)) {
    // v1 row: requirements only, no typed keywords.
    const list = raw as CachedRequirement[];
    if (Array.isArray(list) && list.length > 0) return { v: 2, requirements: list, keywords: [] };
    return null;
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Partial<JobAnalysisCache>;
    if (Array.isArray(o.requirements) && o.requirements.length > 0) {
      return {
        v: 2,
        requirements: o.requirements,
        keywords: Array.isArray(o.keywords) ? o.keywords : [],
      };
    }
  }
  return null;
}

function cacheRowIsSane(cache: JobAnalysisCache): boolean {
  // v3 = extracted with the 12000-char window (v1/v2 rows were built from a
  // 5000-char truncated JD that silently dropped the JD's tail sections —
  // one-time invalidation re-extracts them). Also self-heal garbled rows.
  return (
    (cache as { v?: number }).v === 4 &&
    cache.requirements.length >= 8 &&
    cache.keywords.length >= 18 &&
    cache.requirements.every((r) => {
      const kw = String(r?.keyword ?? '');
      return kw && kw.length <= 60 && kw.split(/\s+/).length <= 5;
    })
  );
}

const MAX_KEYWORDS = 22;
const MAX_DOMAIN_TERMS = 3;

async function extractJobAnalysis(
  job: { id: string; title: string; description: string | null },
): Promise<JobAnalysisCache> {
  // 12000 chars - JD "Preferred Skills" sections live at the END of the
  // posting; a shorter window silently deleted JMeter/k6-class tools from
  // the AI's input (Session 47 bug). Cached once per job, so the larger
  // prompt costs nothing after the first analysis.
  const jd = sanitizeJobDescriptionForAI(job.description ?? '').slice(0, 12000);

  // ── Calls 1+2 in PARALLEL: requirement checklist + ATS keywords ──────────
  // They share no data, and both are cached per job afterwards. Sequential
  // execution doubled the cold-cache latency of every first analysis and was
  // a direct contributor to the studio route's 60s timeout.
  const [reqRaw, kwRaw] = await Promise.all([
    chat(
      'You extract structured hiring requirements from job descriptions. Output strict JSON only.',
      `Extract the real requirements from this job posting. Return JSON:
{"requirements":[{"keyword":"...","type":"tool|activity|concept|education|experience|soft","weight":"must|nice"}]}
Rules:
- 8 to ${MAX_REQUIREMENTS} items.
- keyword MUST be a short canonical noun phrase of 1-4 words that a resume could contain verbatim: "JMeter", "thread dump analysis", "distributed systems", "Bachelor degree".
- NEVER extract verbs, clauses, or full sentences ("recognize performance issues in..." is WRONG - "performance issue analysis" is right).
- Extract experience as a SHORT phrase like "performance testing experience"; education as "Bachelor degree".
- "must" only when the JD clearly requires it (must-have section, explicit "required"); otherwise "nice".
- No duplicates, no garbled fragments, at most 2 soft skills.

JOB TITLE: ${job.title}

JOB DESCRIPTION:
${jd}`,
      0.2,
      true,
      'match_studio_requirements',
    ),
    chat(
      'You select the exact keywords a recruiter would type into an ATS to find candidates for this job. Named tools outrank every other term. Output strict JSON only.',
      `Select the ATS keywords for this posting. Work in PHASES, in this order:

PHASE 1 - TOOL CENSUS (this layer is NEVER trimmed later): list EVERY distinct named tool, technology, framework, programming language, platform, product, database, and certification that appears ANYWHERE in the posting - required AND preferred/nice-to-have sections, including tools mentioned only as examples ("tools such as JMeter, Gatling, k6" means JMeter AND Gatling AND k6 each get their own entry). Use the posting's exact spelling.

PHASE 2 - SKILLS: add the strongest non-tool skills: testing types, methodologies, metrics, technical concepts. Rank by (a) appears in a Required/must-have section, (b) how many times the posting repeats it, (c) how central it is to the role's title.

PHASE 3 - TRIM to at most ${MAX_KEYWORDS} total. If over budget, cut in this order: domain/industry phrases first, then repeated concepts, then activities. NEVER cut a named tool to make room for a non-tool. Keep at most ${MAX_DOMAIN_TERMS} domain/industry phrases (e.g. "financial services", "payment processing"). Zero soft skills ("communication", "leadership").

Each entry: {"keyword":"...","type":"tool"} for named products/languages/platforms, {"keyword":"...","type":"activity"} for everything else. 1-3 words, JD's exact phrasing.

JOB TITLE: ${job.title}

JOB DESCRIPTION:
${jd}

Return JSON: {"keywords":[{"keyword":"...","type":"tool|activity"}]}`,
      0.15,
      true,
      'match_studio_keywords',
    ),
  ]);

  const reqParsed = safeJson<{ requirements?: CachedRequirement[] }>(reqRaw);
  const seenR = new Set<string>();
  const requirements: CachedRequirement[] = [];
  for (const r of reqParsed?.requirements ?? []) {
    const kw = String(r?.keyword ?? '').trim();
    if (!kw || kw.length > 60) continue;
    const key = kw.toLowerCase();
    if (seenR.has(key)) continue;
    seenR.add(key);
    requirements.push({
      keyword: kw,
      type: String(r?.type ?? 'concept'),
      weight: r?.weight === 'nice' ? 'nice' : 'must',
    });
    if (requirements.length >= MAX_REQUIREMENTS) break;
  }
  if (requirements.length === 0) throw new Error('Could not read job requirements');

  // Keyword parsing (the parallel call above). Phased judgment: an unranked
  // "list everything" prompt spends the cap on domain wallpaper ("financial
  // services") and drops named tools ("JMeter") - the exact tokens recruiters
  // type into an ATS.
  const kwParsed = safeJson<{ keywords?: StudioKeyword[] }>(kwRaw);
  const tools: StudioKeyword[] = [];
  const activities: StudioKeyword[] = [];
  const seenK = new Set<string>();
  for (const k of kwParsed?.keywords ?? []) {
    const kw = String(k?.keyword ?? '').trim();
    if (!kw || kw.length < 2 || kw.length > 60) continue;
    const key = kw.toLowerCase();
    if (seenK.has(key)) continue;
    // Anti-hallucination: every keyword must actually appear in the JD text.
    if (!keywordInText(kw, jd)) continue;
    seenK.add(key);
    const entry: StudioKeyword = { keyword: kw, type: k?.type === 'tool' ? 'tool' : 'activity' };
    if (entry.type === 'tool') tools.push(entry);
    else activities.push(entry);
  }
  // Deterministic composition: tools are untouchable and always lead the
  // list; activities fill the remainder of the budget.
  const keywords = [...tools, ...activities].slice(0, Math.max(tools.length, MAX_KEYWORDS));

  return { v: 4, requirements, keywords };
}

/**
 * Cached per-JOB analysis (requirements + typed keywords) shared by the fit
 * check AND the tailoring chips - ONE extraction call per job, ever.
 */
async function getJobAnalysis(
  sb: ReturnType<typeof supabaseAdmin>,
  job: { id: string; title: string; description: string | null },
): Promise<JobAnalysisCache> {
  const { data: cached, error: cacheErr } = await sb
    .from('jd_requirements')
    .select('requirements')
    .eq('job_id', job.id)
    .maybeSingle();
  if (!cacheErr && cached?.requirements) {
    const row = parseCacheRow(cached.requirements);
    if (row && cacheRowIsSane(row)) return row;
  }
  // 42P01 (table missing pre-migration) or cache miss/stale → extract once.
  if (cacheErr && cacheErr.code !== '42P01') {
    console.warn('[match-studio] jd_requirements read failed:', cacheErr.message);
  }

  const analysis = await extractJobAnalysis(job);

  if (!cacheErr) {
    const { error: upErr } = await sb
      .from('jd_requirements')
      .upsert({ job_id: job.id, requirements: analysis }, { onConflict: 'job_id' });
    if (upErr) console.warn('[match-studio] jd_requirements write failed:', upErr.message);
  }
  return analysis;
}

/** Requirements for the fit check (cached per job). */
async function getJobRequirements(
  sb: ReturnType<typeof supabaseAdmin>,
  job: { id: string; title: string; description: string | null },
): Promise<CachedRequirement[]> {
  return (await getJobAnalysis(sb, job)).requirements;
}

/**
 * Typed keyword list for the tailoring chips - the SAME cached extraction the
 * fit check uses, so chips and fit check can never disagree again.
 */
export async function getJobKeywordsCached(
  sb: ReturnType<typeof supabaseAdmin>,
  job: { id: string; title: string; description: string | null },
): Promise<StudioKeyword[]> {
  return (await getJobAnalysis(sb, job)).keywords;
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
  const startedAt = Date.now();
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
    // Budget-aware grade call: the studio route has a hard 60s function cap.
    // Reserve time for DB + response and give the LLM whatever remains; if
    // that is too little for even one attempt (or the call fails), fail open —
    // the deterministic robot score below still ships without the recruiter
    // verdict. A timeout error must not 500 the whole analysis.
    const gradeBudgetMs = Math.max(0, 52_000 - (Date.now() - startedAt));
    let raw: string | null = null;
    if (gradeBudgetMs >= 10_000) {
      raw = await chat(
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
      ).catch((e) => {
        console.warn('[match-studio] grade call failed open:', (e as Error).message);
        return null;
      });
    } else {
      console.warn(
        `[match-studio] skipping grade call, budget exhausted (${gradeBudgetMs}ms left)`,
      );
    }

    const parsed = raw ? safeJson<{
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
    }>(raw) : null;

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
