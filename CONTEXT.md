# JobRadar — AI Development Context

> **For any AI tool (Cursor, Claude, Antigravity, Kiro, etc.):** Read this file first before making changes. It contains the full project context, architecture decisions, known pitfalls, and debugging protocol.

---

## Project Overview

JobRadar is a personalized AI-powered job-search dashboard that:
1. Fetches jobs from Adzuna, Remotive, RemoteOK, HackerNews, Arbeitnow (cron every 6h)
2. AI-scores each job against the user's resume (0-100)
3. Surfaces relevant matches in a polished dark-themed dashboard
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

scripts/ingest.ts           ← Cron entry point
scripts/backfill-jds.ts     ← One-time: fetch full JDs + re-score
.github/workflows/ingest.yml    ← Cron schedule
.github/workflows/backfill.yml  ← Manual trigger for backfill
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

**Last updated:** May 27, 2026 (end of initial multi-session build)
