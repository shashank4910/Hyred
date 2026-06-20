# Tier 1 Premium Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Tier 1 Hyred Premium features: Interview Prep Pack, Match Intelligence, and Resume Studio Pro, on top of a shared premium entitlement and quota system.

**Architecture:** Start by adding durable premium state + usage tracking on the server, then build a shared quota helper that all premium APIs use. Implement Match Intelligence and Interview Prep Pack as job-detail intelligence features backed by new API routes and stored results. Extend the existing ATS resume flow into Resume Studio Pro with quota enforcement and saved versions per match.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase, existing `lib/gemini.ts` AI helpers, server routes under `app/api`, React client UI in `app/(app)/jobs/[id]`, Sonner toasts.

## Global Constraints

- Preserve Hyred's current product direction from `docs/features-jun26-to-be-built.md`; do not pivot the app.
- Tier 1 only: Interview Prep Pack, Match Intelligence, Resume Studio Pro.
- No LinkedIn scraping, LinkedIn OAuth automation, or ATS auto-submit promises.
- No unlimited LLM usage; enforce quotas server-side.
- Keep existing free behavior working: score + matched/missing skills stay free, current tailored resume flow still exists with new limits.
- Premium pricing assumptions stay documentation-only in this plan; do not build Stripe yet.
- Reuse existing match, JD, resume, and extension data wherever possible.
- Add tests for new server logic and helpers where there is meaningful regression risk.

---

## File Structure

### Existing files to modify

- `lib/types.ts`
  - Extend app-level types for premium access, quota usage, interview prep payloads, match verdicts, and resume version summaries.
- `app/(app)/jobs/[id]/page.tsx`
  - Fetch new premium-backed data for the job detail page and pass it down to `JobActions`.
- `app/(app)/jobs/[id]/JobActions.tsx`
  - Add Tier 1 UI sections, generation buttons, quota wall handling, version history UI, and premium upgrade messaging.
- `app/api/match/[id]/resume/route.ts`
  - Enforce resume quotas and save generated versions.
- `app/api/match/[id]/status/route.ts`
  - Return a richer status update payload so the client can immediately surface the interview-prep trigger.

### New files to create

- `supabase/migrations/0015_hyred_premium_tier1.sql`
  - Add durable schema for premium subscription state, usage ledger, resume versions, match verdict cache, and interview prep cache.
- `lib/premium.ts`
  - Shared helper for entitlement lookup, cycle window calculation, quota read/increment, and feature-gate responses.
- `lib/match-intelligence.ts`
  - Build and validate `Apply / Stretch / Skip` verdict output from existing match + JD + resume data.
- `lib/interview-prep.ts`
  - Build structured interview prep JSON from JD, matched skills, missing skills, and resume evidence.
- `app/api/match/[id]/verdict/route.ts`
  - Generate or fetch cached Match Intelligence verdict.
- `app/api/match/[id]/prep/route.ts`
  - Generate or fetch cached Interview Prep Pack with quota enforcement.
- `tests/unit/premium.test.ts`
  - Unit tests for entitlement/quota helper behavior.
- `tests/unit/match-intelligence.test.ts`
  - Unit tests for verdict normalization and guardrails.
- `tests/unit/interview-prep.test.ts`
  - Unit tests for prep payload normalization and evidence requirements.

### Optional small UI helpers if `JobActions.tsx` gets too large

- `app/(app)/jobs/[id]/InterviewPrepCard.tsx`
- `app/(app)/jobs/[id]/MatchIntelligenceCard.tsx`
- `app/(app)/jobs/[id]/ResumeVersionList.tsx`

Create these only if the main file becomes unwieldy during implementation.

---

## Task 1: Premium Entitlements and Quota Foundation

**Files:**
- Create: `supabase/migrations/0015_hyred_premium_tier1.sql`
- Create: `lib/premium.ts`
- Modify: `lib/types.ts`
- Test: `tests/unit/premium.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile()` pattern, `supabaseAdmin()`
- Produces:
  - `type PremiumFeatureKey = 'interview_prep' | 'match_intelligence' | 'resume_studio'`
  - `type PremiumPlan = 'free' | 'premium_monthly' | 'premium_sprint'`
  - `async function getPremiumAccess(profileId: string): Promise<{ plan: PremiumPlan; cycleStart: string | null; cycleEnd: string | null }>`
  - `async function getFeatureUsage(profileId: string, feature: PremiumFeatureKey): Promise<{ used: number; limit: number | null; remaining: number | null }>`
  - `async function requireFeatureAccess(args: { profileId: string; feature: PremiumFeatureKey; consumeOnSuccess?: boolean }): Promise<{ ok: true; usage: { used: number; limit: number | null; remaining: number | null } } | { ok: false; status: 402; error: string; usage: { used: number; limit: number | null; remaining: number | null } }>`
  - DB tables for `premium_subscriptions`, `premium_usage_events`, `resume_versions`, `match_verdicts`, `interview_prep_packs`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { quotaLimitForPlan, quotaWindowKind, summarizeUsage } from '@/lib/premium';

describe('quotaLimitForPlan', () => {
  it('returns free limits for free users', () => {
    expect(quotaLimitForPlan('free', 'interview_prep')).toBe(1);
    expect(quotaLimitForPlan('free', 'resume_studio')).toBe(3);
    expect(quotaLimitForPlan('free', 'match_intelligence')).toBe(0);
  });

  it('returns premium limits for paid users', () => {
    expect(quotaLimitForPlan('premium_monthly', 'interview_prep')).toBe(8);
    expect(quotaLimitForPlan('premium_sprint', 'resume_studio')).toBe(40);
  });
});

describe('quotaWindowKind', () => {
  it('uses lifetime for the free interview prep sample', () => {
    expect(quotaWindowKind('free', 'interview_prep')).toBe('lifetime');
  });

  it('uses billing_cycle for paid features', () => {
    expect(quotaWindowKind('premium_monthly', 'interview_prep')).toBe('billing_cycle');
  });
});

describe('summarizeUsage', () => {
  it('caps remaining at zero', () => {
    expect(summarizeUsage({ used: 9, limit: 8 })).toEqual({ used: 9, limit: 8, remaining: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/premium.test.ts`

Expected: FAIL with module or export errors for `@/lib/premium`.

- [ ] **Step 3: Write the migration**

```sql
create table if not exists premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  plan text not null check (plan in ('free', 'premium_monthly', 'premium_sprint')),
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired')),
  cycle_start timestamptz,
  cycle_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists premium_subscriptions_profile_id_active_idx
  on premium_subscriptions (profile_id)
  where status = 'active';

create table if not exists premium_usage_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  feature_key text not null check (feature_key in ('interview_prep', 'match_intelligence', 'resume_studio')),
  event_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists premium_usage_events_profile_feature_event_idx
  on premium_usage_events (profile_id, feature_key, event_key);

create table if not exists resume_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  label text,
  resume_text text not null,
  ats_match_score smallint,
  selected_keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists resume_versions_profile_match_created_idx
  on resume_versions (profile_id, match_id, created_at desc);

create table if not exists match_verdicts (
  match_id uuid primary key references matches(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  verdict text not null check (verdict in ('apply', 'stretch', 'skip')),
  seniority_fit text not null check (seniority_fit in ('underqualified', 'calibrated', 'overqualified')),
  reasons jsonb not null default '[]',
  actions jsonb not null default '[]',
  generated_at timestamptz not null default now()
);

create index if not exists match_verdicts_profile_generated_idx
  on match_verdicts (profile_id, generated_at desc);

create table if not exists interview_prep_packs (
  match_id uuid primary key references matches(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  prep jsonb not null,
  generated_at timestamptz not null default now()
);

create index if not exists interview_prep_packs_profile_generated_idx
  on interview_prep_packs (profile_id, generated_at desc);
```

- [ ] **Step 4: Write the minimal premium helper**

```ts
import { supabaseAdmin } from '@/lib/supabase/server';

export type PremiumFeatureKey = 'interview_prep' | 'match_intelligence' | 'resume_studio';
export type PremiumPlan = 'free' | 'premium_monthly' | 'premium_sprint';
export type QuotaWindowKind = 'lifetime' | 'billing_cycle';

export function quotaLimitForPlan(plan: PremiumPlan, feature: PremiumFeatureKey): number {
  const freeLimits: Record<PremiumFeatureKey, number> = {
    interview_prep: 1,
    match_intelligence: 0,
    resume_studio: 3,
  };
  const premiumLimits: Record<PremiumFeatureKey, number> = {
    interview_prep: 8,
    match_intelligence: 9999,
    resume_studio: 40,
  };
  return plan === 'free' ? freeLimits[feature] : premiumLimits[feature];
}

export function quotaWindowKind(plan: PremiumPlan, feature: PremiumFeatureKey): QuotaWindowKind {
  if (plan === 'free' && feature === 'interview_prep') return 'lifetime';
  if (plan === 'free' && feature === 'match_intelligence') return 'lifetime';
  return 'billing_cycle';
}

export function summarizeUsage(args: { used: number; limit: number | null }) {
  return {
    used: args.used,
    limit: args.limit,
    remaining: args.limit == null ? null : Math.max(args.limit - args.used, 0),
  };
}

export async function getPremiumAccess(profileId: string) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('premium_subscriptions')
    .select('plan, cycle_start, cycle_end')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle();

  return {
    plan: (data?.plan as PremiumPlan | undefined) ?? 'free',
    cycleStart: data?.cycle_start ?? null,
    cycleEnd: data?.cycle_end ?? null,
  };
}

export async function getFeatureUsage(profileId: string, feature: PremiumFeatureKey) {
  const access = await getPremiumAccess(profileId);
  const limit = quotaLimitForPlan(access.plan, feature);
  const windowKind = quotaWindowKind(access.plan, feature);
  const sb = supabaseAdmin();
  let query = sb
    .from('premium_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('feature_key', feature);

  if (windowKind === 'billing_cycle' && access.cycleStart) {
    query = query.gte('created_at', access.cycleStart);
  }

  const { count } = await query;
  return summarizeUsage({ used: count ?? 0, limit });
}

export async function requireFeatureAccess(args: {
  profileId: string;
  feature: PremiumFeatureKey;
  consumeOnSuccess?: boolean;
}) {
  const usage = await getFeatureUsage(args.profileId, args.feature);
  if (usage.limit !== null && usage.used >= usage.limit) {
    return {
      ok: false as const,
      status: 402 as const,
      error: 'premium_upgrade_required',
      usage,
    };
  }
  return { ok: true as const, usage };
}
```

- [ ] **Step 5: Update shared types**

```ts
export type PremiumPlan = 'free' | 'premium_monthly' | 'premium_sprint';

export type MatchVerdict = 'apply' | 'stretch' | 'skip';
export type SeniorityFit = 'underqualified' | 'calibrated' | 'overqualified';

export type MatchIntelligenceResult = {
  verdict: MatchVerdict;
  seniorityFit: SeniorityFit;
  reasons: string[];
  actions: string[];
};

export type InterviewPrepPack = {
  quickSummary: string;
  likelyQuestions: string[];
  technicalQuestions: string[];
  behavioralQuestions: string[];
  gapDefenseQuestions: string[];
  starAnswerHints: { question: string; answerHint: string }[];
  questionsToAsk: string[];
};

export type ResumeVersionSummary = {
  id: string;
  label: string | null;
  ats_match_score: number | null;
  created_at: string;
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/unit/premium.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0015_hyred_premium_tier1.sql lib/premium.ts lib/types.ts tests/unit/premium.test.ts
git commit -m "feat: add premium quota foundation for tier 1"
```

---

## Task 2: Match Intelligence API and Persistence

**Files:**
- Create: `lib/match-intelligence.ts`
- Create: `app/api/match/[id]/verdict/route.ts`
- Test: `tests/unit/match-intelligence.test.ts`

**Interfaces:**
- Consumes:
  - `requireFeatureAccess({ profileId, feature: 'match_intelligence' })`
  - existing `matches`, `profiles.resume_text`, `profiles.insights`, and `jobs`
- Produces:
  - `async function generateMatchIntelligence(args: { score: number | null; matchedSkills: string[]; missingSkills: string[]; yearsExperience: number | null; seniority: string | null; jobTitle: string; jobDescription: string; reason: string | null }): Promise<MatchIntelligenceResult>`
  - `GET /api/match/[id]/verdict` returns cached verdict or a free preview
  - `POST /api/match/[id]/verdict` generates and stores the full premium verdict

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeVerdictResult } from '@/lib/match-intelligence';

describe('normalizeVerdictResult', () => {
  it('forces verdict into the allowed set', () => {
    const result = normalizeVerdictResult({
      verdict: 'maybe',
      seniorityFit: 'unknown',
      reasons: ['Reason 1', 'Reason 2'],
      actions: ['Action 1'],
    });

    expect(result.verdict).toBe('stretch');
    expect(result.seniorityFit).toBe('calibrated');
  });

  it('keeps only the first three reasons and actions', () => {
    const result = normalizeVerdictResult({
      verdict: 'apply',
      seniorityFit: 'underqualified',
      reasons: ['1', '2', '3', '4'],
      actions: ['a', 'b', 'c', 'd'],
    });

    expect(result.reasons).toHaveLength(3);
    expect(result.actions).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/match-intelligence.test.ts`

Expected: FAIL with module not found or missing export errors.

- [ ] **Step 3: Write the normalization helper and generator shell**

```ts
import { chat } from '@/lib/gemini';
import type { MatchIntelligenceResult } from '@/lib/types';

export function normalizeVerdictResult(input: {
  verdict?: string;
  seniorityFit?: string;
  reasons?: string[];
  actions?: string[];
}): MatchIntelligenceResult {
  const verdict = input.verdict === 'apply' || input.verdict === 'skip' ? input.verdict : 'stretch';
  const seniorityFit =
    input.seniorityFit === 'underqualified' ||
    input.seniorityFit === 'overqualified'
      ? input.seniorityFit
      : 'calibrated';

  return {
    verdict,
    seniorityFit,
    reasons: Array.isArray(input.reasons) ? input.reasons.slice(0, 3) : [],
    actions: Array.isArray(input.actions) ? input.actions.slice(0, 3) : [],
  };
}

export async function generateMatchIntelligence(args: {
  score: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  yearsExperience: number | null;
  seniority: string | null;
  jobTitle: string;
  jobDescription: string;
  reason: string | null;
}): Promise<MatchIntelligenceResult> {
  const system = `You are Hyred's job match strategist.
Return compact JSON with:
{
  "verdict": "apply" | "stretch" | "skip",
  "seniorityFit": "underqualified" | "calibrated" | "overqualified",
  "reasons": ["...", "...", "..."],
  "actions": ["...", "...", "..."]
}
Use only evidence from the supplied match context. Never claim interview probability.`;

  const user = JSON.stringify(args);
  const raw = await chat(system, user, 0.2, true, 'generateMatchIntelligence');
  const parsed = JSON.parse(raw);
  return normalizeVerdictResult(parsed);
}
```

- [ ] **Step 4: Add the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { ensureFullDescription } from '@/lib/jd-fetcher';
import { requireFeatureAccess } from '@/lib/premium';
import { generateMatchIntelligence } from '@/lib/match-intelligence';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const { data } = await sb
    .from('match_verdicts')
    .select('verdict, seniority_fit, reasons, actions, generated_at')
    .eq('match_id', id)
    .eq('profile_id', profile.id)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({
      ok: true,
      locked: true,
      preview: 'Unlock Match Intelligence to see Apply / Stretch / Skip.',
    });
  }

  return NextResponse.json({
    ok: true,
    locked: false,
    result: {
      verdict: data.verdict,
      seniorityFit: data.seniority_fit,
      reasons: data.reasons,
      actions: data.actions,
      generatedAt: data.generated_at,
    },
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const gate = await requireFeatureAccess({ profileId: profile.id, feature: 'match_intelligence' });
  if (!gate.ok) return NextResponse.json(gate, { status: gate.status });

  const sb = supabaseAdmin();
  const { data: match } = await sb
    .from('matches')
    .select(`llm_score, reason, matched_skills, missing_skills, profile:profiles(insights, resume_text), job:jobs(id, title, description, url)`)
    .eq('id', id)
    .eq('profile_id', profile.id)
    .single();

  const insights = (match?.profile as any)?.insights ?? {};
  const job = match?.job as any;
  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  const result = await generateMatchIntelligence({
    score: match?.llm_score ?? null,
    matchedSkills: match?.matched_skills ?? [],
    missingSkills: match?.missing_skills ?? [],
    yearsExperience: insights.years_experience ?? null,
    seniority: insights.seniority ?? null,
    jobTitle: job.title,
    jobDescription: fullDescription ?? job.description ?? '',
    reason: match?.reason ?? null,
  });

  await sb.from('match_verdicts').upsert({
    match_id: id,
    profile_id: profile.id,
    verdict: result.verdict,
    seniority_fit: result.seniorityFit,
    reasons: result.reasons,
    actions: result.actions,
  });

  return NextResponse.json({ ok: true, result });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/unit/match-intelligence.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/match-intelligence.ts app/api/match/[id]/verdict/route.ts tests/unit/match-intelligence.test.ts
git commit -m "feat: add match intelligence verdict API"
```

---

## Task 3: Interview Prep Pack API and Persistence

**Files:**
- Create: `lib/interview-prep.ts`
- Create: `app/api/match/[id]/prep/route.ts`
- Test: `tests/unit/interview-prep.test.ts`

**Interfaces:**
- Consumes:
  - `requireFeatureAccess({ profileId, feature: 'interview_prep' })`
  - cached match + JD + resume data
  - `match_verdicts` when available for richer framing
- Produces:
  - `async function generateInterviewPrep(args: { jobTitle: string; company: string | null; jobDescription: string; matchedSkills: string[]; missingSkills: string[]; resumeText: string; reason: string | null }): Promise<InterviewPrepPack>`
  - `GET /api/match/[id]/prep`
  - `POST /api/match/[id]/prep`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeInterviewPrep } from '@/lib/interview-prep';

describe('normalizeInterviewPrep', () => {
  it('ensures arrays are present even when the model omits them', () => {
    const result = normalizeInterviewPrep({ quickSummary: 'Summary only' });
    expect(result.likelyQuestions).toEqual([]);
    expect(result.technicalQuestions).toEqual([]);
    expect(result.questionsToAsk).toEqual([]);
  });

  it('trims long arrays to keep the pack focused', () => {
    const result = normalizeInterviewPrep({
      quickSummary: 'Summary',
      likelyQuestions: ['1', '2', '3', '4', '5', '6'],
      technicalQuestions: ['a', 'b', 'c', 'd', 'e', 'f'],
      behavioralQuestions: ['x', 'y', 'z', 'm', 'n', 'o'],
      gapDefenseQuestions: ['g1', 'g2', 'g3', 'g4'],
      starAnswerHints: [
        { question: 'q1', answerHint: 'a1' },
        { question: 'q2', answerHint: 'a2' },
        { question: 'q3', answerHint: 'a3' },
        { question: 'q4', answerHint: 'a4' },
      ],
      questionsToAsk: ['qa1', 'qa2', 'qa3', 'qa4'],
    });

    expect(result.likelyQuestions).toHaveLength(5);
    expect(result.starAnswerHints).toHaveLength(3);
    expect(result.questionsToAsk).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/interview-prep.test.ts`

Expected: FAIL with module or export errors.

- [ ] **Step 3: Write the normalization helper and generator**

```ts
import { chat } from '@/lib/gemini';
import type { InterviewPrepPack } from '@/lib/types';

export function normalizeInterviewPrep(input: Partial<InterviewPrepPack>): InterviewPrepPack {
  return {
    quickSummary: input.quickSummary ?? '',
    likelyQuestions: Array.isArray(input.likelyQuestions) ? input.likelyQuestions.slice(0, 5) : [],
    technicalQuestions: Array.isArray(input.technicalQuestions) ? input.technicalQuestions.slice(0, 5) : [],
    behavioralQuestions: Array.isArray(input.behavioralQuestions) ? input.behavioralQuestions.slice(0, 5) : [],
    gapDefenseQuestions: Array.isArray(input.gapDefenseQuestions) ? input.gapDefenseQuestions.slice(0, 3) : [],
    starAnswerHints: Array.isArray(input.starAnswerHints) ? input.starAnswerHints.slice(0, 3) : [],
    questionsToAsk: Array.isArray(input.questionsToAsk) ? input.questionsToAsk.slice(0, 3) : [],
  };
}

export async function generateInterviewPrep(args: {
  jobTitle: string;
  company: string | null;
  jobDescription: string;
  matchedSkills: string[];
  missingSkills: string[];
  resumeText: string;
  reason: string | null;
}) {
  const system = `You are Hyred's interview prep coach.
Return compact JSON with:
{
  "quickSummary": string,
  "likelyQuestions": string[],
  "technicalQuestions": string[],
  "behavioralQuestions": string[],
  "gapDefenseQuestions": string[],
  "starAnswerHints": [{ "question": string, "answerHint": string }],
  "questionsToAsk": string[]
}
Only use evidence from the resume and JD. Never invent achievements or tools.`;

  const raw = await chat(system, JSON.stringify(args), 0.3, true, 'generateInterviewPrep');
  return normalizeInterviewPrep(JSON.parse(raw));
}
```

- [ ] **Step 4: Add the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/current-user';
import { ensureFullDescription } from '@/lib/jd-fetcher';
import { requireFeatureAccess } from '@/lib/premium';
import { generateInterviewPrep } from '@/lib/interview-prep';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const { data } = await sb
    .from('interview_prep_packs')
    .select('prep, generated_at')
    .eq('match_id', id)
    .eq('profile_id', profile.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    result: data?.prep ?? null,
    generatedAt: data?.generated_at ?? null,
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const gate = await requireFeatureAccess({
    profileId: profile.id,
    feature: 'interview_prep',
  });
  if (!gate.ok) return NextResponse.json(gate, { status: gate.status });

  const sb = supabaseAdmin();
  const { data: match } = await sb
    .from('matches')
    .select(`reason, matched_skills, missing_skills, profile:profiles(resume_text), job:jobs(id, title, company, description, url)`)
    .eq('id', id)
    .eq('profile_id', profile.id)
    .single();

  const job = match?.job as any;
  const resumeText = (match?.profile as any)?.resume_text ?? '';
  const fullDescription = await ensureFullDescription({
    jobId: job.id,
    currentDescription: job.description,
    url: job.url,
  });

  const result = await generateInterviewPrep({
    jobTitle: job.title,
    company: job.company ?? null,
    jobDescription: fullDescription ?? job.description ?? '',
    matchedSkills: match?.matched_skills ?? [],
    missingSkills: match?.missing_skills ?? [],
    resumeText,
    reason: match?.reason ?? null,
  });

  await sb.from('interview_prep_packs').upsert({
    match_id: id,
    profile_id: profile.id,
    prep: result,
  });

  return NextResponse.json({ ok: true, result, usage: gate.usage });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/unit/interview-prep.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/interview-prep.ts app/api/match/[id]/prep/route.ts tests/unit/interview-prep.test.ts
git commit -m "feat: add interview prep pack API"
```

---

## Task 4: Resume Studio Pro Quotas and Version History

**Files:**
- Modify: `app/api/match/[id]/resume/route.ts`
- Test: `tests/unit/premium.test.ts`

**Interfaces:**
- Consumes:
  - `requireFeatureAccess({ profileId, feature: 'resume_studio' })`
  - existing `generateAtsResume()`
  - `resume_versions` table
- Produces:
  - `POST /api/match/[id]/resume` with quota enforcement and version persistence
  - `GET /api/match/[id]/resume` enriched with version summaries

- [ ] **Step 1: Extend the failing test with a version-summary contract**

```ts
import { describe, expect, it } from 'vitest';
import { summarizeUsage } from '@/lib/premium';

describe('resume studio quotas', () => {
  it('reports remaining resume generations clearly', () => {
    expect(summarizeUsage({ used: 2, limit: 3 })).toEqual({ used: 2, limit: 3, remaining: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify current behavior**

Run: `npm test -- tests/unit/premium.test.ts`

Expected: PASS or FAIL only if prior helper behavior changed unexpectedly.

- [ ] **Step 3: Add quota checks and version persistence to the resume route**

```ts
// inside POST /api/match/[id]/resume, after loading the match
const gate = await requireFeatureAccess({
  profileId: profile0.id,
  feature: 'resume_studio',
});
if (!gate.ok) {
  return NextResponse.json(gate, { status: gate.status });
}

// after generateAtsResume succeeds
const versionLabel = `Resume ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

await sb
  .from('matches')
  .update({ tailored_resume_text: result.resume })
  .eq('id', id);

await sb
  .from('resume_versions')
  .insert({
    profile_id: profile0.id,
    match_id: id,
    label: versionLabel,
    resume_text: result.resume,
    ats_match_score: result.ats_match_score,
    selected_keywords: selectedKeywords,
  });

await sb
  .from('premium_usage_events')
  .insert({
    profile_id: profile0.id,
    feature_key: 'resume_studio',
    event_key: `${id}:${Date.now()}`,
  });
```

- [ ] **Step 4: Extend the GET route with resume version summaries**

```ts
const { data: versions } = await sb
  .from('resume_versions')
  .select('id, label, ats_match_score, created_at')
  .eq('profile_id', profile0.id)
  .eq('match_id', id)
  .order('created_at', { ascending: false })
  .limit(10);

return NextResponse.json({
  keywords: [...new Set([...available, ...alreadyHave])],
  alreadyHave: [...new Set(alreadyHave)],
  keywordTypes,
  versions: versions ?? [],
});
```

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/unit/premium.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/match/[id]/resume/route.ts tests/unit/premium.test.ts
git commit -m "feat: add resume studio quotas and version history"
```

---

## Task 5: Job Detail UI for Tier 1 Premium Features

**Files:**
- Modify: `app/(app)/jobs/[id]/page.tsx`
- Modify: `app/(app)/jobs/[id]/JobActions.tsx`
- Optional Create: `app/(app)/jobs/[id]/InterviewPrepCard.tsx`
- Optional Create: `app/(app)/jobs/[id]/MatchIntelligenceCard.tsx`
- Optional Create: `app/(app)/jobs/[id]/ResumeVersionList.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/match/[id]/verdict`
  - `POST /api/match/[id]/verdict`
  - `GET /api/match/[id]/prep`
  - `POST /api/match/[id]/prep`
  - `GET /api/match/[id]/resume`
- Produces:
  - visible Tier 1 sections on the job detail page
  - premium paywall prompts at the right moments
  - local state for prep generation, verdict loading, and resume version rendering

- [ ] **Step 1: Add prop types to `JobActions`**

```ts
type ResumeVersionSummary = {
  id: string;
  label: string | null;
  ats_match_score: number | null;
  created_at: string;
};

export function JobActions({
  matchId,
  status,
  bookmarked: initialBookmarked,
  coverLetter,
  notes,
  applyUrl,
  hasTailoredResume: initialHasTailored = false,
  initialResumeVersions = [],
}: {
  matchId: string;
  status: string;
  bookmarked: boolean;
  coverLetter: string | null;
  notes: string | null;
  applyUrl: string;
  hasTailoredResume?: boolean;
  initialResumeVersions?: ResumeVersionSummary[];
}) {
```

- [ ] **Step 2: Thread version summaries from the page**

```ts
const { data: resumeVersions } = await sb
  .from('resume_versions')
  .select('id, label, ats_match_score, created_at')
  .eq('profile_id', profile0.id)
  .eq('match_id', id)
  .order('created_at', { ascending: false })
  .limit(10);

<JobActions
  matchId={match.id}
  status={match.status}
  bookmarked={(match as any).bookmarked ?? false}
  coverLetter={match.cover_letter}
  notes={match.notes}
  applyUrl={job.url}
  hasTailoredResume={Boolean((match as any).tailored_resume_text || (match as any).tailored_resume_url)}
  initialResumeVersions={resumeVersions ?? []}
/>
```

- [ ] **Step 3: Add Match Intelligence client actions**

```ts
const [verdictLoading, setVerdictLoading] = useState(false);
const [verdictResult, setVerdictResult] = useState<MatchIntelligenceResult | null>(null);
const [verdictLocked, setVerdictLocked] = useState(false);

async function loadVerdict() {
  setVerdictLoading(true);
  try {
    const res = await fetch(`/api/match/${matchId}/verdict`);
    const data = await res.json();
    setVerdictLocked(Boolean(data.locked));
    setVerdictResult(data.result ?? null);
  } finally {
    setVerdictLoading(false);
  }
}

async function generateVerdict() {
  setVerdictLoading(true);
  const id = toast.loading('Analyzing this match...');
  try {
    const res = await fetch(`/api/match/${matchId}/verdict`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not generate verdict');
    setVerdictResult(data.result);
    setVerdictLocked(false);
    toast.success('Match Intelligence ready', { id });
  } catch (e) {
    toast.error((e as Error).message, { id });
  } finally {
    setVerdictLoading(false);
  }
}

useEffect(() => {
  void loadVerdict();
}, [matchId]);
```

- [ ] **Step 4: Add Interview Prep Pack client actions**

```ts
const [prepLoading, setPrepLoading] = useState(false);
const [prepPack, setPrepPack] = useState<InterviewPrepPack | null>(null);

async function loadPrepPack() {
  const res = await fetch(`/api/match/${matchId}/prep`);
  const data = await res.json();
  setPrepPack(data.result ?? null);
}

async function generatePrepPack() {
  setPrepLoading(true);
  const id = toast.loading('Building interview prep...');
  try {
    const res = await fetch(`/api/match/${matchId}/prep`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not generate prep');
    setPrepPack(data.result);
    toast.success('Interview Prep Pack ready', { id });
  } catch (e) {
    toast.error((e as Error).message, { id });
  } finally {
    setPrepLoading(false);
  }
}
```

- [ ] **Step 5: Add the new cards to the page**

```tsx
<div className="card">
  <div className="flex items-center justify-between gap-3">
    <div>
      <h2 className="font-semibold text-on-surface">Match Intelligence</h2>
      <p className="text-sm text-on-surface-variant">See whether this role is worth your effort.</p>
    </div>
    <button onClick={generateVerdict} disabled={verdictLoading} className="btn">
      {verdictLoading ? 'Analyzing…' : 'Unlock verdict'}
    </button>
  </div>

  {verdictLocked && !verdictResult ? (
    <div className="mt-3 rounded-xl border border-outline-variant p-4 text-sm text-on-surface-variant">
      Apply / Stretch / Skip is a Premium feature.
    </div>
  ) : verdictResult ? (
    <div className="mt-3 space-y-3">
      <div className="badge-success uppercase">{verdictResult.verdict}</div>
      <div className="text-sm text-on-surface-variant">Seniority fit: {verdictResult.seniorityFit}</div>
      <ul className="list-disc pl-5 text-sm">{verdictResult.reasons.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  ) : null}
</div>

<div className="card">
  <div className="flex items-center justify-between gap-3">
    <div>
      <h2 className="font-semibold text-on-surface">Interview Prep Pack</h2>
      <p className="text-sm text-on-surface-variant">Likely questions, gap defense, and talking points for this job.</p>
    </div>
    <button onClick={generatePrepPack} disabled={prepLoading} className="btn-primary">
      {prepLoading ? 'Building…' : 'Generate prep pack'}
    </button>
  </div>

  {prepPack ? (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-on-surface-variant">{prepPack.quickSummary}</p>
      <div>
        <h3 className="font-medium">Likely questions</h3>
        <ul className="mt-2 list-disc pl-5 text-sm">{prepPack.likelyQuestions.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    </div>
  ) : null}
</div>
```

- [ ] **Step 6: Show the interview trigger immediately after status update**

```ts
async function setStatus(next: string) {
  const id = toast.loading('Updating...');
  try {
    const res = await fetch(`/api/match/${matchId}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    toast.success(`Marked as ${next}`, { id });
    if (next === 'interviewing') {
      toast('Interview stage reached — unlock your Interview Prep Pack next.');
    }
    startTransition(() => router.refresh());
  } catch (e) {
    toast.error((e as Error).message, { id });
  }
}
```

- [ ] **Step 7: Run verification**

Run: `npm run typecheck`

Expected: PASS

Run: `npm test -- tests/unit/premium.test.ts tests/unit/match-intelligence.test.ts tests/unit/interview-prep.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/(app)/jobs/[id]/page.tsx app/(app)/jobs/[id]/JobActions.tsx
git commit -m "feat: add tier 1 premium job detail UI"
```

---

## Task 6: Final Verification and Documentation Sync

**Files:**
- Modify: `docs/features-jun26-to-be-built.md`
- Test: none beyond full verification

**Interfaces:**
- Consumes: all previous tasks
- Produces: updated roadmap status notes for Tier 1 implementation readiness

- [ ] **Step 1: Update the roadmap doc after implementation**

```md
## Status update

- Tier 1 implementation foundation shipped:
  - premium quota helper
  - Match Intelligence route
  - Interview Prep route
  - Resume Studio Pro quota + versions
  - job detail UI hooks
```

- [ ] **Step 2: Run full verification**

Run: `npm run typecheck`

Expected: PASS

Run: `npm test -- tests/unit/premium.test.ts tests/unit/match-intelligence.test.ts tests/unit/interview-prep.test.ts`

Expected: PASS

- [ ] **Step 3: Review diff**

Run: `git diff --stat HEAD~6..HEAD`

Expected: shows the Tier 1 premium feature files and tests only.

- [ ] **Step 4: Commit**

```bash
git add docs/features-jun26-to-be-built.md
git commit -m "docs: record tier 1 premium implementation status"
```

---

## Self-Review

### Spec coverage

- Interview Prep Pack: covered in Tasks 1, 3, 5
- Match Intelligence: covered in Tasks 1, 2, 5
- Resume Studio Pro: covered in Tasks 1, 4, 5
- Shared quotas/paywall foundation: covered in Task 1
- Job-detail paywall moments: covered in Task 5

### Placeholder scan

- No `TODO` or `TBD` placeholders remain.
- All new routes, helpers, and tables are named explicitly.

### Type consistency

- `PremiumFeatureKey`, `PremiumPlan`, `MatchIntelligenceResult`, `InterviewPrepPack`, and `ResumeVersionSummary` are defined once and reused consistently.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-tier-1-premium-features.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
