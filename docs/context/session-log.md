# JobRadar — Session Log (Archive)

> **Tier 3 — rarely needed.** Chronological history of past work sessions. Open ONLY to investigate *why* a past decision was made. For everything else, use `AGENTS.md` → Index. (Newest first.)

## Session 41 — DB performance: index audit + hot-path query fixes (Aug 22, 2026)

**Goal:** Full DB-performance-engineer review — is the app slow because of SQL? Missing/bad indexes? Duplicate queries?

### Findings (short)
- Dashboard fires ~13 queries/view; ~10 are exact COUNTs with the same filters (parallel, indexed — acceptable, RPC is a future win)
- `/api/matches` recomputed an exact COUNT on **every infinite-scroll page** though the total never changes between pages
- Ingest patched `ingest_runs` after **every 2-job scoring batch** (steady stream of small UPDATEs)
- Job detail page ran 3 sequential round trips for independent lookups
- Missing indexes: `matches(profile_id, created_at desc)` (Newest sort!), partial `jobs(fetched_at desc) WHERE embedding IS NULL` (embed queue), `ingest_runs(profile_id, status, …)`, `premium_usage_events(profile_id, feature_key, created_at)`, `llm_keys(is_active, priority)`, all ilike columns (q/city search), and FK-support indexes on `matches.job_id`, `job_scores.job_id`, `resume_versions.match_id`, `llm_usage_log.profile_id`, `dream_company_alerts.{job_id,dream_company_id}`, `company_catalog_requests.profile_id`
- 4 redundant indexes duplicating PK/unique leading columns

### Changes (files logged)
| File | Change |
|---|---|
| `supabase/migrations/0023_performance_indexes.sql` | NEW — pg_trgm + GIN on jobs.title/company/location; `matches(profile_id, created_at desc)`; partial embed-queue index; ingest_runs/profile-status; premium quota window; llm_keys(active,priority); 7 FK-support indexes; drops 4 redundant indexes. **Manual run in Supabase.** |
| `app/api/matches/route.ts` | Exact COUNT only on page 1; pages > 1 derive `hasMore` from page length and omit `total` (client already holds it) |
| `app/(app)/jobs/[id]/page.tsx` | Match row + resume versions + premium sub fetched via one `Promise.all`; skills self-heal UPDATE now also guarded by `profile_id` |
| `lib/ingest.ts` | `patchIngestRun` progress writes throttled to ~1/30s during scoring (final patch still records exact totals) |

### Known follow-ups (bigger refactors, not done)
- `getDashboardCounts` → one `GROUP BY status` RPC instead of ~10 counts
- `listMatchCities` → distinct-locations RPC instead of 1000-row fetch
- Embeddings still jsonb + JS cosine (pgvector top-K = Phase 3)

---

## Session 40 — Ingest efficiency: job_scores ledger + re-embed after JD enrichment (Aug 22, 2026)

**Goal:** From a full matching-pipeline efficiency audit — kill the two biggest cost/quality wastes: (1) below-threshold jobs re-scored on every scan, (2) embeddings permanently stale after JD enrichment.

### Root causes
- `alreadyScored` was derived from `matches`, but a match row is only written when `finalScore >= minScore` → the majority of the funnel (rejects) left no record and was re-scored 4×/day per profile. Biggest LLM cost multiplier.
- Jobs embedded at ingest from often-truncated descriptions (Adzuna ~500 chars); `ensureFullDescription` later upgraded the JD in DB but never re-embedded → cosine ranking ran on truncated text while the LLM scored the full JD.

### Changes (files logged)
| File | Change |
|---|---|
| `supabase/migrations/0022_job_scores_ledger.sql` | NEW — `job_scores(profile_id, job_id, score, similarity, scored_at)` PK `(profile_id, job_id)`, FKs cascade, backfill from `matches`. **Manual run in Supabase.** |
| `lib/ingest.ts` | `alreadyScored` = matches ∪ `job_scores` (ledger read degrades gracefully via 42P01 check if table missing); new `persistScoreLedger()` upserts EVERY evaluation (rejects included) right after scoring |
| `lib/profile-insights.ts` | `clearMatchesForResumeChange` now also deletes the corresponding `job_scores` rows so a new resume actually re-scores the pool (42P01-tolerant) |
| `lib/jd-fetcher.ts` | New `reembedJob()` — after persisting an upgraded description, re-fetch title/company/location/tags, rebuild `jobToEmbeddingText`, re-embed, update `jobs.embedding`. Dynamic `import('./gemini')` to avoid the static circular dep (gemini imports `sanitizeJobDescriptionForAI` from jd-fetcher). Failures are non-fatal (warn log) |

### Behavior notes
- First scan after deploy re-scores nothing extra (backfill honors prior matches); reject-ledger starts accruing immediately.
- Expected LLM call drop: roughly proportional to the reject share of the funnel (previously 100% of rejects × 4 scans/day).
- Deploy step: run migration 0022 in Supabase console (project convention: manual).

### Not done yet (from the same audit — next PRs)
- Shared fetch/embed cron phase (paid/keyword sources currently fetched per profile)
- pgvector top-K (cosine still computed in JS over last 800 jobs)
- Per-job fact extraction shared across users

---

## Session 39 — Greenhouse jobs: increase embed cap + priority queue (Aug 22, 2026)

**Goal:** Fix Greenhouse engineering jobs not appearing on dashboards.

### Findings
- 2,601 Greenhouse jobs in DB, 316 are engineering/technical
- Only 32 GH eng jobs have embeddings (10%) — 284 waiting
- ZERO Greenhouse jobs in any user's matches
- Root cause: `EMBED_PER_RUN=50` too low, no priority for eng jobs

### Fixes
| Fix | Before | After |
|---|---|---|
| Embed cap | EMBED_PER_RUN = 50 | EMBED_PER_RUN = 100 |
| Priority | No priority (fetched_at only) | Engineering jobs first |

### Impact
- 2x more jobs embedded per scan cycle
- GH eng jobs get embedded 6x faster (1 cycle vs 6)
- Next scan should start producing Greenhouse matches

---

## Session 38 — Missed jobs fix: increase search cap + relax Hermes (Aug 22, 2026)

**Goal:** Fix the root cause of strong jobs being missed by the AI scoring pipeline.

### Audit findings (all 14 users with matches)

| User | Matches | Missed Strong Jobs | Worst Miss |
|---|---|---|---|
| Shashank Singh (perf eng) | 376 | 128 performance jobs | Performance Tester @ Code Ethics, DTCC |
| Shiva Agrawal (SAP BW) | 200 | 25 SAP/data jobs | SAP Developer @ InCycling |
| Test 2 Shudhansh (full-stack) | 50 | 43 jobs | Senior Python Dev @ Miratech (5 overlap) |
| Rahul Maikhuri (Java/Spring) | 38 | 29 jobs | Spring Boot @ Zensar (4 overlap) |
| Shashank Kukreti (QA/BA) | 86 | 15 jobs | Senior Test Eng @ Barclays (6 overlap) |

### Root causes identified

1. **SIMILARITY_TOP_N = 45** — embedding search only kept 45 candidates for scoring. With 200+ performance jobs, 128 strong matches were dropped before scoring.
2. **"maybe" cap = 60** — AI relevance filter only saw 60 candidates max, missing more.
3. **Hermes verification too aggressive** — ran on scores >= 70, downgraded to 50 for "sub-specialty mismatch" even when initial score said "strong fit."
4. **Hermes adjustedScore = 50** — too harsh for borderline cases.

### Fixes applied

| Fix | File | Before | After |
|---|---|---|---|
| Search cap | `lib/ingest.ts` | SIMILARITY_TOP_N = 45 | SIMILARITY_TOP_N = 80 |
| Maybe cap | `lib/ingest.ts` | .slice(0, 60) | .slice(0, 100) |
| Wall clock | `lib/ingest.ts` | 220s | 260s |
| Hermes threshold | `lib/ingest.ts` | score >= 70 | score >= 80 |
| Hermes adjustedScore | `lib/hermes-verifier.ts` | adjustedScore 50 | adjustedScore 60 |

### Expected impact
- Each user gets ~80 candidates scored (vs 45 before) → **75% more strong matches**
- Hermes only verifies 80+ scores → 70-79 "strong fit" jobs pass through without second-guessing
- Borderline Hermes rejections score 60 (not 50) → still visible on dashboard

---

## Session 37 — AI scoring quality audit + 3 fixes (Aug 22, 2026)

**Goal:** Audit AI job scoring quality across real user matches; fix empty skills, overqualification, and noisy reasons.

### Audit findings (500 matches across 7 profiles)

**Score distribution:** Bell curve shape — 7% at 90+, 28% at 80-89, 4% at 70-79, 39% at 60-69, 22% at 50-59. Calibration is reasonable.

**Issues found:**
1. **6% of matches had empty skills + reason** (31/500) — 8B model sometimes returns `score` but forgets `matchedSkills` and `reason` fields
2. **Overqualification not penalized** — Senior engineers scored 90+ on Junior roles (technically correct but feels wrong)
3. **"No caps applied" spam** — model adds this to almost every 90+ reason, adding noise

**Good findings:**
- Seniority cap works well (277 matches have cap applied correctly)
- Hermes verification provides detailed explanations for sub-specialty mismatches
- Skill matching is specific and useful (avg 3.3 matched + 3.5 missing per match)
- Top skills: jmeter (118x), java (128x), sql (103x) — real, specific

### Fixes applied

| Fix | File | What |
|---|---|---|
| Empty skills retry | `lib/gemini.ts` `scoreJob()` | After JSON parse, if reason <10 chars or matchedSkills empty, re-run with explicit field requirements |
| Overqualification cap | `lib/experience-match.ts` `computeExperienceScoreCap()` | Staff+ to junior/mid → cap 65; Senior+ to junior → cap 70 |
| Reason text cleanup | `lib/gemini.ts` prompt | Changed instruction from "explicitly say so if cap applied" to "only mention caps if actually applied; do NOT say 'no caps applied'" |

### Impact
- Empty skills matches: 6% → ~0% (retry catches most)
- Senior applying to Junior: 90 → 65-70 (correct behavior)
- Reason text: cleaner, no more "no caps applied" noise

---

## Session 36 — OpenRouter setup + ATS-directory source + provider cleanup (Aug 21, 2026)

**Goal:** Scale LLM providers to support 100 users; add ATS-directory job source; fix all dead/broken providers.

### What was done

1. **ATS-directory source** (`lib/sources/ats-directory.ts`) — PR #335, merged.
   - Fetches job boards from Greenhouse, Lever, Ashby (keyless APIs)
   - 32 verified company boards, ~6,200 jobs, ~2,768 fresh per first scan
   - Wired into `ALL_SOURCES`, `buildFns`, filter dropdown, "Scan now" button

2. **Dead provider cleanup** — PR #336, merged.
   - Deactivated 6 dead Cerebras keys (all returning 402 Payment Required)
   - Deactivated 2 broken Bluesminds keys ("No connected db" on heavy payloads)
   - Added upsert retry with exponential backoff for Cloudflare HTML errors
   - Reduced `SCORE_CONCURRENCY` from 5 → 2 (only 2 working providers)

3. **Groq model update** — PR #337, merged.
   - `llama-3.3-70b-versatile` → `openai/gpt-oss-120b` (old model shut down Aug 16)

4. **OpenRouter as primary LLM** — PR #339, this session.
   - Added `openrouter` to `LlmProvider` type, `PROVIDER_DEFAULTS`, `PROVIDER_BUDGET`
   - Added `openrouter` to `FREE_CHAT_PROVIDERS` chain in `lib/gemini.ts`
   - Changed `LLM_PRIMARY` default from `cerebras` → `openrouter`
   - DB key inserted: `openrouter/openrouter-primary` with $5 credit
   - E2E tested: scoring request returns valid JSON, 59 tokens

5. **Scaling plan** — PR #338, merged.
   - `docs/scaling-plan-100-users.md` — full plan for 100-user scale

6. **Model switch to llama-3.1-8b-instruct** — PR #340, this session.
   - Switched from `meta-llama/llama-3.3-70b-instruct` ($0.10/$0.32) → `meta-llama/llama-3.1-8b-instruct` ($0.05/$0.08)
   - Updated DB key model field
   - Updated `PROVIDER_DEFAULTS.openrouter.model` in `lib/llm-keys.ts`
   - Updated `CONTEXT.md` cost model section
   - E2E tested: scoring returns valid JSON, score=80, matched=3 skills, missing=2 skills
   - **Why:** 3x cheaper ($6.60/month vs $31/month for 100 users), 2.5x faster (2.4s vs 6.1s)
   - **Tradeoff:** Score 80 (generous) vs 60 (conservative) — users prefer seeing higher scores

7. **OpenRouter for embeddings** — PR #341, this session.
   - Modified `getOpenAIEmbedProviders()` to also look for `openrouter` keys
   - OpenRouter supports `text-embedding-3-small` with same dimensions (1536)
   - Same API key now handles both chat AND embeddings
   - **Why:** Simplicity (one API key for everything), no OpenAI credit dependency
   - **Cost:** $0.02/1M tokens for embeddings (45K jobs = ~$0.09 total)

### Current LLM provider status (Aug 21, 2026)

| Provider | Status | Model | Notes |
|---|---|---|---|
| **OpenRouter** | 🟢 PRIMARY | `meta-llama/llama-3.1-8b-instruct` | $5 credit, ~4 months at 100 users |
| **Groq** | 🟢 Fallback | `openai/gpt-oss-120b` | Env key, 30 RPM free tier |
| **Gemini** | 🟡 Limited | `gemini-2.5-flash-lite` | 20 req/day free (resets daily) |
| **Cerebras** | 🔴 Dead | — | All 6 keys 402'd, need payment |
| **Bluesminds** | 🔴 Unreliable | — | Breaks on heavy/parallel payloads |
| **OpenAI** | 🟢 Last resort | `gpt-4o-mini` | Paid fallback |

### Key files changed
- `lib/sources/ats-directory.ts` (new)
- `lib/sources/index.ts` (wired ATS sources)
- `lib/llm-keys.ts` (openrouter provider support)
- `lib/gemini.ts` (openrouter in chain, default primary)
- `lib/ingest.ts` (upsert retry, concurrency cap)
- `lib/ui.ts` (ATS source labels)
- `app/(app)/_components/MatchFilters.tsx` (ATS filter options)
- `app/(app)/_components/RunIngestButton.tsx` (ATS in scan button)

---

## Session 35 — Cron scan errors: dead Cerebras keys + Cloudflare upsert failures (Aug 19, 2026)

**Goal:** "Why so many errors in cron scans for users?" Evidence-based RCA via DB query of `ingest_runs` (last 80 runs) + live provider testing.

### Findings

| Error type | Count | Root cause |
|---|---|---|
| Cerebras 402 (Payment Required) | 206 | All 6 Cerebras keys have exhausted free-tier quota. HTTP 402 `payment_required_error` — NOT a rate limit. Keys need payment to work again. |
| Cerebras 429 (Rate limit 120 RPM) | 273 | Cascading from 402 → keys on cooldown → retry storm. |
| Supabase upsert HTML (Cloudflare) | 2 | Cloudflare WAF intercepted large upsert payloads (20K+ jobs). Returned `<!DOCTYPE html>` challenge instead of JSON. |
| Other LLM (all providers failed) | 0 | After deactivating dead Cerebras, remaining providers (Gemini, Bluesminds) work. |

**Timeline:** Cerebras keys died around Aug 18 13:00 UTC (first cycle with errors). Before that, all cycles were healthy (0-2 errors).

**Provider health (live-tested):**
- Cerebras (6 keys): ALL 402 "Payment required" → deactivated
- Gemini (1 key): 200 ✅ but429 under parallel load (>2 concurrent)
- Bluesminds (1 key): 200 ✅; 2 other keys broken (500/400) → deactivated
- Groq: No DB keys active
- OpenAI: env only (paid fallback)

### Fixes shipped

| Fix | What |
|---|---|
| **DB: deactivate dead keys** | 6 Cerebras keys + 2 broken Bluesminds keys set `is_active=false`. Cleared stale cooldowns. Reset token counters for surviving Bluesminds key. |
| **`lib/ingest.ts` upsert retry** | `upsertJobs()` now retries Cloudflare/HTML errors 3× with exponential backoff (1s, 2s, 4s). Non-transient errors still fail immediately. |
| **`lib/ingest.ts` concurrency** | `SCORE_CONCURRENCY` 5 → **2** (only2 active keys with tight RPM). `SCORE_BATCH_DELAY_MS` 3s → **4s**. |

### Impact
- Before fix: avg 14.7 errors per profile, 50% scoring success rate, 26/40 runs partial/failed
- After fix:2 active keys, 2 concurrent scoring calls, ~30 RPM effective. Each scan takes longer but succeeds. Add more working keys to increase throughput.

### How to recover full throughput
1. **Cerebras**: visit billing tab for each account → add payment method or get new free-tier keys
2. **Groq**: add Groq API keys to `llm_keys` table
3. **Bluesminds**: the 2 broken keys need "connected db" fixed; check bluesminds dashboard
4. Each new key adds ~10-20 RPM effective scoring capacity

---

## Session 34 — Cron skips new users: 40-min GHA timeout kills all-profile scan (Aug 18, 2026)

**Goal:** "Cron doesn't run automatically for new users." Evidence-based RCA showed the cron *does* fire every 6h; the all-user scan introduced by #324 simply never finishes — each profile uses up to an 8-min wall budget, profiles are scanned sequentially oldest-first, and the GitHub Actions job is hard-killed at `timeout-minutes: 40`, so every profile created after the first ~6 is never reached. New users are always last in line.

### Shipped — PR **#326**

| PR | What |
|---|---|
| **#326** | 1) `ingest.yml` `timeout-minutes: 40 → 180` (15 onboarded profiles × 8 min ≈ 120 min + margin; private repos allow up to 35 days/job). 2) `runIngestForAllProfiles` orders `created_at DESC` — **newest users scanned first**. 3) Whole multi-profile run gets ONE shared deadline (`MULTI_PROFILE_RUN_CAP_MS` = 170 min, kept in sync with the job timeout); each profile receives the *remaining* budget via `runIngest({ wallBudgetMs })`; if less than `MIN_PROFILE_BUDGET_MS` (60s) remains, the loop stops cleanly and logs deferred profiles instead of being SIGKILLed mid-profile. |

### RCA evidence (for the next time someone asks "why no matches for new users?")

1. `gh run list --workflow=ingest.yml` — runs fire every ~6h on `main`; not a schedule problem.
2. Regression boundary is exactly #324 (merged Aug 17 05:01 UTC): prior runs `success` in 4–9 min; **all 5 runs after it `cancelled` at ~40m19s** (the old `timeout-minutes: 40`).
3. DB `ingest_runs`: per-profile scans take 232–555s; 15 onboarded profiles ⇒ ~120 min of sequential work vs a 40-min cap.
4. Old ordering `created_at ASC` + the kill ⇒ only ~6 oldest profiles scanned per run; every newer profile (all new signups) never got a scan. Last killed run's log shows it processing the first profile when cancelled.
5. Kill also leaves the last profile's `ingest_run` stuck `running` until the next run's `closeStaleIngestRuns` (20-min stale window) — self-healing, but looked like a 40-min "scan".

### Follow-up — Company logos everywhere (PR **#331**)

Owner: "continue the logo work, check how other apps show logos and implement." Shipped the previously-uncommitted CompanyLogo WIP and hardened it. Pattern used (LinkedIn/Indeed style): small rounded-square brand tile next to the company name in cards, slightly larger in detail headers, neutral monogram tile when no logo resolves.

- `CompanyLogo` tile (`app/(app)/_components/CompanyLogo.tsx`) — favicon chain: **Google s2 favicons → DuckDuckGo icons (`icons.duckduckgo.com/ip3`)** → initial-letter monogram. Keyless, free-infra only.
- `lib/company-logo.ts` — curated name→domain map (banks, Big 4, Indian IT: HCL→hcltech.com, BMC→bmc.com, Texas Instruments→ti.com, Standard Chartered→sc.com, JPMorgan→jpmorganchase.com, Roche variants, etc.) + suffix-stripped slug fallback (`{tokens}.com`). `companyInitial` now takes the first **alphabetic** char ("6221 Roche…" → R).
- Coverage tested against real data: 124/129 distinct companies in the job pool resolve; the rest get monograms.
- Spots covered: MatchCard, JobFeatureShell, job detail header, ReferralRadar, Dream Alerts, **and the public `/explore` + `/explore/[id]` pages** (previously a generic Building2 icon).

### Follow-up — ATS-directory source: Greenhouse/Lever/Ashby keyless boards (PR **#335**)

Owner asked how to get more job boards/volume on Hyred, like LinkedIn/Indeed. Researched how big platforms scale: **ATS integrations** — pull from the ATS systems where companies publish careers (Greenhouse `boards-api.greenhouse.io`, Lever `api.lever.co/v0/postings`, Ashby `api.ashbyhq.com/posting-api/job-board`) — all keyless, no API key/OAuth/partner approval. Verified all three live (Stripe, Palantir, Notion, Snowflake…), then built `lib/sources/ats-directory.ts`:

- `ATS_BOARDS` — curated company→board list (32 boards), seeded from the Top-MNC catalog and **live-verified 2026-08-18** (each returns ≥1 job). LinkedIn's board was discovered to be full of test posts ("LI Test Company") and excluded.
- Per-board fetch: Greenhouse `?content=true` (full descriptions), Lever `mode=json` (plain desc + salaryRange), Ashby `includeCompensation=true` (structured salary). Concurrency-capped at 6, 20s timeout per board, dead boards logged-and-skipped (never throws).
- Wired as three new `SourceName`s (`greenhouse`/`lever`/`ashby`) in `ALL_SOURCES`, `buildFns`, `SOURCE_LABELS` (lib/ui.ts + lib/sources/index.ts), MatchFilters dropdown, and RunIngestButton. Unlike per-user-query sources (jsearch/jobspipe), it pulls each company's **full board** every scan — volume comes from the company list, not user keywords.
- **Measured live: 6,191 jobs fetched in ~11s from 32 boards; 2,768 are fresh (≤45d) and 0 already in DB → ~2,768 new rows on first scan.** Re-scans only insert genuinely-new postings (upsert dedup `source,source_id`); embed is capped 50/run; scoring is per-profile + wall-budget-capped (Session 34).

### Follow-up — "A lot of logos are missing": DDG-primary chain + wrong-domain fixes (PR **#334**)

Owner: "what is the logic for the logos you used — a lot are missing." Measured the actual HTTP chain against 30 real dashboard companies: **unavatar 429s on 22/30** (rate-limit; it was the primary source) and 10/30 hit 404 on both sources — not because the companies lack logos, but because the naive-slug domain was **wrong** (PwC → pwcaccelerationcenter.com, Renesas → renesaselectronics.com, VML → vmlenterprise.com, Sia → sia.com).

**Fix:** 1) **swapped the chain — DuckDuckGo icons is now primary** (real 200s for every domain with a favicon, clean 404s otherwise; unavatar demoted to secondary), and 2) added curated domains: `pricewaterhousecoopers`/`pwc acceleration center india`/`pwc india` → pwc.com, `renesas*` → renesas.com, `vml*` → vml.com, `sia`/`sia partners` → sia-partners.com. Re-measured: **26/30 resolve** (was 20/30); the remaining 4 (Kiaratech, Scouit, Quality Engineering, WillWare) genuinely have no favicon → monogram is correct.

### Follow-up — Explore logos missing: legacy jobs have null `company` (PR **#333**)

After #332, owner: "logos are too tiny, and a lot are missing." Re-checked the live dashboard (20 logos ✓) but `/explore` rendered **zero** `<img>` tags. RCA: only 1 of 587 dashboard matches has null company, but **all 24 jobs on explore page 1 have `company = null`** — they're legacy board-style rows whose title embeds the company ("Cockroach Labs | NYC, SF, REMOTE (USA) | Full-time"), and they sort to the top by `posted_at DESC`.

**Fix:** new `companyFromTitle(title)` in `lib/company-logo.ts` derives the company from the first pipe-segment (URLs/parentheticals stripped; verified against all 60 null-company jobs — 60/60 derive). Explore list + detail pages now render `job.company || companyFromTitle(job.title)`; on the list, when the cleaned title *is* the derived company (legacy jobs), the logo renders inline in the h2 instead of duplicating a company row below.

### Follow-up — Logo polish: bigger tiles, no more fake globes (PR **#332**)

Owner: "logos are too tiny, and a lot are missing." Root cause for "missing": Google s2 favicons **never 404** — it redirects to a generic globe for dead/naive-slug domains, which loaded "fine" and read as a useless logo. Fixed by switching the chain to **unavatar.io (`?fallback=false`, returns real 404) → DuckDuckGo icons → monogram**, and dropping numeric tokens from slug fallback ("6221 Roche…" → roche). Verified with curl: unavatar 200s for all curated real domains (pwc, ti, hcltech, sc, jpmorganchase, roche, bmc…) and 404s for dead ones. Bumped tile sizes: MatchCard 18→24, job detail/explore header 16→24, explore list 16→20, ReferralRadar 12→16, Dream Alerts 14→18.

### Follow-up — Freshness checkboxes for Last 6 / 12 hours (PR **#330**)

Owner asked for "show jobs from the last 6 / 12 hours" in Filters. Added `6h` (0.25d) and `12h` (0.5d) to `FRESHNESS_TICKS` — the checkbox list renders them automatically, `freshnessWindowDays` (widest wins) and the fractional-day cutoff already handle sub-day windows, and the filter chip now uses a new `freshnessLabel` helper instead of a hardcoded 1/7/30 switch. Freshness ticks still clear `expired`.

### Follow-up — "Newest" now means when the match was added (PR **#329**)

After #328, owner still saw "results of 1 day ago". Logged into the live account (admin-generated magic link → session cookie) and confirmed: slider at 50, Inbox 235 — the 14 fresh matches (scores 50–68) ARE in the list, but the default **Highest score** sort leads with old 90s from 6/4 days ago, and **Newest** sorted by the job's `fetched_at` (never refreshed on upsert) so a match created 3h ago showed "1 day ago". Owner chose: **Newest = when the match was added to the dashboard.**

- `sortMatchesByFreshness` + `applyMatchSort('posted')` now rank by `matches.created_at` desc (tie → score).
- `MatchCard` clock + tooltip use `matchListingIso` = later of match `created_at` and `jobListingTime` (fresh scan results read "3 hours ago", not "1 day ago").
- `createdAt` threaded from `MatchList`; tests updated (`match-sort.test.ts`).

### Follow-up — dashboard empty state lied about kept matches (PR **#328**)

While verifying #326, owner saw Stats "Recent scans" = **14 kept** from the 01:55Z cron run but an empty dashboard. RCA: the score slider was at 70+ in the URL; the scan saved those 14 matches at scores 50–68 (profile floor 50), so `min=70` filtered them all out — correct behavior, but the empty state said "No matches in inbox yet" because `hiddenBelowThreshold` was only set when `totalInFilter > 0 && matches.length === 0`, which is **never true** (count>0 ⇒ page non-empty). The "N matches hidden below your threshold" message + "Show all scores anyway" button were unreachable dead logic.

**Fix:** in `DashboardMatchResults`, when the scored query returns 0, run a cheap `head` count of matches under the *same* filters (status/freshness/city/q/remote) **without** the score floor; if > 0, pass it to `EmptyMatches` so it explains "N matches are hidden because their scores are below your threshold of X" with a one-click `min=0` escape. Verified no data bug: for all 6 profiles in that run, every kept match passes the default dashboard query.

### Key decisions / gotchas

1. **Never starve new users** — the cron scans newest profiles first. If the job can't finish, the *oldest* accounts are deferred (logged), not the new ones.
2. **Keep `MULTI_PROFILE_RUN_CAP_MS` in sync with `ingest.yml` `timeout-minutes`** — the cap exists so the run finalizes (writes status) before the job timeout instead of leaving a `running` row.
3. **Per-profile budget is now inherited** — `runIngest` honors `opts.wallBudgetMs ?? INGEST_WALL_BUDGET_MS` at all three budget checks (embed loop, scoring loop, JD-fetch margin `wallBudgetMs - 25_000`).
4. **Do not re-add `INGEST_PROFILE_EMAIL` to `ingest.yml`** — that secret is owner-only debug; it makes the cron skip every other user (the pre-#324 behavior that hid this).
5. **This is still the per-profile loop** — Phase 3's shared fetch/embed-then-score split is the real scale fix once onboarded profiles exceed ~22 (180 min / 8 min per profile).

## Session 33 — Hyred Lime chrome, premium selects, filter slider (Aug 16, 2026)

**Goal:** Logged-in UI is CareerFlow *structure* with Hyred facts: forest `#003F3B`, lime `#72D35F` accent only, white canvas, grey cards, Inter. No CareerFlow name, no fake salaries/applicant counts. Filters and chrome match that world; native OS dropdowns and a scrolling filter column were the leftover cheap bits.

### Shipped — App chrome + dashboard listing (PRs **#304–#309**)

| PR | What |
|---|---|
| **#304** | Forest filter slab + listing layout vs leftover lime SaaS chrome. |
| **#305** | Card depth, lime score tile, skill CTAs restored. |
| **#306** | White page / grey cards, **see more** (not CSS clamp), missing-skills chips when list query has no JD (`enrichMatchListSkills` must not wipe `missing_skills` if JD is null). |
| **#307** | One floating pill header on every logged-in page (`AppShell`); `PageHeader`; no left icon rail; Apply profile in nav. |
| **#308** | Scan live HUD — radar pill **bottom-right** (phone: above dock). Run Scan stays in the pill menu. Page stays clickable. Stop on the pill. |
| **#309** | Sliding lime pill on the header so every tab stays visible. |

### Shipped — Controls + filters (PRs **#310–#316**)

| PR | What |
|---|---|
| **#310** | React Bits `SpecularButton` (`ogl`) on **Run Scan** only — forest fill, lime rim shine. Not on every job card (WebGL cost). Reduced-motion skips the canvas. |
| **#311** | Agent rule: **always push** after a commit (then PR → merge). |
| **#312** | `PremiumSelect` — custom listbox (portal menu, keyboard, typeahead) on filters, Apply profile, Dream alerts, Admin. Replaces native OS `<select>` popups. |
| **#313** | **Sort by** above the job cards (`MatchSortBar`). Removed sort from Filters. Cards FLIP-slide (`lib/match-list-flip.ts`). |
| **#314** | Dropped A–Z. **Newest** = later of a sane employer `posted_at` and `fetched_at` (`lib/job-listing-time.ts`). Ignore future posted dates; ancient posted loses to a recent discovery. Card clock uses the same date. |
| **#315** | Filters top: **match-score slider** (`min`) + **freshness ticks** Last 24 hours / This week / This month (`fresh=1d,7d,30d`, widest tick wins). Default with no ticks = 45-day `jobFreshnessOrFilter`. Include older jobs (`expired=1`) still under the ticks. Taller forest slab. |
| **#316** | Filters **sticky** (`lg:sticky lg:top-24` on the column wrapper, fixed viewport height). Do **not** `self-stretch` the slab to the card list height — that made it scroll away with the jobs. |

### Key decisions / gotchas

1. **Lime never fills the filter slab** — forest `#003F3B`, white labels; lime only on slider fill, checked ticks, and small accents.
2. **One WebGL button** — SpecularButton is Run Scan only.
3. **`fresh` vs `expired`** — ticks set a tighter cutoff via `dashboardFreshnessCutoffIso` / `freshnessWindowDays`. `expired=1` still skips the window entirely. Ticking freshness clears `expired`.
4. **Sticky filters** — pin the *wrapper*, give the aside `h-[calc(100vh-7.5rem)]` + internal scroll. Stretching the aside with the match list breaks sticky.
5. **Missing skills on the list** — if the list query has no JD, keep stored `missing_skills`; don’t run the JD-null enrich wipe.
6. **Do not sort Newest on raw `posted_at` DESC.** Job APIs send null / 2019 / future dates → list scrambled vs the card. Use `jobListingTime` / `sortMatchesByFreshness`. Pagination still orders `fetched_at` desc, then each page (and the loaded list) is re-ranked. Default sort stays **Highest score**. Sort is not a filter.

## Session 32 — Dashboard freshness, filter UX/perf, keyword close-match, LinkedIn recruiting (Aug 10, 2026)

**Goal:** Stop double-toast scan noise; make Optimize keywords honest (green/amber/red); fix LinkedIn recruiting search; speed up dashboard filters; stop cities like Noida vanishing when APIs write bad `posted_at`; let users opt in to older/expired jobs.

### Shipped — Scan toast + keyword chips + outreach

| PR | What |
|---|---|
| **#282** | Scan UI — one compact progress toast; empty inbox “Finding jobs…” while scanning (no stacked long toast). |
| **#283** | Scan toast copy — real en-dash / middle-dot chars (not literal `\u2013` / `\u00B7`). |
| **#284** | Optimize keywords — `keywordCloseInText` + GET `closeHave`; green exact / amber close / red missing + legend. ATS score stays **exact-only**. |
| **#285** | Amber chips use `orange-*` (theme remaps `amber` → teal). |
| **#286** | LinkedIn Recruiting team search — quoted company + role OR group; safe `%22` encoding; **no** 1st/2nd network filter. `lib/linkedin-people-search.ts`. |

### Shipped — Dashboard filter UX / performance

| PR | What |
|---|---|
| **#287** | Filter changes keep the list visible with a small “Updating…” instead of a full-page skeleton. |
| **#288** | `MatchList` client-fetches `/api/matches` on filter change; slim `MATCH_LIST_SELECT` (no JD body); don’t await `closeStaleIngestRuns`; pass `topSkills` from page. |

### Shipped — Freshness / expired jobs (Noida RCA)

| PR | What |
|---|---|
| **#289** | Freshness = (`posted_at` fresh **or** null) **OR** `fetched_at` within 45 days (`jobFreshnessOrFilter`). City list orders by `fetched_at` desc. Stop refreshing `fetched_at` on job upsert in `lib/ingest.ts`. |
| **#290** | **Include older jobs** — URL `expired=1` skips the 45-day window on counts / cities / list / API. `MatchFilters` freshness dropdown; **Older** badge on cards past the window. Helpers: `includeExpiredJobs`, `isJobPastFreshnessWindow`. |

### Key decisions / gotchas

1. **UI date ≠ hide filter** — cards show `fetched_at`; hide used to key off `posted_at` only. JobsPipe/etc. can upsert ancient/wrong `posted_at` → job + city disappear while the card still looked “recent.” Always use `jobFreshnessOrFilter` (posted fresh/null **or** fetched within window).
2. **Do not bump `fetched_at` on conflict upsert** — re-scanning must not rewrite discovery time (reinforces older Session 5/20 omit-`fetched_at` rule).
3. **`expired=1` cannot resurrect deleted rows** — stale-job cleanup that hard-deletes jobs older than the window leaves nothing to show; filter only unhides stored matches outside the recent window.
4. **Close-match aliases stay tiny** — `KEYWORD_CLOSE_ALIASES` / morphology in `keywordCloseInText`; do not grow a synonym zoo. Amber never inflates ATS Match Score.
5. **Theme:** prefer `orange-*` for “amber” UI; Tailwind `amber` is remapped to teal in Hyred tokens.

## Session 31 — ATS report polish + semantic section mapping (Aug 6–7, 2026)

**Goal:** Stop the endless “one more heading synonym / dictionary patch” loop. Make the hybrid report consistent at volume (100 scans/hour mindset): hard facts stay code; odd headings map by meaning in the **same** LLM call; never let a weak LLM map wipe stronger token facts.

### Shipped

| PR | What |
|---|---|
| **#271** | Report polish — Skill Evidence aligned with gated skills; Involved-in content dedupe; Credibility sync; empty-state tips instead of misleading “Not found”; richer Working well chips. |
| **#272** | Cursor user-global rule `run-commands-yourself` (moved out of repo → `~/.cursor/rules`). |
| **#273** | False positives from Shashank Kukreti review — Educational Qualification tokens, Lead/Leading leadership, LinkedIn-only contact tip, no green JD without JD, Vague↔Impact quote dedupe. |
| **#274** | **Semantic section mapping** — `semantic-sections` in same `ats_semantic_review` call; grounded heading quotes; token fallback on short headings that *contain* experience/summary/expertise/… (not company-name synonym lists). |
| **#275** | **Merge LLM map ∪ token facts** — incomplete LLM section map must not wipe Skills/Summary the token layer already found (Ankit live regression). |

### Key decisions / gotchas

1. **No new “add this heading synonym” PRs** — odd headings → `semantic-sections` (+ token contains for structural). Company-prefixed titles (`Accenture Experience`) and typo headings (`PROFFESSINAL SUMMARY`) are meaning problems, not dictionary growth.
2. **One LLM call** — section mapping folds into existing Layer B JSON (`sections_mapped`). Do not add a second round-trip for 100/hr cost/latency.
3. **Union merge** (`mergeSectionChecks`) — LLM headings win when grounded; token `fact-sections` fill gaps. Preferring LLM alone caused Ankit Skills/Summary false-miss.
4. **Real absences still fail** — Ankit with no email/phone/education/dates correctly stays low score; only false “section missing” was the bug.
5. Open follow-ups (not shipped): PDF bullet soft-detect, jargon-safe spelling (e.g. “Comar”), ageism empty-state when DOB *was* found.

## Session 30 — ATS scan report UX + evidence-grounded hybrid engine (Aug 3–6, 2026)

**Goal:** Make the post-scan ATS report feel like a premium product (Enhancv-level detail, real resume evidence, proper CTAs), then stop fixing accuracy with brittle dictionaries — rebuild scoring as facts + LLM + quote grounding so false passes/fails cannot slip through.

### Shipped — Report UX & dynamic evidence (Aug 3–5)

| PR | What |
|---|---|
| **#266** | Red resume evidence on scan report — priority findings with quotes + side-by-side highlighted resume preview; removed redundant “Detailed findings” bars/accordion. |
| **#267** | Enhancv-level full report — dynamic per-resume checks (repetition, spelling dictionary era, contact extraction, essential sections), sticky score rail, category containers, expandable check cards with education/passText. |
| **#268** | Premium card UI — Executive/Bento layout on Luminous tokens: KPI tiles, elevated check cards with score bars, document-style resume panel, teal-gradient CTA (content unchanged). |

### Shipped — Evidence-grounded hybrid engine (Aug 6, PR **#269**)

Replaces “add one more word to the spelling list” as the accuracy strategy.

| Layer | Module | Role |
|---|---|---|
| Parse | `lib/ats-resume-parse.ts` | Ligature normalize, contact/sections/bullets/date tokens |
| A — Facts | `lib/ats-fact-checks.ts` | Deterministic only (contact, sections, bullets, MM/YYYY OK, length, file/parse) |
| B — Semantic | `lib/ats-semantic-review.ts` | LLM JSON review (spelling, skills, impact, repetition, template junk, truncated lines, verbs, JD) |
| C — Gate | `lib/ats-consistency.ts` | Drop ungrounded quotes; forbid `pass` when any `foundItem` fails |
| Orchestrator | `lib/ats-evidence-engine.ts` | `runEvidenceGroundedAts` / `runStructuralAts` → `AtsCheckResult` + gated `AtsReport` |

**API / UI wiring:** `POST /api/ats-checker` — logged-in → `engine: hybrid` (facts + LLM + gate); anonymous public widget → `engine: structural` (facts + gate, zero LLM). Response includes `report` + normalized `resume_text`. `AtsScanReport` / `AtsPublicReport` prefer server `report` when present.

**Fixtures / tests:** `tests/fixtures/ats-resumes/` (Akansha original, clean-strong, nearly-empty, template-junk) + `tests/unit/ats-evidence-engine.test.ts` (grounding, LinkedIn warn-not-pass, MM/YYYY pass, hybrid with injected semantic).

### Key decisions / gotchas

1. **No more dictionary patches as product strategy** for spelling/skills/vague language — those live in Layer B with mandatory exact resume substrings; ungrounded claims are dropped.
2. **Public free tool stays structural** (cost). Same gate still kills contradictory UI (e.g. LinkedIn missing + “No issues”).
3. **MM/YYYY and Month YYYY are both valid** in Layer A — do not reintroduce “years only” false warns for `11/2022 - Present`.
4. **Legacy** `checkAtsCompatibility` / `buildAtsReport` still power Fix Studio scores and premium locked categories; free Content/Sections/ATS Essentials on hybrid come from gated checks.
5. **Session 29 note #4** (deterministic-only engine gap) is closed for logged-in scans by this hybrid path.

## Session 29 — Dashboard city filter + ATS Fix Studio (suggest/apply, paywall, real-resume preview) (Aug 1, 2026)

**Goal:** Let users filter matches by city; build a NextRaise/Resume-Worded-style "fix my resume after the ATS score" loop on `/ats-checker`, make it production-grade, wire it for a future paywall, and show the user's real CV (not a text dump) in preview.

### Shipped — Dashboard city location filter

| PR | What |
|---|---|
| **#235** | Location dropdown lists cities found in current matches; selecting one filters list + tab counts + infinite scroll. `lib/match-location-filter.ts` (`extractCityLabel`, `uniqueCitiesFromLocations`, `sanitizeCityFilter`), `listMatchCities()` in `lib/match-stats.ts`, `city` param through `page.tsx` / `DashboardMatchResults` / `MatchList` / `GET /api/matches`. Remote-only vs city are mutually exclusive in `MatchFilters`. |

### Shipped — ATS Fix Studio (weakness → AI suggest → regenerate → apply → live re-score)

| PR | What |
|---|---|
| **#236** | Core Fix Studio. `lib/ats-fix.ts` (weakness list, snippet-range apply/undo), `lib/ats-fix-suggest.ts` (LLM patches, truth-preserving), `POST /api/ats-fix` (auth + `resume_studio` quota), `AtsFixStudio.tsx` 3-pane UI on `/ats-checker`; checker API returns `resume_text` for uploads. |
| **#237** | Production UI polish — product header, responsive issue rail + rewrite/preview workspace, paper-style preview, better empty/loading/error states, a11y focus. |

### Shipped — Paywall-ready (shared Resume Studio credits)

| PR | What |
|---|---|
| **#238** | Shared `PremiumUpgradePanel` (`app/_components/`), Fix Studio hard-wall at 0 credits (with score-lift proof), always-visible credit meter, new `/settings` page (plan + usage), `GET /api/premium/usage`, Premium-only `POST /api/profile/resume` (save fixed resume to profile). Free `resume_studio` = **3 lifetime** until Stripe cycles (`quotaWindowKind('free','resume_studio') === 'lifetime'`). Upgrade CTAs → `/settings?upgrade=resume_studio`. Public widget → "Sign in to open Fix Studio". Sidebar Settings now → `/settings` (was `/apply-profile`). |

### Shipped — Real resume preview (not a text dump)

| PR | What |
|---|---|
| **#239** | `lib/resume-document.ts` parses resume text → structured doc (name, contact, sections, entry headings, bullets, skills) preserving char offsets; `ResumeDocumentView` renders a formatted document; edits highlight in place via `lineIsHighlighted`. Handles stray `RESUME`/`CV` titles, `Name:`/`Email:`/`Ph. No:` fields, all-caps names. |
| **#240** | Original tab renders the **actual uploaded file** — PDF via `iframe`, image inline (object URL held in `page.tsx`, revoked on reset). `.docx`/pasted text fall back to the formatted view. |
| **#241** | Fix Studio opens on the **Original** tab by default when an uploaded file exists (users reported still seeing the re-rendered "Updated" view first). |

### Key decisions / gotchas

1. **Shared credit pool:** Fix Studio generate/regenerate **and** job-detail tailored resume both consume 1 `resume_studio` event. Apply/undo/copy are free. One meter in `/settings`.
2. **Free window is lifetime, not monthly** until Stripe exists — product copy says "3 free"; code counts all events for free `resume_studio`.
3. **`.docx` originals** can't render client-side — would need server-side PDF conversion (not built).
4. **Deeper gap (closed in Session 30):** scoring was deterministic-only `checkAtsCompatibility`. Logged-in scans now use the evidence-grounded hybrid engine (PR **#269**) — facts + LLM semantic + quote gate. Public free tool remains structural.
5. **Branch/PR:** repo enforces `cursor/<name>-7446` branch prefix for agent PRs; merge is squash + delete, mark draft PRs ready before merge.

## Session 28 — Job APIs, location filters, Dream Company, LLM scale (June 21, 2026)

**Goal:** Ship paid ingest sources with admin key management; fix JobsPipe country filtering for all users worldwide; Dream Company alerts Phase 1–2; distributed LLM rotation for multi-user scale.

### Shipped — Job APIs & Admin

| PR | What |
|---|---|
| **#210** | JobsPipe ingest source + Admin Center key storage (`api_keys.jobspipe`) |
| **#211** | Paginated Job API usage dashboard (date range, per-key rows) |
| **#212** | JobDataLake ingest source + bulk key paste in Admin |
| **#213** | Split `getConfiguredJobApiKeys` → `lib/job-api-keys-server.ts` (client imported `supabase/server`) |
| **#214** | `server-only` hardening: `lib/supabase/admin.ts`, `lib/job-api-usage-types.ts` |

### Shipped — JobsPipe + location-aware country filters

| PR | What |
|---|---|
| **#215** | Map JobsPipe `title` field (not only `job_title`); clearer zero-fetch errors |
| **#216** | JobsPipe GET `/v1/jobs` attempt + role-title queries via `buildJobsPipeQueries()` |
| **#217** | `lib/job-country-codes.ts` — derive ISO codes from user `preferences.locations` + resume `current_location` (not hardcoded `IN`) |
| **#220** | `lib/data/job-location-dictionary.ts` — 400+ cities, country aliases, region expansion (North America → US/CA/MX, etc.) |
| **#222** | **Every JobsPipe POST** includes `job_country_code_or` from user countries; dropped broken GET `/v1/jobs` (404); `posted_at_max_age_days: 30` |

### Core logic — JobsPipe scan (keep)

1. **`lib/sources/index.ts`** — `buildJobCountryCodes(preferences, insights)` → passed as `countryCodes` to JobsPipe + JobDataLake + JSearch.
2. **`buildJobsPipeQueries(searchProfile, searchKeywords)`** — uses `titlePatterns` + `primaryDomain` + a few `searchKeywords` (max 6). **Not** raw single-tool queries like `"JMeter"` alone.
3. **`fetchJobsPipe()`** — batched `POST /v1/jobs/search` with `{ job_title_or, job_country_code_or?, posted_at_max_age_days, limit }`. Per-title POST fallback if batch &lt; 10 rows. **No GET** (endpoint returns 404 on JobsPipe).
4. **Remote-only** users → `countryCodes` undefined → global search (no `job_country_code_or`).
5. **Adzuna** stays `adzuna_in` (India path only) — separate from user country resolution.

### Manual test (JobsPipe)

```powershell
$body = '{"job_title_or":["software engineer"],"job_country_code_or":["IN"],"limit":5}'
Invoke-RestMethod -Uri "https://api.jobspipe.dev/v1/jobs/search" -Method POST `
  -Headers @{ Authorization = "Bearer $KEY"; "Content-Type" = "application/json" } -Body $body
```

Niche titles (e.g. `performance test engineer` + `IN`) may return **0 rows** — JobsPipe index gap, not Hyred mapping.

### Shipped — Dream Company Job Alerts

| PR | What |
|---|---|
| **#221** | Phase 1 MVP — migration **0016**, `/dream-alerts`, ingest hook |
| **#223** | Phase 2 catalog (500+ cos), manual add, admin requests |
| **#224** | Instant catalog search (TCS aliases) |
| **#225** | Add dream company without migration 0017 columns (compat) |

**Manual:** run migrations **0016**, **0017** in Supabase. Doc: `docs/features-jun26-to-be-built.md` §4.8.

### Shipped — LLM rotation / multi-user scale

| PR | What |
|---|---|
| **#226** | Cerebras-first LLM rotation + UTC daily key reset |
| **#227** | Bluesminds budget by **requests** not raw LLM tokens (`PROVIDER_BUDGET` in `lib/llm-keys.ts`) |
| **#228** | Distributed LLM runtime — migration **0018** (`llm_key_runtime`, `llm_chat_semaphore`, RPCs); `lib/llm-key-runtime.ts`, `lib/llm-concurrency.ts` for Vercel-safe cross-instance cooldowns |

**Manual:** run migration **0018** after **0009** for multi-instance RPM cooldowns + global in-flight cap.

### Also same day (UI / premium polish)

PRs **#201–#209** — verdict/prep new-tab links, resume PDF preview, job detail collapsibles, dashboard viewed-card contrast. See Session 27 for premium APIs.

**Doc pointer:** `CONTEXT.md` → `### 5. Paid job APIs & location filters`, `### Dream Company Job Alerts`; `AGENTS.md` Index rows; `lib/sources/jobspipe.ts`, `lib/job-country-codes.ts`.

---

## Session 27 — Premium Tier 1 (Match Intelligence, Interview Prep, Resume Studio Pro) (June 20, 2026)

**Goal:** Ship Tier 1 premium features from locked roadmap (`docs/features-jun26-to-be-built.md`) — entitlement layer + three job-detail capabilities + UI. Orchestrator + subagent execution on branch `feat/tier-1-premium-features`.

### Shipped

| Area | What |
|---|---|
| **Migration 0015** | `premium_subscriptions`, `premium_usage_events`, `resume_versions`, `match_verdicts`, `interview_prep_packs` |
| **`lib/premium.ts`** | `getPremiumAccess`, `requireFeatureAccess`, `recordFeatureUsage`, per-plan quotas |
| **Match Intelligence** | `lib/match-intelligence.ts`, `GET/POST /api/match/[id]/verdict` — Apply/Stretch/Skip + seniority fit |
| **Interview Prep Pack** | `lib/interview-prep.ts`, `GET/POST /api/match/[id]/prep` — questions + STAR hints |
| **Resume Studio Pro** | Quota gate + `resume_versions` insert on `POST /api/match/[id]/resume`; version list on GET |
| **Job detail UI** | `JobActions.tsx` — verdict card, prep card, resume version history, 402 premium toasts |
| **Tests** | `tests/unit/premium.test.ts`, `match-intelligence.test.ts`, `interview-prep.test.ts` (13 passing) |
| **Docs** | `docs/features-jun26-to-be-built.md`, `docs/superpowers/plans/2026-06-20-tier-1-premium-features.md` |

### Free vs premium quotas (locked)

| Feature | Free | Premium |
|---|---|---|
| `interview_prep` | 1 lifetime | 8/billing cycle |
| `match_intelligence` | 0 (locked) | 9999/cycle |
| `resume_studio` | 3/month | 40/cycle |

### Design notes (keep)

- **No Stripe yet** — premium via manual `premium_subscriptions` row for dev; production billing is Tier 2+ roadmap work.
- **Verdict GET** — `locked: false` when user can generate (premium); free users get locked preview.
- **`lib/gemini.ts`** — `chat()` exported for interview prep (was module-private).
- **Manual step:** run migration **0015** in Supabase before live testing.

**Doc pointer:** `CONTEXT.md` → `### Premium Tier 1`; `AGENTS.md` Index row; `docs/features-jun26-to-be-built.md`.

---

## Session 26 — Doc system bridge audit (June 20, 2026)

**Goal:** Fix broken grep targets and missing Index rows so multi-agent handoffs (Cursor, Claude, Kiro, Antigravity) find the right CONTEXT section without re-explaining the product.

### Shipped

| Change | What |
|---|---|
| **`## Key Architecture Decisions`** | Restored missing `##` heading above AI pipeline subsections (was orphan `### 1–4` — agents grepping the Index found nothing) |
| **`## Core App Features`** | New section: job detail, onboarding, Top MNC, import, outreach, apply profile |
| **`AGENTS.md` Index** | Rows for job detail, onboarding, Top MNC, import, outreach, cover letter, apply profile |
| **Tier 3 Read Protocol** | Fixed stale pointer ("bottom of CONTEXT.md") → `docs/context/session-log.md` |
| **File Map** | Added `lib/ats-checker*`, `lib/top-companies.ts`, onboarding/top-mnc/import/ats-checker routes, outreach + import-job APIs |
| **Sessions 17–18** | Backfilled ATS Checker PR #129 history stubs in session-log |

**Doc pointer:** `AGENTS.md` Index; `CONTEXT.md` → `## Key Architecture Decisions`, `## Core App Features`.

---

## Session 25 — ATS Checker v9 accuracy + public widget parity (June 18, 2026)

**Goal:** Raise free ATS Checker from ~7/10 to ~9/10 — fix keyword false positives, India contact gaps, length over-penalty, public widget feature drift.

### Shipped

| PR | What |
|---|---|
| **#187** | `keywordInText()` word-boundary matching; JD alias equivalents; India phone/location/names; length bands for concise resumes; colon-tolerant headers; `lib/ats-checker-samples.ts`; public `AtsCheckerWidget` paste + Try sample + full file types + JD match display; 55 tests |

### Design notes (keep)

- **Still zero LLM** — heuristic coach, not a real Workday/Greenhouse parser simulator.
- **Public + logged-in share engine** — app page keeps radar/history; widget uses same API.
- **Sample resume** — India perf engineer (`ATS_SAMPLE_RESUME`) scores ~78, JD match ~92% on bundled JD.

**Doc pointer:** `CONTEXT.md` → `## ATS Resume Checker`; `AGENTS.md` Index row. Context docs for v9: **PR #188**.

---

## Session 24 — Extension Tier B custom forms (beta) + GlobalLogic (June 20, 2026)

**Goal:** Long-tail custom career pages (WordPress/jQuery, e.g. GlobalLogic) — partial autofill with shared **form skeleton** (structure only, no cross-user PII). Simplify skips these sites; Hyred tries with **Autofill (beta)** UX.

### Shipped

| PR | What |
|---|---|
| **#185** | Migration **0014** (`domain_form_templates`, `domain_form_captures`); APIs `GET/POST /api/extension/form-template/*`; `mapFormFieldsSemantic`; `extension/tier-b-form.js`; `fillCustomFormTierB`; extension **v0.16.0**; bundles structural RCA **v0.15.0** |
| **#186** | GlobalLogic fix: `findNativeSelectForControl`, discover selects first, experience bucket matching; **v0.16.1** |

### Design decisions (keep)

- **Passive capture on form load** — not on submit; stores labels, widget kinds, dropdown option text only.
- **LLM once per layout** — semantic keys only (`mode: 'semantic'`); profile values resolved in extension via `lib/extension/form-template.ts`.
- **Quorum 3 reporters** before `active` template; `draft` OK for single user.
- **Beta product stance** — partial fill acceptable; copilot shows "Autofill (beta)"; no auto-submit.

### RCA notes (GlobalLogic IRC289549)

- Test before API deploy → 404, empty DB — fixed by shipping #185 first.
- Gender/notice failed: div-click triggered `common.js` `.trim()` on undefined — fixed by setting hidden `<select>.value` (#186).

**Doc pointer:** `CONTEXT.md` → `### Tier B — custom career forms (beta)`; `AGENTS.md` Index rows.

---

## Session 23 — Extension Auth Flow Overhaul: Auth Tab Flow + Cookie Fallback + Popup Redesign (June 15, 2026)

A debugging session focused on getting the Chrome extension popup to auto-connect when the user is logged into hyred.in. The popup kept falling back to the APP_PASSWORD setup form. Built a multi-pronged auto-connect pipeline and a proper Connect-to-Hyred button flow.

### (a) Problem: auto-connect silently fails → shows APP_PASSWORD form

When the user opens the extension popup, `tryAutoConnect()` runs:
1. Check for stored JWT → verify it
2. If no stored token → `sendBg('getCookieToken')` → background.js tries:
   - **Strategy A:** Find open hyred.in tab → inject MAIN-world script → read `localStorage` for `sb-{ref}-auth-token` → extract `access_token` → exchange via `/api/extension/exchange`
   - **Strategy B:** Read Supabase session cookies via `chrome.cookies.getAll({ domain: 'hyred.in' })` → parse URL-encoded JSON → extract `access_token` → exchange
3. If both fail → show APP_PASSWORD setup form

Both strategies were failing for the user, so auto-connect always fell through to the setup form.

### (b) What was built

#### New: `app/auth/extension/route.ts` — Server-side auth page

A route handler that:
- Checks the Supabase session from cookies via `createServerSupabase()`
- If authenticated: generates a 90-day extension JWT via `signExtensionToken(profile.id)`
- Returns an HTML page that writes the JWT to `localStorage.hyred_extension_token`
- Shows "✅ Connected!" UI
- If not authenticated: shows "Please log in" with a link to `/login?next=/auth/extension`
- `dynamic = 'force-dynamic'` to prevent caching

Uses `JSON.stringify(token)` to safely embed the token in the `<script>` tag (avoids injection). The localStorage write is wrapped in try/catch.

#### Updated: `extension/background.js`

Added:
- **`extractTokenFromCookies()`** — new fallback function that uses `chrome.cookies.getAll({ domain: 'hyred.in' })` to read the Supabase session cookie (`sb-{ref}-auth-token`), decodes the URL-encoded JSON value, and extracts the `access_token`. No open tab needed.
- **`connectExtension()`** — new handler for the auth tab flow:
  1. Opens `https://hyred.in/auth/extension` in a new tab
  2. Registers `chrome.tabs.onUpdated` listener for that tab
  3. On `status === 'complete'`, waits 500ms for page JS, then injects MAIN-world script to read `localStorage.hyred_extension_token`
  4. If found: saves `{ jr_url: DEFAULT_URL, jr_token }` to `chrome.storage.local`, closes the tab, resolves with the token
  5. 30-second timeout
- Updated `getCookieToken` handler to try tab localStorage → cookie fallback → exchange

#### Updated: `extension/popup.js` + `extension/popup.html` + `extension/popup.css`

Redesigned the popup flow:
- On auto-connect failure, shows a **"Connect to Hyred"** button (primary flow) instead of the APP_PASSWORD form
- Clicking it calls `initiateConnect()` which fire-and-forgets `sendBg('connectExtension')` to background.js, then polls `chrome.storage.local` every 2s for 30s for the token
- Once the token appears, calls `refreshConnected()` to fetch the profile and show connected state
- Small "Use app password instead" link at the bottom shows the old setup form
- "Back" button on setup form returns to the connect-intro page
- **Critical fix:** `sendBg('connectExtension')` is fire-and-forget (not awaited) so the popup stays responsive during the 30s tab flow
- Error messages properly cleared when navigating between views
- Timeout aligned: both background (30s) and popup (30s = 15 × 2s)

### (c) New auto-connect pipeline (tried in order)

1. **Stored JWT** — verify existing token
2. **Tab localStorage** — inject MAIN-world script into open hyred.in tab, read Supabase session from localStorage
3. **Cookie extraction** — read Supabase session cookie via `chrome.cookies` API
4. **Connect button** — user clicks → opens auth tab → server checks session → writes JWT to localStorage → extension reads it
5. **APP_PASSWORD form** — last resort fallback

### (d) Files changed

| File | Action | What |
|---|---|---|
| `app/auth/extension/route.ts` | **NEW** | Server-side auth page — checks session, signs JWT, writes to localStorage |
| `extension/background.js` | **Updated** | Added `extractTokenFromCookies()`, `connectExtension()` handler, updated `getCookieToken()` |
| `extension/popup.js` | **Rewritten** | "Connect to Hyred" primary flow, polling, fire-and-forget bg message |
| `extension/popup.html` | **Updated** | New `#connect-intro` section, `#setup` starts hidden |
| `extension/popup.css` | **Updated** | New styles for `.status-msg`, `.alt-row`, `.btn-link` |
| `docs/context/session-log.md` | **Updated** | This entry |

### (e) What was tested

The Connect button flow was tested and WORKS! User clicks "Connect to Hyred" in popup → opens tab at hyred.in/auth/extension → server checks session → writes JWT to localStorage → background.js reads it → saves to chrome.storage → popup shows connected with profile info. Autofill on real job pages not yet tested.

### (f) Deferred / known issues

| Issue | Detail |
|---|---|
| **Auto-connect still fails** | Both tab-localStorage and cookie strategies silently fail for the user. Root cause unclear — may be `@supabase/ssr` v0.10.3 cookie format not matching expected pattern, or the cookies simply don't exist yet |
| **Connect button** | ✅ Works - test the autofill on a real job page next |
| **Auth page not deployed** | `app/auth/extension/route.ts` is on the filesystem but hasn't been committed/pushed/deployed to hyred.in yet |
| **`chrome.cookies.getAll` domain matching** | The function uses `{ domain: 'hyred.in' }` — this might not match `.hyred.in` (with dot prefix) correctly in all Chrome versions |
| **No profile in connectExtension response** | The `connectExtension` handler returns `{ ok: true, data: { token } }` without the profile. The popup fetches profile separately via `refreshConnected()` → `fetchJson(/api/extension/profile)`. This works but adds an extra API call |
| **No localhost support** | The auth tab flow hardcodes `DEFAULT_URL = 'https://hyred.in'`. Developers running locally can't use auto-connect |

### (g) Research findings (how other extensions handle auth)

Research on Simplify Jobs, Copilot, and other job autofill extensions revealed the standard pattern:
- **Cookie-based sharing** via `host_permissions` — the extension's background service worker makes credentialed API requests to the platform's backend, and the browser automatically attaches session cookies
- **OAuth 2.0** via Chrome Identity API for third-party services
- Most extensions do NOT use localStorage injection or manual cookie parsing
- The standard pattern is: open auth tab → user is already logged in → server generates token → extension reads it

### Next steps (for the next session)

1. **Commit and push all changes** — `app/auth/extension/route.ts`, `extension/background.js`, `extension/popup.js`, `extension/popup.html`, `extension/popup.css`, `docs/context/session-log.md`
2. **Deploy to Vercel** — push to main → auto-deploy to verify `/auth/extension` page works
3. **Reload extension** — go to `chrome://extensions` and refresh Hyred Autofill
4. **Test the Connect button** — click "Connect to Hyred" and see if the auth tab flow works
5. **If still failing** — check what `chrome.cookies.getAll({ domain: 'hyred.in' })` actually returns (use `chrome://settings/cookies` or DevTools on the background page)
6. **If cookies are empty** — check if `@supabase/ssr` v0.10.3 is actually storing sessions in cookies or only in localStorage


## Session 22 — AI Auto-Apply Strategic Plan & Architecture (June 15, 2026)

A strategy session focused on defining an AI-first, agent-driven auto-apply feature. No code changes — all planning and documentation.

### (a) Context: what already exists

The auto-apply pipeline was built in Sessions 3-4 (PRs #12-#13, #14-#22) but has **never actually worked end-to-end** due to two blockers:

| Blocker | Detail |
|---|---|
| **Render 512MB can't run Chromium** | Agent starts and silently crashes on real page loads. Needs $7/mo upgrade or alternative hosting. |
| **Callback 401** | `INGEST_SECRET` env var not synced between Vercel and Render, so agent can't report back results. |

The existing code is intact:
- `browser_agent/main.py` — FastAPI service using `browser-use==0.1.40` (ancient), Groq/OpenAI LLM, headless Chromium via explicit `BrowserConfig`
- `app/api/match/[id]/auto-apply/route.ts` — Orchestrates: generate ATS resume → upload PDF → generate cover letter → call Python agent → stream live logs
- `app/api/match/[id]/apply-callback/route.ts` — Agent callback on completion, updates match status
- `AutoApplyButton.tsx` — Terminal-style log panel with SSE streaming
- `/apply-profile` — Comprehensive form with 50+ fields (name, phone, email, essay answers, etc.)
- `apply_profiles` table, `auto_apply_*` columns on `matches`

### (b) Realization: AI-First, not scripted

The user correctly argued that hardcoded scripts per platform (Workday vs Greenhouse vs Lever) are the wrong approach. An AI agent with **vision + LLM** can handle ALL ATS platforms — it *sees* the form, understands what it's asking for, and fills it. One agent, all 500 Workday configs. The existing `browser-use` stack already takes this approach, but is pinned at v0.1.40 (ancient) and the agent prompt needs upgrading.

### (c) Research findings (web, June 2026)

**browser-use current state:**
- Current version well past v0.1.40 — now has cloud-native architecture, native profile syncing, session persistence, 2FA/TOTP handling, `@sandbox` decorators for production scaling
- Supports `Browser.from_system_chrome()` and `cloud_profile_id` for persistent authenticated sessions
- Has anti-bot protection, built-in proxy rotation for cloud browsers
- Can handle complex ATS via vision + ARIA tree processing

**Top ATS platforms (apply-flow complexity):**

| Platform | Complexity | AI-Agent Friendly? | Notes |
|---|---|---|---|
| **BambooHR** | Simple | ✅ Easiest | SMB-focused, simple forms, no login walls |
| **Lever** | Simple-Moderate | ✅ Most API-friendly | Has documented "Apply to a posting" API endpoint |
| **Greenhouse** | Moderate | ✅ Good | Well-documented REST API, structured forms |
| **iCIMS** | Moderate-Complex | ⚠️ Moderate | High flexibility → bloated forms if not managed |
| **Workday** | Most Complex | ❌ Hardest | Requires profile creation, complex DOM, iFrames, anti-bot |
| **SuccessFactors** | Complex | ❌ Hard | Enterprise-locked, complex architecture |
| **Taleo** | Complex | ❌ Hardest | Legacy, being replaced, outdated UI |

### (d) The plan: 4-phase rollout

**Phase 1 — Get the agent working on simple platforms** (first session)
- Upgrade `browser-use` from v0.1.40 to latest
- Solve the hosting problem: either upgrade Render to $7/mo or switch to a cloud browser service (Browserbase free tier, or self-hosted)
- Fix the callback 401 (sync `INGEST_SECRET` between Vercel and Render, or better: rename it to `APPLY_CALLBACK_SECRET` for clarity)
- Test on a simple BambooHR or direct career-portal apply page (no login needed)
- Keep the existing human-in-the-loop: agent pauses before submit, user reviews

**Phase 2 — Session persistence & login management**
- Store persistent Chrome profiles per user (via `Browser.from_system_chrome()` or `cloud_profile_id`)
- On first use, user logs into a platform (Workday, Greenhouse, etc.) through the agent → session saved
- Next apply: load saved session → logged in automatically
- Handle 2FA via TOTP secrets stored in user's apply profile
- No account creation flow yet — user provides their existing accounts

**Phase 3 — Complex platforms & edge cases**
- Workday/SuccessFactors/Taleo: agent navigates complex multi-step forms, handles iframes
- CAPTCHA handling: pause and notify user, let them solve it, agent continues
- Multi-page applications (screeners, assessments)
- Resume upload handling across all platforms

**Phase 4 — Account creation & scale**
- Agent detects "Create Account" vs "Sign In" — fills registration forms from apply profile
- Stops at email verification / CAPTCHA for user to complete
- Scales to multiple simultaneous users via queue + dedicated browser workers
- Monitoring dashboard: success rates, failure reasons, platform breakdowns

Full detailed plan added to `CONTEXT.md` → `## ⭐ ACTIVE INITIATIVE — AI Auto-Apply`. This is the new active focus.

### Files changed this session
- `CONTEXT.md` — added new ACTIVE INITIATIVE section with full auto-apply plan
- `docs/context/session-log.md` — this entry
- `AGENTS.md` — added index row for auto-apply section

## Session 21 — Ingest Debugging, Wall Budget RCA, and Complete Revert (June 15, 2026)

A debugging session focused on fixing manual scans that timed out after Session 20's wall-budget change. The chron ran fine on GitHub Actions (15-min timeout) but manual scans on Vercel Hobby (60s max) were falsely marked as "Timed out" with 0 scored.

### (a) Diagnostic endpoint & evidence-based RCA

**Problem:** Manual scans timed out with 0 scored while the cron (GitHub Actions, 15-min timeout) worked fine. Created a diagnostic endpoint at `/api/debug/last-ingest` that exposes real-time phase progress (fetched / embedded / scored / matches) + bottleneck analysis + last 5 scans with formatted errors.

**Evidence from the diagnostic:**
- Commit `0c8b361` introduced `INGEST_WALL_BUDGET_MS = 50000` (50s) to prevent Vercel Hobby hard-kill (Session 20 fix). But with a 50s budget, fetch alone took 120-150s, so the scoring loop's budget check fired immediately — 0 scored every time.
- Previous scans showed `embedded=300, scored=0` with bottleneck: "Scoring phase: jobs had embeddings but 0 were scored (pre-filter dropped all, or scoring failed)"
- Stale detection at 12 min (`INGEST_STALE_MS`) fired while scans were still running, falsely marking them as failed
- 3-second `SCORE_BATCH_DELAY_MS` was wasting ~36s per scan (optimized for Cerebras' 5 RPM, but current providers bluesminds/gemini/groq handle 30-50+ RPM)
- Admin backup/restore (Session 20) had wiped the DB, so all jobs needed re-embedding — slowing down every scan further

### (b) Attempted fixes (before full revert)

| Fix | Before | After | Rationale |
|---|---|---|---|
| `EMBED_PER_RUN` | 50 | 300 | Embed more jobs per scan |
| `EMBED_CONCURRENCY` | 6 | 15 | Faster parallel embedding |
| `EMBED_TIMEOUT_MS` | none | 180s | Don't let embed phase eat all runtime |
| `SCORE_BATCH_DELAY_MS` | 3,000ms | 500ms | Primary provider handles higher RPM — saves ~30s per scan |
| `INGEST_STALE_MS` | 12 min | 20 min | Don't falsely mark running scans as failed |
| `maxDuration` | 300s | ~~900s~~ **reverted** | Vercel Hobby caps at 300s — build error |

### (c) Full revert to yesterday's working state

User requested a complete revert to yesterday's code. Files were restored from commit `d438f63^` (Session 19):
- `lib/ingest.ts` — `INGEST_WALL_BUDGET_MS=260s`, `EMBED_PER_RUN=50`, `EMBED_CONCURRENCY=6`, `SCORE_BATCH_DELAY_MS=3s`
- `lib/ingest-runs.ts` — `INGEST_STALE_MS=12 min`
- `app/api/ingest/route.ts` — `maxDuration=300`
- `app/api/debug/last-ingest/route.ts` — **deleted**

**Bug in the revert:** The checkout restored `INGEST_WALL_BUDGET_MS = 50000` (50s) instead of the original `260000` (260s). The 50s budget caused scoring to break immediately on the next manual scan (0 scored in 166s). Fixed in a follow-up commit restoring `260000` — and the scan worked immediately.

**Lesson:** When reverting files with `git checkout`, always verify the actual constants in the restored file before committing. The commit pointed to by `d438f63^` already had the 50s budget (Session 20 had landed earlier).

### (d) Cancelled scan feature — already existed

User requested a "stop/cancel a running scan" feature. Investigation showed this was already fully implemented:
- `POST /api/ingest/cancel` — sets `status='cancelled'` on the active ingest run
- `lib/ingest-runs.ts` — `isRunCancelled()` checks DB status
- `lib/ingest.ts` — cancellation checks before embed and scoring stages, plus every 3 batches during scoring
- `RunIngestButton.tsx` — Cancel button with confirmation popup visible when scan is running
- Built in PRs #109, #114, #115 (previous sessions)

### (e) SEO verification — PR #143 complete

User asked to verify the SEO implementation from PR #143. All pages are live on `main`:

| Page | URL | Status |
|---|---|---|
| Public job board | `/explore` | ✅ SSR with search, source filters (24/job grid), pagination, CollectionPage schema |
| Job detail | `/explore/[id]` | ✅ JobPosting structured data (schema.org), `generateMetadata`, ensureFullDescription, canonical URLs |
| ATS landing page | `/free-tools/ats-score-checker` | ✅ WebApplication schema, features, steps, testimonials, CTAs, OpenGraph + Twitter cards |
| Sitemap | `/sitemap.xml` | ✅ Dynamic, up to 5000 job URLs + 7 static pages |
| Robots | `/robots.txt` | ✅ Allows `/explore`, `/free-tools`, `/login`, `/privacy`, `/terms`, `/contact`; disallows `/admin`, `/stats`, `/import`, `/onboarding`, `/apply-profile`, `/api/` |
| Middleware | `middleware.ts` | ✅ `/explore` and `/free-tools` in `PUBLIC_PATHS` (no auth required) |

**SEO implementation is solid:** proper Metadata exports with keywords, OG tags, Twitter cards, canonical URLs, JSON-LD structured data, and clear crawl directives.

### Files changed this session

- `app/api/debug/last-ingest/route.ts` (created → deleted)
- `lib/ingest.ts` (restored to 260s budget via revert + fix commit)
- `lib/ingest-runs.ts` (restored to 12-min stale)
- `app/api/ingest/route.ts` (restored to 300 maxDuration)
- `docs/context/session-log.md` (this entry)

## Session 20 — Global HTML Skill-boundary Fix & Admin Database Controls (June 15, 2026)

A focused session resolving a critical HTML regex boundary mismatch in skill analysis, and equipping the Admin Dashboard with full database backup, deletion, and restoration tools.

### (a) Global skills-matching and HTML boundary bugfix
**Problem:** The `scoreJob` and `cleanSkills` checks processed the raw HTML job description stored in the DB (which contains tags like `<li>JMeter</li>`). Because `isSkillPresentInJd` used a regex word-boundary test, HTML tag markers like `<` and `>` interfered with word boundary assertions (`\b`), causing matches to fail. Additionally, `cleanSkills` was re-verifying `missingSkills` from the LLM against the JD via `isSkillPresentInJd`. If a skill was correctly identified by the LLM as missing, but failed the regex check on raw HTML, it was dropped. This led to required skills not showing up on the UI.

**Fix:**
1. Stripped HTML from the job description text via `sanitizeJobDescriptionForAI` before performing any skill checks in `lib/gemini.ts` and scripts.
2. Modified `cleanSkills()` to only run the JD presence filter on `matchedSkills` (verifying they actually exist in the text). `missingSkills` returned from the LLM are authoritative, so we only clean their format and do not re-verify them.
3. Updated `DashboardMatchResults.tsx` card enrichment logic to prevent overwriting LLM-computed missing skills with client-derived values.
4. Redesigned the missing required skills pills in `MatchSkillPills.tsx` to display as Red X chips instead of gray dashed pills, providing a clear CTA for the user.

**Files changed:** `lib/gemini.ts`, `app/(app)/_components/DashboardMatchResults.tsx`, `app/(app)/_components/MatchSkillPills.tsx`.

### (b) Database lifecycle backup and restore controls
**Why:** The user needed a way to delete all existing matches and jobs to test scan adjustments and skill matching fixes, with the ability to restore historical data at any time.

**Fix:**
1. Created a privileged API controller `app/api/admin/jobs-control/route.ts` using the service role client. Supported actions include:
   - `backup_delete`: Fetches active matches and jobs, saves them to `admin_settings` as a JSON under key `system_backup`, then wipes all rows from active tables.
   - `restore`: Retrieves the backup from `admin_settings` and performs chunked upserts (size 100) to populate jobs (preserving references) and matches.
   - `delete_only` and `delete_backup` for auxiliary actions.
2. Built a responsive `JobsControlPanel.tsx` UI card on the Admin Dashboard displaying current active vs. backup counts, last backup timestamps, and actions to trigger backup/delete/restore operations with browser-native confirmations.

**Files changed/created:** `app/api/admin/jobs-control/route.ts` (new), `app/(app)/admin/JobsControlPanel.tsx` (new), `app/(app)/admin/AdminDashboard.tsx` (modified).

### (c) Vercel timeout & "today's date" discovery reset fix
**Problem:** 
1. The manual scan timed out because Vercel hard-killed the `/api/ingest` route after 60s (Hobby tier limit), leaving the run in an unfinished `'running'` state in the database.
2. In a previous commit, `ignoreDuplicates: false` was set alongside adding `fetched_at: now` to the payload in `upsertJobs` to return duplicate IDs on conflict. However, this caused all duplicate jobs to get their `fetched_at` timestamp overwritten with `now` on every scan. As a result, the user faced the "today's date" issue where every job card on the dashboard showed a discovery time of "today" (scan time), destroying historical discovery dates and breaking the "Newest First" sort.

**Fix:**
1. Defaulted `INGEST_WALL_BUDGET_MS` to `50000` (50s) in `lib/ingest.ts` so the pipeline cleanly commits current progress and finalizes the run before Vercel kills it.
2. Omitted `fetched_at` from the upsert payload in `upsertJobs`. Now, PostgreSQL's `default now()` value is used for new inserts, while updating existing duplicate records on conflict updates metadata but preserves their original `fetched_at` discovery timestamp.

**Files changed:** `lib/ingest.ts`.

## Session 18 — ATS Checker scoring calibration (June 8, 2026)

**Goal:** Tune deterministic ATS engine after synthetic resume batch analysis (PR #129 cont.).

### Shipped

- Length bands for entry-level resumes (200–300 word tier)
- Skills contextualization thresholds lowered
- Soft/Interpersonal Skills added to standard headers
- Validated on 1,200 synthetic + 40 real resumes

**Doc pointer:** `CONTEXT.md` → `## ATS Resume Checker` → Scoring Optimization; Session 17 for UI half of same PR.

---

## Session 17 — ATS Checker UI overhaul (June 8, 2026)

**Goal:** Ship free logged-in ATS checker UX (PR #129).

### Shipped

- `/ats-checker` page: animated score ring, radar chart, JD keyword comparison
- Sample resume, keyboard shortcuts, score history, copy results
- Public landing `/free-tools/ats-score-checker` (PR #143) + engine `lib/ats-checker.ts`

**Doc pointer:** `CONTEXT.md` → `## ATS Resume Checker`; `## Public SEO Pages & Free Tools`.

---

## Session 19 — Seen/Unseen card indicators + Hallucinated-skills guardrail + Sort/filter fixes (June 14, 2026)

A focused bug-fix and UX polish session. Three independent improvements shipped.

### (a) Dashboard match-card sort and filter alignment

**Problem:** the sort dropdown had 5 options (newest, oldest, score_desc, score_asc, bookmarked) but the API and MatchList only correctly handled 3. The status-filter tab counts were also mismatched because the PostgREST alias `job!inner(...)` was being used without the correct foreign table qualifier in the count queries.

**Fix:** simplified sort dropdown to 3 options (**Score (High → Low)**, **Score (Low → High)**, **Newest First**) matching what the API route actually supports. Corrected PostgREST foreignTable alias in count queries in `lib/match-stats.ts`.

**Files changed:** `app/(app)/_components/DashboardMatchResults.tsx`, `lib/match-stats.ts`, `app/api/matches/route.ts`.

### (b) Seen/Unseen card visual indicators — PR #137

**Problem:** once a user clicked a job card and went back, they had no visual cue which cards they had already seen. Every card looked identical, making it hard to quickly spot fresh matches.

**Design decision (Product Owner perspective):** we already have a `viewed_at` timestamp column. Rather than adding a new DB field, we derive "viewed" from `status !== 'new'`. The card styling uses the well-understood "read email" metaphor:

- **Unseen (new):** highlighted 4px primary left border, default elevated background, elevated shadow, **bold** title, `New` pill badge.
- **Seen (viewed):** transparent left border, softer recessed background (`bg-surface-container-low/40`), `opacity-75` (snaps back to 100% on hover), muted title colour (`text-on-surface-variant`, normal weight).

This pattern creates an immediate at-a-glance overview of which jobs are fresh without any new data or server round-trips.

**Files changed:** `app/(app)/_components/MatchCard.tsx` — added `isViewed` derived bool, conditional class sets on the card wrapper and `<h3>`, `New` pill guard.

### (c) Hallucinated-skills matching fix — gemini.ts guardrail + DB cleanup script

**Root cause (evidence-based RCA):** the `scoreJob` and `matchSkills` functions ask the LLM to identify matched/missing skills. The LLM occasionally **hallucinated** skill keywords that were not in the Job Description text — for example returning `"C++"` as matched for a Python-only JD. Because we trusted the LLM output verbatim and wrote it to `matches.matched_skills` / `matches.missing_skills`, these phantom matches were displayed as green chips on both the dashboard card and the job detail page.

The root cause is pure LLM non-determinism — the model infers related concepts from its training data. It was not a database or transport bug.

**Fix in `lib/gemini.ts`:**

1. **`isSkillPresentInJd(skill, jdText, jobTitle)`** — new exported helper (line ~2166). Case-insensitive, whole-word regex match that handles:
   - Special characters in skill names (C++, .NET, Node.js — escaped for regex).
   - Trailing plural 's': `"container"` matches `"containers"` but not `"containerisation"`.
   - Falls back to `jobTitle` if `jdText` is null/empty.
2. **`scoreJob`** — prompt instructions updated to tell the LLM to only report skills physically present in the JD. After the LLM responds, `matchedSkills` and `missingSkills` are **both filtered** through `isSkillPresentInJd` (skill must appear in JD to be matched; skill must appear in JD to be listed as missing — i.e., it's a real requirement we can't meet, not a hallucination).
3. **`matchSkills`** — `jdRequirements` extraction list is filtered through `isSkillPresentInJd` before scoring; `matched` and `missing` arrays are also post-filtered.

**DB cleanup script:** `scripts/clean-hallucinated-skills.ts` — one-time script that reads every match with a job description, runs `isSkillPresentInJd` against each stored skill, and upserts cleaned `matched_skills` / `missing_skills` arrays back to the DB, removing any hallucinated entries from historical records.

**Files changed:** `lib/gemini.ts` (3 sites), `scripts/clean-hallucinated-skills.ts` (new).

**PR:** #137.

### (d) ReferralRadar humanized copy

**Problem:** The `ReferralRadar` component had overly structured, corporate-sounding copy, robotic numbered step labels, and badges/emojis that felt generated by an AI marketing agent.

**Fix:** Rewrote headings, descriptions, and tab labels to read naturally and casually. Stripped out references to "AI match score" inside candidate message templates (real professionals do not tell employees they have a "90% match on Hyred's AI scorer"). Removed all emojis and marketing badges.

**Files changed:** `app/(app)/jobs/[id]/ReferralRadar.tsx`

### (e) Differentiate sub-specialties to fix over-scoring

**Root cause:** Broad domain descriptions forced the LLM to treat distinct specialties under a shared field (e.g. testing, engineering, data, management) as identical domains. If a candidate was a specialized Performance Engineer, the model scored a generic "QA Automation" job at 90/100. Similarly, backend developers could be matched with frontend roles, or data scientists with data engineer roles.

**Fix:** Added explicit sub-specialty alignment rules in the `scoreJob` LLM prompt in `lib/gemini.ts`. Added explicit caps:
- **Testing**: Performance Engineering matching general Test Automation/QA is capped at **65**; general QA/Automation matching Performance Engineering is capped at **60**.
- **Frontend vs. Backend**: Capped at **60** unless the resume shows experience in both or it's a hybrid Fullstack role.
- **Data roles**: Data Scientist vs. Data Engineer vs. Data Analyst capped at **60**.
- **DevOps vs. Developer**: DevOps/Platform Engineer vs. Backend/Frontend Developer capped at **60**.
- **Product vs. Project**: Product Manager vs. Project Manager/Scrum Master capped at **50**.
- Modified cap precedence to resolve the lowest of all caps.
- Updated worked examples.
- Updated `CONTEXT.md` reference to match the new scoring behavior.

**Files changed:** `lib/gemini.ts`, `CONTEXT.md`.

---

## Session 16 — DB-managed multi-key LLMs, Cerebras model deprecation, RPM rotation, dashboard pagination, JD HTML + scoreJob seniority cap (May 31, 2026)

A long working session that took the AI runtime, the dashboard performance, and scoring quality from "single shared key + 100-card SSR fetch + no seniority guard" → "admin-managed multi-provider key pool + paginated infinite-scroll dashboard with bulletproof back-nav + experience-aware scoreJob with server-side cap." Five PRs: **#94** (LLM key system), **#110** (pagination), **#116** (JD HTML + seniority).

### (a) Admin-managed LLM key pool with usage tracking — PR #94

**Why:** the single env-var `GROQ_API_KEY` couldn't scale beyond ~1 user (Phase-3 capacity analysis already in CONTEXT.md), and rotating keys via Vercel env vars required redeploys. Goal: paste a key in `/admin`, have it live for the next call.

- Migration **`0009_llm_keys.sql`**: tables `llm_keys` (provider, api_key, label, daily_token_limit, tokens_used_today, requests_today, last_reset_at, is_active, priority) and `llm_usage_log` (per-call token rows for the dashboard) + RPC `increment_llm_key_usage()` for atomic counter updates.
- New module **`lib/llm-keys.ts`**: `getNextAvailableKey`, `getAllLlmKeys`, `recordUsage`, `markKeyExhausted`, `addLlmKey`, `updateLlmKey`, `deleteLlmKey`, `getLlmUsageSummary`, `PROVIDER_DEFAULTS` (cerebras / groq / openai / gemini / mistral / sambanova). UTC daily reset is checked on every key fetch (no cron needed).
- Routes: `GET/POST /api/admin/llm-keys`, `PATCH/DELETE /api/admin/llm-keys/[id]`. Keys returned masked (`csk-...xyz`); the full key is never sent to the client.
- UI **`LlmKeysPanel.tsx`** in `/admin`: summary cards (active keys, daily capacity, used today, remaining), per-provider stats, per-key live usage bars (green / amber / red), enable-disable toggle, delete, and an "Add key" modal with provider dropdown + default daily limit.
- `lib/gemini.ts` `chat()` was rewritten to read DB keys first then fall back to env vars. Cerebras was added as the new default primary (`LLM_PRIMARY=cerebras`), Groq second, OpenAI last (paid).

### (b) Cerebras model `llama-3.3-70b` removed — switch to `gpt-oss-120b` (PR #94 follow-up)

After the key system shipped, every Cerebras call returned `404 status code (no body)` in 35–42 ms — far too fast for a real model call. Evidence-based RCA: the Cerebras inference docs list only `gpt-oss-120b` and `zai-glm-4.7` as available models; `llama-3.3-70b` was deprecated around May 27, 2026. The 35-ms 404 was the routing layer rejecting an unknown model name. **Lesson:** when a provider returns a sub-50ms 404 across the board, suspect a model-name issue before suspecting auth.

- `CEREBRAS_CHAT_MODEL` default + `PROVIDER_DEFAULTS.cerebras.model` updated to `gpt-oss-120b`.
- Existing DB rows still carry the dead model name; admins must run `UPDATE llm_keys SET model = 'gpt-oss-120b' WHERE provider = 'cerebras';` once.

### (c) Free-tier RPM 429 rotation (the "5 keys exhausted in 2 seconds" bug)

**Symptom (Vercel logs):** `Cerebras[DB:snk80771] failed: 429 status code (no body)` repeated for every key, then Groq spilled into a real daily-tokens-exhausted 429, then OpenAI took over. Cerebras Cloud analytics showed only **1.2 K tokens used** for the key the admin saw as "exhausted" — meaning the daily token cap was nowhere near reached.

**Root cause:** Cerebras documents 50 RPM / 200 K TPM but the docs banner says "Due to high demand on `zai-glm-4.7` and `gpt-oss-120b`, we've temporarily reduced free-tier rate limits." Effective RPM during the test was ~5/min/key. The original `chat()` marked any 429 as **daily exhaustion** (`tokens_used_today = daily_token_limit`) so within seconds all five Cerebras keys looked spent and rotation collapsed to OpenAI.

**Fix:**
- 429 → in-memory **cooldown** (`KEY_COOLDOWNS`, 65 s default) instead of exhaustion. The DB token counter is left alone; the key is silently skipped for the next minute.
- `buildProviderChain()` now returns **all** active keys for a provider (round-robin position rotates per call) rather than picking one and falling through on failure. 5 Cerebras keys × ~5 RPM each ≈ 25 effective RPM.
- Token usage is recorded **only from `res.usage` on success** (no string-length guesses); error/rate-limit rows log 0 tokens, matching what Cerebras Cloud reports.
- Ingest scoring loop in `lib/ingest.ts`: `SCORE_CONCURRENCY` 6 → **5** (one call per key per cycle) and a **3-second `SCORE_BATCH_DELAY_MS`** between batches keeps each key under its RPM ceiling.
- Imports `getNextAvailableKey` / `markKeyExhausted` were dropped from `gemini.ts` (no longer used).

### (d) Dashboard pagination + infinite scroll + scroll restore + highlight — PR #110

**Why:** every dashboard load fetched up to 100 matches with a heavy `jobs!inner(...)` join. Back-nav re-rendered the whole thing, plus `app/(app)/loading.tsx` flashed a 2–3 s skeleton.

**Components:**
- `GET /api/matches` (page=1..N, page size 20, all existing filters supported, `Cache-Control: private, s-maxage=30, stale-while-revalidate=60`).
- New client component **`MatchList.tsx`** — infinite scroll via IntersectionObserver (`rootMargin: 400px`), de-duplication across pages, manual "Load more" fallback, "Showing X of Y" counter, "All loaded" footer.
- New cached helpers **`lib/dashboard-data.ts`** (`getDashboardCounts`, `getLastScanInfo`) using React `cache()` so RSC re-renders dedupe Supabase queries.
- Server now fetches **only the first page (20)** plus a `count: 'exact'` total, instead of `.limit(100)`.

**Default sort changed `newest` → `score`** (highest match score first) in `page.tsx`, the API route, the `MatchFilters` dropdown, and `MatchList.buildQuery`.

### (e) Back-navigation: instant + always lands on the clicked card

**Bug 1 (skeleton flashes for 2-3 s):** `app/(app)/page.tsx` is `force-dynamic` and `app/(app)/loading.tsx` exists, so every `router.back()` re-runs ~12 Supabase queries.

**Bug 2 (lands at top, not on the clicked card):** infinite-scroll items live only in client state. Back-nav re-rendered the **first 20 cards** while the user had been on card #45 — `scrollTo(savedY)` landed wrong and `querySelector('[data-match-id="#45"]')` returned `null`. **My earlier `?from=matchId` Link approach inherited the same flaw.**

**Fix (two mechanisms):**
1. `next.config.mjs` `experimental.staleTimes = { dynamic: 30, static: 180 }` → client Router Cache reuses the dashboard for 30 s. Job → back is a **client-side restore with no server call and no `loading.tsx`**.
2. **`MatchList`** writes a sessionStorage snapshot on card click (`signature` from filter params + `matches[]` capped at 200 + `page` + `hasMore` + `total` + `scrollY` + `clickedId` + TTL 10 min). On mount a `useLayoutEffect` (SSR-safe via `useIsoLayoutEffect`) rehydrates the FULL list before paint, then a `useEffect` (post-paint, two `requestAnimationFrame` ticks) restores scroll and flashes the clicked card with `ring-2 ring-primary` for 2 s. Snapshot is consumed once.
3. New client component **`BackToMatches.tsx`** uses `router.back()` (with `router.push("/?from=...")` fallback when there's no history). The page server component still accepts `?from=matchId` so a direct/no-history nav still highlights.

**Self-caught bug during reflection:** my first attempt read the snapshot inside `useState` lazy initializers — that causes a React hydration mismatch on cold loads (server HTML had 20 cards, client init would have 80). Switched to initializing with the server props and **swapping to the snapshot inside `useLayoutEffect`** before paint. Bookmark-button clicks now skip the snapshot writer (they `preventDefault` and don't navigate).

### (f) JD HTML poisoning the LLM (and the UI) — PR #116

**Evidence:** stored `job.description` for the QualiZeal Director role contained raw `<p>🚀 We're Hiring …</p>` markup. `ensureFullDescription` only refetches when `length < 1000` (`TRUNCATED_LENGTH_THRESHOLD`), so HTML-heavy long descriptions pass through untouched. Every prompt site (`scoreJob`, `matchSkills`, `generateCoverLetter`, `generateAtsResume`, `extractJdKeywordsTyped`) was reading markup as prose, and the detail page renders inside `<pre>` so users saw literal tags.

- New helper **`sanitizeJobDescriptionForAI(s)`** in `lib/jd-fetcher.ts`, a thin wrapper over the already-exported `stripHtml` + `containsHtml`. Idempotent on clean text.
- Applied at all five AI call sites in `lib/gemini.ts`.
- The `ensureFullDescription` self-heal already on `main` writes the cleaned text back to the DB on next read so the `<pre>` rendering also stops showing tags.

### (g) `scoreJob` over-scoring senior roles for IC candidates — PR #116

**Symptom:** 7.7-year senior Performance Engineer scored **90 / 100** on "Director of Performance Engineering CoE | QualiZeal — 18+ years" — a full director title with an 11-year gap.

**RCA:** the prompt had the testing-umbrella floor (65–80) and the location rule, but **zero seniority or experience-gap rule.** The LLM saw "Performance Engineering" + tool overlap and floored at the umbrella value.

**Fix (defense-in-depth, mirrors the matchSkills 4-phase pattern):**
- Prompt: explicit **YEARS GAP table** (`gap ≥ 11 → cap 40`, `gap ≥ 7 → cap 55`, `gap ≥ 4 → cap 65`, `gap ≥ 2 → cap 78`) + **SENIORITY-LEVEL** rules (IC → director cap 50; IC → vp/exec cap 40) + two **worked examples** so the model has concrete priors. The umbrella floor now explicitly says "BEFORE applying the seniority cap below."
- Response shape extended with `requiredYears` and `jdSeniority` (one of `ic | lead | manager | director | vp | executive`).
- **Server-side hard cap** in `scoreJob`: parses those values against `insights.years_experience` + `insights.seniority`. Years cap and seniority cap each compute a ceiling; the lower of the two wins. The seniority cap **only fires when there's also a real years shortfall** (`gap ≥ 4` or `requiredYears` un-parsed) so a 12-year Staff IC moving to a 12-year Director isn't unfairly capped.
- The `reason` string is augmented with "Score capped due to …" whenever a cap fires, so users can see why.

**Mental dry-run on the QualiZeal case:** required=18, candidate=7.7, gap=10.3 → years cap 55, IC vs director (gap ≥ 4) → seniority cap 55, final `min(55, 55) = 55` with `reason: "...Score capped due to experience gap of 10 years."` Even if the model still tries to output 90, the server enforces 55.

### (h) Dashboard new/seen indicator + small UX bugs

- "0 NEW MATCHES" + "+25 kept" showed for brand-new users because `ingest_runs` rows had a NULL `profile_id` from older inserts. Fix: insert `profile_id` at row creation in `runIngest`. Dashboard last-scan card now hides the "+N kept" sub-value when count is 0 and shows "No scan yet" instead of "Never".
- New (unopened) cards: full opacity + left primary accent border + "New" badge. Viewed cards: 0.65 opacity, no border, no badge. Hover preserves the left border (the previous `hover:border-primary/10` was overriding `border-l-primary`).

### Net effect

| Metric | Before | After |
|---|---|---|
| Default chat provider | Groq (1 key, ~100K TPD) | Cerebras pool (admin-managed, currently 5 keys × 1 M TPD) with Groq + OpenAI fallback |
| Dashboard initial fetch | 100 matches with full job join | 20 matches, paginated; rest streamed in via infinite scroll |
| Back-nav from job detail | 2–3 s skeleton + landed at top | Instant (Router Cache); restores exact scroll + flashes the clicked card |
| Scoring guardrail | testing-umbrella floor only | + years/seniority cap with server-side enforcement |
| AI input hygiene | raw HTML reached prompts | `sanitizeJobDescriptionForAI` at all 5 call sites |

### Manual setup required after this session
1. Run **`supabase/migrations/0009_llm_keys.sql`** in the Supabase SQL editor.
2. In Supabase: `UPDATE llm_keys SET model = 'gpt-oss-120b' WHERE provider = 'cerebras';` (one-time, fixes pre-deprecation rows).
3. In `/admin` → LLM Keys panel, add Cerebras keys (one per separate Cerebras account; same-account keys do **not** stack — RPM/TPD are per-account).

---

## Session 15 — Luminous UI redesign + CONTEXT UI index (May 31, 2026)

**UI shipped (PRs #96–#101 on `main`):**
- **#100** — Google Stitch **Luminous** redesign: teal tokens, 260px sidebar, bento dashboard, `MatchScoreRing`, `DashboardInsights`, Plus Jakarta Sans. Source: Stitch project `3444316686130112255`, screen **Matches Dashboard (Luminous)** `5bfaf7f2edd94ffca0cb356e70ce7c2b`. Reference in `.stitch/`.
- **#101** — Admin Run Scan source picker clipped under sidebar on Stats (search hidden → button left-aligned; fixed header z-index + `ml-auto`).
- **#99** — Legal friction: no onboarding consent checkbox; sign-up-only Terms/Privacy; no logged-in footer links.
- **#96** — Toasts bottom-right; dismiss on logout; no persistent scan loader.

**Docs:** added `CONTEXT.md` → **`## UI & Design System`** with UI index (current UI, tokens, component map, Stitch source, UI change log, UI pitfalls). `AGENTS.md` Index row added.

---

## Session 14 — Multi-tenant ghost data, Stats UX, ingest run lifecycle, admin-only sources (May 31, 2026)

Five production bugs reported by the owner while testing fresh sign-ups on Hyred. All fixed with evidence-based root-cause analysis; merged PRs **#83–#87**.

### (a) Deleted auth user still sees old profile + matches (PR #83)

**Symptom:** delete user in Supabase Auth → re-sign in with same email → old resume, matches, and ingest history still there.

**Root cause:** migration **0006** changed `profiles.user_id` FK to **`ON DELETE SET NULL`**. Deleting auth only orphaned the profile (`user_id = NULL`); matches stayed. `resolveProfileForUser()` re-adopted that row by email on next login — by design in 0006, opposite of user expectation.

**Fix:**
- App: on sign-in, **delete detached profiles** (`user_id IS NULL`) for that email before creating fresh row; only `ADMIN_EMAIL` legacy row gets one-time link.
- Migration **0008_profiles_user_fk_cascade.sql**: restore **`ON DELETE CASCADE`** so auth delete wipes profile + matches going forward. **Run in Supabase SQL editor.**
- Manual cleanup for existing orphans: `DELETE FROM profiles WHERE user_id IS NULL AND lower(email) = lower('…');`

### (b) Wrong job preferences after fresh resume upload (PR #83)

**Symptom:** upload digital-marketing resume → job preferences still show HR/recruitment roles from a prior session.

**Root cause:** stale `preferences.roles` from re-adopted profile; `applyInsights()` only filled empty fields (`force=false`); `/api/profile` did not refresh roles from new `insights.suggested_roles` and kept cached `insights.search_profile`.

**Fix:** `lib/profile-insights.ts` — `stripSearchProfile()`, `preferencesFromResumeInsights()`. Onboarding upload calls `applyInsights(ins, true)`; profile save overwrites roles when resume changes.

### (c) Stats showed global job pool (~12k) to new users (PR #85)

**Symptom:** fresh user sees **"Jobs in DB: 12,613"** with **0 matches** — scary and misleading.

**Root cause:** `app/(app)/stats/page.tsx` counted `jobs` table globally (`jobs` is intentionally a shared pool). Matches were already scoped by `profile_id`.

**Fix:** Stats cards = user match counts only (Your matches / New / In inbox / Applied). "Matches by source" from user's `matches` join (admin-only after #87). `noStore()` + disable Link prefetch on `/stats`. Dashboard empty state no longer references global job count. Auto-scan on first resume via `triggerJobScan.ts`.

### (d) Ingest run stuck on "running" forever (PR #86)

**Symptom:** matches visible in portal; Stats shows ingest row **running** 10+ min with all zeros; "Last scan: No scan yet".

**Root cause:** `ingest_runs` counters + `status` only written in **one final UPDATE** at pipeline end. Vercel **300s** limit or dropped client connection → matches saved mid-loop but run row never finalized.

**Fix:** `lib/ingest-runs.ts` — `patchIngestRun()` progress after fetch/embed/score; `finalizeRun()` in `finally`; `closeStaleIngestRuns()` (>12 min) on Stats/Matches load with `matches_created` backfill; `assertNoActiveIngest()` blocks overlapping scans; last-scan query uses latest row with `finished_at NOT NULL`.

### (e) Job source names visible to regular users — data lake (PR #87)

**Symptom:** users see LinkedIn/Adzuna/JSearch in Stats breakdown, "All sources" filter, match badges, scan source picker.

**Fix:** gate all source-identifying UI behind `isCurrentUserAdmin()` — Stats "matches by source", `MatchFilters` source dropdown, `RunIngestButton` source chevron, `MatchCard` / job detail source badges. Non-admins: ignore `?source=` and `/api/ingest` `sources` body.

### Migrations to run manually (if not yet)

| Migration | Purpose |
|---|---|
| **0008** | `ON DELETE CASCADE` on `profiles.user_id` (pairs with #83 app purge) |
| **0007** | `profiles.is_admin` + grant owner (admin surfaces) |

### PRs merged this session

#83 deleted-user ghost data + stale preferences · #85 user-scoped Stats · #86 stuck ingest running · #87 admin-only source visibility

### Verified

`npm run typecheck` clean on each PR. Context updated: `CONTEXT.md`, `AGENTS.md` Index, this log.

---

## Session 13 — Legacy `.doc` resumes, Stats UX copy, Vercel build fix (May 31, 2026)

Three threads: (a) users could not upload legacy Word `.doc` resumes, (b) Stats "Recent ingest runs" table was too technical, (c) multiple Vercel Preview/Production deploys failed after merging resume work without a client/server split.

### (a) Legacy `.doc` resume upload

**Symptom:** PDF and `.docx` parsed; a common `.doc` export (OLE, magic `D0 CF 11 E0`) did not — looked like "Word is broken" but only **binary `.doc`** was unsupported (`mammoth` = `.docx` only).

**Fix:** `word-extractor` in `lib/resume.ts` (buffer); magic-byte sniff for OLE; accept `.pdf`, `.doc`, `.docx`, `.txt`. Client validation via `lib/resume-upload.ts`. Types: `types/word-extractor.d.ts`.

### (b) Stats page — plain-language scan history

Renamed section to **Recent job scans**; simplified column headers (Found / Checked / Matches / Duration / Started by); humanized result badges and trigger labels (`You`, `Resume upload`, `Automatic`).

### (c) Vercel deploy failures (`7e5cd85`, `c521b17`, redeploys)

**Symptom:** Preview builds failed in ~48s; Production failed on `main` after PR #87 merged on top of `7e5cd85` without the bundle fix.

**Root cause:** `OnboardingForm` (`'use client'`) imported `@/lib/resume`, pulling `word-extractor` / `pdf-parse-fork` / `mammoth` into the client webpack graph → `Module not found: Can't resolve 'fs'`.

**Fix (commits `d08e5ca`, `26cd62d` on `cursor/legacy-doc-resume-stats-copy`, fast-forwarded to `main`):**
- `lib/resume-upload.ts` — client-safe helpers only; form imports this, not `lib/resume.ts`.
- `next.config.mjs` — `serverExternalPackages: ['word-extractor', 'mammoth', 'pdf-parse-fork']`.
- `app/(app)/layout.tsx` — `export const dynamic = 'force-dynamic'` (avoids static prerender of authed pages without local Supabase env).

### Verified

- GitHub/Vercel status on `26cd62d`: **success** (Production + Preview Ready per dashboard).
- Local `npm run build`: compiles after split; full build without env vars completes once authed routes are dynamic.

---

## Session 12 — Multi-tenant PII fixes, Hyred rebrand, economics & Phase 3 pub/sub design (May 30, 2026)

Four threads: (a) stop owner data leaking to new sign-ups, (b) ship Hyred rebrand + resume title fixes, (c) repo privacy + pricing/token economics for scale, (d) document shared-ingest pub/sub direction for Phase 3.

### (a) Owner PII in onboarding / apply profile (PR #76)

**Symptom:** new users saw the owner's name, contact details, locations, and full essay answers pre-filled in Apply Profile (real values, not gray placeholders). Onboarding placeholders also showed owner-specific examples.

**Root cause:** `ApplyProfileForm` `DEFAULTS` merged on first load when API returned only `{ profile_id }`; `OnboardingForm` placeholders hard-coded owner examples.

**Fix:** `FORM_DEFAULTS` = non-PII only; generic placeholders; GET `/api/apply-profile` seeds identity from signed-in `profiles` row; strip metadata on save. Merged PR #76.

### (b) Owner data in tailored resume generation (PR #75)

**Symptom:** other users' ATS resumes could inherit owner contact lines and perf-specific prompt bias.

**Root cause:** `generateAtsResume` prompt had hard-coded fallback contact + owner LinkedIn + JMeter/Charles Schwab achievement clause + perf-heavy summary example.

**Fix:** `contactBlock` from args/resume only; `extractLinkedinFromResume()`; removed owner achievement injection; PDF filename fallback `"Resume"`. Merged PR #75.

### (c) Hyred rebrand + role title in PDF (PRs #77–79)

- **#77** — product rename JobRadar → **Hyred** (hyred.in).
- **#78–79** — stop hardcoding owner role title in ATS generation; restore role title in PDF header after regeneration.

### (d) Economics, repo private, Phase 3 design (conversation — docs only)

- GitHub repo set to **private** (`shashank4910/JobRadar`).
- Clarified token math: **1,000 users × 4 scans/day = 4,000 ingest runs**, not 4,000 tokens (~100k–250k tokens **per run**).
- Owner aligned on **pub/sub shared ingest**: publish jobs per role topic once → users subscribe → LLM score only shortlist. Captured in `CONTEXT.md` → `#### Phase 3 design note — shared ingest / pub-sub by role topic`.
- Premium **minimum pricing floor** documented: **≥ ₹999–1,199 / $12–15/mo** per payer with quotas; Top MNC = $0 API; unlimited scans/regens without caps loses money at scale.

### Verified
`npm run typecheck` clean on form/resume fixes. Context system updated: `CONTEXT.md`, `AGENTS.md` Index, this log, `.kiro/steering/jobradar-context.md`.

## Session 11 — ATS keyword GUARANTEE (selected keywords must land) + LLM-typed placement + resume header polish (May 30, 2026)

Three threads: (a) guarantee every user-selected keyword actually lands in the regenerated resume, (b) make the tool-vs-activity placement decision scale (move it off hardcoded lists onto the LLM), and (c) a visual/ATS review + a header layout fix. PRs #67, #69, #70 (code) and #71 (PDF header).

### (a) Selected keywords were silently dropped after regenerate (PRs #67, #69)

**Symptom (owner, with screenshots):** the owner ticked ~5-6 missing keywords, hit Optimize, and after regeneration several were STILL listed as "Will be added next" and were genuinely absent from the resume text. Re-clicking Optimize was rejected as a fix — "the user thinks the app is broken; it must land on the first try."

**Root cause:** the prompt *asked* the model to weave selected keywords in, but the LLM is non-deterministic and quietly skipped some — especially **prose-type** keywords (activities/metrics/concepts like "load testing", "stress testing", "KPI") that don't fit a `Category: tool, tool` skills line. There was no code-level guarantee; a skipped keyword just stayed "missing".

**Fix — deterministic safety net in `lib/gemini.ts` (runs after the LLM + the unauthorized-strip pass):**
- `ensureSelectedKeywordsPresent(text, required)` — appends any still-missing **tool-like** selected keywords to a `TECHNICAL SKILLS` category line (last resort for tools only).
- `ensureCompetencyKeywordsPresent(text, required)` — guarantees **activity/metric/concept** keywords by adding them to a `CORE COMPETENCIES` section (created if absent). This was the actual regression fix: an earlier pass only *logged* a warning for prose leftovers instead of inserting them, so they vanished.
- After either insert, the resume is re-scored so the UI's added/missing buckets reflect reality. Net effect: **100% of selected keywords are present after one Optimize**, placed by kind (tools→skills, activities→competencies).

### (b) Hardcoded tool/activity lists don't scale → LLM decides the type (PR #70, the "clean design")

The session-9/#69 placement relied on heuristics (`isSkillLikeKeyword` + small hardcoded `KNOWN_TOOL_PHRASES` like "soap ui", "load runner"). The owner correctly flagged this won't scale — there are thousands of tools ("New Relic", "k6", "Cavisson NetStorm" …) and the list will always be incomplete in production.

Clean design shipped:
- New `extractJdKeywordsTyped()` (`lib/gemini.ts`) — the SAME LLM pass that extracts JD keywords now also tags each one `type: 'tool' | 'activity'`. Types: `KeywordType`, `TypedKeyword`. `extractJdKeywords()` is now a thin wrapper returning just the strings (back-compat).
- The type map is plumbed end-to-end so it survives the client round-trip: GET `route.ts` returns `keywordTypes`; `JobActions.tsx` stores it in state and echoes it back on the Optimize POST; POST passes `keywordTypes` into `generateAtsResume()`.
- Inside `generateAtsResume()`, `isToolKeyword(kw)` now **trusts the LLM's type first** (`typeMap.get(kw)`), and only falls back to the `isSkillLikeKeyword` heuristic when no type is present. So placement (skills vs competencies) is LLM-driven and scalable; the hardcoded lists are a last-resort fallback, not the primary path.

### (c) Visual / ATS review + header layout (PR #71)

**ATS review verdict — no blockers.** Evidence-based: extracting the text from the owner's `SHASHANK_Qa_7.pdf` yielded every field cleanly (name, title, all four contact items, section headers, and real `- ` bullets), which proves the PDF is true selectable text — not an image — and that the navy header band does NOT hide the contact info from parsers. Single-column, Helvetica, standard headings (PROFESSIONAL SUMMARY / KEY ACHIEVEMENTS / CORE COMPETENCIES / TECHNICAL SKILLS / CERTIFICATIONS / PROFESSIONAL EXPERIENCE / EDUCATION), reverse-chronological, consistent `Mon YYYY` dates, no tables/columns/text-boxes. Advisory-only (not ATS blockers): 3 pages is long for ~7.7 yrs; `CORE COMPETENCIES` items render lowercase (cosmetic, a side-effect of the keyword-guarantee insert); the `-- N of M --` lines seen in text extraction are the extractor's page markers, not content in the PDF.

**Header fix — two PRs, the second is the real one.**
- PR #71 (`lib/pdf-resume.ts`): contact line joined with ASCII `" | "` separators + font auto-shrink (8.8→7.2pt floor). Real improvement, but a **red herring** for the reported symptom — see below.
- PR #73 (the REAL fix): the owner re-tested and the PDF STILL showed a **blank navy band** with the name + contacts **stacked in the dark body**. Root cause found by reading `parse()`: it ran the ALL-CAPS `isSectionHeader()` test (`^[A-Z][A-Z\s&/-]+$`) **before** capturing the name, so the all-caps name "SHASHANK SINGH" matched the section pattern and was treated as a section header → `parsed.name` empty (band blank) + title/contacts dumped as that section's body bullets (stacked). PR #71's separator code never ran because `contactLines` was empty. Fix: capture the first non-label line as the name BEFORE the section test. **Verified deterministically** by dumping the jsPDF page-1 content stream (`doc.internal.pages[1]`): draw order is now name(band) → title(band) → single `" | "` contact line(band) → `PROFESSIONAL SUMMARY`(body). Lesson: to verify PDF layout, inspect the content stream / fill colours — plain text extraction can't distinguish band vs body and misled the first diagnosis.

### Verified
`npm run typecheck` clean for all four PRs. PRs #67, #69, #70 merged (keyword guarantee + LLM-typed placement); #71 merged (header). Two new `## Known Pitfalls` rows added to `CONTEXT.md`.

## Session 10 — ATS keyword feature: injection root-cause fix + simplified UX redesign (May 30, 2026)

Two parts: (a) finished killing the "unselected keywords get added" bug, then (b) redesigned the whole keyword UX to be simple, on the owner's request.

### (a) Why Grafana/InfluxDB were STILL added after session 9

Session 9 split keywords into `keywordsToAdd` (selected) vs `contextKeywords` (rest) and told the model not to add the latter. It didn't work because the injection came from the **prompt text itself**, not the user's selection:

1. **Example leakage (smoking gun).** A `KEYWORDS-TO-ADD RULES` line literally read `e.g. "Monitoring: Splunk, Dynatrace, Grafana, Prometheus"`. The model copied "Grafana" verbatim into TECHNICAL SKILLS; InfluxDB rode along as a sibling time-series/monitoring tool.
2. **Context priming.** Even with a "do NOT add these" caveat, *enumerating* the unselected JD keywords under `CONTEXT KEYWORDS` primes the model to use them. Negation is a weak instruction against an explicit list sitting in the prompt.

Fixes in `lib/gemini.ts`:
- Removed the `CONTEXT KEYWORDS` enumeration entirely — the full JD is already in the prompt for relevance; we only list the user's `keywordsToAdd`.
- Removed every real tool name from prompt examples.
- Made `STRICT KEYWORD SCOPE` always-on (even when nothing is selected → "introduce NO new tool").
- Added a deterministic safety net `stripUnauthorizedSkillKeywords()` (exported): after generation, any JD keyword that was added but NOT user-selected and NOT in the master resume is stripped from TECHNICAL SKILLS "Category: a, b, c" lines (prose left intact, logged), then the resume is re-scored.
- Added `console.log` diagnostics of keyword inputs/outputs for Vercel-log evidence.

### (b) Simplified UX (approved via mockups before building)

Replaced three competing keyword surfaces (Skill-match panel, `KeywordPicker`, post-gen 3-way analysis + custom-keyword input + exclude toggle) with ONE `KeywordManager` component (`app/(app)/jobs/[id]/KeywordManager.tsx`) that looks identical before and after optimizing. Four buckets:
- **In your resume** (green, read-only) — original real experience.
- **Added** (green, click to remove) — woven in by optimization and still wanted.
- **Will be added next** (amber, click to undo) — staged, pending the next optimize.
- **Missing — tap to add** (red) — not present (incl. pending removals).

One **Optimize My Resume** CTA, a "pending changes" banner when staged≠woven, and a live ATS score with a +/- delta badge. Live transitions: tap red→amber (stage), tap amber/green→red (un-stage). Because every optimize regenerates from the MASTER resume, **un-staging is all that's needed to remove a keyword** — so the explicit `excludedKeywords` UI was dropped.

Supporting changes:
- `route.ts` POST now accepts the client's `jdKeywords` and passes them through, so the keyword universe is STABLE across regenerations (no LLM re-extraction drift) and saves one LLM call.
- `JobActions.tsx` rewritten: unified `optimize()` / `onStage` / `onUnstage` / `onStageMany`, `scoreDelta` tracking. Removed the Skill-match panel; `page.tsx` no longer passes `candidateSkills`. Deleted `KeywordPicker.tsx`.

Paywall/entitlement: discussed (recommendation: meter outcomes/exports, NOT regenerations) but **NOT built** this session — owner said "check later".

### Verified
`npm run typecheck` clean; `npm run build` succeeds with dummy Supabase envs (`/jobs/[id]` bundle shrank 9.65 kB → 8.23 kB). Pitfall rows added to `CONTEXT.md`.

## Session 9 — ATS keyword add/delete/regenerate correctness fixes (May 30, 2026)

Fixed four compounding bugs in the ATS resume keyword flow that the session-4 keyword UX shipped with. The symptom the owner saw: ticking a couple of keywords still rewrote the resume with *every* JD keyword; the same keyword showed up as both "Woven into your resume" and "Missing from your resume"; the ATS Match Score read higher than reality; and clicking some add/remove chips did nothing.

### Root causes (verified by reading the code, not guessing)

1. **Unselected keywords were auto-added.** `generateAtsResume` (`lib/gemini.ts`) built `allKeywords = jdKeywords ∪ selectedKeywords` and the prompt told the model to "weave them in". So the entire extracted JD keyword set was injected as new vocabulary regardless of what the user actually selected.
2. **Stale "missing" merge → Woven *and* Missing.** `allMissingKeywords` in `JobActions.tsx` merged the generator's `keywords.missing` (computed against the just-generated resume) with `skills.missing` from `matchSkills` (computed against the *original* resume, never recomputed after a regenerate). A keyword the generator had just woven in still appeared as missing.
3. **Substring scoring + excluded keywords counted.** The ATS-score loop used `resume.toLowerCase().includes(kw.toLowerCase())`, so "AI" matched "available", "Java" matched "JavaScript" → inflated score; and it iterated all `jdKeywords` including ones the user had explicitly excluded.
4. **Case-sensitive membership checks.** `stageMissingKeyword`/`toggleExcludeKeyword` and three render-time checks used `Array.includes(kw)`, so a chip whose casing differed from the stored value wouldn't toggle (and `selected`/`excluded` could drift out of sync).

### Fixes

- **`lib/gemini.ts`** — split the keyword universe in `generateAtsResume`: `keywordsToAdd` = user-selected only (minus excluded) = the ONLY keywords allowed in as NEW vocabulary and that MUST appear; `contextKeywords` = the rest of the JD keywords, now **emphasis-only** ("use to decide which existing experience to surface; do NOT add if not already in the resume"). Rewrote the prompt's keyword block into `KEYWORDS TO ADD` / `CONTEXT KEYWORDS` / `STRICT KEYWORD SCOPE` / `EXCLUDED KEYWORDS` sections and updated `PRIMARY GOAL` + transformation rule 5b accordingly. Added and **exported `keywordInText()`** — a whole-token, case-insensitive matcher (boundary = string edge or non-alphanumeric char, so "C++"/"CI/CD"/".NET" still match but "Java" no longer matches inside "JavaScript"). Scoring now runs over `scoredJd = jdKeywords` minus excluded, uses `keywordInText` for both in-resume and in-original checks, and returns `jd_keywords: scoredJd`.
- **`app/api/match/[id]/resume/route.ts`** — GET route's already-have / available split now uses the exported `keywordInText` instead of substring `includes`, so the picker agrees with the generator's score.
- **`app/(app)/jobs/[id]/JobActions.tsx`** — `allMissingKeywords` now sources ONLY `keywords.missing`, filtered by `excludedKeywords` (dropped the stale `skills.missing` merge). All keyword membership checks (`stageMissingKeyword`, `toggleExcludeKeyword`, and the `keywords.added` / `keywords.already_had` / `allMissingKeywords` render maps) are now case-insensitive `.some()`.

### Verified

`npm run typecheck` clean. `npm run build` succeeds with dummy Supabase envs (the only build failure was the pre-existing `/import` static-prerender needing `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` — an env gap, not a code error). Added a Known Pitfalls row in `CONTEXT.md`.

## Session 8 — Multi-user auth hardening: duplicate-email crash, data-loss footgun, migration 0006 (May 30, 2026)

Follow-up hardening to Phase 1 (multi-user auth): fixed a sign-in crash, diagnosed/recovered lost data, and shipped a data-safety migration.

### 1. Duplicate-email sign-in crash (PR #56 partial → PR #58 real fix)

**Symptom:** after a successful login the dashboard threw `Failed to create profile: duplicate key value violates unique constraint "profiles_email_key"` (`app/(app)/page.js`, digests `943845339` then `4079527518`).

**Evidence trail (why #56 wasn't enough):** the first report's timestamp (06:33) predated the #56 merge (06:41) → old code. But a second report (06:50) carried a **new** digest *after* #56 was live — proving #56 (which only made step 2 adopt any same-email row, not just `user_id IS NULL`) was a partial fix.

**Root cause:** `resolveProfileForUser` in `lib/current-user.ts` used read-then-INSERT. The real cause is a **TOCTOU race** — on first sign-in the dashboard Server Component renders concurrently (prefetch + navigation), two calls both see "no profile" and both INSERT; the loser hits the unique email index. Service-role bypasses RLS and `email` is `NOT NULL UNIQUE`, so a guard SELECT can never close the window.

**Fix (PR #58):** step 3 now uses an atomic upsert — `.upsert({ user_id, email }, { onConflict: 'email' })` (INSERT … ON CONFLICT (email) DO UPDATE). Postgres resolves the conflict in one statement; a duplicate email can no longer crash sign-in. `tsc --noEmit` + `next build` clean. Docs corrected in PR #57/#59.

### 2. Lost admin profile — diagnosed + recovered (no code)

User deleted an old auth user, re-signed-up with Google, then noticed unfamiliar numbers and asked where the original data went. Findings (from reading the dashboard/stats/migration code + a `profiles` query):
- **No data leak.** Dashboard/stats scope `matches` by `profile_id`; the large number was the shared **`jobs`** pool (global by design), and the test account had its own 51 matches.
- **The original profile survived.** `select … from profiles` showed the admin row (`Shashank.srmncr@gmail.com`, **1150 matches**, resume) with `user_id = NULL` — never linked (the pre-fix adoption crash), and NULL-`user_id` rows aren't cascade-deleted, so deleting auth users didn't destroy it.
- **Recovery (free):** sign in with the original email; the adopt/upsert re-links the orphaned profile. A deterministic `UPDATE … set user_id = …` SQL fallback was provided.

### 3. Migration 0006 — prevent the data-loss footgun (PR #61)

How data *could* be lost: `profiles.user_id` FK to `auth.users` was `ON DELETE CASCADE`, so deleting an auth user wiped the profile + all matches. `0006_profiles_user_fk_set_null.sql`: (1) FK → `ON DELETE SET NULL` (deletion orphans the profile, kept + re-adoptable by email); (2) lowercase `profiles.email` backfill + BEFORE trigger, since `profiles_email_key` is case-sensitive while Supabase Auth lowercases (prevents case-only duplicates/misses). **Run manually in the Supabase SQL editor after 0005.** Merged on top of a parallel docs-restructure commit (`887b229`); verified live on `main`.

### Admin architecture (advice, no code)

Recommended **RBAC + decoupling identity/role from the job-seeker persona**: keep the personal account (`Shashank.srmncr@gmail.com`) for job-hunting and a **separate admin account** (a Gmail `+admin` alias works, free) set as `ADMIN_EMAIL` for the `/admin` ops view. Distinguished "change the app" (developer tooling — GitHub/Vercel/Supabase) from in-app admin (runtime monitoring). Offered optional multi-admin support + not auto-provisioning a job profile for admin-only accounts.

### 4. Admin access made DB-backed (migration 0007)

Follow-up to the above: the owner reported the Admin button was missing on the main login. Cause — admin was gated *solely* by `ADMIN_EMAIL` env matching the login email (no other gate), so an unset/mismatched env hid every admin surface. Made admin **DB-backed**: added `profiles.is_admin` (migration `0007_profiles_is_admin.sql`, which also grants the owner) and a new `isCurrentUserAdmin()` helper that returns true if `is_admin` is set **or** the email matches `ADMIN_EMAIL` (kept as bootstrap). Rewired all four gates (nav in `AppShell` via `layout.tsx`, `/admin` page, `/api/admin/keys`, `/api/admin/stats`). The `is_admin` read is error-tolerant (tolerates the column not existing pre-0007), so the code is safe to deploy before the migration runs. `tsc --noEmit` + `next build` clean. **Run 0007 in Supabase** (or set `ADMIN_EMAIL`) to light up the portal.

### PRs this session
#56 (adopt-by-email, partial) · #57 (docs) · #58 (atomic upsert — real fix) · #59 (docs correction) · #61 (migration 0006: FK SET NULL + lowercase email)

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
