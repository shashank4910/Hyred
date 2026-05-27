# JobRadar — Kiro Steering Context

> **This file is auto-loaded by Kiro in every new chat.** It provides full project context so continuity is maintained across sessions.

---

## 1. What is JobRadar?

A **personalized AI-powered job-search dashboard** built by Shashank (Senior Performance Engineer, India, 7+ years). Single-user for now, designed for multi-user/public later.

**Core flow:** Fetches jobs from multiple sources → AI-scores against resume → surfaces relevant matches → generates tailored ATS resumes + cover letters per job.

- **Repo:** https://github.com/shashank4910/JobRadar
- **Live:** https://job-radar-ten-nu.vercel.app

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Database | Supabase (Postgres + pgvector) |
| Auth | Custom JWT cookie (HS256 via `jose`) |
| AI | OpenAI `gpt-4o-mini` + `text-embedding-3-small` |
| AI module | `lib/gemini.ts` (named historically; uses OpenAI) |
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
5. AI pre-filter: titlePatterns → antiPatterns → AI relevance batch
6. LLM-score filtered candidates
7. Persist matches
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

scripts/ingest.ts           ← Cron entry point
scripts/backfill-jds.ts     ← One-time backfill script
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

Last updated: May 27, 2026 (end of initial build session)
