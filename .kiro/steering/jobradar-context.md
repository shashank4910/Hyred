# JobRadar — Project Context for Kiro

> **READ THIS FIRST in any new chat.** This document is the single source of truth for understanding what JobRadar is, what's been built, what's broken, and what the user wants. Avoid re-discovering things — read this and act.

---

## 1. What is JobRadar?

A **personalized AI-powered job-search dashboard** the user (Shashank, a Senior Performance Engineer in India, 7+ years experience) is building. Single-user app for now, but designed to be made multi-user / public later.

**Core value prop:** Instead of manually browsing 10 job boards, JobRadar fetches jobs from many sources, AI-scores them against the user's resume, and surfaces only the highly relevant ones — plus generates tailored ATS resumes and cover letters per job.

### Live URL
- Production: https://job-radar-ten-nu.vercel.app
- Repo: https://github.com/shashank4910/JobRadar

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Database | Supabase (Postgres + pgvector) |
| Auth | Custom JWT cookie (HS256 via `jose`) — single password gate |
| AI | OpenAI `gpt-4o-mini` (chat) + `text-embedding-3-small` (embeddings) |
| File: AI module | `lib/gemini.ts` (named historically; uses OpenAI now) |
| Job ingestion | GitHub Actions cron every 6h → `scripts/ingest.ts` → `lib/ingest.ts` |
| Hosting | Vercel (web) + GitHub Actions (cron) |
| Job sources | Adzuna India, Remotive, RemoteOK, HackerNews, Arbeitnow |
| UI | Tailwind, lucide-react icons, sonner toasts, custom dark theme |
| PDF | `jspdf` (resume PDF generator in `lib/pdf-resume.ts`) |
| Resume parsing | `pdf-parse-fork`, `mammoth` |

---

## 3. The User's Profile Data

The user is a **Senior Performance Engineer in India**. Critical facts to remember:

- `email`: Shashank.srmncr@gmail.com
- `seniority`: senior
- `years_experience`: ~7-8 years
- `top_skills` (in DB): loadrunner, jmeter, blazemeter, cavisson netstorm, appdynamics, dynatrace, splunk, jprofiler, jvisualvm, github actions, jenkins, core java
- `preferences.roles`: Senior Performance Engineer, Performance Test Lead, Performance Engineering Manager, Performance Consultant, Performance Test Analyst, Performance Automation Engineer
- `preferences.locations`: pune, noida, gurgaon
- `preferences.min_score`: 75 (note: this is high — see "Gotchas" below)

**The user's resume does NOT contain "spring boot" or "postgresql" as exact phrases**, even though they're a senior engineer. Don't assume any keyword is in the resume — verify with SQL.

---

## 4. Architecture / Pipeline

### Ingest Pipeline (cron every 6h, runs on GitHub Actions)

```
1. Pick profile (by INGEST_PROFILE_EMAIL secret)
2. Generate/load AI SearchProfile (cached 7 days in profiles.insights.search_profile)
   - searchKeywords: optimal Adzuna keywords (e.g. "loadrunner", "jmeter")
   - titlePatterns: positive title substrings
   - antiPatterns: reject-list substrings
   - primaryDomain, adjacentDomains
3. Fetch from sources (Adzuna queries use AI-generated searchKeywords)
4. Upsert jobs (ignoreDuplicates: true — preserves fetched_at)
5. Embed new jobs (text-embedding-3-small)
6. Build candidate pool (top 800 most recent embedded jobs)
7. AI Pre-filter:
   - classifyByTitle() drops jobs matching antiPatterns
   - aiRelevanceFilter() (batched, 15 jobs/call) classifies "maybe" titles
8. LLM-score the filtered set (scoreJob)
9. Persist matches to DB
```

### Job Detail Page Pipeline (per-job, on-demand)

```
User opens /jobs/[id]
  ↓
Skill match panel:
  POST /api/match/[id]/skills
    → ensureFullDescription() — fetches full JD if truncated
    → matchSkills() — 4-phase pipeline (see #6)
  ↓
ATS Resume:
  POST /api/match/[id]/resume — uses full JD + selected keywords
  ↓
Cover Letter:
  POST /api/coverletter — uses full JD
```

---

## 5. Database Schema (Supabase)

Tables (see `supabase/migrations/`):
- `profiles` — single user profile, includes `resume_text`, `resume_embedding`, `preferences`, `insights` (JSON, includes `search_profile`)
- `jobs` — raw jobs, `(source, source_id)` unique. `description` was the bug source (truncated by Adzuna).
- `matches` — `(profile_id, job_id)` unique. Has `llm_score`, `similarity`, `reason`, `status`, `cover_letter`, `notes`
- `ingest_runs` — telemetry for each cron run

---

## 6. Critical Component: Skill Match (`lib/gemini.ts → matchSkills`)

This is the most-debugged feature. It uses a **4-phase pipeline with hard invariants**:

```
Phase 1 (LLM): Extract jdRequirements from JD only (via prompt)
  - Includes EVERY specific tool/tech the JD mentions
  - Co-occurrence in resume is IRRELEVANT for this step
  - Worked example in prompt teaches LLM the right output

Phase 2 (LLM): Classify each jdRequirement as matched/missing
  - matched ⊆ jdRequirements
  - missing ⊆ jdRequirements
  - matched ∪ missing = jdRequirements (everything classified)
  - matched ∩ missing = ∅
  - Default to MATCHED when in doubt (synonyms/equivalents count)

Phase 3 (CODE): Drop matched/missing items not in jdRequirements
  - Catches LLM violating invariants

Phase 4 (CODE): Drop items not actually in JD text
  - Catches LLM hallucinations
  - Uses substring + significant-word match for paraphrasing
```

The 4-phase design protects against multiple failure modes the user has hit. **Don't simplify this.** It exists because of real bugs from PRs #4, #5, #6.

---

## 7. Journey of Bug Fixes (PRs #2 → #7)

The skill-match feature went through ~7 fixes. Read this so you don't repeat the same mistakes:

| PR | Fix | What was wrong | Lesson |
|---|---|---|---|
| #2 | Keyword picker + beautiful PDF | Initial feature build | — |
| #3 | Stronger LLM scoring + smarter title patterns | LLM scoring "Test Automation Engineer" as 60 (should be 70+) for performance engineers | Same testing umbrella concept |
| #4 | Skill match uses full resume + case-insensitive | Only top_skills (12 items) was being checked. Case-sensitive `.includes()` filter dropped valid matches. | Always check the full resume, not the distilled list |
| #5 | Strict JD-only requirements + Phase 3/4 verification | "Cavisson NetStorm" (resume-only) appearing as matched. LLM was leaking resume content into JD-only lists. | Code-side verification is necessary; can't rely solely on prompts |
| #6 | Include strong technical keywords | After PR #5, prompt was over-strict; LLM stopped including JMeter/BlazeMeter/Dynatrace in jdRequirements because they were also in resume. | Co-occurrence is irrelevant; use worked examples in prompts |
| #7 | **Fetch full JDs from source URL** | All Adzuna jobs had `desc_length: 500` (Adzuna search API truncates). LLM was working on first paragraph only. THIS WAS THE REAL ROOT CAUSE — PRs #4-#6 were actually working but on truncated input. | **Always check the data first. Don't assume the LLM is wrong if you haven't verified what's in its input.** |

### THE BIGGEST LESSON

For ~10 messages I made prompt fix after prompt fix without verifying the actual input data. The user finally said: "Let's debug it properly with evidence, not guesses." I asked for SQL output and discovered the JDs in the DB were 500 chars. **All my prompt fixes were correct but irrelevant.** When debugging a multi-stage pipeline, verify the data at each stage before changing any logic.

---

## 8. Critical Files (where to look)

```
lib/gemini.ts              ← AI helpers (matchSkills is the most complex)
lib/jd-fetcher.ts          ← Fetches full JDs from redirect_url (Adzuna fix)
lib/search-profile.ts      ← AI-generated search profile (caching SearchProfile)
lib/ingest.ts              ← Main cron pipeline
lib/sources/adzuna.ts      ← Adzuna fetcher (multi-page, multi-query)
lib/sources/index.ts       ← Source dispatcher, wires SearchProfile to Adzuna
lib/pdf-resume.ts          ← Beautiful PDF generator
scripts/ingest.ts          ← Cron entry point

app/(app)/jobs/[id]/page.tsx       ← Job detail page (server component)
app/(app)/jobs/[id]/JobActions.tsx ← Client component with skill match, ATS resume, cover letter UI
app/(app)/jobs/[id]/KeywordPicker.tsx ← Keyword toggle UI

app/api/match/[id]/skills/route.ts   ← Skill match endpoint
app/api/match/[id]/resume/route.ts   ← ATS resume gen (POST) + JD keyword extraction (GET)
app/api/coverletter/route.ts         ← Cover letter gen
app/api/ingest/route.ts              ← Manual ingest trigger

.github/workflows/ingest.yml ← Cron (every 6h)
```

---

## 9. Pending Work (User's last request)

User asked for these as **one-time activities** but I didn't complete them due to tool errors at the very end of the previous chat:

### Task A: Backfill full JDs for all existing Adzuna jobs
- Query: all jobs where `source LIKE 'adzuna%' AND char_length(description) < 1000`
- For each: call `ensureFullDescription()` (it persists)
- Rate limit: ~500ms between fetches
- Should NOT reuse the cron — this is a separate, manually-triggered backfill

### Task B: Re-score matches whose jobs got upgraded
- After backfill, jobs may have much longer descriptions
- For each job that was upgraded, re-run `scoreJob()` on existing matches for the user's profile
- Update `matches.llm_score` and `matches.reason`
- Also re-embed the upgraded jobs (embedding will be more accurate)

### Implementation Plan (was about to write but got stuck on tool errors)
1. Create `scripts/backfill-jds.ts`
2. Add `"backfill:jds": "tsx scripts/backfill-jds.ts"` to package.json
3. Create `.github/workflows/backfill.yml` with `workflow_dispatch` only — user can trigger from GitHub UI
4. The script should print clear progress (job N/M, upgraded? embedded? rescored?)
5. Stats at the end: processed / upgraded / fetch_failed / reembedded / matches_rescored

**Cost estimate**: ~1000 Adzuna jobs × ($0.00002 embed + $0.001 score) = ~$1-2 total. Negligible.

---

## 10. User's Preferences & Communication Style

The user is **technical, direct, and rightfully impatient with hit-and-trial debugging**. They've explicitly said:
- "I don't want you to do hit and trial. Let's debug properly with evidence."
- "Ask me what to do. Tell me, instruct me what things you need."

### When to ask vs when to act
- **For complex multi-stage bugs**: Ask for evidence first (SQL queries, network responses, JSON dumps). Pinpoint the failure stage before changing code.
- **For clear-cut tasks**: Just do it.

### Things they care about
- **Data accuracy** — false matches/misses are the #1 frustration
- **Real, tangible improvements** — they want to actually find good jobs, not see metrics improve
- **Speed of iteration** — they merge PRs quickly, expect fast cycles
- **Multi-user readiness** — even though it's single-user now, they want code that scales

### Things they DON'T want
- Hardcoded keyword lists (they prefer AI generating queries from the resume)
- Regex-based heuristics where AI works better
- "Smart" filters that miss obvious matches
- Long apologetic explanations — get to the fix

---

## 11. Common Debugging Recipe

When the user reports a bug in skill match / scoring / ingestion:

1. **First**: ask which PR has been merged, verify deployed commit hash matches latest (a previous bug was that changes were on a feature branch but cron ran from main)
2. **Then**: ask for SQL evidence:
   - For skill match: query `jobs.description` length and content
   - For scoring: query `matches` table with score distribution
   - For profile: query `profiles.insights`
3. **Then**: ask for network response from the relevant API endpoint (browser DevTools)
4. **Only after evidence**: propose a fix
5. **Fix on a new branch**, push, create PR, ask user to merge

Don't make multiple speculative fixes in a row. The user has explicitly punished this approach.

---

## 12. Things to NEVER Do

- ❌ Don't hardcode keyword lists like `['loadrunner', 'jmeter', ...]` in prompt builders. Use AI-generated profile.
- ❌ Don't trim the user's resume in ATS resume generation (PR fix in #2 — preserve all content).
- ❌ Don't cap searchKeywords at 6 (this was a hidden bug in adzuna.ts).
- ❌ Don't add new tools/skills to the ATS resume that aren't in the original.
- ❌ Don't assume `description` in DB is full — Adzuna truncates at 500 chars. Use `ensureFullDescription()`.
- ❌ Don't filter dashboard matches by `preferences.min_score` (user has it set to 75 which hides everything).

---

## 13. Things to ALWAYS Do

- ✅ Run `npx tsc --noEmit` before pushing.
- ✅ Use `mcp_sandbox_github_push_to_remote` (not raw `git push`).
- ✅ Create a new branch for each fix; PR to main.
- ✅ Use `ensureFullDescription()` whenever consuming `job.description` for AI work.
- ✅ When matchSkills changes, preserve the 4-phase pipeline (Phase 3 + 4 verification is critical).
- ✅ When uncertain whether a fix worked, ask user for SQL evidence before iterating further.

---

## 14. Open Questions / Future Work the User Mentioned

- Adding feedback loop ("👍/👎" on matches → AI learns user's taste)
- Email digest of top matches each morning
- More job sources (LinkedIn, Naukri APIs)
- "Auto-apply" agent (much later)
- Going public/multi-user (after the search quality is solid)

---

## 15. State of the Repo (as of context handoff)

- `main` branch HEAD: `66dfe04` (Merge PR #6) — actually PR #7 also merged later, check with `git log`
- All 7 PRs merged
- Pending: backfill script (Tasks A + B in section 9)
- Build is clean (zero TS errors)

When picking up in a new chat, **immediately**:
1. Read this file
2. Run `git log --oneline -10` to see latest commits
3. Run `git status` to see if there's any uncommitted work
4. Confirm with user what they want to tackle next

That's everything. Good luck.
