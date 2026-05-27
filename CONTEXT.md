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

**Owner:** Shashank Singh — Senior Performance Engineer (India, 7+ years)
**Stack:** Next.js 15, React 19, TypeScript, Supabase, OpenAI gpt-4o-mini, Vercel, GitHub Actions

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
lib/gemini.ts              ← AI: matchSkills, scoreJob, generateCoverLetter, extractResumeInsights
lib/jd-fetcher.ts          ← Fetches full JDs from source URLs
lib/search-profile.ts      ← AI SearchProfile generation + title classification + AI relevance filter
lib/ingest.ts              ← Main ingest pipeline (10 steps)
lib/sources/adzuna.ts      ← Adzuna API (multi-query, pagination, dedup)
lib/sources/index.ts       ← Source dispatcher
lib/pdf-resume.ts          ← Beautiful PDF resume generator
lib/matcher.ts             ← Cosine similarity + embedding text builder

app/(app)/jobs/[id]/        ← Job detail page + actions
app/api/match/[id]/skills/  ← Skill match endpoint
app/api/match/[id]/resume/  ← ATS resume (GET=keywords, POST=generate)
app/api/coverletter/        ← Cover letter generation
app/api/ingest/             ← Manual ingest trigger

scripts/ingest.ts                    ← Cron entry point
scripts/backfill-jds.ts             ← Backfill: fetch full JDs + re-embed + re-score existing jobs
.github/workflows/ingest.yml        ← Cron schedule (every 6h)
.github/workflows/backfill-jds.yml  ← Manual workflow_dispatch for bulk JD backfill
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
| Embed a job | ~$0.00002 | Per new job |
| AI relevance filter (batch of 15) | ~$0.001 | Per cron run (2-4 batches) |
| LLM score a job | ~$0.001 | Per scored job (30-80/run) |
| Skill match (per job detail view) | ~$0.002 | On demand |
| **Total per cron run** | **~$0.07-0.10** | 4x/day |
| **Monthly estimate** | **~$10-15** | At current usage |

---

## Update Protocol

**Update this file every 2-3 significant conversations.** Add:
- New bugs found and their root causes
- New features or architecture changes
- New "pitfalls" or rules learned
- Changes to the file map

**Last updated:** May 27, 2026 (session 2: JD truncation fix, UI redesign, backfill workflow, status='viewed' bug identified)

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
