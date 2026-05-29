# JobRadar — Kiro Steering Context

> **This file is auto-loaded by Kiro in every new chat.** It provides full project context so continuity is maintained across sessions.

---

## ⭐ ACTIVE INITIATIVE — Enterprise Multi-Tenant Transformation

> **Current north-star.** JobRadar is moving from a single-user app (personalized for Shashank) to a **public, multi-tenant SaaS**: anyone signs up, uploads a resume, and gets the full feature set. **Execute ONE phase per chat** — finish a phase, update this tracker, start the next phase in a NEW chat. Never mix phases.

### Progress Tracker (read this first, every chat)

| Phase | Title | Status |
|---|---|---|
| **0** | Strategic decisions (auth provider, cost model, scope) | 🟡 IN PROGRESS |
| **1** | Real auth & identity (Supabase Auth, replace first-profile pattern) | ⬜ Not started |
| **2** | Data isolation & security (RLS, ownership checks, private resume bucket) | ⬜ Not started |
| **3** | Scalable ingest & cost control (split shared vs per-user, quotas) | ⬜ Not started |
| **4** | Monetization & abuse protection (tiers, rate limits, legal) | ⬜ Not started |
| **5** | Scale & ops (pgvector, observability, auto-apply queue) | ⬜ Not started |

⬜ Not started · 🟡 In progress · ✅ Done

### Two realities driving this

1. **Single-user assumption is contained but pervasive.** "Current user" is resolved everywhere by `profiles … order('created_at').limit(1)` = "whoever signed up first" = Shashank (~10 files). Auth = one shared `APP_PASSWORD`, JWT payload `{ ok: true }` (no identity). **But** the data model is already ~80% multi-tenant: `matches`, `apply_profiles`, `search_profile` are keyed by `profile_id`; `jobs` is a correctly-shared global pool.
2. **⚠️ COST MODEL INVERTS (biggest risk).** All LLM/embedding calls run on Shashank's OpenAI key. New users scale cost **linearly on our bill**. This breaks "free tiers only." **No public sign-up link until Phase 3 quotas exist.** (Phase 0 open question: can FREE models replace paid OpenAI? — under research.)

### Single-user blast radius (Phase 1 files)
`app/(app)/{layout,page,onboarding/page,top-mnc/page}.tsx`, `app/api/apply-profile/route.ts` (2×), `app/api/extension/{answer,profile}/route.ts`, `app/api/import-job/route.ts`, `app/api/profile/route.ts` (email upsert), `lib/ingest.ts`, `scripts/backfill-jds.ts`. Auth core: `lib/auth.ts` + `middleware.ts`.

### Phase 0 — Decisions (decide before coding; fill in as answered)

| # | Decision | Recommendation | Answer |
|---|---|---|---|
| Q1 | Auth provider | **Supabase Auth** (email/pass + Google OAuth) — native RLS, free, email verify/reset built in | _pending_ |
| Q2 | Who pays for LLM? | Free tier + hard quotas / Stripe paid tiers / bring-your-own-key. **Researching free models now.** | _pending pick: (A) free-tier swap / (B) BYOK / (C) hybrid — see research note_ |
| Q3 | Auto-apply at launch? | **Gate off / waitlist** (Render 512MB agent crashes for one user) | _pending_ |
| Q4 | Hosting | Free tiers for beta; budget paid Supabase/Vercel at scale | _pending_ |

### Phase 0 research — free/open-source models vs paid OpenAI (May 29, 2026)

- **Kiro/Cursor/Antigravity are dev assistants, NOT callable inference APIs.** Runtime AI needs a real free LLM API.
- **Free LLM APIs:** Gemini free (2.5 Flash-Lite ~1,000 req/day), **Groq** (Llama 3.3 70B, 14,400 req/day, fast), **Cerebras** (1M tokens/day), **OpenRouter** free models (50/day unpaid). 
- **Free embeddings:** `gemini-embedding-001`, Jina v5, Cohere embed-v4. But OpenAI embeddings are only ~$1.30/mo — **embeddings aren't the cost driver; LLM scoring/generation is.**
- **⚠️ Two public-launch caveats:** (1) free tiers are **per-KEY not per-user** — 1,000 req/day is shared across ALL users; one scan (30-80 jobs) eats most of it → breaks at ~10-50 users. (2) free tiers **log/train on data** → PII/GDPR risk for strangers' resumes.
- **⚠️ GEMINI IS OUT (evidence-based, May 2026):** code's `gemini-2.0-flash` is deprecated (shuts down June 1 2026; "existing customers only" since March 6) → free/new keys get `429 limit: 0` (the "rate limit" Shashank saw). Google also gutted free limits 50-80% in Dec 2025 + free tier trains on data. Drop Gemini entirely.
- **✅ SHIPPED (session 6): Groq replaces Gemini.** `lib/gemini.ts` `chat()` now chains OpenAI `gpt-4o-mini` → **Groq `llama-3.3-70b-versatile`** (free ~14,400 req/day, OpenAI-compatible API), with no silent error masking (combined error if all providers fail). `browser_agent/main.py` uses Groq via `ChatOpenAI(base_url=...)`. New secret: `GROQ_API_KEY`. Gemini fully removed.
- **Recommended provider stack: OpenAI `gpt-4o-mini` (paid, primary) → Groq (free fallback) → BYOK for scale.** Options to Shashank for multi-tenant cost model: (A) free-tier swap (Groq) / (B) pure BYOK / (C) hybrid ← rec.

### Phase summaries (the "how")

- **Phase 1 — Auth & identity:** Supabase Auth via `@supabase/ssr`; retire `APP_PASSWORD`/`jr_session`; migration `0005_multitenant.sql` adds `user_id uuid → auth.users` on `profiles` + backfills Shashank's row; `getCurrentProfile()` helper replaces all first-profile queries; sign-up/login/reset/verify UI.
- **Phase 2 — Isolation (ship WITH Phase 1):** RLS on `profiles`/`matches`/`apply_profiles`/`ingest_runs` keyed to `auth.uid()`; ownership checks on `match/[id]/*`; **make `resumes` bucket private** + signed URLs; add `profile_id` to `ingest_runs`.
- **Phase 3 — Cost control (before any public link):** split `lib/ingest.ts` into shared (fetch→upsert→embed, paid once) vs per-user (filter→score→matches); broad shared Adzuna fetch + per-user embedding pre-filter to top ~30 before LLM; `usage` table + hard quotas; per-user work on Supabase scheduled Edge Functions / queue for active users only.
- **Phase 4 — Monetization:** Stripe tiers; rate limiting (Upstash free); input hardening + prompt-injection guards; Privacy/Terms + delete-account + GDPR.
- **Phase 5 — Scale:** `pgvector` + index (replace cosine-in-JS); Sentry + usage dashboard; auto-apply as queued worker service (separate track).

### Execution rule
Start each chat by reading this tracker → confirm prior phase is ✅ → execute ONLY the next phase → update tracker + add a phase log when done.

---

## 1. What is JobRadar?

A **personalized AI-powered job-search dashboard** built by Shashank (Senior Performance Engineer, India, 7+ years). **Currently single-user; actively being converted to public multi-tenant SaaS — see ⭐ ACTIVE INITIATIVE above.** UI uses a warm light theme (Runway-inspired: off-white canvas, amber CTA, Inter typography).

**Core flow:** Fetches jobs from multiple sources → AI-scores against resume → surfaces relevant matches → generates tailored ATS resumes + cover letters per job.

- **Repo:** https://github.com/shashank4910/JobRadar
- **Live:** https://job-radar-ten-nu.vercel.app

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Database | Supabase (Postgres + pgvector) |
| Auth | Custom JWT cookie (HS256 via `jose`) — **being replaced by Supabase Auth in Phase 1** |
| AI | OpenAI `gpt-4o-mini` + `text-embedding-3-small`; **Groq `llama-3.3-70b-versatile` = free chat fallback** (Gemini removed, session 6) |
| AI module | `lib/gemini.ts` (named historically; uses OpenAI primary + Groq fallback) |
| Ingestion | GitHub Actions cron every 6h → `scripts/ingest.ts` |
| Hosting | Vercel (web) + GitHub Actions (cron) |
| Job sources | Adzuna India, Remotive, RemoteOK, HackerNews, Arbeitnow |
| PDF | jsPDF (`lib/pdf-resume.ts`) |

---

## 3. User's Profile

- **Domain:** Performance Engineering / Load Testing
- **Top skills:** loadrunner, jmeter, blazemeter, cavisson netstorm, appdynamics, dynatrace, splunk, jprofiler, jvisualvm, github actions, jenkins, core java
- **Target roles:** Senior Performance Engineer, Performance Test Lead, Performance Engineering Manager
- **Locations:** Pune, Noida, Gurgaon
- **preferences.min_score:** 75 (high — dashboard defaults to 50 to avoid hiding everything)

---

## 4. Critical Architecture

### Ingest Pipeline (cron)
```
1. Load/generate AI SearchProfile (cached 7 days)
2. Fetch jobs using AI-generated searchKeywords
3. Upsert jobs (ignoreDuplicates: true)
4. Embed new jobs
5. Upgrade truncated JDs — call ensureFullDescription() for new jobs (added May 27)
6. AI pre-filter: titlePatterns → antiPatterns → AI relevance batch
7. LLM-score filtered candidates
8. Persist matches
```

### On-demand (job detail page)
```
ensureFullDescription() → fetches full JD if Adzuna truncated it
matchSkills() → 4-phase pipeline (see below)
ATS resume generation
Cover letter generation
```

---

## 5. Key Files

```
lib/gemini.ts              ← AI helpers (matchSkills, scoreJob, generateCoverLetter)
lib/jd-fetcher.ts          ← Fetches full JDs from redirect_url
lib/search-profile.ts      ← AI-generated SearchProfile
lib/ingest.ts              ← Main cron pipeline
lib/sources/adzuna.ts      ← Adzuna fetcher (multi-query, multi-page)
lib/sources/index.ts       ← Source dispatcher
lib/pdf-resume.ts          ← Beautiful PDF generator

app/(app)/jobs/[id]/JobActions.tsx  ← Skill match + ATS resume + cover letter UI
app/api/match/[id]/skills/route.ts  ← Skill match API
app/api/match/[id]/resume/route.ts  ← ATS resume API
app/api/coverletter/route.ts        ← Cover letter API

scripts/ingest.ts                    ← Cron entry point
scripts/backfill-jds.ts             ← Bulk backfill: fetch full JDs + re-embed + re-score (manual trigger)
.github/workflows/ingest.yml        ← Cron schedule (every 6h)
.github/workflows/backfill-jds.yml  ← workflow_dispatch for bulk JD backfill (inputs: limit, dry_run, rescore etc.)
```

---

## 6. matchSkills 4-Phase Pipeline (DO NOT SIMPLIFY)

```
Phase 1 (LLM): Extract jdRequirements from JD text only
Phase 2 (LLM): Classify each as matched/missing against full resume
Phase 3 (CODE): Verify items came from jdRequirements list
Phase 4 (CODE): Verify items actually appear in JD text
```

Invariants: matched ⊆ jdRequirements, missing ⊆ jdRequirements, no resume-only items.

---

## 7. Critical Bugs Fixed (don't repeat these)

| Issue | Root Cause | Fix |
|---|---|---|
| 0 matches after cron | All jobs already scored (seen set was all-time) + LLM too harsh + min_score=75 hiding results | 24h seen window, relaxed scoring, dashboard defaults to 50 |
| Adzuna returns random jobs | Generic role queries AND-match poorly | AI SearchProfile generates niche single-word keywords |
| Skill match shows "no matches" | JD truncated to 500 chars by Adzuna API | `ensureFullDescription()` fetches full JD from redirect URL |
| Resume-only skills appearing as matched | LLM leaked resume content into jdRequirements | Phase 3+4 code verification |
| Strong keywords (JMeter) missing from matched | Prompt was too strict about not including co-occurring items | Worked example + "co-occurrence is irrelevant" rule |
| ATS resume adds fake skills | LLM was inventing experience | Strict "ONLY use original resume" rules |
| Cron showing 0 but code was fixed | Feature branch not merged — cron runs from main | Always verify deployed commit hash |
| `status='viewed'` makes jobs vanish | Job detail page does `status='viewed'` but `'viewed'` is not in `STATUS_ORDER` — job disappears from all tabs | **Not fixed yet.** Plan: add `viewed_at timestamptz` column, stop changing status on open, reset existing `viewed` rows to `new` |
| JD descriptions truncated in DB | `ensureFullDescription()` existed in `lib/jd-fetcher.ts` but was never called | Called it in job detail page (lazy upgrade) AND in ingest pipeline step 6 (upgrade before scoring) |
| Adzuna `posted_at` unreliable | `created` = when Adzuna indexed, not when company posted | Weakest source for freshness; Remotive/RemoteOK/Arbeitnow are more reliable |

---

## 8. NEVER Do

- ❌ Hardcode keyword lists — use AI SearchProfile
- ❌ Trim user's resume in ATS generation
- ❌ Cap Adzuna queries at 6
- ❌ Assume `description` in DB is complete (Adzuna truncates)
- ❌ Filter dashboard by `preferences.min_score` as hard filter
- ❌ Make multiple speculative fixes without evidence — debug with SQL first

---

## 9. ALWAYS Do

- ✅ Run `npx tsc --noEmit` before pushing
- ✅ Use `ensureFullDescription()` before any AI feature that uses JD
- ✅ Preserve 4-phase matchSkills pipeline
- ✅ Ask for SQL evidence when debugging
- ✅ Create new branch → PR → merge (never push directly to main)
- ✅ Verify which commit the cron is actually running

---

## 10. Update Protocol

This file should be updated every 2-3 significant conversations. Add:
- New bugs found and fixed
- New features built
- Changes to architecture
- New "NEVER do" / "ALWAYS do" rules learned

Last updated: May 29, 2026 (session 6: launched the **Enterprise Multi-Tenant Transformation** initiative — added the Master Plan + Progress Tracker (Phases 0-5) to the top of this file. Phase 0 in progress: strategic decisions + researching free/open-source LLM + embedding alternatives to paid OpenAI. Documentation only, no code changed.)

_Earlier: May 27, 2026 (session 2: backfill + JD fix + UI redesign + status='viewed' bug identified)_

---

## 11. Session 2 Log — May 27, 2026

### Built & Merged (on `main`)

**Backfill JDs script + workflow**
- `scripts/backfill-jds.ts` — paginates Adzuna jobs with short descriptions, fetches full JDs, persists, re-embeds, re-scores
- `.github/workflows/backfill-jds.yml` — `workflow_dispatch` with inputs: `limit`, `source_prefix`, `threshold`, `concurrency`, `dry_run`, `rescore`
- PR #8 — merged

**Fixed truncated JD bug end-to-end**
- Root cause: `ensureFullDescription()` in `lib/jd-fetcher.ts` was never called anywhere
- Fix 1: `app/(app)/jobs/[id]/page.tsx` — lazy upgrade on first view, persisted to DB for future loads
- Fix 2: `lib/ingest.ts` step 6 — upgrade all newly upserted jobs before scoring so AI gets full text
- Merged as part of PR #10

**UI redesign — Runway warm light theme**
- Off-white `#f8f7f5` canvas, pearl `#ffffff` cards, ink `#261b07` text, amber `#f9a600` primary CTA
- Inter font, exact letter-spacing type scale, 12px card / 8px button / 6px badge radii
- Merged as PR #10 (v1 only — see below)

### Built but NOT yet on `main`

**UI v2 + v3** (branch `ui-redesign-runway`, commits `886fef4` + `342a084`)
- Disciplined amber to primary CTA only (was overused on every icon and badge in v1)
- Removed decorative colored icons from section headings
- Fixed range slider CSS (browser default rendered right-side track black)
- Neutral skill chips instead of yellow `badge-warm`
- Hairline-border cards instead of shadow-heavy cards
- **Reason not merged:** PR #10 merged before these follow-up commits were pushed

### Identified but not yet built

**Viewed dimming + Bookmarks**
- User wants: unseen cards look prominent, already-opened cards appear dimmed
- User wants: bookmark icon on each card, independent of application status
- Root bug uncovered: `status='viewed'` makes jobs disappear from all tabs (not in `STATUS_ORDER`)
- Plan: `viewed_at timestamptz` + `bookmarked boolean` columns on `matches`; stamp `viewed_at` on open instead of changing status; dim cards where `viewed_at != null`; reset existing `viewed` rows to `new`

### Answered (user questions)

**"How old is this job?" — source of `posted_at`**
- Adzuna → `j.created` (weakest — Adzuna index date, not company post date)
- Remotive → `j.publication_date`, RemoteOK → `j.date`, Arbeitnow → `j.created_at × 1000`, HN → `it.created_at`
- Display: `date-fns formatDistanceToNow(posted_at)` vs current time
