# AGENTS.md — JobRadar (read this FIRST, then stop)

> **Universal entry point for AI coding tools** (Cursor, Claude Code, Antigravity, Kiro, Codex, Gemini CLI…).
> This file is small on purpose. It is the **router + index** for the project's knowledge base.
> **Goal: minimum tokens.** Do NOT read the big docs end-to-end. Use the Index below to open ONLY the one section you need.

---

## 30-second project summary
**Hyred** (hyred.in; repo `JobRadar`) = a **multi-user** AI job-search dashboard. Next.js 15 + React 19 + TS on Vercel, Supabase (Postgres + Auth + Storage), **Groq Llama 3.3 70B (free) primary + OpenAI gpt-4o-mini fallback** for chat, OpenAI `text-embedding-3-small` for embeddings, GitHub Actions cron for ingest, Python browser-use agent on Render for auto-apply. GitHub repo is **private**. Owner/admin: Shashank.

---

## 📖 READ PROTOCOL (this is how you save tokens)

Pick the smallest tier that fits the task. **Never read `CONTEXT.md` in full for a routine task.**

- **Tier 0 — every task (already loaded):** this file. It has the rules + the index. If the task is trivial, you're done here.
- **Tier 1 — first time in this repo, or architecture/multi-file work:** open `CONTEXT.md` → `## Key Architecture Decisions`, `## File Map`, `## Known Pitfalls` (only those three).
- **Tier 2 — a specific task:** find the matching row in the **Index** below → open ONLY that one section (grep its exact `##`/`####` heading in the target file and read from there).
- **Tier 3 — "why was this done?" / history:** open `docs/context/session-log.md` (newest first) ONLY when investigating past decisions.

How to open one section cheaply: `grep -n "<heading text>" CONTEXT.md` to get the line, then read a bounded range — don't load the whole file.

---

## 🗂️ INDEX (topic → where → when to open)

| If you need… | Open | When |
|---|---|---|
| What the app is / stack | `CONTEXT.md` → `## Project Overview` | rarely (summary above usually enough) |
| **Coding rules / gotchas** (the must-nots) | `CONTEXT.md` → `## Known Pitfalls` | before editing AI/ingest/resume/auth code |
| How the AI pipeline works (search profile, JD fetch, 4-phase skill match, scoring) | `CONTEXT.md` → `## Key Architecture Decisions` | touching `lib/gemini.ts`, `lib/ingest.ts`, `lib/search-profile.ts` |
| Where a file/feature lives | `CONTEXT.md` → `## File Map` | locating code |
| **Job detail page** (skill match, tailored resume, keywords, PDF) | `CONTEXT.md` → `## Core App Features` → `### Job detail` + Known Pitfalls (ATS keyword rows) + `docs/context/session-log.md` → Sessions 9–11 | `JobActions.tsx`, `generateAtsResume`, keyword chips |
| **Onboarding / resume upload** | `CONTEXT.md` → `### Onboarding` + Known Pitfalls (resume parser + `.doc` rows) + `lib/resume-upload.ts` | first-time user, `/onboarding`, `/api/profile/parse` |
| **Top MNC page** | `CONTEXT.md` → `### Top MNC` + `lib/top-companies.ts` | `/top-mnc`, MNC badge filter |
| **Import job (manual URL)** | `CONTEXT.md` → `### Import job` | `/import`, `/api/import-job` |
| **Outreach / referral messages** | `CONTEXT.md` → `### Outreach` + `lib/gemini.ts` `generateOutreachMessage` | `ReferralRadar.tsx`, `/api/match/[id]/outreach` |
| **Cover letter generation** | `CONTEXT.md` → `### Job detail` + `app/api/coverletter/route.ts` | job detail page |
| **Premium Tier 1** (Match Intelligence, Interview Prep, Resume Studio Pro) | `CONTEXT.md` → `### Premium Tier 1` + `docs/features-jun26-to-be-built.md` + `lib/premium.ts` + migration **0015** | verdict/prep/resume APIs, quotas, `JobActions.tsx`, `/settings` usage |
| **ATS Fix Studio** (suggest / apply / paywall / real-resume preview) | `CONTEXT.md` → `## ATS Resume Checker` → Fix Studio + `AtsFixStudio.tsx` + `POST /api/ats-fix` (shares `resume_studio`) + `lib/resume-document.ts` + `app/_components/PremiumUpgradePanel.tsx` + `docs/context/session-log.md` → Session 29 | Fix Studio UI, credits, upgrade panel, document preview |
| **ATS evidence-grounded engine** (hybrid facts + LLM + quote gate) | `CONTEXT.md` → `## ATS Resume Checker` → Evidence-grounded pipeline + Known Pitfalls (dictionary / heading-patch rows) + `docs/context/session-log.md` → Sessions **30–31** | `ats-evidence-engine.ts`, semantic review, consistency gate, golden fixtures, PRs #269–#275 |
| **ATS section mapping** (odd/misspelled headings, no synonym zoo) | `CONTEXT.md` → `## ATS Resume Checker` → Section mapping + Session **31** | `semantic-sections`, `mergeSectionChecks`, token heading contains, PRs #274–#275 |
| **Dashboard city location filter** | `lib/match-location-filter.ts` + `listMatchCities()` in `lib/match-stats.ts` + `MatchFilters.tsx` + `docs/context/session-log.md` → Session 29 | filtering matches by city, `city` search param |
| **Dashboard freshness / older jobs / score slider** | `CONTEXT.md` → `### Dashboard — filters, freshness, older jobs` + Known Pitfalls (`posted_at` hide row) + Sessions **32–33** | `jobFreshnessOrFilter`, `fresh=1d\|7d\|30d`, `expired=1`, score slider, sticky Filters |
| **Dashboard sort (Highest score / Newest)** | `CONTEXT.md` → `### Dashboard — filters, freshness, older jobs` + Session **33** + `lib/job-listing-time.ts` | `MatchSortBar`; never raw `posted_at` DESC |
| **Optimize keyword green/amber/red** | `CONTEXT.md` → `### Job detail` (Optimize chips) + Session **32** + `keywordCloseInText` in `lib/gemini.ts` | closeHave, amber/orange chips, exact-only ATS score |
| **LinkedIn recruiting people search** | `lib/linkedin-people-search.ts` + Session **32** + `ReferralRadar.tsx` | quoted company, no network filter, `%22` encoding |
| **Apply profile form** | `CONTEXT.md` → `### Apply profile` + AI Auto-Apply section + Known Pitfalls (owner PII rows) | `/apply-profile`, extension autofill source |
| **Current UI / design tokens / Stitch / UI PRs** | `CONTEXT.md` → `## UI & Design System` (Hyred Lime, Session **33**) | any frontend styling, layout, or UX work |
| Multi-tenant plan & phase status | `CONTEXT.md` → `## ⭐ ACTIVE INITIATIVE` → `### Progress Tracker` | planning the next phase |
| LLM provider strategy (Groq/OpenAI, why not Gemini) | `CONTEXT.md` → Phase 0 research note + the `gemini-2.0-flash` pitfall row | changing AI providers |
| Capacity limits (Groq free tier, users per key) | `CONTEXT.md` → `#### Phase 3 capacity analysis` | scaling / quota decisions |
| Cost per user / 1→1000 scaling | `CONTEXT.md` → `#### OpenAI-primary cost model` | budgeting |
| Premium pricing floor / monetization planning | `CONTEXT.md` → `#### Minimum premium pricing floor` + `### Premium Tier 1` | Stripe tiers, what to charge, quota gates |
| Shared ingest / pub-sub by role topic (Phase 3) | `CONTEXT.md` → `#### Phase 3 design note — shared ingest / pub-sub by role topic` | scaling ingest before public launch |
| Multi-tenant PII in forms / resume prompts | `CONTEXT.md` → `## Known Pitfalls` (owner PII rows) | onboarding, apply-profile, `generateAtsResume` |
| Resume upload / `.doc` vs `.docx` / Vercel `fs` build | `CONTEXT.md` → `## Known Pitfalls` (resume parser + client bundle rows) + `lib/resume-upload.ts` | onboarding upload, `lib/resume.ts`, deploy failures |
| **LLM key admin (multi-key pool, daily quotas, RPM rotation)** | `CONTEXT.md` → File Map (`lib/llm-keys.ts`) + Known Pitfalls (Cerebras model deprecation, RPM ≠ exhaustion rows) + `docs/context/session-log.md` → Session 16 (a)–(c) | adding/rotating provider keys, debugging 429s, changing primary provider |
| **Dashboard pagination + back-nav scroll restore** | `CONTEXT.md` → File Map (`MatchList`, `BackToMatches`, `staleTimes`) + Known Pitfalls (back-nav skeleton, hydration mismatch rows) + Session 16 (d)–(e) | editing dashboard list, infinite scroll, jobs-list ↔ job-detail navigation |
| **JD HTML poisoning AI prompts** | `CONTEXT.md` → Known Pitfalls (HTML row) + `lib/jd-fetcher.ts` (`sanitizeJobDescriptionForAI`) + Session 16 (f) | any new code that puts `args.jobDescription` into a prompt |
| **`scoreJob` seniority + experience-gap cap** | `CONTEXT.md` → Known Pitfalls (over-scoring row) + `lib/gemini.ts` `scoreJob` + Session 16 (g) | tuning scoring, adding new score rules, debugging high-score-low-fit complaints |
| Repo visibility / deployment | `CONTEXT.md` → `## Repo & deployment notes` | go-live, collaborator access |
| **Freebuff auto-commit rule** (always ship work) | `.freebuff/rules.md` + `AGENTS.md` CRITICAL RULES #8 | any work that should be committed/pushed; "should I push?" questions |
| **Auth / login / Supabase Auth / Google OAuth setup** | `docs/AUTH_SETUP.md` | anything auth, or go-live config |
| Multi-user identity in code (`getCurrentProfile`, per-user scoping) | `CONTEXT.md` → `### Phase 1 log` + `lib/current-user.ts` | editing pages/routes that read user data |
| Stats / ingest run UX (user-scoped metrics, stuck `running`) | `CONTEXT.md` → Known Pitfalls (Stats global pool, ingest finalize rows) + `lib/ingest-runs.ts` | Stats page, scan history, `runIngest` |
| Admin-only job sources (data lake) | `CONTEXT.md` → Known Pitfalls (source visibility row) | `MatchFilters`, Stats by-source, `MatchCard` badges |
| Delete user / re-signup data reset | `CONTEXT.md` → Known Pitfalls (0006/0008 FK rows) + migration **0008** | auth delete, orphan profiles |
| **Public SEO pages + free tools** | `CONTEXT.md` → `## Public SEO Pages & Free Tools (PR #143)` | editing /explore, /free-tools, sitemap, robots.txt, or adding new public pages |
| **ATS Resume Checker (free tool + engine + scan report)** | `CONTEXT.md` → `## ATS Resume Checker` + Known Pitfalls (ATS keyword + dictionary/heading-patch rows) + Sessions **30–31** + `AtsScanReport.tsx` + `lib/ats-evidence-engine.ts` | hybrid vs structural, section mapping, report UI, JD match, public widget, Fix Studio entry |
| **Extension auto-login & autofill** | `CONTEXT.md` → `## ⭐ EXTENSION AUTO-LOGIN & AUTOFILL — Handoff (Sessions 22-23)` | extension auth, popup, content script, autofill |
| **Extension Workday end-to-end status** | `CONTEXT.md` → `### Workday autofill — end-to-end (extension v0.13.0+)` | all 5 wizard pages, PR table, profile pipeline |
| **Extension Workday Page 1 autofill** | `CONTEXT.md` → `### Workday autofill — Page 1 "My Information"` | multiSelect, promptIcon, LinkedIn source, `dumpWorkdayUnfilled` |
| **Extension Workday Page 2 My Experience** | `CONTEXT.md` → `#### Page 2 "My Experience"` | work/edu rows, languages panel, skills, GPA, currentlyWorkHere |
| **Extension Workday Page 3 Application Questions** | `CONTEXT.md` → `#### Page 3 "Application Questions"` | `workdayScreeningPrefsForQuestion`, work_permit_type, screening taxonomy |
| **Extension Workday Page 4 Voluntary Disclosures** | `CONTEXT.md` → `#### Page 4 "Voluntary Disclosures"` | EEO dropdowns, terms/privacy consent checkbox (Alight) |
| **Extension structured profile (Profile tab)** | `CONTEXT.md` → `#### Extension structured profile` | refresh-structure, structure API, migrations 0011–0013, AI extract |
| **Extension Tier B custom forms (beta)** | `CONTEXT.md` → `### Tier B — custom career forms (beta)` | GlobalLogic, domain skeleton, passive capture, semantic map, partial fill |
| **Extension Tier B deploy / debug** | `CONTEXT.md` → Tier B section + Known Pitfalls (Tier B rows) + File Map (`form-template`, `tier-b-form.js`) | 404 capture, common.js trim, migration 0014, second-visit expectations |
| **AI Auto-Apply Plan** (NEW) | `CONTEXT.md` → `## ⭐ ACTIVE INITIATIVE — AI Auto-Apply` | building / shipping the auto-apply agent |
| Kiro-specific steering | `.kiro/steering/jobradar-context.md` | Kiro auto-loads it |
| **Superpowers workflow (big tasks only)** | `.cursor/rules/superpowers-gate.mdc` | multi-phase features, new subsystems; skip for surgical fixes |
| Past session history | `docs/context/session-log.md` (newest first) | Tier 3 only |
| **Dream Company Job Alerts** | `CONTEXT.md` → `### Dream Company Job Alerts` + `docs/features-jun26-to-be-built.md` §4.8 + migrations **0016**, **0017** | `/dream-alerts`, catalog search, manual add, admin requests |
| **Paid job APIs (JobsPipe, JobDataLake, JSearch)** | `CONTEXT.md` → `### 5. Paid job APIs & location filters` + File Map (`lib/sources/jobspipe.ts`) + `docs/context/session-log.md` → Session 28 | ingest sources, Admin keys, usage dashboard, zero-fetch debugging |
| **User location → country filter** | `CONTEXT.md` → `### 5. Paid job APIs` + `lib/job-country-codes.ts` + `lib/data/job-location-dictionary.ts` | onboarding locations, worldwide cities, `job_country_code_or`, remote-only global |
| **Distributed LLM runtime (multi-instance)** | `CONTEXT.md` → File Map (`lib/llm-key-runtime.ts`) + Known Pitfalls (in-memory cooldown row) + migration **0018** + Session 28 | Vercel-safe RPM cooldowns, `acquire_llm_chat_slot`, 10-user scale |
| **Doc system / context bridges** | `docs/context/session-log.md` → Session 26 | fixing AGENTS↔CONTEXT↔session-log gaps |
| **Score ledger (stop re-scoring rejects)** | `CONTEXT.md` → Known Pitfalls (rejects re-scored row) + migration **0022** + `lib/ingest.ts` (`persistScoreLedger`) + `lib/profile-insights.ts` (ledger clear on resume change) | ingest cost, "why is X not re-scored", resume re-upload re-scoring |
| **DB performance (indexes, RPCs, pgvector)** | `CONTEXT.md` → Known Pitfalls (repeated COUNTs row) + migrations **0023**/****0024** + `lib/match-stats.ts` (RPC + fallback) + `lib/ingest.ts` (`candidate_jobs`) + Sessions **41–43** | slow pages, adding indexes, RPC fallbacks, vector backfill, SQL editor timeouts, missing-table 42P01 errors |

> Keep this Index in sync when you add/rename a `##` section in `CONTEXT.md`. It is the single source of the map.

---

## 🚦 CRITICAL RULES (always apply — do not violate)

1. **Token discipline:** follow the Read Protocol. Don't bulk-read `CONTEXT.md`.
2. **Verify before pushing:** run `npm run typecheck` (and `npm run build` for app changes). Must be clean.
3. **Git workflow:** new branch → PR → **always merge when CI is green** (squash + delete branch). Treat merge as part of completing **every** fix or update — do not leave work unshipped on an open PR. Merge without waiting for a second "please merge" unless CI is failing or the user explicitly says not to. **Never** push follow-up commits to a merged/closed PR's branch — branch off latest `main` and open a NEW PR. After merging, verify the change is live via `https://raw.githubusercontent.com/shashank4910/JobRadar/main/<path>` (local git cache can be stale in sandboxes).
4. **Evidence-based debugging:** read actual logs/errors first; don't guess-and-check.
5. **AI providers:** Groq primary + OpenAI fallback via `LLM_PRIMARY`. **Never reintroduce `gemini-2.0-flash`** (deprecated → 429). Embeddings are OpenAI-only.
6. **Multi-user:** resolve the user with `getCurrentProfile()` (`lib/current-user.ts`); scope every user-data query by `profile_id`. Never use the old "first profile" pattern.
7. **Free infra only** beyond API keys (owner constraint). No paid services without asking.
8. **Auto-commit + push everything (Freebuff rule, `.freebuff/rules.md`):** committing/pushing is part of every task — never ask "should I commit/push/merge?". After any change (fix, feature, docs, config, rules, extension work): commit on a fresh branch, push immediately, open a PR, merge when CI is green, verify live, and end the session with zero uncommitted work.
9. **Explain simply, always:** every explanation to the user must use easy, everyday words and at least one simple relatable example or analogy. No jargon without a plain-language gloss. Lead with "what was the problem → what was fixed → what it means for you" in story form (e.g. "the app kept re-asking the expert about candidates it already rejected" beats "idempotency was missing"). Code/comments stay technical; user-facing explanations stay simple.

---

## File map of the context system
- `AGENTS.md` (this) — router + index + rules. Auto-read by most 2026 tools.
- `CLAUDE.md` — pointer here (Claude Code).
- `.cursor/rules/jobradar.mdc` — pointer here (Cursor, always-apply).
- `.kiro/steering/jobradar-context.md` — Kiro steering (auto-loaded); also points here.
- `.freebuff/rules.md` — Freebuff pointer: auto commit + push everything (see CRITICAL RULES #8).
- `CONTEXT.md` — the full knowledge base (open by section via the Index).
- `docs/context/session-log.md` — dated session archive (Tier 3 history).
- `docs/AUTH_SETUP.md` — auth/go-live runbook.
