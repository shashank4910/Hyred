# JobRadar — Session Log (Archive)

> **Tier 3 — rarely needed.** Chronological history of past work sessions. Open ONLY to investigate *why* a past decision was made. For everything else, use `AGENTS.md` → Index. (Newest first.)

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
