# JobRadar — AI Development Context

> **For any AI tool (Cursor, Claude, Antigravity, Kiro, etc.):** Read this file first before making changes. It contains the full project context, architecture decisions, known pitfalls, and debugging protocol.

---

## Project Overview

JobRadar is a personalized AI-powered job-search dashboard that:
1. Fetches jobs from Adzuna, Remotive, RemoteOK, HackerNews, Arbeitnow (cron every 6h)
2. AI-scores each job against the user's resume (0-100)
3. Surfaces relevant matches in a polished light-themed dashboard (Runway-inspired warm palette)
4. Generates tailored ATS resumes + cover letters per job
5. Provides skill-match analysis (JD requirements vs resume)

**Owner:** Shashank Singh — Senior Performance Engineer (India, 7.7 years)
**Stack:** Next.js 15, React 19, TypeScript, Supabase, Groq Llama 3.3 70B (free chat primary) + OpenAI gpt-4o-mini (paid chat fallback) & text-embedding-3-small (embeddings), Vercel, GitHub Actions, Python FastAPI + browser-use (auto-apply agent on Render)

---

## ⭐ ACTIVE INITIATIVE — Enterprise Multi-Tenant Transformation (Master Plan)

> **This is the current north-star.** JobRadar is moving from a single-user app (personalized for Shashank) to a **public, multi-tenant SaaS** where anyone can sign up, upload a resume, and get the full feature set. We execute this **one phase per chat session** — finish a phase, update this tracker, then start the next phase in a NEW chat. Do not mix phases.

### Progress Tracker (update after every phase)

| Phase | Title | Status |
|---|---|---|
| **0** | Strategic decisions (auth provider, cost model, scope) | 🟡 IN PROGRESS |
| **1** | Real authentication & identity (Supabase Auth, replace first-profile pattern) | ⬜ Not started |
| **2** | Data isolation & security (RLS, ownership checks, private resume bucket) | ⬜ Not started |
| **3** | Scalable ingest & cost control (split shared vs per-user, quotas) | ⬜ Not started |
| **4** | Monetization & abuse protection (tiers, rate limits, legal) | ⬜ Not started |
| **5** | Scale & operations (pgvector, observability, queue for auto-apply) | ⬜ Not started |

Legend: ⬜ Not started · 🟡 In progress · ✅ Done

### Why this is non-trivial: two realities

1. **Single-user assumption is contained but pervasive.** "The current user" is resolved everywhere by the same trick — `sb.from('profiles').select(...).order('created_at').limit(1).maybeSingle()` = "whoever signed up first" = Shashank. It appears in ~10 places (see blast radius below). Auth is a single shared `APP_PASSWORD` whose JWT payload is literally `{ ok: true }` — it carries **no identity**. Good news: the data model is already ~80% multi-tenant (`matches`, `apply_profiles`, `search_profile` are keyed by `profile_id`; `jobs` is a correctly-shared global pool).

2. **⚠️ THE COST MODEL INVERTS (most important risk).** Today every LLM/embedding call runs on Shashank's own OpenAI key for one person (~$10–15/mo). The moment strangers sign up, scoring + skill-match + resume/cover-letter generation + embeddings all scale **linearly per user on our bill**. 1,000 active users is potentially thousands of dollars/month, NOT ~$15. This breaks the "free tiers only / no infra spend beyond API keys" constraint. **A public launch is fundamentally a cost-control + monetization problem, not just an auth problem.** Do NOT put a public sign-up link anywhere until Phase 3 (quotas) ships.

### Single-user blast radius (files to change in Phase 1)

The `profiles … order('created_at').limit(1)` pattern lives in:
- `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `app/(app)/onboarding/page.tsx`, `app/(app)/top-mnc/page.tsx`
- `app/api/apply-profile/route.ts` (2×), `app/api/extension/answer/route.ts`, `app/api/extension/profile/route.ts`, `app/api/import-job/route.ts`
- `lib/ingest.ts`, `scripts/backfill-jds.ts`
- `app/api/profile/route.ts` resolves by `email` upsert (also needs to bind to the authed user)

Auth core: `lib/auth.ts` (`APP_PASSWORD`, `jr_session` cookie, `jose` HS256, payload `{ ok: true }`) + `middleware.ts`.

### Phase 0 — Strategic decisions (DECIDE BEFORE CODING)

These shape everything. **Recorded answers will be filled in here as Shashank decides:**

| # | Decision | Recommendation | Shashank's answer |
|---|---|---|---|
| Q1 | Auth provider | **Supabase Auth** (email/pass + Google OAuth) — already on Supabase, native Postgres RLS, free tier, email verify + reset built in | _pending_ |
| Q2 | Who pays for LLM calls? | Free tier + hard quotas, OR paid tiers (Stripe), OR bring-your-own-key. **Open question this session: can we use FREE models to avoid paid OpenAI entirely?** (research in progress) | _pending Shashank's pick: (A) free-tier swap / (B) BYOK / (C) hybrid — see research note below_ |
| Q3 | Auto-apply at launch? | **Gate off / waitlist** — Render 512MB agent already crashes for one user; multi-user needs a queue + workers | _pending_ |
| Q4 | Hosting reality | Free tiers fine for beta; budget paid Supabase/Vercel at scale | _pending_ |

### Phase 0 research note — Free / open-source models vs paid OpenAI (May 29, 2026)

Researched the latest 2026 landscape (web). Key findings:

- **"Kiro / Cursor / Antigravity" are NOT callable inference APIs** — they're dev assistants/IDEs. The app's runtime AI (`lib/gemini.ts`) needs a real free/open-weight LLM API, not an IDE.
- **Free LLM APIs that can replace paid OpenAI for scoring/generation:**
  - Google **Gemini free tier** — 2.5 Flash-Lite ~15 RPM / **1,000 req/day**, Flash 10 RPM / 250/day, Pro 5 RPM / 100/day. Easiest drop-in (already the fallback).
  - **Groq** free — Llama 3.3 70B etc., **30 RPM / 14,400 req/day**, very fast.
  - **Cerebras** free — Llama/Qwen/GPT-OSS, **1M tokens/day**, ~2,000 tok/s.
  - **OpenRouter** free models — 50 req/day unpaid (1,000/day after one-time >$10 top-up), 300+ models, easy fallback routing.
- **Free embeddings:** `gemini-embedding-001` (free tier), Jina v5 (open weights), Cohere embed-v4 (trial). Self-hosted BGE-M3/Qwen3 cheapest but bad fit for Vercel serverless. NOTE: current OpenAI embeddings are only **~$1.30/mo** — embeddings are NOT the cost driver; LLM scoring/generation is.
- **⚠️ Two caveats that matter because this is going PUBLIC:**
  1. **Free tiers are per-KEY, not per-user.** Gemini's 1,000 req/day is shared across ALL users. One JobRadar scan scores 30–80 jobs → one user's single scan eats most of a day's free quota. Free tiers break at ~10–50 users (rate-limit problem replaces cost problem).
  2. **Free tiers typically log/train on data.** Running strangers' resumes (PII) through a free tier that may log/human-review them is a GDPR/privacy liability once we have a Privacy Policy (Phase 4). Paid Vertex / zero-data-retention tiers have training restrictions; free does not.

**Recommended direction — Bring Your Own Key (BYOK), likely as a hybrid:**
- **⚠️ Gemini is OUT (evidence-based, May 2026):** `gemini-2.0-flash` (the current code's `CHAT_MODEL`) is deprecated, shuts down June 1 2026, and since March 6 2026 is "existing customers only" → free/new keys get `429 limit: 0`. Plus Google gutted free-tier limits 50-80% in Dec 2025 and free tier trains on data. Do NOT rely on Gemini as the free default.
- **Provider stack:** OpenAI `gpt-4o-mini` (paid, already primary + works) → **Groq** (Llama 3.3 70B, free ~14,400 req/day, fast) as the free fallback → BYOK for multi-tenant scale. Cerebras (1M tokens/day) is a backup free option.
- Each user pastes their OWN free Groq/OpenAI key at onboarding → our LLM cost = **$0**, rate limits become per-user (not a shared pool), PII flows through the user's own account. This permanently satisfies "no infra spend beyond API keys" even at world scale.
- Launch path: (1) for dev + early beta, replace the dead Gemini fallback in `lib/gemini.ts` + `browser_agent/main.py` with **Groq**, keep OpenAI primary; (2) public = add **BYOK** with a small hard-quota'd shared trial pool for users who haven't added a key yet.
- **Three options put to Shashank (awaiting pick): (A)** free-tier swap (Groq fallback) + shared key + hard quotas; **(B)** pure BYOK; **(C)** hybrid (shared trial pool + BYOK) ← recommended.

### Phase 1 — Real authentication & identity (the foundation)

**Goal:** every request knows *which user* it is.
- Adopt **Supabase Auth** via `@supabase/ssr`; retire `APP_PASSWORD` + `jr_session`. Middleware resolves the Supabase session → real `user.id`.
- New migration `0005_multitenant.sql`: add `user_id uuid references auth.users(id)` to `profiles`; **backfill Shashank's existing row** so no data loss.
- Build a `getCurrentProfile()` helper (authed user → their profile). Replace all ~10 first-profile queries with it.
- Auth UI: sign-up, login, forgot-password, email verification (Supabase provides backend; we build thin UI).

### Phase 2 — Data isolation & security (ship WITH Phase 1)

**Goal:** User A can never see User B's data, even with a bug.
- Real RLS policies keyed to `auth.uid()` on `profiles`, `matches`, `apply_profiles`, per-user `ingest_runs`. Keep service-role for cron; user-facing reads go through the user's JWT so the DB enforces isolation.
- Ownership checks on every `match/[id]/*` route (resume, bookmark, auto-apply, etc.) — RLS makes this automatic once wired.
- **Make the `resumes` storage bucket private** + short-lived signed URLs (resumes are PII; currently public = guessable URLs).
- Add `profile_id` to `ingest_runs` so Stats shows the user's own scans.

### Phase 3 — Scalable ingest & cost control (MUST precede any public link)

**Goal:** serving N users doesn't N-times the bill or runtime.
- Split `lib/ingest.ts`: **shared phase** (fetch sources → upsert jobs → embed new jobs; paid once, shared by all) vs **per-user phase** (candidate select → title filter → AI relevance → LLM score → write matches).
- Adzuna queries are currently personalized to Shashank's `SearchProfile`. With many domains, switch to a broad shared fetch + aggressive per-user embedding pre-filter so LLM tokens hit only the top ~30 candidates per user.
- **Hard quotas + metering** (`usage` table): free tier = e.g. 1 scan/day, capped scored jobs, capped resume/cover-letter generations. Stops one user/bot from burning $50 in an afternoon.
- Move per-user work off GitHub Actions cron → Supabase scheduled Edge Functions or a queue; only process *active* users (logged in within N days).

#### Phase 3 capacity analysis — single shared Groq free key (May 2026, evidence-based)

**Question:** how many users can one shared Groq free API key support, and how many cron runs/day?

**Critical fact:** Groq rate limits apply at the **organization (API-key) level, not per user** ([Groq docs](https://console.groq.com/docs/rate-limits)). One key = ONE shared bucket every user draws from. Adding users does NOT add capacity.

**Groq free-tier limits — `llama-3.3-70b-versatile`** (verify exact values per key at `console.groq.com/settings/limits`; figures vary as Groq tunes them):

| Limit | Free value | Binds first? |
|---|---|---|
| Requests/min (RPM) | ~30 | |
| Requests/day (RPD) | ~1,000 | |
| **Tokens/min (TPM)** | **~12,000** | ✅ (burst) |
| **Tokens/day (TPD)** | **~100,000** | ✅ (daily) |

**JobRadar measured usage** (from `lib/ingest.ts → scoreJob()`): each job scored re-sends the full resume (~6,000 chars ≈ 1,500 tok) + JD (~4,000 chars ≈ 1,000 tok) + prompt + output ≈ **~3,000 tokens/job**. A cron run scores 30–80 jobs.

| | Per cron run | Per day (4 runs / 6h) |
|---|---|---|
| Requests | ~30–80 | ~150–340 |
| **Tokens** | **~100K–250K** | **~400K–1,000K** |

**Verdict:** one user's daily scoring (~400K–1M tokens) is **~4–10× the entire free daily token cap (~100K TPD)**. The binding constraint is **tokens, not requests** (prompts are huge because every job re-sends the whole resume).

| Question | Answer (current design, one shared free key) |
|---|---|
| Max users on one free Groq key | **~1** (the owner). Does NOT scale to a public launch. |
| Cron runs/day supportable | Even **1 run/day for 1 user** meets/exceeds ~100K TPD → throttles (TPM) + spills overflow to paid OpenAI. |

**Only two honest paths to scale (both = the plan):**
- **(A) BYOK — Bring Your Own Key:** each user pastes their own free Groq key → per-key limits mean every user gets their own ~100K TPD bucket → **$0 to us at any scale.** The only free multi-user path.
- **(B) Shrink per-user consumption** (stretches a shared key to ~2–4 light users at best): cron 4×/day→1×/day (4× saving); embedding pre-filter so the LLM scores only the top ~15 (not 80); **stop re-sending the full resume every call — cache a short resume summary (biggest single saving)**; on-demand scoring instead of scheduled burst; cheaper `llama-3.1-8b-instant` (higher free limits, lower quality).

Quick win for Phase 3: the "stop re-sending the full resume on every `scoreJob` call" change alone cuts per-job tokens roughly in half. Tackle first.

#### OpenAI-primary cost model — scaling 1 → 1,000 users (May 2026, evidence-based)

If OpenAI `gpt-4o-mini` is the primary (no Groq offset), here is the AI-only cost (LLM + embeddings; excludes Supabase/Vercel/hosting).

**Prices (verified May 2026):** gpt-4o-mini = **$0.15/1M input, $0.60/1M output** ([markaicode](https://markaicode.com/pricing/tool-pricing-comparison/)); text-embedding-3-small = **$0.02/1M** ([costgoat](https://costgoat.com/pricing/openai-embeddings)). gpt-4o-mini is OpenAI's cheapest chat model — newer o4-mini/GPT-5.x minis cost more.

**Per-operation cost (from the code):**

| Operation | Tokens/call | Cost/call |
|---|---|---|
| **Score one job** (resume + JD re-sent each call) | ~2,900 in + 150 out | **~$0.0005** ← dominant |
| AI relevance filter (batch) | ~2,000 in + 300 out | ~$0.0005 |
| Skill match (on-demand) | ~4,000 in + 500 out | ~$0.0009 |
| ATS resume (2-pass) | ~8,000 in + 2,000 out | ~$0.0024 |
| Cover letter | ~3,000 in + 700 out | ~$0.0009 |

**Per active user / month** (driven almost entirely by jobs scored @ ~$0.0005/job):

| Jobs scored/day | Per user/month |
|---|---|
| ~20 (light) | ~$0.50 |
| ~40 (typical) | ~$1 |
| ~80 (heavy, current 4×/day cron) | ~$2 |

Note: the ~$10-15/mo in this file's "Cost Model" section is the **owner's heavy-dev usage** (constant re-scans, backfills, dozens of resume regens) — NOT a normal end-user. Plan on **~$1-2/active user/mo**.

**Shared fixed cost:** embedding the job pool ≈ **$2-4/mo flat** — does NOT grow with users (jobs embedded once, scored for all).

**Scaling table (AI-only, per month):**

| Users | Typical (~$1.5/user) | Heavy ceiling (~$8/user) |
|---|---|---|
| 1 | ~$3-5 | ~$10-13 |
| 10 | ~$18 | ~$85 |
| 100 | ~$150 | ~$800 |
| **1,000** | **~$1,500** | **~$8,000** |

(~$18K-$96K/year at 1,000 users.)

**Takeaways:** (1) cost scales **linearly** with users — no economy of scale on tokens. (2) **Scoring is ~90% of the bill**; embeddings are negligible → the Phase 3 "don't re-send full resume + pre-filter to ~15 jobs" change can cut per-user cost 50-70% (e.g. $1,500→~$500/mo at 1,000 users). (3) This is the whole case for **BYOK**: with users' own free Groq keys, the $1,500-8,000/mo at 1,000 users → **~$0 to us** (only the small shared embedding cost remains). OpenAI-primary is fine for the owner + a small beta; financially unviable for a free public launch.

### Phase 4 — Monetization & abuse protection

- **Stripe** for paid tiers (free until you transact). Free tier for acquisition; paid unlocks higher quotas / auto-apply.
- Rate limiting on auth + AI endpoints (Upstash Redis free tier or Supabase-based).
- Input hardening: resume size/type caps, scan-frequency caps, prompt-injection guards on uploaded resume text (it flows into prompts).
- Legal: Privacy Policy + Terms, "delete my account" button (the `on delete cascade` already makes this clean), GDPR/data-handling language (we store resumes).

### Phase 5 — Scale & operations

- Observability: error tracking (Sentry free tier), structured logging, an internal per-user usage dashboard.
- Move embeddings from `JSONB` to **`pgvector`** with an index once `jobs` exceeds a few thousand (cosine-in-JS won't scale).
- Auto-apply as a real service: queue + dedicated workers + per-user browser isolation. Separate paid/beta track.

### Execution rule

**One phase per chat.** Start each new chat by reading this tracker, confirm the previous phase is ✅, then execute only the next phase. Update the tracker + add a phase log when done. Never juggle phases.

---

## Key Architecture Decisions

### 1. AI-First Job Search (not keyword regex)

The system uses an AI-generated **SearchProfile** (`lib/search-profile.ts`) that reads the user's resume once and outputs:
- `searchKeywords` — optimal Adzuna API queries
- `titlePatterns` — substring matches to auto-accept jobs
- `antiPatterns` — substring matches to auto-reject jobs
- `primaryDomain` / `adjacentDomains` — for batched AI relevance filtering

This replaced hardcoded regex tables after those proved ineffective.

### 2. Full JD Fetching (`lib/jd-fetcher.ts`)

Adzuna's search API truncates job descriptions to ~500 chars. The system fetches the full JD from the `redirect_url` using JSON-LD / og:description extraction. Results are cached in the DB.

**Rule:** Always call `ensureFullDescription()` before any AI feature that uses `job.description`.

### 3. 4-Phase Skill Matching (`lib/gemini.ts → matchSkills`)

```
Phase 1 (LLM): Extract jdRequirements from JD text
Phase 2 (LLM): Classify each as matched/missing against resume
Phase 3 (CODE): Verify items came from jdRequirements (catch LLM violations)
Phase 4 (CODE): Verify items appear in JD text (catch hallucinations)
```

**DO NOT simplify this.** Each phase exists because of a real bug that was debugged with evidence.

### 4. Scoring Prompt Rules

The LLM scoring prompt (`scoreJob` in `lib/gemini.ts`) has explicit rules:
- Performance Engineering, QA, SDET, Test Automation = same "testing umbrella" → score 65-80 for each other
- "Performance" is ambiguous — marketing/finance uses ≠ engineering uses
- Tools are interchangeable (JMeter ≈ Gatling ≈ LoadRunner)
- Location alone should never drop score below 60

---

## File Map

```
lib/gemini.ts              ← AI: OpenAI primary, Gemini fallback. matchSkills, scoreJob, generateCoverLetter, extractResumeInsights, generateAtsResume
lib/jd-fetcher.ts          ← Fetches full JDs from source URLs
lib/search-profile.ts      ← AI SearchProfile generation + title classification + AI relevance filter
lib/ingest.ts              ← Main ingest pipeline (10 steps)
lib/sources/adzuna.ts      ← Adzuna API (multi-query, pagination, dedup)
lib/sources/index.ts       ← Source dispatcher
lib/pdf-resume.ts          ← Beautiful PDF resume generator (matches Shashank's exact format)
lib/matcher.ts             ← Cosine similarity + embedding text builder

app/(app)/jobs/[id]/        ← Job detail page + actions + AutoApplyButton
app/(app)/apply-profile/    ← Application profile form (memory store for auto-apply)
app/(app)/_components/      ← MatchCard (bookmark+seen/unseen), StatusFilter (Inbox tab), AppShell
app/api/match/[id]/skills/  ← Skill match endpoint
app/api/match/[id]/resume/  ← ATS resume (GET=keywords, POST=generate)
app/api/match/[id]/resume/pdf/ ← Generate PDF + upload to Supabase Storage
app/api/match/[id]/bookmark/ ← Toggle bookmark
app/api/match/[id]/auto-apply/ ← Orchestrate full auto-apply flow
app/api/match/[id]/apply-callback/ ← Agent callback on completion
app/api/apply-profile/      ← GET/POST application profile
app/api/coverletter/        ← Cover letter generation
app/api/ingest/             ← Manual ingest trigger

browser_agent/main.py       ← Python FastAPI auto-apply agent (browser-use + Gemini)
browser_agent/Dockerfile    ← Docker config for Render
browser_agent/requirements.txt ← Pinned: browser-use==0.1.40

scripts/ingest.ts                    ← Cron entry point
scripts/backfill-jds.ts             ← Backfill: fetch full JDs + re-embed + re-score existing jobs
scripts/clear-embeddings.sql        ← (Session 5, MERGED) Wipe stale 768-dim vectors so next ingest re-embeds with OpenAI 1536-dim. Run once in Supabase SQL Editor.
.github/workflows/ingest.yml        ← Cron schedule (every 6h). GEMINI_API_KEY now chat-fallback only.
.github/workflows/backfill-jds.yml  ← Manual workflow_dispatch for bulk JD backfill

# AI IDE skill directories (Session 5) — UI UX Pro Max design skill
# Installed via 'uipro init --ai <ide>' from npm package 'uipro-cli'.
# Auto-loaded by the IDE when present. Same 28 files in each location.
.kiro/steering/ui-ux-pro-max/        ← Kiro skill (slash command: /ui-ux-pro-max)
.cursor/skills/ui-ux-pro-max/        ← Cursor skill (auto-activate)
.agent/skills/ui-ux-pro-max/         ← Antigravity skill (auto-activate)
```

---

## User's Profile Data

| Field | Value |
|---|---|
| Domain | Performance Engineering / Load Testing |
| Skills | loadrunner, jmeter, blazemeter, cavisson netstorm, appdynamics, dynatrace, splunk, jprofiler, jvisualvm, jenkins, core java |
| Preferred roles | Senior Performance Engineer, Performance Test Lead, Performance Engineering Manager |
| Locations | Pune, Noida, Gurgaon |
| min_score preference | 75 (dashboard ignores this, uses 50 as default filter) |

---

## Known Pitfalls (Learned the Hard Way)

| Pitfall | What happened | Rule |
|---|---|---|
| Adzuna truncates JDs | All JDs were 500 chars. AI matching worked on incomplete data. | Always use `ensureFullDescription()` |
| Cron runs from main | Made fixes on feature branch, cron kept running old code from main. User saw no improvement. | Verify deployed commit before debugging |
| min_score hides everything | User set preferences.min_score=75. Dashboard filtered at >=75. All scored jobs were 50-69. | Dashboard defaults to 50, independent of user preference |
| Exhausted candidate pool | "seen" set was all-time. After a few runs, all candidates already scored → 0 new. | Only exclude last 24h from scoring |
| LLM over-corrects on prompts | Made prompt strict about not including resume items → LLM stopped including JD items that were also in resume | Use worked examples; explicitly say "co-occurrence is irrelevant" |
| `ignoreDuplicates: false` on upsert | Re-fetched jobs got their `fetched_at` reset, pushing them to top and displacing new jobs | Use `ignoreDuplicates: true` |
| `status='viewed'` makes jobs vanish | Job detail page sets `status='viewed'`, but `'viewed'` is not in `STATUS_ORDER`. The job disappears from every tab. | Fix: add `viewed_at timestamptz` column, stop changing status on open, just stamp `viewed_at`. Reset existing `viewed` rows back to `new`. |
| Adzuna `posted_at` is unreliable | `created` field reflects when Adzuna indexed the job, not when the company posted it | Show exact date in tooltip; trust Remotive/RemoteOK more than Adzuna for freshness |
| Pushing to a closed/merged PR's branch | Two important commits sat dangling on a closed branch for two test cycles; Render kept deploying old main; user got frustrated | Always check PR state with `github_list_pull_requests` BEFORE pushing. If closed/merged, branch off latest main and open a NEW PR. |
| Trusting local `git fetch` in this sandbox | Auth header issues silently fail the fetch; local git cache lies about remote state | Verify deployed state by fetching `raw.githubusercontent.com/{repo}/main/{path}` directly |
| `BROWSER_USE_HEADLESS` env var | Fabricated from earlier guessing; does not exist in `browser-use==0.1.40` source | Verify env-var/API names by reading the pinned version's source on GitHub. v0.1.40 needs explicit `Browser(BrowserConfig(headless=True, extra_chromium_args=[...]))` into `Agent(browser=...)`. |
| `text-embedding-004` deprecated (Google, 2026-01-14) | Ingest fails with `404 Not Found ... models/text-embedding-004`. `@google/generative-ai` SDK also EOL 2025-08-31. | Switch to OpenAI `text-embedding-3-small` (1536 dims, ~$1.30/mo). DB columns are JSONB so dimension change is non-breaking; cosine similarity returns 0 on length mismatch so old vectors are silently ignored. |
| `gemini-2.0-flash` throws "rate limit" 429 on ALL AI activities (May 2026) — ✅ FIXED session 6 | **WHERE:** a single chokepoint — `chat()` in `lib/gemini.ts` (lines 37-75), the `model.generateContent()` call with `CHAT_MODEL='gemini-2.0-flash'`. **ALL 6 chat AI features route through it**: `scoreJob`, `matchSkills`, `extractJdKeywords` + `generateAtsResume` (resume regen = 2 calls), `generateCoverLetter`, `extractResumeInsights`. Only `embed()` bypasses it (OpenAI-only). That's why scoring, skill-match, resume-regen, cover-letter ALL 429'd identically when Gemini was the active provider. **WHY:** Gemini 2.0 Flash is **deprecated, shuts down June 1 2026**; since **March 6 2026 it's "existing customers only"** → free/new keys get `429 ResourceExhausted` `limit: 0` (looks like a rate limit, means "model not on your plan"). Google also cut free limits 50-80% in Dec 2025 + free tier trains on data. **MASKING TRAP:** `chat()` tried OpenAI first, but on ANY OpenAI failure it did only `console.warn(...)` and silently fell through to Gemini → so a Gemini 429 was often a *symptom* of OpenAI not running (missing/exhausted key in that env, billing, outage), NOT a real Gemini rate limit. | **✅ FIXED (session 6, PRs #48 + #50):** dropped Gemini entirely. `chat()` builds a provider chain ordered by `LLM_PRIMARY` (default **`groq`**): **Groq `llama-3.3-70b-versatile` (free, primary) → OpenAI `gpt-4o-mini` (paid, fallback)**, both via the OpenAI SDK (Groq is OpenAI-compatible, `baseURL=api.groq.com/openai/v1`). PR #48 first added Groq as fallback; PR #50 flipped Groq to **primary** for cost ($0 unless Groq fails) + added the `LLM_PRIMARY` env toggle. No silent masking — each provider's error is recorded; combined error if all fail. `browser_agent/main.py` defaults to Groq (`LLM_PROVIDER=openai` to override). Secret: `GROQ_API_KEY` (Vercel + GH Actions + Render). **Watch:** Groq free tokens-per-minute cap may throttle the 30-80 job ingest burst → set `LLM_PRIMARY=openai` on the cron if needed (chain auto-spills to OpenAI on 429 regardless). |
| ATS parsers see one giant paragraph instead of bullets | PDF used graphical amber circles only — no text bullet character. Workday/Greenhouse/Lever/Taleo/iCIMS extracted bullet content as a single blob. | Render real `- ` text characters in the PDF text stream; ASCII-only output for legacy parsers. |
| LLM prefixes resume output with the word "Resume" | Navy header band rendered "Resume" as the candidate's name | Parser skips any leading `Resume / RESUME / Curriculum Vitae / CV / PROFILE` label before treating the next line as the name. Also call `doc.setProperties({ title, author, creator })` so PDF viewers show candidate name. |

---

## Debugging Protocol

When a feature seems broken:

1. **Check which code is deployed** — `git log --oneline -5` on main. Compare with Actions run.
2. **Check the data** — run SQL to verify what's actually in the DB (description length, scores, timestamps).
3. **Check the API response** — browser DevTools → Network → relevant endpoint → Response tab.
4. **Only then propose a fix** — after evidence, not before.

**DO NOT** make multiple speculative prompt changes without verifying the input data first.

---

## Cost Model

| Operation | Cost | Frequency |
|---|---|---|
| Generate SearchProfile | ~$0.005 | Once per 7 days |
| Embed a job (OpenAI text-embedding-3-small, 1536 dims, post-Session-4 migration) | ~$0.00002 | Per new job (~$1.30/mo at current volume) |
| AI relevance filter (batch of 15) | ~$0.001 | Per cron run (2-4 batches) |
| LLM score a job | ~$0.001 | Per scored job (30-80/run) |
| Skill match (per job detail view) | ~$0.002 | On demand |
| ATS resume generation | ~$0.003 | Per job apply |
| Cover letter generation | ~$0.002 | Per job apply |
| **Total per cron run** | **~$0.07-0.10** | 4x/day |
| **Monthly estimate** | **~$10-15** | At current usage |

---

## Update Protocol

**Update this file every 2-3 significant conversations.** Add:
- New bugs found and their root causes
- New features or architecture changes
- New "pitfalls" or rules learned
- Changes to the file map

**Last updated:** May 29, 2026 (session 6: started the **Enterprise Multi-Tenant Transformation** initiative — added the Master Plan + Progress Tracker (Phases 0-5) near the top of this file. Phase 0 in progress: strategic decisions + researched free/open-source LLM alternatives. **Shipped the Groq migration** (Phase 0 cost-model groundwork): PR #48 replaced the dead `gemini-2.0-flash` 429 fallback with Groq + removed silent OpenAI-error masking; PR #50 then **flipped Groq to the FREE PRIMARY** with OpenAI as paid fallback, added the `LLM_PRIMARY` env toggle (default `groq`). Requires `GROQ_API_KEY` secret on Vercel + GH Actions + Render. Also **added the Phase 3 Groq free-tier capacity analysis** (one shared free key ≈ 1 user; limits are per-key not per-user; scale via BYOK or token-shrinking) under the Phase 3 section.)

_Session 5 (May 29, 2026): OpenAI text-embedding-3-small migration shipped; matches sort dropdown bug fixed (foreignTable alias) + per-card discovery date stamp; UI UX Pro Max design skill installed for Kiro, Cursor, and Antigravity from the official `uipro-cli`. PRs #25-#28 + #29 all merged._

---

## Session 5 — What Was Built & Fixed (May 29, 2026)

Short, focused session that closed the three open issues from session 4 and added a workspace-wide design skill that auto-activates in multiple AI IDEs.

### 1. OpenAI embeddings migration (PR #26, merged)

Closed open issue #1 from session 4. The cron's embed phase had been failing every run with `[GoogleGenerativeAI Error]: ... [404 Not Found] models/text-embedding-004` because Google deprecated `text-embedding-004` on 2026-01-14 and the v1beta endpoint started 404'ing.

- `lib/gemini.ts` — `embed()` now uses OpenAI `text-embedding-3-small` (1536 dims) via the existing `getOpenAIClient()` helper. `EMBED_MODEL` constant updated. File header rewritten to document the migration. Throws clean `Missing OPENAI_API_KEY env var` on misconfig.
- `scripts/clear-embeddings.sql` (new) — one-shot Supabase SQL to wipe stale 768-dim vectors so the next ingest re-embeds at 1536 dims. Idempotent.
- `.github/workflows/ingest.yml` + `backfill-jds.yml` — comment block rewritten: `GEMINI_API_KEY` is now chat-fallback only, no longer required for embed. Secret line kept so the chat fallback still works if OpenAI ever errors.
- `README.md` — stack line, pipeline diagram, cron-secrets list updated.

**Why no schema migration:** embedding columns are `JSONB`. Cosine similarity in `lib/matcher.ts` returns 0 on length mismatch, so old 768-dim vectors are silently ignored — non-breaking.

**Manual steps after deploy:**
1. Run `scripts/clear-embeddings.sql` in Supabase SQL Editor.
2. Re-save profile from `/onboarding` to regenerate `resume_embedding` at 1536 dims.
3. Trigger Daily Ingest workflow manually.
4. Verify `ingest_runs` latest row is `status='success'` with `embedded > 0`.

### 2. Matches sort dropdown was a silent no-op (PR #27, merged)

User reported "newest first" doing nothing. Root cause was a `foreignTable` alias mismatch in the Supabase query.

The select clause aliased the embedded relationship as `job` (singular):

```ts
.select(`...job:jobs!inner(...)`)
                   //  ^^^ alias is 'job', not 'jobs'
```

But every `.order()` call passed `foreignTable: 'jobs'` (the underlying table name). PostgREST uses the **alias** as the embed identifier in URL params, so the generated `?jobs.order=fetched_at.desc` was silently dropped server-side. Three of the five sort modes were dead (newest, oldest, posted); "best score" was half-broken (primary worked, secondary tiebreak ignored); only "recent activity" worked because it sorts on a local column.

**Fix:** changed all 4 `foreignTable: 'jobs'` → `foreignTable: 'job'` in `app/(app)/page.tsx`, with an inline comment explaining the gotcha so it doesn't silently regress again.

### 3. Per-card discovery date stamp (PR #27, merged)

User wanted to see exactly how old each job is, not just "2 days ago".

- `lib/ui.ts` — added `formatShortDate()` (returns `"28 May 26"`) and `formatFullDate()` (returns `"28 May 2026, 14:32"`). Both use the existing `date-fns` import.
- `MatchCard.tsx` now renders: `🕒 28 May 26 · 2 days ago` next to each card, with the precise `28 May 2026, 14:32` on hover via the `title` attribute. The small `added` tag is preserved when the source did not provide a `posted_at` (so user can distinguish "JobRadar saw it" from "company posted it").

### 4. UI UX Pro Max design skill — multi-platform install (PRs #28 + #29, merged)

Installed an external open-source design skill so any AI IDE working on this repo gets professional UI/UX guidance automatically.

**What the skill provides:**
- 67 UI styles (Glassmorphism, Bento Grid, Neumorphism, Brutalism, Soft UI Evolution, AI-Native UI, Dark Mode OLED, etc.)
- 161 industry-specific reasoning rules (SaaS, fintech, healthcare, e-commerce, services, gaming, etc.)
- 96 color palettes, 57 font pairings, 99 UX guidelines, 25 chart types
- Stack-specific guidelines for 13+ stacks (React, Next.js, Vue, shadcn/ui, Tailwind, SwiftUI, Jetpack Compose, React Native, Flutter, etc.)
- A Python "design system generator" that produces a complete recommended pattern + style + colors + typography + effects + anti-patterns + pre-delivery checklist for any product/industry combination

**Source:** [github.com/nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT-licensed). Installed via the project's official `uipro-cli` — no manual file copying.

**Installed for three IDEs (all in this repo):**

| IDE | Install path | Activation mode |
|---|---|---|
| **Kiro** | `.kiro/steering/ui-ux-pro-max/` | Slash command: `/ui-ux-pro-max <prompt>` |
| **Cursor** | `.cursor/skills/ui-ux-pro-max/` | Auto-activate on UI requests |
| **Antigravity** | `.agent/skills/ui-ux-pro-max/` | Auto-activate on UI requests |

Each location has the same 28 files: `SKILL.md` + 15 CSV databases + 11 stack-specific CSVs + 3 Python scripts (`core.py`, `design_system.py`, `search.py`).

`.gitignore` updated to exclude `__pycache__/`, `*.pyc`, `*.pyo` so Python bytecode caches don't get committed.

**Verified working:** ran `python3 .kiro/steering/ui-ux-pro-max/scripts/search.py "SaaS dashboard" --design-system -p "TestApp"` and `python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "fintech dashboard" --design-system -p "TestApp"` — both produced real ASCII design system outputs (pattern, style, colors, typography, effects, anti-patterns, pre-delivery checklist).

#### How to use the skill in each IDE

**In Kiro (slash command):**
```
/ui-ux-pro-max Build a landing page for my SaaS product
/ui-ux-pro-max Design a dashboard for healthcare analytics
/ui-ux-pro-max Improve the JobRadar matches list visual design
```

**In Cursor / Antigravity (auto-activate):** just describe the UI work in chat — the skill activates automatically when the request matches design/build/create/implement/review/fix/improve UI-related keywords. Example prompts:
```
Build a landing page for my SaaS product
Create a dashboard for healthcare analytics
Design a portfolio website with dark mode
Make a mobile app UI for e-commerce
```

You may need to start a new session in the IDE for the skill files to be discovered.

#### Adding the skill for a new AI IDE

If you start using Windsurf, Claude Code, GitHub Copilot, Codex CLI, Continue, Roo Code, or any other supported tool, run **one** command from the JobRadar repo root and commit the new platform directory:

```bash
npm install -g uipro-cli           # only first time
uipro init --ai windsurf           # or: claude, copilot, codex, continue, roocode, kilocode, warp, augment, droid, gemini, opencode, qoder, codebuddy, trae, all
```

Supported platforms (per the skill's official README):

| Tool | Workflow Mode (slash command) | Skill Mode (auto-activate) |
|---|---|---|
| Kiro | ✓ | — |
| GitHub Copilot | ✓ | — |
| Roo Code | ✓ | — |
| KiloCode | ✓ | ✓ |
| Cursor | — | ✓ |
| Windsurf | — | ✓ |
| Antigravity | — | ✓ |
| Claude Code | — | ✓ |
| Codex CLI, Continue, Gemini CLI, OpenCode, Qoder, CodeBuddy, Droid (Factory), Warp, Augment | — | ✓ |
| **All at once** | `uipro init --ai all` | — |

**Global install** (available to every project on your machine, not just JobRadar): add `--global` to the command, e.g. `uipro init --ai cursor --global`.

#### Updating the skill

```bash
uipro update                       # pull latest version
uipro versions                     # list available versions
uipro init --offline               # use bundled assets (no network)
```

#### Uninstalling

```bash
uipro uninstall --ai kiro          # remove from this project for one platform
uipro uninstall                    # remove from this project for all detected platforms
```

Or just delete the relevant directory (`.kiro/steering/ui-ux-pro-max/`, `.cursor/skills/ui-ux-pro-max/`, `.agent/skills/ui-ux-pro-max/`) and the `.gitignore` entry for `__pycache__/`.

### Workflow lessons (this session)

- Always verify the actual `main` branch state via `raw.githubusercontent.com/{repo}/main/{path}` before assuming what's deployed. The local sandbox's `git fetch` and `git pull` fail with auth-header errors; only the `mcp_tool_server_github_push_to_remote` and `web_fetch` tools talk to GitHub reliably.
- When local `main` is stale and can't be pulled: `rm -rf` the workspace and re-clone via `github_repo_set_up`. Do this BEFORE branching or the new branch will diverge from real `main` and the PR diff will be a mess.
- Pre-installing platform-specific skill files (`.cursor/`, `.agent/`, `.kiro/steering/`) in the repo means the skill auto-loads when you open the project in any of those IDEs — no per-tool re-install needed.

### Open issues for the next session

1. **Render free tier 512 MB still tight for Chromium.** Carried over from session 3/4. Even with the headless fix, the auto-apply agent may still crash on real page loads. Options remain: upgrade ($7/mo), run agent locally, or switch to a lighter automation lib.
2. **Auto-apply callback 401** (carried over): `INGEST_SECRET` env var still not synced between Vercel and Render.

### Files modified / added this session (all on main)

- `lib/gemini.ts` — `embed()` switched to OpenAI text-embedding-3-small.
- `scripts/clear-embeddings.sql` (new) — wipe stale 768-dim vectors.
- `.github/workflows/ingest.yml` + `backfill-jds.yml` — comment block clarification.
- `README.md` — stack/pipeline/secrets references updated.
- `app/(app)/page.tsx` — `foreignTable: 'jobs'` → `'job'` in 4 places + comment.
- `app/(app)/_components/MatchCard.tsx` — discovery date stamp + tooltip.
- `lib/ui.ts` — `formatShortDate()`, `formatFullDate()` helpers.
- `.kiro/steering/ui-ux-pro-max/` (new, 28 files) — UI UX Pro Max skill for Kiro.
- `.cursor/skills/ui-ux-pro-max/` (new, 28 files) — same skill for Cursor.
- `.agent/skills/ui-ux-pro-max/` (new, 28 files) — same skill for Antigravity.
- `.gitignore` — added `__pycache__/`, `*.pyc`, `*.pyo`.

### Merged PRs in this session

#25 docs(context): add Session 4 · #26 fix(embed): switch from deprecated Gemini text-embedding-004 to OpenAI text-embedding-3-small · #27 fix(matches): repair sort dropdown (foreignTable alias bug) + show discovery date · #28 feat(skill): install UI UX Pro Max via official uipro-cli for Kiro · #29 feat(skill): install UI UX Pro Max for Cursor + Antigravity + Session 5 context update

---

## Session 4 — What Was Built & Fixed (May 28, 2026, evening)

This was a long session focused on (a) making the ATS resume actually pass scanners, (b) cleaning up the resume PDF's visual + semantic correctness, (c) fixing two production-impacting ingest bugs, (d) adding sort controls. **All PRs #14 through #24 listed below are MERGED to main.** Section "Open issues" at the bottom lists what is still pending after this session.

### Resume / ATS pipeline (PRs #14-#22, all merged)

The previous resume generator produced essentially the same generic perf-eng resume regardless of JD. Rebuilt as a two-pass JD-tailored pipeline with measurable score and per-keyword controls.

- **Two-pass generation** (`lib/gemini.ts → extractJdKeywords()` + `generateAtsResume()`):
  1. First LLM call extracts 18-25 ATS-relevant keywords from THIS specific JD. Uses exact phrasing from the JD, skips soft-skill noise.
  2. Second LLM call generates the resume around those keywords, with conditional directives (AI-angle summary only when JD mentions AI/ML; JMeter Performance Center bullet only for perf/test/QA roles).
- **Strict keyword scope rule:** the model can only introduce new tools that are EITHER in the extracted JD-keyword list OR already in the candidate's existing resume. The JD text is for relevance context only — explicitly NOT a source of new keywords. Stops the model from sneaking in arbitrary JD vocab.
- **Client name privacy:** "Charles Schwab" (or any client name) is allowed in EXACTLY one place — the `Client: ClientName (Domain)` subline directly under the relevant job header in PROFESSIONAL EXPERIENCE. Hardcoded JMeter Performance Center bullet was reworded to "adopted by multiple teams across the organization" (was "at Charles Schwab"). New CRITICAL RULE 4 in the prompt enforces this.
- **Role title alignment:** new `cleanJdTitle()` strips JD-listing noise — year ranges (`- 4 to 8 years`), location pipes (`| Pune | Banking`), parenthetical departments (`(BFSI)`, `(WFH)`), `at Company X`, hiring-tail words (opening / WFH / hybrid / immediate joiner), trailing Roman numerals (II, III, IV), trailing 1-3 letter ALL-CAPS dept codes (CX, RX) under a role-keyword guard so `AI Engineer` survives, and `' - {text}' / ' / {text}'` suffixes (e.g. `Senior Performance Testing Engineer - Assistant Manager` → `Senior Performance Testing Engineer`). If a JD title has a parenthetical containing a real role keyword (`Tester II, Product (Performance Tester)`), the parenthetical wins. Fallback: `Senior Performance Engineer`. Past role titles in PROFESSIONAL EXPERIENCE stay untouched — only the most recent role gets aligned.
- **ATS Match Score:** server computes `(JD keywords present in generated resume) / (total JD keywords)` and returns it. UI shows it as a green/amber/red banded card (≥80 / ≥60 / <60).
- **Add/remove keyword UX:**
  - Missing keywords (red chips) are clickable → stage for next regenerate. Becomes amber "staged" badge.
  - Present keywords (Woven + Already had) are clickable → stage for REMOVAL. Chip flips red+strikethrough with "remove" badge.
  - "+ Add all & regenerate" button stages every missing keyword in one click.
  - User-staged keywords get marked `[USER PRIORITY]` in the prompt, with an explicit rule that they MUST appear in the final resume (in TECHNICAL SKILLS at minimum, even if the candidate has no direct experience — Skills is by convention a familiarity list).
  - Excluded keywords get an `EXCLUDED KEYWORDS` block in the prompt: "MUST NOT appear ANYWHERE; if currently in the input resume, REMOVE every occurrence and rephrase the surrounding sentence." Exclusion overrides JD priority.
  - **Free-text custom-keyword input** (always visible after generation): type any keyword, click "+ Add" or "- Remove" to force-include / force-exclude. Catches cases where matchSkills() flagged a term but extractJdKeywords() didn't (e.g. `non-functional requirements`).
  - **Skill Match red chips** at the top of the page are also clickable now — same staging behavior as the chips lower in the keyword analysis.
  - Unified missing list: merges `keywords.missing` (from extractJdKeywords) + `skills.missing` (from matchSkills) so every flagged-missing keyword has an actionable add chip.
  - In-place regenerate: keeps the existing resume visible while regenerating; score card shows a "Regenerating..." overlay; toast on completion shows new score AND delta vs previous (e.g. "ATS Match Score: 87% (+12)").
- **PDF generator** (`lib/pdf-resume.ts`):
  - **Bullets are now real `- ` text characters** in the PDF text stream — ATS parsers (Workday, Greenhouse, Lever, Taleo, iCIMS) extract them as list items. Previously bullets were graphical amber circles only with no text marker, so ATS extracted bullet content as one giant paragraph. This was the silent killer.
  - Header: dark navy band restored (matches user's preferred original-resume layout). Name big bold white. Title tagline in amber ALL CAPS. Contact info on a single line with `  •  ` bullet separators in light blue-gray.
  - Parser skips any leading `Resume / RESUME / Curriculum Vitae / CV / PROFILE` label so the navy band shows the candidate's actual name (LLM occasionally prefixed output with "Resume" — that was being rendered as the name).
  - `doc.setProperties({ title, author, creator })` so PDF viewers display the candidate name in their toolbar instead of "Resume" or "Untitled".
  - ASCII-only output (em-dash, smart quotes, unicode bullets, NBSP, ellipsis, ZWJ stripped) for older ATS parsers (Taleo, iCIMS).
  - Single column, plain Helvetica throughout, minimal styling.
- **Smart default download filename:** `{FirstName}_{Specialization}_{Years}` e.g. `Shashank_Performance_7.7.pdf`. Years preserves one decimal (was rounded to integer); fallback `7.7`. Specialization picks first non-seniority word of cleaned JD title, fallback `Performance`. Filename rendered server-side and returned in the API response so client downloads use it.

### Matches list sort (PR #23, merged)

Default ordering changed from `llm_score desc only` to `jobs.fetched_at desc`. Five sort modes via `?sort=` URL param + dropdown:

| Mode | Order |
|---|---|
| `newest` (default) | `jobs.fetched_at desc` |
| `posted` | `jobs.posted_at desc nulls last, jobs.fetched_at desc` |
| `score` | `matches.llm_score desc, jobs.fetched_at desc` |
| `activity` | `matches.updated_at desc` |
| `oldest` | `jobs.fetched_at asc` |

MatchCard now falls back to `fetched_at` when `posted_at` is null with a small uppercase **added** tag and tooltip — distinguishes "added 2h ago" from "posted 2h ago".

### Ingest production fix (PR #24, merged)

Recent ingests showed `partial (300)` with `embedded=0` for hours. Evidence-based diagnosis via Supabase SQL on `ingest_runs.errors`:

```
errors_by_source: {embed: 300}
sample: "Missing GEMINI_API_KEY env var"
```

**Root cause:** `.github/workflows/ingest.yml` env block was missing `GEMINI_API_KEY`. This was caused by commit `da6a62a` on 2026-05-25 ("switch AI provider from Gemini to OpenAI") that deliberately removed the secret as part of a planned OpenAI-only switch. Later commits brought Gemini embeddings back into the code (text-embedding-004 stayed for the 768-dim DB schema) but no one rewired the workflow secret. The 2026-05-27 success run probably ran during a transitional state.

**Fix:**
- Both `.github/workflows/ingest.yml` and `backfill-jds.yml` now pass `GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}` with an inline comment explaining why.
- `lib/ingest.ts` embed loop has a defensive early-bail: on the FIRST embed failure (when `embedded === 0`) we test the error message against `/missing\s+\w+_API_KEY|invalid api key|api key not valid|unauthor|forbid/i`. If it matches, the loop aborts and pushes ONE descriptive error like *"Embed phase aborted on first job (300 pending). Config error: Missing GEMINI_API_KEY env var"* — instead of 300 identical errors. Subsequent transient errors still accumulate one per job.

### Auto-apply browser agent (PRs #12-#13, merged earlier in this session)

Render logs from this session proved the previous "minimal API" learning was wrong for `browser-use==0.1.40`. Definitive findings (verified by reading the pinned version's source on GitHub):
- `BrowserConfig.headless` defaults to `False` (headed mode!).
- There is NO `BROWSER_USE_HEADLESS` env var anywhere in v0.1.40 — that name was a fabrication from earlier guessing.
- The only way to enable headless is `Browser(BrowserConfig(headless=True, extra_chromium_args=[--no-sandbox, --disable-setuid-sandbox, --disable-dev-shm-usage, --disable-gpu]))` passed as `Agent(browser=browser)`.
- LLM provider for the agent: switched to OpenAI gpt-4o-mini as primary (Gemini fallback). Same code mirrors `lib/gemini.ts` precedence in the Next.js app.
- Per-step visibility: `Agent(register_new_step_callback=...)` now pipes per-step decisions (next goal + first action) into the SSE feed so silent failures are visible.
- Truthful status: status only becomes `done` on a confirmed success signal in the agent's final output. Empty / unclear results now mark `failed` with a real diagnostic, not a fake "Application submitted!".

### Workflow lessons (added to learnings)

- **Never push to a closed/merged PR's branch.** GitHub considers it already-merged; commits sit dangling and the deployment platform keeps deploying old main. After every merge, fresh branch off latest main, fresh PR. Verified with the user during a frustrated moment when two commits sat on a closed branch for two test cycles.
- **Verify deployed state by fetching `raw.githubusercontent.com/{repo}/main/{path}`**, not by trusting local git cache (which fails to fetch in this sandbox due to auth header issues).

### Open issues for the next session

1. **Embedding model deprecation (NOT YET MERGED).** The latest ingest run at 2026-05-28 21:03:22 UTC failed with a NEW error confirming PR #24's secret-wiring worked but exposing the next-layer problem:
   ```
   [GoogleGenerativeAI Error]: ... [404 Not Found] models/text-embedding-004
     is not found for API version v1beta
   ```
   - `text-embedding-004` was deprecated by Google on 2026-01-14 and is now removed from the v1beta endpoint.
   - Replacement `gemini-embedding-001` is paid ($0.15/M tokens, ~$10/month at our volume). Plus the `@google/generative-ai` SDK reached EOL on 2025-08-31.
   - **Recommended path: switch embeddings to OpenAI `text-embedding-3-small` (1536 dims, $0.02/M = ~$1.30/month).** Already imports the `openai` SDK. DB columns are JSONB so dimension change is non-breaking; cosine similarity returns 0 on length mismatch so old 768-dim vectors are silently ignored.
   - **Edits already made locally in this session but NOT committed/pushed** (sandbox shell tool became unavailable):
     - `lib/gemini.ts`: `EMBED_MODEL` changed to `text-embedding-3-small`; `embed()` rewritten to use the existing OpenAI client; file header rewritten to document the migration. The `getOpenAIClient()` helper, `chat()` Gemini-fallback, and other functions are unchanged.
     - `scripts/clear-embeddings.sql` (new file): one-shot script to wipe stale 768-dim vectors so the next ingest re-embeds with 1536 dims.
   - **Next session must:** (a) commit + push these edits as a fresh PR off main, (b) run `scripts/clear-embeddings.sql` in Supabase SQL Editor, (c) re-save profile from `/onboarding` so resume embedding regenerates, (d) trigger the workflow manually and verify `success` status with `embedded > 0`.
2. **Render free tier 512 MB still tight for Chromium.** Even with the headless fix, the auto-apply agent may still crash on real page loads. Options remain: upgrade ($7/mo), run agent locally, or switch to a lighter automation lib.
3. **Auto-apply callback 401** (carried over from session 3): `INGEST_SECRET` env var still not synced between Vercel and Render.

### Files modified in this session (already on main except where noted)

- `lib/gemini.ts` — extractJdKeywords, generateAtsResume rewrite, cleanJdTitle, normalizeAscii, conditional directives, prompt reinforcements. **Plus uncommitted edit for embed() → OpenAI.**
- `lib/pdf-resume.ts` — full PDF rewrite: text bullets, parser title-slot detection, label-skip, navy band restoration with single-line bullet-separator contact, setProperties metadata.
- `lib/ingest.ts` — embed loop early-bail on config-shaped errors.
- `app/(app)/page.tsx` — sort modes + select clause includes fetched_at and updated_at.
- `app/(app)/_components/MatchFilters.tsx` — sort dropdown.
- `app/(app)/_components/MatchCard.tsx` — fetched_at fallback with "added" tag.
- `app/(app)/jobs/[id]/JobActions.tsx` — clickable add/remove keyword chips, custom-keyword input, allMissingKeywords useMemo, in-place regenerate, filename state, ATS Match Score card.
- `app/api/match/[id]/resume/route.ts` — extractJdKeywords for picker, accept selectedKeywords + excludedKeywords, return filename_base, return ats_match_score + missing.
- `.github/workflows/ingest.yml` + `backfill-jds.yml` — added GEMINI_API_KEY env line.
- `browser_agent/main.py` — Browser(BrowserConfig(headless=True, ...)), OpenAI primary LLM with Gemini fallback, register_new_step_callback for SSE visibility, truthful status reporting.
- `browser_agent/requirements.txt` — added `langchain-openai>=0.2.0`.
- `browser_agent/.env.example` — documented OPENAI_API_KEY, OPENAI_MODEL, GEMINI_MODEL, LLM_PROVIDER.
- `app/(app)/jobs/[id]/AutoApplyButton.tsx` — drop hardcoded "Application submitted!" log; truthful messages from Python agent.
- `scripts/clear-embeddings.sql` (new, **uncommitted**) — wipe stale 768-dim vectors.

### Merged PRs in this session

#12 headless browser-agent · #13 OpenAI primary + step callback + truthful status · #14 two-pass JD tailoring + ATS Match Score + parser-safe PDF · #15 clickable missing keywords + USER PRIORITY · #16 client privacy + strict keyword scope + JD title alignment · #17 PDF JD-aligned title + cleaner header · #18 default download filename + decimal years · #19 aggressive title cleaner + multi-line PDF + remove-keyword flow · #20 strip ' - Designation' / ' / Specialization' from titles · #21 restore navy header + skip 'Resume' label leak · #22 unified missing list + clickable Skill Match chips + custom keyword input · #23 default sort by freshness + 5 sort modes · #24 wire GEMINI_API_KEY into workflow + early-bail in embed loop

---

## Session 3 — What Was Built & Fixed (May 28, 2026)

### 1. Bookmark + Seen/Unseen Feature (PR #11, merged)
- **Bookmark:** Toggle on match cards + job detail page. Dedicated "Bookmarked" tab in status filter. DB: `matches.bookmarked boolean`.
- **Seen/Unseen:** Cards fade to opacity-75 when viewed (was opacity-55, too harsh). New "Inbox" tab = `new + viewed` combined — fixes the bug where opening a job made it vanish.
- **Inbox tab fix:** Default dashboard tab is now `inbox` (queries `status IN ('new', 'viewed')`). Individual `new`/`viewed` tabs removed.
- **Removed `saved` status:** Replaced by bookmark concept. Removed from `STATUS_ORDER`, API ALLOWED set, and status tracker buttons.
- **Migration:** `0003_bookmarked.sql` — `bookmarked boolean` + partial index.

### 2. ATS Resume Engine (Gemini → OpenAI)
- **Complete rewrite of `lib/gemini.ts`:** OpenAI gpt-4o-mini as primary LLM, Gemini 2.0 Flash as fallback (Gemini free tier exhausts daily quota quickly).
- **`generateAtsResume()`:** Preserves exact resume structure (same sections, same bullets, same order). Weaves in ATS keywords: k6, Gatling, Grafana, Prometheus, Docker, Kubernetes, SLA/SLO/SLI, OpenTelemetry, Shift-Left Testing, etc. Adds new achievement: "JMeter Performance Center (React/TS + Python, adopted by Charles Schwab teams)".
- **PDF generator rebuilt** (`lib/pdf-resume.ts`): Matches Shashank's exact format — navy header, amber accents, skills as `Category: Tools` rows, experience with shaded job headers + italic client lines.
- **Resume saved per match:** `matches.tailored_resume_text` + `matches.tailored_resume_url` (PDF in Supabase Storage bucket "resumes").

### 3. Application Profile (Memory Store)
- **New page:** `/apply-profile` — comprehensive form with 50+ fields.
- **Pre-filled defaults:** Name, phone, email, city, LinkedIn, all essay answers written by AI coach.
- **Essay answers included:** About yourself, why leaving, strengths, weaknesses, salary expectation.
- **DB:** `apply_profiles` table with unique per profile_id.
- **Bug fix:** `upsert` had invalid `.eq()` chain — removed, now uses `onConflict: 'profile_id'`.

### 4. Auto-Apply Browser Agent
- **Python FastAPI service** (`browser_agent/`): Uses `browser-use==0.1.40` + Gemini 2.0 Flash.
- **Hosted on Render free tier** (Docker, port 10000). UptimeRobot keeps alive.
- **API:** `POST /apply` (start task), `GET /apply/{task_id}` (SSE stream), `GET /apply/{task_id}/result`.
- **JobRadar integration:** `POST /api/match/[id]/auto-apply` orchestrates: generate ATS resume → upload PDF → generate cover letter → call Python agent → stream live logs.
- **Callback:** `POST /api/match/[id]/apply-callback` — agent reports back on completion.
- **Live feed UI:** `AutoApplyButton.tsx` — terminal-style log panel with SSE.
- **Current limitation:** Render free tier (512MB RAM) cannot sustain Chromium. Agent starts but silently crashes. Needs either: upgrade to $7/mo, run locally, or lighter automation approach.

### 5. browser-use API Learnings

> **NOTE (superseded by Session 4):** the claim below that `BROWSER_USE_HEADLESS=true` enables headless mode is **WRONG** for `browser-use==0.1.40`. That env var does not exist anywhere in the v0.1.40 source. The correct API is `Browser(BrowserConfig(headless=True, extra_chromium_args=[...]))` passed as `Agent(browser=browser)`. See Session 4 → "Auto-apply browser agent" for the verified-from-source fix.

- **v0.1.40 correct API:** `Agent(task=..., llm=...)` — NO `Browser`, NO `BrowserConfig`, NO `BrowserProfile`. Library manages its own browser session.
- **Headless mode:** Set via `BROWSER_USE_HEADLESS=true` environment variable.
- **DO NOT pass `config=`, `browser=`, or `browser_profile=`** — all cause `BrowserSession.__init__() got an unexpected keyword argument 'config'` error.
- **The library's public API is unstable across versions** — always pin exact version.

### 6. Deployment Lessons
- **Render:** Must use Docker runtime (not Node). Port must be 10000. "Clear build cache & deploy" needed when changing pip packages.
- **Vercel:** Deploys from `main` only. Feature branches = Preview deployments. Always verify which branch is deployed before debugging.
- **Gemini quota:** Free tier exhausts quickly with large prompts. OpenAI as primary avoids this.

### Migrations Run
- `0003_bookmarked.sql` — `bookmarked boolean` column + index
- `0004_ats_and_apply.sql` — `tailored_resume_text`, `tailored_resume_url`, `auto_apply_*` columns, `apply_profiles` table, `resumes` storage bucket

### Open Issues for Next Session
1. **Render free tier memory:** 512MB insufficient for Chromium. Options: upgrade, run locally, or use lighter approach.
2. **Callback 401:** Agent callback to `/api/match/[id]/apply-callback` returns 401 because `INGEST_SECRET` env var not synced between Vercel and Render.
3. **Health check 405:** UptimeRobot sends HEAD, endpoint only handles GET. Minor.

---

## Session 2 — What Was Built & Fixed (May 27, 2026)

### 1. Backfill JDs script (`scripts/backfill-jds.ts`)
- **Problem:** Adzuna stores truncated ~500-char descriptions. Existing jobs in DB had bad JDs.
- **Fix:** New script that paginates `source LIKE 'adzuna_%'`, finds short descriptions, fetches full JDs via `fetchFullJobDescription()`, persists, re-embeds, re-scores.
- **Workflow:** `.github/workflows/backfill-jds.yml` — `workflow_dispatch` only, with inputs: `limit`, `source_prefix`, `threshold`, `concurrency`, `dry_run`, `rescore`.

### 2. Fixed truncated JDs in live app
- **Root cause:** `ensureFullDescription()` existed in `lib/jd-fetcher.ts` but was never called anywhere.
- **Fix 1:** `app/(app)/jobs/[id]/page.tsx` — call it before rendering. First open fetches + persists full JD. Subsequent opens are instant.
- **Fix 2:** `lib/ingest.ts` step 6 — after embedding new jobs, call it for all newly upserted jobs so scoring uses full JD.

### 3. UI redesign — Runway warm light theme (PR #10, merged to main)
- Switched from dark theme (`#0b0d10`) to warm light canvas (`#f8f7f5` off-white).
- Palette: ink `#261b07`, stone `#61594a`, amber `#f9a600` (primary CTA only), faded-stone `#e3dfd5` borders.
- Typography: Inter with exact letter-spacing scale from spec.
- Components: 12px card radius, 8px button radius, 6px badge radius, subtle warm shadows.
- **Note:** v2 + v3 follow-up commits (removing amber overuse, fixing range slider, neutral skill chips) are on branch `ui-redesign-runway` but NOT yet merged. PR #10 was merged before those commits were pushed.

### 4. `posted_at` source explained
- `date-fns formatDistanceToNow(posted_at)` drives "X days ago" display.
- Source mapping: Adzuna→`created`, Remotive→`publication_date`, RemoteOK→`date`, Arbeitnow→`created_at×1000`, HN→`created_at`.
- **Weakest:** Adzuna (indexes date, not post date). **Most reliable:** Remotive, RemoteOK, Arbeitnow.

### 5. Identified but NOT yet built
- **Viewed dimming + Bookmarks:** User wants seen cards to appear less prominent, unseen ones to pop. Also wants a bookmark icon on each card independent of application status.
- **Plan:** Add `viewed_at timestamptz` + `bookmarked boolean default false` columns to `matches`. Stop setting `status='viewed'` on open — just stamp `viewed_at`. Cards with `viewed_at != null` render dimmed. Bookmark toggle on card. Migration resets existing `status='viewed'` rows to `'new'`.
- **Not built yet** — was scoped but session ended before implementation.

---

## Session Log — May 27, 2026

### Shipped to `main`
1. **Backfill script** — `scripts/backfill-jds.ts` + `.github/workflows/backfill-jds.yml`
   - Manual `workflow_dispatch` to fetch full JDs for truncated Adzuna jobs already in DB
   - Re-embeds + re-scores upgraded jobs
   - Inputs: `limit`, `source_prefix`, `threshold`, `concurrency`, `dry_run`, `rescore`
   - PR #8 — merged
2. **Fix truncated JDs end-to-end** — wired `ensureFullDescription()` into two places it was missing:
   - **Job detail page** (`app/(app)/jobs/[id]/page.tsx`): lazy-upgrade on first view, persist for future loads
   - **Ingest pipeline** (`lib/ingest.ts` step 6): for every new job after embedding, fetch full JD before scoring
   - The function existed in `lib/jd-fetcher.ts` but was never called — that was the actual bug
   - Merged as part of PR #10
3. **UI redesign v1** — Runway warm-light theme (off-white canvas, amber CTA, Inter typography, hairline borders, 12px card radius). PR #10 — merged.

### NOT yet on `main` — sitting on `ui-redesign-runway` branch
- **UI v2 + v3** commits (`886fef4`, `342a084`) — disciplined amber to primary CTA only, removed colored icons from section headings, fixed range slider track (was rendering black on right of thumb), made skill chips neutral instead of yellow, replaced shadow-heavy cards with hairline-border cards.
- **Why orphaned:** PR #10 was merged after only v1 was pushed. v2/v3 were follow-ups based on screenshots showing the v1 looked too "AI-themed SaaS template" with amber overuse.
- **To recover:** cherry-pick those two commits or open a new PR from that branch.

### Identified but not yet fixed
- **`status='viewed'` bug:** when user opens a match, code does `status = 'viewed'`, but `'viewed'` is **not in `STATUS_ORDER`**. The job vanishes from every visible status tab — user has no way to find it again.
- **Planned fix (not built):** add `viewed_at timestamptz` + `bookmarked boolean` columns to `matches`. Stop changing status on view, just stamp `viewed_at`. Dim viewed cards in the list. Bookmark icon on each card, independent of status. Migration must reset existing `status='viewed'` rows back to `'new'`.

### Discovered (transparency)
- "X days ago" on cards = `date-fns formatDistanceToNow(posted_at)`. `posted_at` comes verbatim from each source: Adzuna `created`, Remotive `publication_date`, RemoteOK `date`, Arbeitnow `created_at × 1000`, HN `created_at`. **Most reliable: Remotive/RemoteOK/Arbeitnow. Weakest: Adzuna** (sometimes reflects when Adzuna indexed it, not when company posted).
