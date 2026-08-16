# JobRadar — AI Development Context

> **⚡ Token-efficient reading:** Start at **`AGENTS.md`** (repo root) — it's a small router + index + rules. Use its **Index** to open ONLY the one `##` section here that your task needs; do NOT read this whole file for routine work. First time on the repo? Read `## Key Architecture Decisions`, `## File Map`, and `## Known Pitfalls`. History/"why" questions → `docs/context/session-log.md`.
>
> _This file is the full knowledge base; `AGENTS.md` tells you which part to open._

---

## Project Overview

**Product brand:** **Hyred** (hyred.in) — repo folder/history still `JobRadar`.  
JobRadar / Hyred is a personalized AI-powered job-search dashboard that:
1. Fetches jobs from Adzuna, Remotive, RemoteOK, HackerNews, Arbeitnow (cron every 6h)
2. AI-scores each job against the user's resume (0-100)
3. Surfaces relevant matches in a polished light-themed dashboard (**Hyred Lime** — forest filter slab, grey cards, lime accent; Aug 2026. Earlier: Luminous teal / Stitch, May 2026)
4. Generates tailored ATS resumes + cover letters per job
5. Provides skill-match analysis (JD requirements vs resume)

**Owner:** Shashank Singh — Senior Performance Engineer (India, 7.7 years)
**Stack:** Next.js 15, React 19, TypeScript, Supabase, **Bluesminds (`DeepSeek-V4-Flash` / `gpt-4o`, paid primary via `llm_keys` table & env `LLM_PRIMARY`)** → Gemini `gemini-2.5-flash-lite` (free fallback) → Cerebras `gpt-oss-120b` (free) → Groq `llama-3.3-70b-versatile` (free) → OpenAI `gpt-4o-mini` (paid last-resort) & text-embedding-3-small (embeddings), Vercel, GitHub Actions, Python FastAPI + browser-use (auto-apply agent on Render)

---

## UI & Design System

> **UI index** — current look, where it lives in code, Stitch source, and UI-only PR history. Tokens + presentational components only; ingest/auth/scoring logic is unchanged.

### UI index (quick lookup)

| If you need… | Open below |
|---|---|
| **What the app looks like right now** | [Current UI](#current-ui-live-on-hyredin) |
| Colors, fonts, radii, shadows | [Design tokens](#design-tokens) |
| Sidebar, header, mobile nav | [App shell & layout](#app-shell--layout) |
| Which file owns which widget | [UI component map](#ui-component-map) |
| Google Stitch project / screens | [Stitch design source](#stitch-design-source) |
| What changed and when (PRs) | [UI change log](#ui-change-log) |
| **ATS Resume Checker** | [ATS Checker](#ats-resume-checker) |
| **Job detail, onboarding, Top MNC, import, outreach** | [Core App Features](#core-app-features) |
| UI bugs already fixed | [UI pitfalls](#ui-pitfalls) |

### Current UI (live on hyred.in)

**As of Aug 16, 2026** — **Hyred Lime** (Sessions **32–33**, PRs **#304–#316**): forest filter slab, floating pill header, white canvas, grey cards, Inter. Luminous/Stitch tokens remain in `tailwind.config.ts` for older surfaces; live dashboard chrome is forest + lime accent only.

| Aspect | Current (Hyred Lime) |
|---|---|
| **Primary / accent** | Forest `#003F3B`; lime `#72D35F` never fills the filter slab |
| **Canvas / cards** | White `#FFFFFF` page, grey `#F3F4F6` cards, Inter |
| **Desktop chrome** | Floating pill header + mobile dock; **no** left icon rail (`AppShell`) |
| **Filters** | Sticky forest slab: score slider, freshness ticks (`fresh=`), location `PremiumSelect` (no sort) |
| **Sort** | `MatchSortBar` above cards: Highest score / Newest (`lib/job-listing-time.ts`) |
| **Run Scan** | Header `SpecularButton` + live HUD bottom-right (`ScanLiveHud`) |
| **Match cards** | Lime score tile, skill pills, see more, one forest Apply now |

**Older Luminous look (May 2026, PRs #100–#106):** 260px left sidebar, Plus Jakarta Sans, circular score ring, teal-gradient Run Scan + scan-started toast. Still referenced in tokens/`globals.css`; do not revive the sidebar rail.

**ATS Checker (PR #129 / #187 / #266–#275):** Logged-in `/ats-checker` — premium scan report (`AtsScanReport`), evidence quotes + resume preview, Fix Studio entry; **hybrid evidence-grounded engine** (facts + LLM semantic + quote gate, PR **#269**) + **semantic section mapping** (PRs **#274–#275**, Session **31**). Public `/free-tools/ats-score-checker` — structural (zero LLM) + gated fact report; upload/paste, Try sample, JD match %.

### Design tokens

| Layer | File | Notes |
|---|---|---|
| Tailwind theme | `tailwind.config.ts` | Hyred Lime: forest primary, lime accent, Inter, `shadow-card` / `shadow-elevated` |
| Global components | `app/globals.css` | `.btn-primary`, `.card`, `.input`, forest/lime utilities |
| Toaster | `app/_components/AppToaster.tsx` | Bottom-right; mobile offset above bottom nav |
| Fonts | Google Fonts import in `globals.css` | **Inter** 400–800 (Hyred Lime). Plus Jakarta remains in older token comments only. |

**Semantic colors (common):** `primary`, `primary-container`, `match-success` (`#2cc9c0`), `text-muted`, `surface-container-lowest` (card white), `outline-variant` (borders).

### App shell & layout

| Piece | File | Behavior |
|---|---|---|
| Shell | `app/(app)/_components/AppShell.tsx` | Floating pill header (`z-[60]`), mobile dock, **no** left icon rail; `ScanLiveHud` |
| Header search | `app/(app)/_components/HeaderSearch.tsx` | **Dashboard (`/`) only**; flex spacer on other routes so Run Scan stays right |
| Run scan | `app/(app)/_components/RunIngestButton.tsx` | Header `SpecularButton`; admin source picker still a normal chevron |
| Scan UX | `ScanLiveHud` + `lib/scan-ui-active.ts` | Bottom-right radar pill; page stays clickable; Stop on the pill (PR **#308**) |
| Dashboard page | `app/(app)/page.tsx` | Forest `MatchFilters` + match list; sticky filters (PR **#316**) |
| Login | `app/login/page.tsx` | Teal/forest mark; no legal footer |

**Header nav (desktop pill):** Dashboard · My Resume · Apply profile · Stats · Dream Alerts · ATS · Top MNCs · Import · Settings · (Admin if `is_admin`).

### UI component map

```
app/(app)/_components/
  AppShell.tsx           ← floating pill header + mobile dock (no left rail)
  HeaderSearch.tsx       ← dashboard search → ?q= filter
  RunIngestButton.tsx    ← SpecularButton scan + admin source picker
  ScanLiveHud.tsx        ← bottom-right radar pill while scanning
  MatchCard.tsx          ← grey card, lime score tile, skill pills, see more
  StatusFilter.tsx       ← Inbox / Saved (and status) chips
  MatchFilters.tsx       ← sticky forest slab: score slider, freshness ticks, location PremiumSelect (no sort)
  MatchSortBar.tsx       ← Highest score / Newest above the job cards
  MatchList.tsx          ← grid + FLIP reorder on sort
  PageHeader.tsx         ← shared page title on logged-in routes

app/_components/ui/PremiumSelect.tsx  ← custom listbox (portal)
app/_components/react-bits/SpecularButton.tsx  ← WebGL rim (Run Scan only)

app/_components/
  AppToaster.tsx         ← (via app/layout.tsx) toast placement
  LegalConsentFields.tsx ← sign-up checkbox only
  LegalDocumentLayout.tsx / LegalFooterLinks.tsx ← public /privacy, /terms only

app/(app)/ats-checker/
  page.tsx               ← ATS Resume Checker (AtsScanReport, history, Fix Studio entry)
  AtsFixStudio.tsx       ← AI Fix Studio + Resume Studio credit meter + paywall panel
app/_components/ats-report/
  AtsScanReport.tsx      ← Logged-in scan report (premium cards, evidence, full report rail)
app/(app)/settings/
  page.tsx               ← Plan + Resume Studio usage + upgrade placeholder
app/_components/
  PremiumUpgradePanel.tsx ← Shared Premium hard-wall / upgrade CTA

lib/
  ats-checker.ts         ← Legacy 8-criterion deterministic scores (Fix Studio / structural base)
  ats-evidence-engine.ts ← Orchestrator: hybrid (logged-in) vs structural (public) → result + gated report
  ats-resume-parse.ts    ← Normalize + structured extract (contact, sections, bullets, dates)
  ats-fact-checks.ts     ← Layer A deterministic fact checks
  ats-semantic-review.ts ← Layer B LLM semantic review + quote grounding
  ats-consistency.ts     ← Layer C gate (no ungrounded fails; no pass with missing foundItems)
  ats-report.ts          ← AtsReport model + buildAtsReport (legacy / premium categories)
  ats-checker-samples.ts ← Shared sample resume + JD (India perf engineer) for app + public widget

app/free-tools/ats-score-checker/
  AtsCheckerWidget.tsx   ← Public widget: upload/paste, Try sample, structural report (zero LLM)
  AtsPublicReport.tsx    ← Public report UI (prefers API `report` when present)

app/api/ats-checker/
  route.ts               ← POST hybrid if signed in, else structural; returns report + resume_text

lib/
  scan-toast-id.ts       ← stable Sonner id for scan-started toast
  toast-app.ts           ← dismissAllAppToasts() on logout

.stitch/                 ← downloaded Stitch HTML + PNG reference (not served to users)
  matches-dashboard-luminous.html
  matches-dashboard-luminous.png
  README.md
```

### Stitch design source

| Field | Value |
|---|---|
| Tool | [Google Stitch](https://stitch.withgoogle.com) MCP `https://stitch.googleapis.com/mcp` |
| Project | **Hyred AI Career Platform** |
| Project ID | `3444316686130112255` |
| Reference screen | **Matches Dashboard (Luminous)** |
| Screen ID | `5bfaf7f2edd94ffca0cb356e70ce7c2b` |
| Also in Stitch (not all ported) | Onboarding (Luminous), Job Analysis (Luminous), Personal Stats (Luminous) |
| Local assets | `.stitch/matches-dashboard-luminous.{html,png}` |

**Implementation rule:** Port **tokens + layout patterns** into Next.js components; do not paste Stitch HTML wholesale (no React wiring, no auth). Backend routes/APIs unchanged.

### UI change log

| Date | PR | Summary |
|---|---|---|
| Aug 16, 2026 | **#316** | Filters **sticky** while jobs scroll (`lg:sticky` on wrapper, not stretched to list height) |
| Aug 16, 2026 | **#315** | Match-score **slider** + freshness ticks (`fresh=1d,7d,30d`); default 45-day window |
| Aug 16, 2026 | **#314** | **Newest** sort = `jobListingTime` (sane posted ∪ fetched); dropped A–Z |
| Aug 16, 2026 | **#313** | Sort bar above cards; sort removed from Filters; card FLIP |
| Aug 16, 2026 | **#312** | `PremiumSelect` custom listbox (portal) |
| Aug 16, 2026 | **#309–#310** | Sliding header pill tabs; lime specular Run Scan |
| Aug 15–16, 2026 | **#304–#308** | **Hyred Lime** listing + floating pill chrome + ScanLiveHud |
| Aug 6–7, 2026 | **#274–#275** | **ATS section mapping** — LLM `semantic-sections` in same call + token heading contains; merge LLM∪facts so incomplete maps don’t wipe Skills/Summary |
| Aug 6, 2026 | **#271 / #273** | **ATS report polish** — Skill Evidence sync, Involved-in / Vague dedupe, LinkedIn-only contact tip, no green JD without JD, empty-state tips |
| Aug 6, 2026 | **#269** | **Evidence-grounded ATS engine** — hybrid facts + LLM semantic + quote gate (logged-in); structural gated facts for public widget; server `report` on API |
| Aug 5, 2026 | **#268** | **ATS scan report premium cards** — KPI bento, elevated check cards, document resume preview (`AtsScanReport`) |
| Aug 5, 2026 | **#267** | **ATS full report** — dynamic repetition/spelling/contact/sections checks, sticky rail, category issue cards |
| Aug 5, 2026 | **#266** | **ATS resume evidence** — red quotes + highlighted resume preview; removed redundant detailed-findings accordion |
| June 18, 2026 | **#187** | **ATS Checker v9** — word-boundary keywords, JD aliases, India contact/location, length calibration, public widget paste/sample parity |
| June 8, 2026 | **#129 (cont.)** | **ATS scoring optimized** — 3 fixes from 1200 synthetic resume analysis: Length bands for entry-level, Skills contextualization threshold lowered, Soft Skills header added |
| June 8, 2026 | **#129** | **ATS Checker overhaul** — JD comparison, radar chart, animated UI, sample data, sample resume, keyboard shortcuts, score history, copy results |
| May 31, 2026 | **#106** | **Status filter** — 7-column grid; all tabs on one line (no horizontal scroll) |
| May 31, 2026 | **#105** | **Scan-started toast** — immediate notice + quick links while ingest runs (~1–2 min) |
| May 31, 2026 | **#104** | **Luminous polish** — tokens/forms/cards on job detail, onboarding, Stats, Admin, Import, errors |
| May 31, 2026 | **#103** | Dashboard **layout overlap** fix — flex stack until `xl`, `min-w-0`, `lg:pl-[284px]` |
| May 31, 2026 | **#102** | This **UI index** section added to `CONTEXT.md` + `AGENTS.md` row |
| May 31, 2026 | **#100** | **Luminous redesign** — Stitch tokens, sidebar shell, dashboard widgets, `MatchScoreRing`, login refresh |
| May 31, 2026 | **#101** | Run Scan **source picker** no longer clips under sidebar (`ml-auto`, header `z-[60]`, spacer when search hidden) |
| May 31, 2026 | **#99** | Legal: remove onboarding consent checkbox; sign-up-only Terms/Privacy; no footer links when logged in |
| May 31, 2026 | **#96** | Toasts → bottom-right; no persistent scan loading toast; dismiss on logout |
| May 31, 2026 | **#95** | `/privacy`, `/terms` pages + sign-up consent (later trimmed by #99) |
| May 31, 2026 | **#93** | Stats card footnotes removed |
| May 31, 2026 | **#92** | Stats counts aligned with Matches filters |
| Earlier | **#90** | Ingest cost optimization (not UI) |
| Pre-May 2026 | Kiro replication | Stitch project **Kiro Dev Design Replication** (`2007768131265843142`) — indigo palette; superseded by #100 |

When you ship UI work: add a row here, link the PR, and update **Current UI** if the live look changed.

### UI pitfalls

| Issue | Fix | PR |
|---|---|---|
| “Scanning job boards…” toast covered Run scan / Sign out | Bottom-right toasts; no blocking loader on manual scan | #96 |
| Logout toast stuck after scan | `dismissAllAppToasts()` + login cleanup | #96 |
| Resume AI consent checkbox friction | Removed from onboarding; covered at sign-up in Terms/Privacy | #99 |
| Admin **source picker** clipped by sidebar on Stats/other pages | Header `z-[60]`, `ml-auto` on actions, flex spacer when search hidden | #101 |
| **Match activity** sidebar overlapping status tabs / match cards on dashboard | Stack main + insights until `xl`; flex layout with `min-w-0`; explicit `lg:pl-[284px]`; lower sidebar z-index | #103 |
| Status filter **horizontal scrollbar** (tabs clipped off-screen) | Full-width `grid-cols-7`, compact equal tabs — one row, no `overflow-x` | #106 |
| Manual scan gave **no feedback** while ingest runs (1–2 min) | Rich **scan-started toast** via `scanStartedToast.tsx`; dismiss on complete / logout | #105 |
| Sticky filters scrolling away with cards | Pin the MatchFilters **wrapper** (`lg:sticky lg:top-24`); aside `h-[calc(100vh-7.5rem)]`; never `self-stretch` the slab to the list height | #316 |
| Native OS `<select>` popup vs Hyred chrome | `PremiumSelect` portal listbox | #312 |
| Scan toast covering the page | Live HUD pill bottom-right; page stays clickable | #308 |
| Header nav labels clipped in the pill | Own-row `FloatingPillNav`; no `overflow-x` clip | #309 |
| **Newest** sort scrambled vs card dates | Rank by `jobListingTime` (later of sane `posted_at` and `fetched_at`); never raw `posted_at` DESC | #314 |
| Filters scrolled away with the job list | Sticky wrapper + fixed-height slab, internal scroll | #316 |

---

## ⭐ ACTIVE INITIATIVE — Enterprise Multi-Tenant Transformation (Master Plan)

> **This is the current north-star.** JobRadar is moving from a single-user app (personalized for Shashank) to a **public, multi-tenant SaaS** where anyone can sign up, upload a resume, and get the full feature set. We execute this **one phase per chat session** — finish a phase, update this tracker, then start the next phase in a NEW chat. Do not mix phases.

### Progress Tracker (update after every phase)

| Phase | Title | Status |
|---|---|---|
| **0** | Strategic decisions (auth provider, cost model, scope) | ✅ Done |
| **1** | Real authentication & identity (Supabase Auth, replace first-profile pattern) | ✅ Done (session 7) |
| **2** | Data isolation & security (RLS, ownership checks, private resume bucket) | ✅ Done — per-user scoping + ownership checks + RLS; **resumes bucket private + signed URLs** (migration **0019**, `lib/resume-storage.ts`) |
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
| Q1 | Auth provider | **Supabase Auth** (email/pass + Google OAuth) — already on Supabase, native Postgres RLS, free tier, email verify + reset built in | ✅ **Supabase Auth (email/password + Google)** — shipped in Phase 1 |
| Q2 | Who pays for LLM calls? | Free tier + hard quotas, OR paid tiers (Stripe), OR bring-your-own-key. | ✅ for now: **shared OpenAI key for testing** (Groq primary in code, OpenAI fallback). BYOK/quotas deferred to Phase 3/4. |
| Q3 | Auto-apply at launch? | **Gate off / waitlist** — Render 512MB agent already crashes for one user; multi-user needs a queue + workers | ✅ kept available but **secondary/untested for multi-user**; per-user browser-agent scaling deferred to Phase 5 |
| Q4 | Hosting reality | Free tiers fine for beta; budget paid Supabase/Vercel at scale | ✅ **stay on free tiers** for the multi-user beta |

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

#### Phase 3 design note — shared ingest / pub-sub by role topic (May 30, 2026)

**Problem:** 1,000 users × 4 cron scans/day ≠ 4,000 tokens — it is **4,000 ingest runs**, each scoring **~30–80 jobs** at **~3,000 tokens/job** → **hundreds of millions of tokens/day** if every user re-fetches and re-scores everything.

**Direction (owner-approved concept, not built yet):** treat ingest like **publish/subscribe**:

| Layer | What happens | Token/API save |
|---|---|---|
| **Publish (shared)** | Cron scans **per topic** (role family + region, e.g. `performance-engineering / India`): fetch sources → upsert `jobs` → embed once | Huge — paid once per topic, not per user |
| **Subscribe (per user)** | User maps `SearchProfile` / roles → 1–3 topics; on new jobs: cosine pre-filter to top **15–30** candidates | Cuts LLM calls before scoring |
| **Personalize (per user)** | `scoreJob` only on shortlist (resume-specific 0–100) | Cannot pub/sub away — still per user |

`jobs` is already a shared global pool; `matches` is per `profile_id`. Phase 3 work = wire **topic publishers** + **subscriber shortlist** + **usage quotas**, not duplicate full ingest per profile.

**Top MNC** stays cheap: filter existing `matches` / `jobs` by `lib/top-companies.ts` — **$0** extra scan cost.

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

#### Minimum premium pricing floor (May 2026, evidence-based — planning only)

**Tier 1 entitlement code shipped (Session 27, Jun 2026):** `lib/premium.ts` + migration **0015** — quota gates on verdict/prep/resume; no Stripe yet. See `### Premium Tier 1` under Core App Features and `docs/features-jun26-to-be-built.md`.

| Assumption | Floor |
|---|---|
| Typical active premium user AI COGS | **~$1.50–2/mo** (with quotas + Groq primary) |
| Heavy premium user (unlimited scans/regens) | **~$8/mo** OpenAI |
| Infra + Stripe | **~$0.50–1/user/mo** at scale |

**Minimum charge (covers API + ~40% margin + fees):** **≥ ₹999–1,199/mo** or **≥ $12–15/mo** per paying subscriber. **Top MNC** = high margin (no extra API). **Unlimited regenerations/scans** without caps = margin killer.

**1,000 users ≠ 1,000 payers:** break-even on API alone needs roughly **15–20%+ of actives paying** at ~$12, or **~800+ payers** if most users are active on a 4×/day full ingest design.

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

### Phase 1 log — multi-user auth & identity (session 7)

Shipped the full single-user → multi-user transformation. Anyone can sign up (email/password or Google), onboard their own resume, and see only their own matches/scans.

**What changed (code):**
- **Auth:** `@supabase/ssr` added. `lib/supabase/server.ts` → `supabaseAdmin()` (service role, bypasses RLS) + `createServerSupabase()` (cookie-bound anon, resolves the user). `lib/supabase/client.ts` → `createBrowserClient`. `middleware.ts` rewritten to refresh the Supabase session + redirect unauthed (public: `/login`, `/auth`, `/api/extension`, `/api/ingest`).
- **Identity:** `lib/current-user.ts` — `getCurrentUser()`, `getCurrentProfile()` (lazy: link existing same-email profile or create new, keyed by `profiles.user_id`), `requireProfile()`, `isAdminEmail()`. `profiles.user_id → auth.users` added (migration `0005_multiuser.sql`).
- **Auth UI:** `/login` `LoginForm` = email/password sign-in + sign-up + "Continue with Google"; `app/auth/callback/route.ts` exchanges the OAuth/confirm code; logout via `supabaseBrowser.auth.signOut()`. Old password `/api/login` deleted; `lib/auth.ts` trimmed to the two helpers the extension still needs.
- **Per-user everywhere:** all ~10 first-profile lookups replaced with `getCurrentProfile()` (dashboard, onboarding, top-mnc, layout, `/api/profile`, `/api/apply-profile`, `/api/import-job`). `/api/profile` updates the authed user's own row (identity from session, not body).
- **Ownership checks:** every `match/[id]/*` route + `/api/coverletter` + job detail page now scope by `profile_id = current user`. Stats + dashboard "last scan" scoped per-user.
- **Per-user scan:** `runIngest({ profileId })`; `/api/ingest` (dashboard button) scans only the signed-in user; new `runIngestForAllProfiles()` for the cron; `scripts/ingest.ts` loops all onboarded profiles; `ingest_runs.profile_id` recorded.
- **Admin:** `/admin` page + `/api/admin/*` gated to `ADMIN_EMAIL`; Admin nav link hidden for non-admins.
- **RLS:** own-rows policies on profiles/matches/apply_profiles/ingest_runs (defense-in-depth; server uses service role).

**Verified:** `tsc --noEmit` clean; `next build` succeeds (all routes compile, middleware builds, `/api/login` gone).

**MANUAL SETUP REQUIRED before it works live (Supabase dashboard + Vercel):**
1. Run `supabase/migrations/0005_multiuser.sql` in the Supabase SQL editor.
2. Authentication → Providers → enable **Email** (toggle "Confirm email" as desired) and **Google** (paste Google OAuth client id/secret).
3. Authentication → URL Configuration → Site URL = your app URL; add `<app-url>/auth/callback` + `http://localhost:3000/auth/callback` to Redirect URLs.
4. Vercel env: set **`ADMIN_EMAIL`** (your email) so you keep Admin access. `AUTH_SECRET` no longer used.
5. First login with Shashank's existing email auto-adopts the existing profile (so current data/matches stay yours).

**Deferred (carried forward):**
- ✅ **`resumes` storage bucket is private** (migration **0019**) — app stores object paths and mints short-lived signed URLs via `lib/resume-storage.ts` (no `getPublicUrl` for resume PDFs).
- Extension routes (`/api/extension/*`) still resolve the first profile (owner tool, separate Bearer auth) — fine for now.
- `scripts/backfill-jds.ts` still single-profile (manual owner maintenance tool).
- Per-user cron currently re-fetches/re-embeds per profile (cost) → split shared vs per-user in Phase 3.

#### Phase 1 follow-up — duplicate-email sign-in crash FIXED (session 8, PR #56 + #58)

**Symptom (Vercel runtime logs):** login succeeded, then the dashboard threw
`Failed to create profile: duplicate key value violates unique constraint "profiles_email_key"` (`app/(app)/page.js`, digest `943845339`).

**Root cause:** `resolveProfileForUser()` in `lib/current-user.ts` only adopted an existing profile when `user_id IS NULL` (step 2). A profile already owned by a *different* auth identity but sharing the same email (e.g. the same address used via email/password **and** Google) fell through to the step-3 `INSERT` and hit the `profiles_email_key` unique constraint → crash *after* a successful login.

**Fix attempt 1 (PR #56, partial):** new helper `adoptProfileByEmail(sb, email, userId)` selects the oldest profile by `ilike('email', email)`, returns it if `user_id` already matches, else re-points `user_id` to the current user. Step 2 now adopts *any* same-email profile (not just null-`user_id` rows); step 3 inserted and, on a duplicate, fell back to adopting before throwing.

**Why #56 wasn't enough:** after #56 deployed, the crash recurred — a **new** digest `4079527518` at `06:50` (the merge of #56 went live `06:41`). Since `resolveProfileForUser` uses the **service-role** client (RLS bypassed) and `profiles.email` is `NOT NULL UNIQUE`, a read-then-`INSERT` guard cannot explain a SELECT-misses-but-INSERT-collides outcome *except* via a **time-of-check/time-of-use race**: on first sign-in the dashboard Server Component renders concurrently (prefetch + navigation), two `resolveProfileForUser` calls both see "no profile", and both `INSERT` — the loser hits `profiles_email_key`.

**Real fix (PR #58, `lib/current-user.ts`):** step 3 now uses an **atomic upsert** — `INSERT ... ON CONFLICT (email) DO UPDATE` (`onConflict: 'email'`, the `profiles_email_key` constraint). Postgres resolves the conflict in one statement: an existing same-email row (concurrent insert, legacy null-`user_id` row, or a row owned by another auth identity for the same address) is re-pointed to this user; otherwise a fresh row is inserted. A duplicate email can no longer crash sign-in. Lesson: for "create-on-first-use" rows, prefer an atomic upsert over read-then-insert. `tsc --noEmit` clean + `next build` succeeds (dummy envs).

**Data-safety follow-up — `0006` migration (session 8).** While verifying the above, found the admin's original profile (1150 matches) had been lost. Root cause: `profiles.user_id` FK to `auth.users` was `ON DELETE CASCADE`, so deleting an auth user wiped its profile + all matches. The original profile happened to survive only because the pre-fix adoption crash left it `user_id = NULL` (a NULL-`user_id` row isn't cascade-deleted), so it was recoverable by signing in with the original email. `0006_profiles_user_fk_set_null.sql`: (1) re-points the FK to **`ON DELETE SET NULL`** so deleting an auth user *orphans* the profile (kept, re-adoptable by email) instead of destroying it; (2) lowercases `profiles.email` + adds a BEFORE trigger to keep it lowercase, since `profiles_email_key` is case-sensitive while Supabase Auth lowercases — preventing case-only duplicates/misses. **Run manually in the Supabase SQL editor after 0005.**

**Revised delete semantics — `0008` + app purge (session 14, PR #83).** Owner expectation when deleting a test auth user: **fresh start** on re-signup, not ghost data. 0006's SET NULL + email re-adoption caused the opposite. Fix: migration **0008** restores **`ON DELETE CASCADE`**; `resolveProfileForUser()` deletes any `user_id IS NULL` orphan for the email before insert (except one-time `ADMIN_EMAIL` legacy link). Run **0008** in Supabase after 0006.

#### Phase 1 follow-up — Stats, ingest lifecycle, source privacy (session 14, PRs #83–#87)

- **Stats scoped to user matches** — never show global `jobs` count to end users (`jobs` remains a shared pool internally).
- **`lib/ingest-runs.ts`** — mid-run progress patches, `finally` finalize, stale-run cleanup (>12 min), overlap guard.
- **`lib/profile-insights.ts`** — resume change clears cached `search_profile` and overwrites `preferences.roles`.
- **Admin-only source surfaces** — `isCurrentUserAdmin()` gates source breakdown, filter dropdown, scan picker, match badges; non-admins cannot pass `sources` to `/api/ingest` or `?source=` filter.

---

## ⭐ ACTIVE INITIATIVE — AI Auto-Apply (One-Click Job Application)

> **This is the new active north-star.** The goal: one click → AI agent applies to any job on any ATS platform. The user clicks "Auto Apply" on a match, and the agent navigates the apply page, fills every field using their profile + tailored resume + cover letter, handles logins (via saved sessions), and submits. **AI-first philosophy** — one agent with vision + LLM handles ALL platforms: Workday, Greenhouse, Lever, BambooHR, SuccessFactors, iCIMS, Taleo, and any custom career portal. No hardcoded scripts per platform.

### Current state (what already exists)

The auto-apply pipeline was built in Sessions 3-4 but has **never actually worked end-to-end** due to infrastructure blockers. All code is on `main`:

| Component | File | Status |
|---|---|---|
| Python agent | `browser_agent/main.py` | ✅ Built, `browser-use==0.1.40` (ancient), Groq primary LLM |
| Docker for Render | `browser_agent/Dockerfile` | ✅ Built, deployed on Render free tier |
| Orchestration API | `app/api/match/[id]/auto-apply/route.ts` | ✅ Built — generates resume, PDF, cover letter, calls agent |
| Callback API | `app/api/match/[id]/apply-callback/route.ts` | ✅ Built — receives agent result, updates match |
| SSE live log UI | `app/(app)/jobs/[id]/AutoApplyButton.tsx` | ✅ Built — terminal-style log panel |
| Apply profile form | `app/(app)/apply-profile/` | ✅ Built — 50+ fields |
| DB schema | `apply_profiles` table, `auto_apply_*` columns on `matches` | ✅ Built |

### Known blockers (must fix before testing)

| # | Blocker | Detail | Fix |
|---|---|---|---|
| 1 | **Render 512MB can't run Chromium** | Agent starts and silently crashes on real page loads | Upgrade Render to $7/mo (1GB) OR switch to cloud browser service like Browserbase/Steel free tier |
| 2 | **`browser-use` pinned at v0.1.40 (ancient)** | Current version is well past 0.1.x with cloud-native architecture, session persistence, 2FA, anti-bot protection | Update `requirements.txt` to latest version; rewrite agent API calls to match new SDK |
| 3 | **Callback 401** | `INGEST_SECRET` env var not synced between Vercel and Render | Sync the secret, or better: rename to `APPLY_CALLBACK_SECRET` for clarity |
| 4 | **No session persistence** | Every apply starts fresh — no saved logins, no cookies | Add Playwright `storageState` → browser-use profile syncing (Phase 2) |

### Architecture (target)

```
User clicks "Auto Apply" on match
         │
         ▼
  ┌─────────────────────────────────────────┐
  │  app/api/match/[id]/auto-apply/route.ts │
  │  1. Fetch match + profile + job         │
  │  2. Ensure tailored resume exists       │
  │  3. Ensure PDF uploaded to Storage      │
  │  4. Load cover letter (user-generated)  │
  │  5. Load apply profile (50+ fields)     │
  │  6. Load saved browser session (if any) │
  └──────────┬──────────────────────────────┘
             │ POST /apply
             ▼
  ┌─────────────────────────────────────────┐
  │  browser_agent/main.py (Python FastAPI) │
  │                                         │
  │  Prompt to LLM:                         │
  │  "You are applying for a job...          │
  │   Candidate info: {profile}             │
  │   Resume PDF: {url}                     │
  │   Cover letter: {text}                  │
  │   Navigate to {job_url}                 │
  │   → Detect form type (any ATS)          │
  │   → Fill all fields via vision + LLM    │
  │   → Upload resume                       │
  │   → Paste cover letter if asked         │
  │   → Handle login (saved session or ask) │
  │   → Pause before submit (human review)  │
  │   → Submit → confirm success"           │
  │                                         │
  │  AI Agent (browser-use + vision LLM):   │
  │  • Sees the page (screenshot)           │
  │  • Understands each field's intent      │
  │  • Fills based on candidate profile     │
  │  • Handles ANY ATS (Workday, GH, etc.)  │
  └──────────┬──────────────────────────────┘
             │ SSE stream + callback
             ▼
  ┌─────────────────────────────────────────┐
  │  AutoApplyButton.tsx (React)            │
  │  • Live terminal log via SSE            │
  │  • Shows each step the agent takes      │
  │  • Pause for human review before submit │
  │  • Shows final result (success/fail)    │
  └─────────────────────────────────────────┘
```

### AI-First Agent Prompt Strategy

The agent prompt is the KEY — not scripts. A single prompt handles all platforms:

```
You are applying for a job on behalf of a candidate.

JOB: {title} at {company}
URL: {apply_url}

CANDIDATE PROFILE:
{full_name} | {email} | {phone}
{location} | {linkedin}
Resume: {resume_pdf_url}
Experience: {years} years
{essay_answers}

COVER LETTER: {text}

YOUR GOAL:
1. Navigate to the job URL
2. Look at the page — detect if it's Workday, Greenhouse, Lever,
   BambooHR, SuccessFactors, iCIMS, Taleo, or a custom portal
   (Doesn't matter — you handle ALL of them)
3. Check if logged in:
   - Yes → proceed
   - No → try saved session cookies
   - If expired → ask user to log in once
4. Find the apply button / form
5. Fill EVERY field using the candidate profile above
   - Name, email, phone → obvious
   - Work authorization → {work_auth}
   - Salary expectation → {salary}
   - Custom questions → use essay answers
6. Upload resume PDF from {url}
7. Paste cover letter if there's a textarea for it
8. Before clicking Submit: PAUSE and wait for user confirmation
9. Submit → confirm on confirmation page
10. Report result back via callback
```

### ATS Platform Strategy

| Platform | Phase | Approach | Expected Success |
|---|---|---|---|
| **BambooHR** | Phase 1 | Simple form, no login wall. Agent fills and submits directly. | ~90% |
| **Lever** | Phase 1 | Clean forms, API-friendly. Session may be needed. | ~85% |
| **Greenhouse** | Phase 1 | Structured forms, may require account. Session persistence helps. | ~80% |
| **Direct career portals** | Phase 1 | Company's own site — usually simple html forms | ~85% |
| **iCIMS** | Phase 2 | More complex, multi-step. Vision LLM needed for iframes. | ~70% |
| **Workday** | Phase 3 | Most complex. Profile creation, multi-step, iFrames, anti-bot. Needs saved session + vision. | ~60% |
| **SuccessFactors** | Phase 3 | Enterprise-locked, complex. Similar to Workday. | ~55% |
| **Taleo** | Phase 3 | Legacy, outdated UI but simpler DOM than Workday. | ~65% |

### Phased Implementation Plan

#### Phase 1 — Get one apply working end-to-end

**Goal:** Click "Auto Apply" on a BambooHR/Greenhouse job and see it actually fill and submit.

| Step | Task | Dependencies |
|---|---|---|---|
| 1.1 | Upgrade `browser-use` from v0.1.40 to latest in `requirements.txt` | None |
| 1.2 | Update `main.py` agent API to match new browser-use SDK (likely cloud-enabled) | 1.1 |
| 1.3 | Solve hosting: upgrade Render to $7/mo (Starter, 1GB RAM), or switch to Browserbase/Steel free-tier cloud browsers | None |
| 1.4 | Fix callback 401: ensure `INGEST_SECRET` (or renamed `APPLY_CALLBACK_SECRET`) is set in both Vercel and Render env vars | None |
| 1.5 | Test end-to-end on a simple BambooHR/Greenhouse apply URL | 1.1-1.4 |
| 1.6 | Add human-in-the-loop pause before submit (SSE sends user a confirm button) | 1.5 |
| 1.7 | Polish the UI: better status messages, error handling, retry button | 1.5 |

**Estimated effort:** 1-2 focused sessions

#### Phase 2 — Session persistence & login management

**Goal:** Agent remembers the user's login. First use → user logs into a platform → session saved. Next apply → auto-logged-in.

| Step | Task | Dependencies |
|---|---|---|---|
| 2.1 | Add Playwright `storageState` persistence per user (store in Supabase Storage as JSON) | None |
| 2.2 | On agent start: load saved session cookies before navigating | 2.1 |
| 2.3 | After successful login: save cookies back to storage | 2.1 |
| 2.4 | Handle session expiry: agent detects login page → ask user to log in again | 2.1-2.3 |
| 2.5 | (Optional) Store TOTP secrets in apply profile for 2FA auto-fill | Phase 1 done |
| 2.6 | UI: show "Saved session for {platform}" indicator, "Log in to {platform}" button | 2.2 |

**Estimated effort:** 1-2 sessions

#### Phase 3 — Complex platforms & edge cases

**Goal:** Handle Workday, SuccessFactors, Taleo, iCIMS. Multi-step applications, CAPTCHA, iframes.

| Step | Task | Dependencies |
|---|---|---|---|
| 3.1 | Upgrade agent to use cloud browser (anti-bot bypass) for Workday/SuccessFactors | $7/mo or paid cloud tier |
| 3.2 | CAPTCHA handling: agent detects → pauses → user solves → agent continues | Phase 1 |
| 3.3 | Multi-page applications (screener questions, assessments) — agent navigates all pages | Phase 1 |
| 3.4 | Resume upload variant handling (drag-drop vs file picker vs URL field) | Phase 1 |
| 3.5 | Better error recovery: if agent gets stuck on a field, skip it and log the reason | Phase 1 |

**Estimated effort:** 2-3 sessions

#### Phase 4 — Account creation & scale

**Goal:** Agent can create accounts on platforms that require them. Scale to multiple concurrent users.

| Step | Task | Dependencies |
|---|---|---|---|
| 4.1 | Agent detects "Create Account" vs "Sign In" → fills registration from apply profile | Phase 2 |
| 4.2 | Handle email verification: pause and wait for user to click the link | 4.1 |
| 4.3 | Queue system for concurrent user applies (one agent per user, not per job) | All previous phases |
| 4.4 | Success/failure monitoring dashboard per platform | 4.3 |
| 4.5 | Rate limiting per platform (don't trigger anti-abuse) | 4.3 |

**Estimated effort:** 2-3 sessions

### What the next session should do first

Open this file in a **new chat**, read this section, then start **Phase 1 Step 1.1**: upgrade `browser-use` and get the agent working on one simple apply URL. The code is already there — just needs the infrastructure fixes and the library upgrade.

### Key files reference for auto-apply

```
browser_agent/main.py              ← Python FastAPI agent (NEEDS REWRITE for latest browser-use)
browser_agent/requirements.txt     ← browser-use==0.1.40 (NEEDS UPDATE)
browser_agent/Dockerfile           ← Docker config for Render
app/api/match/[id]/auto-apply/route.ts ← Orchestration API (mostly solid)
app/api/match/[id]/apply-callback/route.ts ← Callback endpoint (solid)
app/(app)/jobs/[id]/AutoApplyButton.tsx ← UI (solid, minor polish needed)
app/(app)/apply-profile/           ← Apply profile form (solid)
lib/pdf-resume.ts                  ← PDF generator (solid)
```

---

## ⭐ EXTENSION AUTO-LOGIN & AUTOFILL — Handoff (Session 22)

> **⚠️ THIS IS A HANDOFF SECTION.** If you're reading this in a new chat, you're picking up where Session 22 left off. Read this entire section, then check the **Next steps** at the bottom. All code is on `main` (commit `bdf6d93`).

### What was built

Replaced the old shared `APP_PASSWORD` auth with **per-user auto-login via Supabase session**. Each user who is logged into hyred.in gets a user-specific 90-day JWT automatically — no shared password, no extra login step.

### Architecture (auth flow)

```
Extension popup opens
         │
         ▼
  Sends 'session' message to background.js (via chrome.runtime.sendMessage)
  ── Why through background.js? ──
  MV3 service workers with <all_urls> permission make credentialed cross-origin
  requests WITHOUT CORS restrictions. A direct fetch() from the popup would hit
  CORS on the session cookie (credentialed + chrome-extension:// origin).
         │
         ▼
  background.js → fetch('https://hyred.in/api/extension/session',
                     { credentials: 'include' })
         │
         ├── Cookies are auto-sent (user's Supabase session for hyred.in)
         │
         ▼
  Server reads Supabase session cookie → gets user → gets profile →
  signs a 90-day JWT with { scope: 'extension', profile_id: <user's id> }
         │
         ▼
  Response { token, profile } sent back to popup
         │
         ▼
  Popup stores { jr_url, jr_token } in chrome.storage.local → shows connected
  All future API calls use this JWT, scoped to the user's profile_id
```

**Fallback:** If the user is NOT logged into hyred.in, the popup shows the old `APP_PASSWORD` setup form (unchanged).

### Files changed

| File | Action | What |
|---|---|---|
| `lib/extension/auth.ts` | **Rewritten** | `signExtensionToken(profileId?)` accepts optional `profileId`, embeds it in JWT payload. `verifyExtensionToken` returns `ExtJwtPayload|null` instead of boolean. `isExtAuthed` returns `ExtJwtPayload|null`. Legacy tokens (no `profile_id`) still work. |
| `app/api/extension/session/route.ts` | **NEW** | `GET /api/extension/session` — reads Supabase session cookie → gets authed user → gets their profile → signs user-scoped JWT → returns `{ token, profile }`. Uses `createServerSupabase()` (cookie-based auth). |
| `app/api/extension/profile/route.ts` | **Updated** | Uses `profile_id` from JWT to fetch the correct user's profile. Falls back to first-profile for legacy tokens (no `profile_id` in JWT). |
| `app/api/extension/match-by-url/route.ts` | **Updated** | Scopes match lookup to `profile_id` from JWT. Falls back to first-profile for legacy tokens. |
| `app/api/extension/answer/route.ts` | **Updated** | Scopes screening Q&A to `profile_id` from JWT. Falls back to first-profile for legacy tokens. |
| `app/api/extension/apply/route.ts` | **Updated** | Scopes apply action to `profile_id` from JWT. Falls back to first-profile for legacy tokens. |
| `extension/background.js` | **Updated** | New `session` message handler: `callSession(url)` fetches the session endpoint with `credentials: 'include'` (bypasses CORS). |
| `extension/popup.js` | **Updated** | `tryAutoConnect()` sends `'session'` message to background.js instead of direct fetch. Falls back to setup form on failure. Added `sendBg()` helper. |

### What was tested

| Component | Status | Detail |
|---|---|---|
| TypeScript compilation | ✅ Passed | `npx tsc --noEmit` clean |
| Code review | ✅ Approved | CORS fix through background.js is correct |
| Commit & push | ✅ Pushed | `git push origin main` (commit `bdf6d93`) |
| Vercel deploy | 🟡 Auto-deployed | Deploy started after push to main; verify at hyred.in |
| Extension loaded in Chrome | ⬜ Not tested yet | User needs to load unpacked from `extension/` folder |
| Auto-connect with session | ✅ Works via Connect button | Click "Connect to Hyred" in popup → auth tab → JWT stored → connected automatically |
| Autofill on real job page | ⬜ Not tested | User was on a broken GlobalLogic URL (redirected to contact page) |

### Deferred / known issues

| Issue | Detail | Fix needed |
|---|---|---|---|
| **CORS on extension endpoints** | The `corsResponse()` helper returns `Access-Control-Allow-Origin: *` which doesn't work with `credentials: 'include'`. Currently bypassed by routing through `background.js`. If the extension ever needs direct `fetch()` calls to the API, CORS headers must be updated. | Add explicit origin handling or keep routing through background.js. |
| **Extension not auto-injected on all sites** | Content script runs on `<all_urls>` but the FAB (floating autofill button) only mounts if it detects an ATS form pattern. On unrecognised portals, the user must click the extension icon → "Autofill this page". | Improve ATS detection heuristics, or add a "force" mode. |
| **No resume upload from extension** | The extension can fill text fields but can't upload a file from the popup. The resume PDF from Hyred's storage is used instead. | Add file upload capability or use URL-based resume links. |
| **APP_PASSWORD still exists in code** | `lib/auth.ts` still exports `comparePasswords()` and `getAppPassword()`. The legacy auth endpoint `/api/extension/auth` is still active. Safe to keep until full migration. | Can deprecate once session auth is proven in production. |
| **No way to disconnect and reconnect as another user in popup** | The popup shows "Connected" but doesn't expose a simple "Connect as different user" flow. The user has to click Disconnect → enter setup form. | Add a "Switch account" button. |

### Next steps (to pick up from here)

1. **Load the extension in Chrome** — go to `chrome://extensions` → Developer mode → Load unpacked → select the `extension/` folder. Pin it to the toolbar.
2. **Log into hyred.in** in Chrome (if not already).
3. **Open a real job apply URL** — use a known working Lever page: `https://jobs.lever.co/getwingapp/f6c44f7d-2606-4e18-a886-8e96e59ed2f2`
4. **Click the extension icon** — it should show "Connected to hyred.in" with your name.
5. **Click "Autofill this page"** — check the Console (F12) for `[JobRadar]` logs.
6. **Fix any autofill issues** — the extension fills fields by regex matching on common field labels. Some platforms may need additional field patterns added to `content.js`.
7. **Add resume upload capability** — the extension currently relies on Hyred's stored resume PDF.

### Workday autofill — end-to-end (extension v0.13.0+)

> **Status (Jun 2026):** **Verified end-to-end** on Alight `*.myworkdayjobs.com` (Pages 1–5 wizard) and Cohesity Workday. Current extension **v0.13.0**. All five wizard steps autofill; user clicks **Save and Continue** / **Review** manually (no auto-submit).

| Page | Status | PRs / version |
|---|---|---|
| 1 My Information | ✅ | v0.8.9+ (Cohesity, custom-domain) |
| 2 My Experience | ✅ | #168–#172 — work/edu/languages/skills |
| 3 Application Questions | ✅ | #173 v0.12.9 — universal screening taxonomy |
| 4 Voluntary Disclosures | ✅ | #174 v0.13.0 — EEO + terms consent (Alight) |
| 5 Review | — | No fields; user submits |

**Profile pipeline (required before autofill):** Extension **Profile** tab → **Refresh from resume** (AI) → edit rows → **Save edits** → **Mark as reviewed**. Uses `POST /api/extension/refresh-structure`, `POST /api/extension/structure`, migrations **0011** (structured work/edu), **0012** (`languages`), **0013** (`work_permit_type`). See `#### Extension structured profile` below.

### Workday autofill — Page 1 "My Information" (extension v0.8.9+)

> **Also verified:** Cohesity `*.myworkdayjobs.com` and **custom-domain Workday** (e.g. Mastercard careers). **v0.10.0:** DOM-based Workday detection (`isWorkdayDom`) — not only `myworkdayjobs.com` hostname.

Workday is React-controlled and **does not** use standard `name`/`label` heuristics. It needs a dedicated adapter in `extension/content.js` (`fillWorkday`, `fillWorkdayMultiSelects`, etc.), inspired by Simplify/Jotofiller patterns (scroll into view → open prompt → type → confirm selection).

**After every extension reload:** hard-refresh the Workday tab (`Ctrl+Shift+R`). Otherwise `Extension context invalidated` — Copilot shows "Not connected" until refresh (v0.9.6+ shows explicit refresh hint).

**Custom-domain Workday (v0.10.0+):** Many employers (Mastercard, etc.) host Workday on `careers.company.com` — same `formField-*` DOM. `isWorkdayDom()` detects by DOM + page text. **v0.10.1:** `fanOutAutofill` in `background.js` sends autofill to **every frame** via `chrome.webNavigation.getAllFrames` + `tabs.sendMessage({ frameId })` — required when apply form lives in cross-origin Workday iframe (top-frame-only fill is a no-op).

#### What fills on Page 1

| Field | How |
|---|---|
| Given / Family name (+ local names) | `data-automation-id` on wrapper → nested `input` (`formField-legalName--firstName`, etc.) |
| City, Postal Code, Phone number | Same text-map pass on `formField-*` automation ids |
| Country (dropdown) | `button` → `ul[role="listbox"]` → click matching `li[role="option"]` |
| Phone device type | Dropdown → **Mobile** |
| **How did you hear about us?** * | **multiSelect prompt** → type **LinkedIn** → pick exact **LinkedIn** row → confirm chip (`selectedItem`) |
| Country phone code * | multiSelect / `searchBox` input → match profile country (e.g. India → India (+91)) |
| Previously employed at company? * | Yes/No radio → safe default **No** |
| Email | Pre-filled by Workday account (read-only) |

**Not filled (expected):** Address Line 1 (no street in Application Profile), Phone Extension, "I have a preferred name" checkbox (optional).

#### How it works (fill order in `fillWorkday`)

1. **multiSelect prompts first** (`fillWorkdayMultiSelects`) — scroll + click `promptIcon` (☰), not the bare input.
2. **Text fields** — scan every `[data-automation-id]` node; resolve nested `input`/`textarea` (automation id is often on the **wrapper div**, not the input).
3. **Button dropdowns** — `setWorkdayDropdown`: click trigger → wait for listbox → click option by text.
4. **Screening radios** — `fillWorkdayScreeningRadios`: heuristics + profile (`require_sponsorship`, `authorized_to_work`).
5. **Generic engine** — `autofill-engine.js` `buildFillPlan` + `fillKnownFields` + LLM `mapFields` fallback.
6. **Diagnostics** — `dumpWorkdayUnfilled()` logs remaining controls with `aid`, `role`, `label` (copy-paste for mapping gaps).

#### Critical Workday DOM gotchas (learned the hard way)

| Gotcha | Fix |
|---|---|
| `data-automation-id="multiselectInputContainer"` is on a **wrapper**, not the `<input>` | `findWorkdayMultiSelectInputs()` queries `wrapper input`, also `searchBox` and `formField-*source*` / `*countryPhoneCode*` |
| Prompt opens via **`promptIcon`**, not typing alone | `openWorkdayPrompt()` → `scrollIntoView` + click `data-automation-id="promptIcon"` |
| Typed search text ≠ committed value | `workdayMultiSelectFilled()` checks **`selectedItem` chip only** — never `input.value` |
| LinkedIn has sub-variants in results | `pickMsOption(..., preferExact)` → exact **LinkedIn**, not "LinkedIn (Ad Posting)" |
| Selection confirm | `confirmMsOption()` → click `promptLeafNode` / `promptOption`, then **ArrowDown + Enter** fallback |
| False "already filled" after source attempt | Scope chip check to `formField` root via `workdayMsFieldRoot()` |

#### Key files

| File | Role |
|---|---|
| `extension/content.js` | `fillWorkday`, `fillWorkdayExperiencePage`, `fillWorkdayWorkExperience`, `fillWorkdayEducation`, `fillWorkdayLanguages`, `fillWorkdayApplicationQuestionsPage`, `fillWorkdayVoluntaryDisclosuresPage`, `workdayScreeningPrefsForQuestion`, `findWorkdayEmptyDropdownTriggers`, `setWorkdayDropdownStrict`, `dumpWorkdayUnfilled` |
| `extension/ATS_ADAPTERS.md` | Target layout: one adapter per ATS; Workday still migrating out of `content.js` |
| `extension/ats-fill.js` + `extension/ats-config/workday.js` | Declarative Page 1 recipes + generic engine |
| `extension/autofill-engine.js` | Generic field catalog + `buildFillPlan` (runs after Workday pass) |
| `extension/background.js` | `fanOutAutofill` (all frames), session auth, optimistic `ping()` |
| `lib/extension/profile.ts` | `buildAutofillProfile` — Application Profile + structured work/edu/languages |
| `lib/structured-profile-service.ts` | AI extract + merge same-company work history |
| `app/api/extension/refresh-structure/route.ts` | Resume → structured profile (extension Profile tab) |
| `app/api/extension/structure/route.ts` | Save user edits to `apply_profiles` structured columns |

#### Debug console (page context, not `background.js`)

```
[JobRadar] content script loaded v0.8.9 on cohesity.wd5.myworkdayjobs.com …
[JobRadar] workday:ms scan found 2 multiselect inputs
[JobRadar] workday:source rule → LinkedIn
[JobRadar] workday:ms confirm ok → LinkedIn
[JobRadar] workday:multiselect source linkedin
[JobRadar] workday:UNFILLED (3) ↓   ← optional fields only when Page 1 is complete
```

Reload extension after every update; hard-refresh Workday tab (`Ctrl+Shift+R`) to avoid `Extension context invalidated`.

#### Page 2 "My Experience" (extension v0.12.x+, verified Alight Jun 2026)

**Detection:** `isWorkdayExperienceStep()` — resume upload, skills multiselect, or body text `My Experience` + skills/social/websites.

| Field | How | Source |
|---|---|---|
| **Work history rows** | `fillWorkdayWorkExperience` — click **Add**, fill each row via `fillWorkdayWorkExperienceRow` (company, title, dates spinbuttons, role description) | `profile.structured_work_history[]` |
| **I currently work here** | Checkbox only on **job index 0** when `end = Present`; past jobs **unchecked** | PR #171 |
| **Education** | `fillWorkdayEducation` — school typeahead, degree, field of study, **Overall Result (GPA)** | `profile.structured_education[]` |
| **Languages** | **Panel mode** (Alight): `languages-1` → Language dropdown + fluent checkbox + Comprehension/Overall/Reading/Speaking/Writing → `4 - Fluent`; click **Add** for row 2+. **Fallback:** chip multiselect | `profile.languages[]` (migration **0012**, default `["English","Hindi"]`) |
| **Skills** | multiSelect — `fillWorkdaySkills` / `addWorkdaySkill()` per skill; **once per autofill** (`workdaySkillsPassDone`) | `profile.skills[]` + match missing skills |
| **Resume/CV** | `input[data-automation-id="file-upload-input-ref"]` — PDF via `uploadResume` (DataTransfer) | Hyred storage |
| **LinkedIn / GitHub / social** | `fillWorkdaySocialUrls` + profile-consent radios | `profile.links` |
| **Screening radios on page** | `fillWorkdayScreeningRadios` (share-profile yes/no) | profile links |

**Languages panel (v0.12.8 — do not regress to multiselect-only):** Many tenants (Alight) use **Languages 1** panel, not chip multiselect. `findWorkdayLanguageRows()` detects `languages-N`, heading `Languages 1`, or Language + Comprehension/Speaking block. Simplify-style: English + all proficiency = Fluent.

**Work history gotchas:**

| Gotcha | Fix |
|---|---|
| Same employer twice in resume (client projects) | AI extract merges via `mergeSameCompanyWorkHistory` before save (PR #169) |
| All jobs get "currently work here" checked | Only index 0 + Present end date (PR #171) |
| Date fields are spinbuttons | `setWorkdayDatePart` on `datesSectionMonth/Year` automation ids |

**Skills flow (v0.9.3 — do not regress):** Cohesity Workday skills taxonomy is **server-side search**, not client filter. type keyword → **Enter** → wait options → click exact match (never `opts[0]` fallback). `workdaySkillsPassDone` guard.

**Debug logs:** `workday:experience page`, `workday:experience row`, `workday:languages panel rows found`, `workday:language name`, `workday:education`, `workday:UNFILLED`.

#### Page 3 "Application Questions" (extension v0.12.9+, verified Alight Jun 2026)

**Detection:** `isWorkdayApplicationQuestionsStep()` — wizard text `Application Questions` + sponsorship/auth/employer/non-compete markers.

**Strategy:** Universal **question-type taxonomy** — not per-company code. `workdayScreeningPrefsForQuestion(q, profile)` classifies each empty dropdown; company name in text is ignored.

| Question type (regex on label) | Answer | Profile / default |
|---|---|---|
| Legally authorized to work | Yes/No | `authorized_to_work` |
| Visa / sponsorship | Yes/No | `require_sponsorship` |
| **Permit type** (textarea) | Free text | `work_permit_type` or `Citizen of {work_auth_country}` (migration **0013**) |
| Restricted-nation list | Does Not Apply | never `profile.country` (v0.9.5) |
| Dual citizenship | Does Not Apply / No | safe default |
| Prior employment at **this** company | No | taxonomy — any employer name |
| Interviewed in last 6–12 months | No | taxonomy |
| Non-compete clause | No | taxonomy |
| Conflict / family at company | No | taxonomy |
| Accreditations / certifications | No / N/A | taxonomy |
| Current employer / title | text | `latest_company`, `current_title` |
| Saved answers | — | `custom_qa` checked first |

**DOM:** Dropdowns are `button[data-automation-id^="formField"]`. Use `findWorkdayEmptyDropdownTriggers()` + `workdayQuestionForControl()`. `setWorkdayDropdownStrict` on yes/no screening — no first-option fallback.

**Debug logs:** `workday:application-questions page`, `workday:appq-text`, `workday:appq-dd`, `workday:appq-dd failed`.

#### Page 4 "Voluntary Disclosures" (extension v0.13.0+, verified Alight Jun 2026)

**Two tenant shapes:**

| Shape | Example | What fills |
|---|---|---|
| **Terms-only** | Alight — "Terms and Conditions" + one checkbox | `fillWorkdayConsentCheckboxes` — `read and accept`, `terms & conditions`, `privacy policy` |
| **EEO + consent** | Cohesity, many US employers | Gender / veteran / disability dropdowns + consent checkbox |

**Detection:** `isWorkdayVoluntaryDisclosuresStep()` — `Voluntary Disclosures` in wizard + main content has terms **or** EEO markers (`aria-current="step"` preferred when present).

| Field | Profile source | Default if empty |
|---|---|---|
| Gender | `profile.gender` | **Decline to Declare** |
| Veteran status | `profile.veteran_status` | **I am not a protected veteran** |
| Disability status | `profile.disability_status` | **No, I don't have a disability** |
| Race / ethnicity (if shown) | — | Decline / prefer not |
| Terms / privacy consent | — | **checked** — scans `formField` labels + `input[type=checkbox]` + `[role=checkbox]` |

**How:** `fillWorkdayVoluntaryDropdowns` (EEO) then `fillWorkdayConsentCheckboxes` (terms). Set gender/veteran/disability on hyred.in **Application Profile** for exact EEO values.

**Debug logs:** `workday:voluntary-disclosures page`, `workday:voluntary-dd`, `workday:consent checked`.

#### Page 5 "Review"

No fields to fill — user reviews and submits. Optional: `markApplied` on submit (future).

#### Extension structured profile (extension v0.12.x+, PRs #168–#171)

AI-only resume extraction (no regex job parsing). Powers Page 2 autofill after user review.

| Piece | Location |
|---|---|
| AI extract | `lib/gemini.ts` → `extractStructuredApplicationProfile` |
| Same-company merge | `mergeSameCompanyWorkHistory` in `lib/structured-profile-service.ts` |
| DB columns | migration **0011** `structured_work_history`, `structured_education`, `structure_*` timestamps |
| Languages default | migration **0012** `languages jsonb` |
| Work permit text | migration **0013** `work_permit_type` |
| Extension UI | `extension/popup.js` Profile tab — edit rows, GPA, languages, **Save edits**, **Mark as reviewed** |
| Refresh API | `POST /api/extension/refresh-structure` |
| Save API | `POST /api/extension/structure` |

**Gating:** Autofill prefers `structured_*` when `profile_structure.reviewed === true`.

**Hyred vs Simplify:** Simplify records per-site answers + paid AI for essays. Hyred = structured Application Profile + universal question taxonomy + `custom_qa` reuse. Use `/api/extension/answer` only for long open-ended text when heuristics miss — not for EEO or yes/no screening.

### Tier B — custom career forms (beta) — domain form skeleton (extension v0.16.0+)

> **Status (Jun 2026):** **Beta — partial fill expected.** Unlike Simplify (which skips unknown custom sites), Hyred **attempts** long-tail career pages (WordPress/jQuery, custom domains like GlobalLogic). Copilot shows **Autofill (beta)**; user must review all fields; **no auto-submit**. Owner accepts partial success for now; promote to stable only after broader validation.

**Shipped:** PR **#185** (Tier B skeleton + semantic map), PR **#186** (GlobalLogic hidden-`<select>` fill). Extension **v0.16.1+**.

#### Tier A vs Tier B (extension autofill)

| Tier | Sites | Approach | Expectation |
|---|---|---|---|
| **A** | Workday, Lever, Greenhouse, Ashby, Phenom/universal | Dedicated adapters + `ats-config/*` | ~90% fill when profile reviewed |
| **B (beta)** | `detectAts() === 'generic'` and **not** Workday/Phenom | Domain skeleton + semantic keys + local value resolver | Partial fill; improves as skeleton matures |

`isCustomFormMode()` in `extension/content.js` gates Tier B.

#### What gets stored (Supabase) — structure only, no PII

Migration **0014** → `domain_form_templates`, `domain_form_captures`.

| Stored (shared across users) | **Never** stored |
|---|---|
| Domain, `structure_hash`, field labels, widget kind, dropdown **option labels** | Salary, notice period **values**, phone, gender **selection**, free-text answers |
| Semantic keys (`notice_period_days`, `gender`, …) after LLM map once per layout | User submit payload or manual typing |

Capture is **passive on form load** (debounced), **not** on submit. Quorum: **3 distinct reporters** → template `status = active`. Single-user capture still works (`draft`, lower confidence).

#### Pipeline (Tier B fill order)

1. Heuristics — `fillKnownFields` (email, phone, name, LinkedIn…)
2. **`fillCustomFormTierB`** — discover fields → `GET /api/extension/form-template` → semantic map gaps → `resolveProfileSemanticValue` + `pickDropdownOption` locally
3. Generic choices + screening radios + legacy `mapFields` (profile in prompt) as fallback

**LLM for Tier B:** `mapFormFieldsSemantic` in `lib/gemini.ts` — labels → semantic keys **only** (`POST /api/extension/map-fields` with `mode: 'semantic'`). Profile JSON is **not** sent.

#### Key files

| Piece | Location |
|---|---|
| Field discovery + passive capture | `extension/tier-b-form.js` → `window.__HyredTierBForm` |
| Tier B fill + `isCustomFormMode` | `extension/content.js` → `fillCustomFormTierB`, `applyTierBField`, `findNativeSelectForControl` |
| BG handlers | `extension/background.js` → `getFormTemplate`, `captureFormTemplate`, `mapFieldsSemantic` |
| Structure hash, value resolver, merge | `lib/extension/form-template.ts` |
| Load skeleton | `GET /api/extension/form-template?domain=&structure_hash=` |
| Capture skeleton | `POST /api/extension/form-template/capture` |
| Semantic map API | `POST /api/extension/map-fields` `{ mode: 'semantic', domain, fields[] }` |

#### Deploy checklist (required before Tier B works)

1. Migration **0014** applied in Supabase (tables exist)
2. API routes merged to `main` + Vercel live (404 = not deployed)
3. Extension reloaded from `extension/` — confirm manifest version **≥ 0.16.1**

#### Known limitations (beta)

- **Partial fill is normal** — custom jQuery dropdowns (GlobalLogic `common.js`) break if extension clicks visible div instead of hidden `<select>`; v0.16.1 prefers `select.value`.
- **Second visit does not replay manual values** — only structure is shared; values always come from the **current user's** Hyred apply profile.
- **`structure_hash` changes** when field discovery logic changes → new template row; old captures may not match.
- **Reference site:** GlobalLogic careers (e.g. IRC289549) — gender, notice period, experience buckets, expected salary.

#### Debug logs (acceptance)

Filter console `[JobRadar]`:

- `tierB:capture <domain> <hash> <capture_count>` — passive capture OK
- `tierB: loaded template draft|active conf=` — skeleton loaded
- `tierB: semantic map N keys` — first-time mapping
- `tierB:fill <semantic_key> <= <label>` — per-field success
- `tierB: filled N of M` — summary
- **Avoid:** `common.js … trim` on GlobalLogic — indicates div-click path; should use native select (v0.16.1+)

Verify Supabase:

```sql
SELECT domain, structure_hash, status, capture_count,
       jsonb_array_length(fields) AS field_count
FROM domain_form_templates
WHERE domain LIKE '%globallogic%';
```

#### Future upgrades (not started)

- Post-submit **structure-only** learning (multi-step forms)
- Per-domain widget executors in skeleton (not just semantic keys)
- Promote beta → stable UX when fill rate consistently high across top N domains

---

## Key Architecture Decisions

> Core AI/ingest pipeline rules. Open this section (not the whole file) before editing `lib/gemini.ts`, `lib/ingest.ts`, or `lib/search-profile.ts`. Indexed from `AGENTS.md`.

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
- Performance Engineering, QA/Automation, and SRE are distinct sub-specialties → cap mismatched roles at 60-65 (e.g., Performance Engineer matching a general QA Automation role is capped at 65)
- Differentiate other domain sub-specialties → cap Frontend vs. Backend at 60, Data Scientist vs. Data Engineer/Analyst at 60, DevOps vs. Developer at 60, and Product vs. Project Manager at 50
- "Performance" is ambiguous — marketing/finance uses ≠ engineering uses
- Tools are interchangeable (JMeter ≈ Gatling ≈ LoadRunner)
- Location alone should never drop score below 60

### 5. Paid job APIs & location-aware country filters (June 21, 2026)

**Sources:** JobsPipe (`jobspipe`), JobDataLake (`jobdatalake`), JSearch (`jsearch`), Adzuna India (`adzuna_in` — always `country: 'in'`, not user-derived).

**Country resolution (`lib/job-country-codes.ts`):**

```
preferences.locations + resume current_location
  → split on comma/semicolon/pipe ("Indore, Dubai")
  → lib/data/job-location-dictionary.ts (city / country alias / region)
  → ISO codes[] (max 6) — e.g. IN, AE, US, GB
```

- `remote_only` or location text is only "Remote" / "WFH" → **no country filter** (global APIs).
- Unrecognized city with no country name → **no filter** (safer than guessing).

**JobsPipe (`lib/sources/jobspipe.ts`) — core scan logic:**

| Step | Behavior |
|---|---|
| Title queries | `buildJobsPipeQueries()` in `lib/sources/index.ts` — `searchProfile.titlePatterns` + `primaryDomain` + up to 4 `searchKeywords` (max 6 titles). Role phrases beat single tools (`"performance test engineer"` not `"JMeter"` alone). |
| API call | **POST only** `https://api.jobspipe.dev/v1/jobs/search` |
| Body | `{ job_title_or: string[], job_country_code_or?: string[], posted_at_max_age_days: 30, limit: 25 }` |
| Batched first | One POST with all titles OR'd |
| Thin results | If &lt; 10 jobs, per-title POST (still with country filter) |
| Keys | `JOBSPIPE_API_KEYS` env + Admin `api_keys.jobspipe`; rotation on 401/402/429 |

**Do not use GET `/v1/jobs`** — returns `404 Not Found` on JobsPipe (wasted credits if called).

**JobDataLake** — `countryCodes` passed as query param per user (same resolver).

**JSearch** — `jsearchCountryParam(codes)` maps first ISO → country name string.

**Admin:** `JobApiUsagePanel.tsx` + `/api/admin/job-api-usage` — logs per request with masked key + `jobs_returned`. Keys UI in `AdminDashboard.tsx` (bulk paste for JobDataLake).

**Pitfall:** JobsPipe may return **0 jobs** for niche title + country combos even when the API key works (e.g. `performance test engineer` + `IN`). SAP + `IN` may return rows — index coverage, not Hyred bug.

---

## Core App Features

> Logged-in product pages with no dedicated extension/SEO section. Token-light pointers — pitfalls hold the must-nots.

### Job detail — skill match, tailored resume, cover letter

**Route:** `/jobs/[id]` · **UI:** `app/(app)/jobs/[id]/page.tsx`, `JobActions.tsx`

| Capability | API / lib |
|---|---|
| 4-phase skill match | `GET/POST /api/match/[id]/skills` → `matchSkills()` in `lib/gemini.ts` |
| JD keyword analysis + Optimize resume | `GET/POST /api/match/[id]/resume` → `generateAtsResume()`, `extractJdKeywords` |
| PDF download | `POST /api/match/[id]/resume/pdf` → `lib/pdf-resume.ts` |
| Cover letter | `POST /api/coverletter` |
| **Match Intelligence** (premium) | `GET/POST /api/match/[id]/verdict` → `lib/match-intelligence.ts` |
| **Interview Prep Pack** (quota) | `GET/POST /api/match/[id]/prep` → `lib/interview-prep.ts` |
| Resume version history | `GET /api/match/[id]/resume` → `resume_versions` table |
| Bookmark / status / notes | `/api/match/[id]/bookmark`, `status`, `notes` |

**Pitfalls:** ATS keyword flow (Sessions 9–11), owner PII in prompts, JD HTML sanitization, hallucinated skill chips (Session 19). See Known Pitfalls rows for `generateAtsResume`. Premium verdict GET returns `locked: false` for users who can generate (premium plan); free users see locked preview until they upgrade.

**Optimize keyword chips (Session 32, PRs #284–#285):** green = exact (`keywordInText` / `alreadyHave`); amber = close (`keywordCloseInText` / `closeHave`, tap to weave exact JD phrase); red = missing. ATS Match Score stays exact-only. Use `orange-*` for amber UI (theme remaps `amber` → teal). Keep `KEYWORD_CLOSE_ALIASES` tiny — no synonym zoo.

**Find an insider / LinkedIn (PR #286):** `lib/linkedin-people-search.ts` — recruiting search uses quoted company + role OR group, proper `%22` encoding, **no** network filter (TA/HR often outside 1st/2nd).

### Dashboard — filters, freshness, older jobs

**Route:** `/` · **UI:** `MatchFilters`, `MatchList`, `DashboardMatchesSection`, `MatchCard` · **API:** `GET /api/matches` · **Stats:** `lib/match-stats.ts`

| Piece | Role |
|---|---|
| City filter | `city` search param + `listMatchCities()` / `lib/match-location-filter.ts` (Session 29) |
| Score floor | URL `min` — **slider** 0–100 at top of Filters (PR **#315**); empty `min` still defaults to list min score 50 |
| Freshness ticks | URL `fresh=1d`, `7d`, `30d` (comma-separated; **widest wins**) via `freshnessWindowDays` / `dashboardFreshnessCutoffIso` (PR **#315**) |
| Freshness window | No ticks → hide if outside 45 days via `jobFreshnessOrFilter` — (`posted_at` ≥ cutoff **or** null) **OR** `fetched_at` ≥ cutoff (PR **#289**) |
| Include older jobs | `expired=1` → `includeExpiredJobs()` skips window; **Older** badge via `isJobPastFreshnessWindow` (PR **#290**). Ticking `fresh` clears `expired`. |
| Filter UX | Keep list visible + “Updating…” (PR **#287**); client refetch `/api/matches` + slim select (PR **#288**); Filters column **sticky** (PR **#316**) |
| Dropdowns | `PremiumSelect` (PR **#312**), not native OS menus |
| Sort | `MatchSortBar` above cards (PRs **#313–#314**). Highest score (default) / Newest via `jobListingTime` — not in Filters, not raw `posted_at` DESC |

**Do not** key hide-only **or Newest sort** on raw `posted_at` (paid APIs can write ancient/wrong/future dates). **Do not** bump `fetched_at` on job upsert conflict. `expired=1` cannot bring back hard-deleted cleanup rows.

### Premium Tier 1 — Match Intelligence, Interview Prep, Resume Studio Pro

**Roadmap:** `docs/features-jun26-to-be-built.md` · **Entitlements:** `lib/premium.ts` · **Migration:** `0015_hyred_premium_tier1.sql` (**manual run** in Supabase)

| Feature | Free quota | Premium quota | API |
|---|---|---|---|
| Match Intelligence | 0 (locked) | 9999/cycle | `GET/POST /api/match/[id]/verdict` |
| Interview Prep Pack | 1 lifetime | 8/cycle | `GET/POST /api/match/[id]/prep` |
| Resume Studio Pro | **3 lifetime** (until Stripe cycles) | 40/cycle | `POST /api/match/[id]/resume` **and** `POST /api/ats-fix` (shared ledger) |

**Shared Resume Studio credits:** job-detail tailored resumes + ATS **Fix Studio** generate/regenerate each consume 1 `resume_studio` event. Apply/undo/copy in Fix Studio are free. Usage meter: `GET /api/premium/usage` + Settings page `/settings`.

**Paywall UX:** `app/_components/PremiumUpgradePanel.tsx` — Fix Studio hard-wall when remaining is 0; job-detail 402 toast links to `/settings?upgrade=resume_studio`. Stripe checkout not wired yet (placeholder Settings CTA).

**UI:** `JobActions.tsx` — verdict card, prep card, collapsible resume version list; 402 → premium toast + Upgrade. Fix Studio: `AtsFixStudio.tsx`.

**Not built yet:** Stripe checkout, subscription management, Tier 2 (Smart Scan Plus, Autofill Pro). Premium-only: save Fix Studio resume to profile via `POST /api/profile/resume`.

**Dev testing premium:** insert `premium_subscriptions` row for your `profile_id` with `plan = 'premium_sprint'`, `status = 'active'`.

### Onboarding — resume upload & first profile

**Route:** `/onboarding` · **API:** `/api/profile`, `/api/profile/parse`

User uploads resume → parse server-side (`lib/resume.ts`) → AI insights → seeds `profiles` + preferences. **Client forms must use `lib/resume-upload.ts` only** (never import `lib/resume.ts` in client — Vercel `fs` build failure). Supports `.pdf`, `.doc`, `.docx`, `.txt`.

### Top MNC — premium-style MNC filter

**Route:** `/top-mnc` · **Filter:** `lib/top-companies.ts` against existing `matches` / `jobs` — **$0 extra ingest/API cost** (no separate scan). Sidebar: **Top MNCs**.

### Import job — paste a job URL manually

**Route:** `/import` (desktop nav) · **API:** `POST /api/import-job`

Fetches JD from URL, creates/updates job + match for current user (`getCurrentProfile()`). Use when user found a role outside cron ingest.

### Outreach — referral / recruiter messages

**UI:** `ReferralRadar.tsx` on job detail · **API:** `POST /api/match/[id]/outreach` · **AI:** `generateOutreachMessage()` in `lib/gemini.ts`

Generates a short personalized outreach blurb from resume + JD. Requires uploaded resume.

### Apply profile — autofill & auto-apply field memory

**Route:** `/apply-profile` · **API:** `/api/apply-profile`

50+ application fields (screening answers, work history structure, EEO prefs) used by **extension autofill** and **auto-apply agent**. Extension APIs: `/api/extension/profile`, `structure`, `refresh-structure`. Never hard-code owner PII in form defaults (PR #76).

### Dream Company Job Alerts

**Route:** `/dream-alerts` · **Migrations:** **0016** (alerts MVP), **0017** (company catalog + requests)

| Piece | Role |
|---|---|
| `lib/company-catalog/*` | Seeded catalog (~500+ cos), region filter, TCS-style aliases, lazy DB seed |
| `POST /api/dream-companies` | Watchlist add — catalog pick or `custom_name` manual pattern |
| Ingest hook | After scan, match new jobs against user's dream company patterns |
| Admin | `CompanyCatalogRequestsPanel` — approve user-requested companies (Tier C) |

Email/SMS delivery = future phase. Full spec: `docs/features-jun26-to-be-built.md` §4.8.

---

## File Map

```
lib/gemini.ts              ← AI: chat() with Bluesminds→Gemini→Cerebras→Groq→OpenAI provider chain (order set by LLM_PRIMARY env, default=`bluesminds`), dynamically built from PROVIDER_DEFAULTS; RPM-aware round-robin across ALL DB keys per provider, in-memory cooldowns (65s on 429), env-var fallback only when provider has ZERO DB keys, synthetic `env:{provider}` key IDs logged to activity panel; sanitizeJobDescriptionForAI at all 5 prompt sites, scoreJob seniority+years cap (server-enforced); isSkillPresentInJd() exported helper (session 19) — post-filters matchedSkills+missingSkills in scoreJob+matchSkills to eliminate LLM hallucinations
lib/llm-keys.ts            ← (Session 16 + later) Multi-key LLM rotation + PROVIDER_DEFAULTS (cerebras/groq/openai/gemini/mistral/sambanova/bluesminds). Bluesminds: `{ baseUrl: 'https://api.bluesminds.com/v1', model: 'gpt-4o' }`. Gets: getNextAvailableKey, recordUsage, daily reset, getRecentLlmActivity (live log), getAllLlmKeys, addLlmKey, updateLlmKey, deleteLlmKey, getLlmUsageSummary. Synthetic `env:{provider}` key IDs let env-var fallbacks appear in the admin activity panel.
lib/jd-fetcher.ts          ← Fetches full JDs from source URLs; exports stripHtml + containsHtml + sanitizeJobDescriptionForAI; ensureFullDescription self-heals HTML in stored rows
lib/search-profile.ts      ← AI SearchProfile generation + title classification + AI relevance filter
lib/ingest.ts              ← Main ingest pipeline (10 steps). INGEST_WALL_BUDGET_MS=50s (session 20) to prevent Vercel Hobby timeouts. SCORE_CONCURRENCY=5 + 3s SCORE_BATCH_DELAY_MS.
lib/ingest-runs.ts         ← Ingest run progress/finalize/stale cleanup (Stats + scan lifecycle)
lib/profile-insights.ts    ← Resume-change helpers: strip cached search_profile, refresh preferences.roles
lib/current-user.ts        ← getCurrentProfile(), isCurrentUserAdmin(), orphan purge on re-signup
lib/dashboard-data.ts      ← (Session 16) Cached (React `cache()`) per-request helpers: getDashboardCounts, getLastScanInfo
lib/match-stats.ts         ← Dashboard counts + city list + freshness (`jobFreshnessOrFilter`, `includeExpiredJobs`, `expired=1` / Session 32)
lib/match-location-filter.ts ← City label extract / sanitize (Session 29)
lib/linkedin-people-search.ts ← Find-an-insider LinkedIn URLs; recruiting query quoted + no network filter (PR #286)
lib/sources/adzuna.ts      ← Adzuna API (multi-query, pagination, dedup) — always India path
lib/sources/jobspipe.ts    ← JobsPipe POST /v1/jobs/search; job_country_code_or from user; batched titlePatterns (PR #222)
lib/sources/jobdatalake.ts ← JobDataLake GET /v1/jobs; user countryCodes on query
lib/sources/jsearch.ts     ← JSearch RapidAPI; country name from jsearchCountryParam()
lib/sources/index.ts       ← Source dispatcher; buildJobsPipeQueries(), buildJobCountryCodes() wiring
lib/job-country-codes.ts   ← Location → ISO for paid APIs; remote_only → global
lib/data/job-location-dictionary.ts ← 400+ cities, COUNTRY_ALIASES, REGION_TO_COUNTRIES (longest-match)
lib/job-api-keys.ts        ← Client-safe: JOB_API_SOURCES, maskKey, quotas (no server imports)
lib/job-api-keys-server.ts ← server-only: merge env + admin_settings.api_keys
lib/job-api-usage-types.ts ← Shared types for usage dashboard (client-safe)
lib/jobspipe-keys.ts       ← JobsPipe key pool (env + Admin DB)
lib/jobdatalake-keys.ts    ← JobDataLake key pool
lib/llm-key-runtime.ts     ← Cross-instance RPM cooldowns (migration 0018 llm_key_runtime)
lib/llm-concurrency.ts     ← Global in-flight LLM cap (acquire_llm_chat_slot RPC)
lib/pdf-resume.ts          ← Beautiful PDF resume generator (matches Shashank's exact format)
lib/resume.ts              ← Server-only resume parsers (.pdf / .doc / .docx / .txt) — API routes only
lib/resume-upload.ts       ← Client-safe upload helpers (`RESUME_FILE_ACCEPT`, `isResumeFilename`) — use from `'use client'` forms
lib/matcher.ts             ← Cosine similarity + embedding text builder
lib/top-companies.ts       ← MNC company name list for /top-mnc filter
lib/ats-checker.ts         ← Legacy 8-criterion ATS scores (PR #129 + v9 #187); still used by Fix Studio / structural base
lib/ats-evidence-engine.ts ← Evidence-grounded orchestrator (PR #269) — hybrid vs structural; `mergeSectionChecks` (PR #275)
lib/ats-resume-parse.ts / ats-fact-checks.ts / ats-semantic-review.ts / ats-consistency.ts ← parse → facts → LLM → gate; token headings + `semantic-sections` (PRs #274–#275)
lib/ats-report.ts          ← AtsReport categories/checks + buildAtsReport
lib/ats-checker-samples.ts   ← Shared Try-sample resume + JD
app/_components/ats-report/AtsScanReport.tsx ← Logged-in scan report UI (PRs #266–#268)
tests/fixtures/ats-resumes/  ← Golden corpus (Akansha, clean, empty, template-junk)
tests/unit/ats-evidence-engine.test.ts ← Grounding + gate + hybrid fixture tests
lib/premium.ts               ← Premium entitlements + quota helpers (interview_prep, match_intelligence, resume_studio)
lib/match-intelligence.ts    ← Apply/Stretch/Skip verdict generation (LLM JSON)
lib/interview-prep.ts        ← Interview prep pack generation (questions + STAR hints)

app/(app)/jobs/[id]/        ← Job detail: JobActions.tsx, ReferralRadar.tsx, AutoApplyButton, BackToMatches.tsx
app/(app)/onboarding/       ← First-run resume upload + profile setup
app/(app)/top-mnc/          ← Top MNC filtered job list (lib/top-companies.ts)
app/(app)/import/           ← Manual job URL import UI
app/(app)/ats-checker/      ← Logged-in ATS checker (AtsScanReport + Fix Studio + history)
app/(app)/apply-profile/    ← Application profile form (memory store for auto-apply)
app/(app)/_components/      ← AppShell (pill header), MatchCard, MatchSortBar, MatchFilters (slider + freshness ticks + sticky), HeaderSearch, RunIngestButton (SpecularButton), MatchList, ScanLiveHud, PageHeader
app/_components/ui/         ← PremiumSelect
app/_components/react-bits/ ← SpecularButton (ogl)
app/(app)/admin/            ← Admin Center: AdminDashboard (JobsPipe/JobDataLake/JSearch keys + bulk paste), JobApiUsagePanel.tsx, LlmKeysPanel.tsx, JobsControlPanel.tsx, CompanyCatalogRequestsPanel
app/(app)/dream-alerts/     ← Dream Company watchlist + alert feed (migration 0016+)
app/api/admin/job-api-usage/ ← GET usage logs by date range + source
app/api/dream-companies/    ← Dream company watchlist CRUD
app/api/company-catalog/    ← Catalog search + seed
app/_components/            ← AppToaster, LegalConsentFields, LegalDocumentLayout
tailwind.config.ts          ← Luminous design tokens (Stitch)
app/globals.css             ← .teal-gradient, .btn-*, .card, .input
.stitch/                    ← Stitch reference HTML/PNG (Matches Dashboard Luminous)
app/api/match/[id]/skills/  ← Skill match endpoint
app/api/match/[id]/resume/  ← ATS resume (GET=keywords+versions, POST=generate, quota-gated)
app/api/match/[id]/verdict/ ← Match Intelligence (GET cached/locked preview, POST generate)
app/api/match/[id]/prep/    ← Interview Prep Pack (GET cached, POST generate, quota-gated)
app/api/match/[id]/resume/pdf/ ← Generate PDF + upload to Supabase Storage
app/api/match/[id]/bookmark/ ← Toggle bookmark
app/api/match/[id]/auto-apply/ ← Orchestrate full auto-apply flow
app/api/match/[id]/apply-callback/ ← Agent callback on completion
app/api/match/[id]/outreach/ ← Referral/recruiter outreach message (ReferralRadar)
app/api/apply-profile/      ← GET/POST application profile
app/api/import-job/         ← Manual job URL import
app/api/profile/parse/      ← Onboarding resume parse
app/api/coverletter/        ← Cover letter generation
app/api/ats-checker/        ← POST free ATS analysis (file or JSON)
app/api/ingest/             ← Manual ingest trigger
app/api/matches/            ← (Session 16) Paginated match list (page=1..N, page size 20, all filters, Cache-Control SWR)
app/api/admin/llm-keys/     ← (Session 16) GET/POST list + add LLM keys; PATCH/DELETE [id] toggle/update/remove
app/api/admin/jobs-control/ ← (Session 20) GET counts, POST database lifecycle actions (backup_delete, restore, delete_only, get_debug_logs)

app/explore/                ← (PR #143) Public SEO job listing page — search, source filters, pagination, no auth required
app/explore/[id]/           ← (PR #143) Public job detail page — JobPosting structured data (schema.org) for Google rich results
app/free-tools/ats-score-checker/ ← (PR #143) Public ATS resume score landing page — WebApplication schema, testimonials, no auth required
app/sitemap.ts              ← (PR #143) Auto-generates sitemap with up to 5000 job URLs
app/robots.ts               ← (PR #143) Allows crawlers on /explore + /free-tools, blocks /admin /api

next.config.mjs            ← experimental.staleTimes.dynamic=30 (Session 16) — Router Cache reuses dashboard for 30s so back-nav skips the server + skeleton

browser_agent/main.py       ← Python FastAPI auto-apply agent (browser-use + Gemini)
browser_agent/Dockerfile    ← Docker config for Render
browser_agent/requirements.txt ← Pinned: browser-use==0.1.40

extension/content.js          ← Main autofill: Workday adapter, Tier B fillCustomFormTierB, heuristics, copilot card
extension/tier-b-form.js        ← Tier B (beta): field discovery, structure hash, passive capture scheduler
extension/background.js         ← Extension API hub: profile, mapFields, form-template, fanOutAutofill
extension/bg-messaging.js       ← MV3 worker wake + retry for chrome.runtime.sendMessage
extension/autofill-engine.js    ← Generic fill plan (after Workday / ATS config)
extension/ats-fill.js           ← Config-driven ATS fill runner
extension/ats-config/*.js       ← workday, greenhouse, lever, ashby, universal recipes
lib/extension/form-template.ts  ← Tier B domain skeleton: hash, merge, pickDropdownOption, resolveProfileSemanticValue
lib/extension/profile.ts        ← buildAutofillProfile shape for extension
app/api/extension/form-template/route.ts       ← GET load domain skeleton
app/api/extension/form-template/capture/route.ts ← POST passive structure capture
app/api/extension/map-fields/route.ts            ← legacy map (profile in prompt) + mode: semantic (Tier B)
supabase/migrations/0014_domain_form_templates.sql ← Tier B tables (manual run if not applied)
supabase/migrations/0015_hyred_premium_tier1.sql   ← Premium tables: subscriptions, usage, resume_versions, match_verdicts, interview_prep_packs (manual run)
supabase/migrations/0016_dream_company_alerts.sql  ← dream_companies, dream_company_alerts (manual run)
supabase/migrations/0017_company_catalog.sql       ← company_catalog, company_catalog_requests (manual run)
supabase/migrations/0018_llm_distributed_runtime.sql ← llm_key_runtime, llm_chat_semaphore, cooldown/slot RPCs (manual run after 0009)
docs/features-jun26-to-be-built.md                 ← Locked premium roadmap + Tier 1 + Dream Company status

scripts/ingest.ts                    ← Cron entry point
scripts/backfill-jds.ts             ← Backfill: fetch full JDs + re-embed + re-score existing jobs
scripts/clean-hallucinated-skills.ts ← (Session 19) One-time DB cleanup: reads all matches, runs isSkillPresentInJd(), upserts clean matched_skills/missing_skills arrays
scripts/clear-embeddings.sql        ← (Session 5, MERGED) Wipe stale 768-dim vectors so next ingest re-embeds with OpenAI 1536-dim. Run once in Supabase SQL Editor.
supabase/migrations/0009_llm_keys.sql ← (Session 16) llm_keys + llm_usage_log tables + increment_llm_key_usage RPC. **Manual run required.**
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
| `ignoreDuplicates: false` on upsert | Re-fetched jobs got their `fetched_at` reset, pushing them to top and displacing new jobs | Omit `fetched_at` from the upsert payload (so it default-sets to `now()` on insert, but remains untouched on conflict updates) and keep `ignoreDuplicates: false` so that duplicate IDs are still returned and counts remain accurate. |
| `status='viewed'` makes jobs vanish | Job detail page sets `status='viewed'`, but `'viewed'` is not in `STATUS_ORDER`. The job disappears from every tab. | Fix: add `viewed_at timestamptz` column, stop changing status on open, just stamp `viewed_at`. Reset existing `viewed` rows back to `new`. |
| Adzuna `posted_at` is unreliable | `created` field reflects when Adzuna indexed the job, not when the company posted it | Show exact date in tooltip; trust Remotive/RemoteOK more than Adzuna for freshness |
| **Dashboard hide keyed only on `posted_at` → cities vanish (Session 32, PRs #289–#290)** | UI card date uses `fetched_at`, but freshness filter used `posted_at`. JobsPipe/etc. can upsert ancient/wrong `posted_at` → match drops from list **and** from `listMatchCities()` (e.g. Noida). | Use `jobFreshnessOrFilter`: keep if `posted_at` fresh/null **or** `fetched_at` within `MAX_JOB_AGE_DAYS` (45). Never refresh `fetched_at` on upsert conflict. User opt-in: `expired=1` / **Include older jobs** skips the window; **Older** badge via `isJobPastFreshnessWindow`. Does not resurrect hard-deleted cleanup rows. |
| **Theme remaps Tailwind `amber` → teal (Session 32, PR #285)** | Close-match keyword chips used `bg-amber-*` and looked blank/wrong. | For warm “amber” UI use `orange-*` classes. |
| Pushing to a closed/merged PR's branch | Two important commits sat dangling on a closed branch for two test cycles; Render kept deploying old main; user got frustrated | Always check PR state with `github_list_pull_requests` BEFORE pushing. If closed/merged, branch off latest main and open a NEW PR. |
| Trusting local `git fetch` in this sandbox | Auth header issues silently fail the fetch; local git cache lies about remote state | Verify deployed state by fetching `raw.githubusercontent.com/{repo}/main/{path}` directly |
| `BROWSER_USE_HEADLESS` env var | Fabricated from earlier guessing; does not exist in `browser-use==0.1.40` source | Verify env-var/API names by reading the pinned version's source on GitHub. v0.1.40 needs explicit `Browser(BrowserConfig(headless=True, extra_chromium_args=[...]))` into `Agent(browser=...)`. |
| `text-embedding-004` deprecated (Google, 2026-01-14) | Ingest fails with `404 Not Found ... models/text-embedding-004`. `@google/generative-ai` SDK also EOL 2025-08-31. | Switch to OpenAI `text-embedding-3-small` (1536 dims, ~$1.30/mo). DB columns are JSONB so dimension change is non-breaking; cosine similarity returns 0 on length mismatch so old vectors are silently ignored. |
| `gemini-2.0-flash` throws "rate limit" 429 on ALL AI activities (May 2026) — ✅ FIXED session 6 | **WHERE:** a single chokepoint — `chat()` in `lib/gemini.ts` (lines 37-75), the `model.generateContent()` call with `CHAT_MODEL='gemini-2.0-flash'`. **ALL 6 chat AI features route through it**: `scoreJob`, `matchSkills`, `extractJdKeywords` + `generateAtsResume` (resume regen = 2 calls), `generateCoverLetter`, `extractResumeInsights`. Only `embed()` bypasses it (OpenAI-only). That's why scoring, skill-match, resume-regen, cover-letter ALL 429'd identically when Gemini was the active provider. **WHY:** Gemini 2.0 Flash is **deprecated, shuts down June 1 2026**; since **March 6 2026 it's "existing customers only"** → free/new keys get `429 ResourceExhausted` `limit: 0` (looks like a rate limit, means "model not on your plan"). Google also cut free limits 50-80% in Dec 2025 + free tier trains on data. **MASKING TRAP:** `chat()` tried OpenAI first, but on ANY OpenAI failure it did only `console.warn(...)` and silently fell through to Gemini → so a Gemini 429 was often a *symptom* of OpenAI not running (missing/exhausted key in that env, billing, outage), NOT a real Gemini rate limit. | **✅ FIXED (session 6, PRs #48 + #50):** dropped Gemini entirely. `chat()` builds a provider chain ordered by `LLM_PRIMARY` (default **`groq`**): **Groq `llama-3.3-70b-versatile` (free, primary) → OpenAI `gpt-4o-mini` (paid, fallback)**, both via the OpenAI SDK (Groq is OpenAI-compatible, `baseURL=api.groq.com/openai/v1`). PR #48 first added Groq as fallback; PR #50 flipped Groq to **primary** for cost ($0 unless Groq fails) + added the `LLM_PRIMARY` env toggle. No silent masking — each provider's error is recorded; combined error if all fail. `browser_agent/main.py` defaults to Groq (`LLM_PROVIDER=openai` to override). Secret: `GROQ_API_KEY` (Vercel + GH Actions + Render). **Watch:** Groq free tokens-per-minute cap may throttle the 30-80 job ingest burst → set `LLM_PRIMARY=openai` on the cron if needed (chain auto-spills to OpenAI on 429 regardless). |
| ATS parsers see one giant paragraph instead of bullets | PDF used graphical amber circles only — no text bullet character. Workday/Greenhouse/Lever/Taleo/iCIMS extracted bullet content as a single blob. | Render real `- ` text characters in the PDF text stream; ASCII-only output for legacy parsers. |
| LLM prefixes resume output with the word "Resume" | Navy header band rendered "Resume" as the candidate's name | Parser skips any leading `Resume / RESUME / Curriculum Vitae / CV / PROFILE` label before treating the next line as the name. Also call `doc.setProperties({ title, author, creator })` so PDF viewers show candidate name. |
| Duplicate-email crash on first sign-in (`profiles_email_key`) | `resolveProfileForUser` used read-then-INSERT. On first login the dashboard Server Component renders concurrently (prefetch + navigation), so two calls both saw "no profile" and both INSERTed — the loser hit the unique email index. A TOCTOU race: service-role bypasses RLS and `email` is `NOT NULL UNIQUE`, so a guard SELECT can't close the window. PR #56 (partial: adopt any same-email row) → PR #58 (real fix). | For create-on-first-use rows, resolve with an **atomic upsert** — `.upsert({…}, { onConflict: 'email' })` (INSERT … ON CONFLICT DO UPDATE) — never read-then-insert. |
| `profiles.user_id` FK was `ON DELETE CASCADE` (data-loss footgun) | Deleting a Supabase Auth user cascade-deleted that profile **and all its matches** — this is how the admin's 1150-match profile was lost. It only survived because the pre-fix adoption crash left it `user_id = NULL`, and NULL-`user_id` rows aren't cascaded. Separately, `profiles_email_key` is case-sensitive while Supabase Auth lowercases emails → mixed-case rows can be missed or duplicated. | Migration **0006** (PR #61): FK → `ON DELETE SET NULL` (deletion orphans the profile; re-adopted by email on next login) + lowercase `email` backfill & BEFORE trigger. Run it in the Supabase SQL editor after 0005. Never delete the auth user expecting the profile to stay. **Session 14:** owner wanted the *opposite* for test users — **0008** restores **`ON DELETE CASCADE`** + app deletes `user_id IS NULL` orphans on re-signup (PR #83). Run **0008** after 0006. |
| **0006 SET NULL → ghost data on re-signup** (session 14, PR #83) | Delete auth user → profile + matches survive with `user_id = NULL` → next login re-adopts by email → user sees old data. | Run migration **0008** (`ON DELETE CASCADE`). App purges detached rows on sign-in. Orphan cleanup SQL: `DELETE FROM profiles WHERE user_id IS NULL AND lower(email) = lower('…');` |
| **Stale job preferences after resume upload** (session 14, PR #83) | Re-adopted profile kept old `preferences.roles` (e.g. HR roles). `applyInsights()` skipped non-empty fields; profile save kept cached `insights.search_profile`. | On resume change: `stripSearchProfile()` + `preferencesFromResumeInsights()` in `lib/profile-insights.ts`; onboarding upload uses `applyInsights(ins, true)`. |
| **Stats showed global `jobs` count to new users** (session 14, PR #85) | `stats/page.tsx` queried entire shared `jobs` pool (~12k) while matches were profile-scoped → "Jobs in DB: 12613" with 0 matches. | User-facing Stats = **match counts only**. Never expose global pool size. `noStore()` + disable `/stats` Link prefetch. |
| **Ingest run stuck `running` with zero counters** (session 14, PR #86) | Final `ingest_runs` UPDATE only at pipeline end. Vercel 300s timeout or dropped connection → matches saved but row never finalized; "Last scan" picked unfinished row. | `lib/ingest-runs.ts`: progress patches mid-pipeline, `finally` finalize, `closeStaleIngestRuns()` (>12 min), last-scan query requires `finished_at`. |
| **Job source names exposed to regular users** (session 14, PR #87) | Stats "matches by source", "All sources" filter, match badges, scan source picker revealed LinkedIn/Adzuna/etc. — owner treats sources as proprietary data lake. | Gate source UI + `?source=` filter + `/api/ingest sources` body behind **`isCurrentUserAdmin()`** only. |
| Admin portal/button silently missing for the owner | Admin (the nav link in `AppShell`, the `/admin` page, and `/api/admin/*`) was gated **solely** by `isAdminEmail` = `email === process.env.ADMIN_EMAIL`. If `ADMIN_EMAIL` is unset, doesn't match the login email, or is set only in the wrong Vercel environment, every admin surface disappears with no error. | Admin is now **DB-backed**: `isCurrentUserAdmin()` (`lib/current-user.ts`) returns true if `profiles.is_admin` is true OR the email matches `ADMIN_EMAIL` (env bootstrap). Grant via migration **0007** (`update profiles set is_admin = true where lower(email) = '…'`). The DB read is error-tolerant (column missing pre-0007 → falls back to env), so it never breaks the app. Source breakdown/filter/picker also admin-only (#87). |
| ATS keyword add/delete/regenerate misbehaved (session 9, PRs forthcoming) | Four compounding bugs in the ATS keyword flow: **(1)** `generateAtsResume` merged ALL `jdKeywords` into one `allKeywords` list and told the model to "weave them in" → every JD keyword got auto-added even when the user only ticked a few. **(2)** The UI's `allMissingKeywords` merged the generator's `keywords.missing` (computed vs the freshly generated resume) with the **stale** `skills.missing` (from `matchSkills`, computed vs the ORIGINAL resume) → a keyword the generator had already woven in still showed as Missing, so the same keyword appeared as both "Woven" and "Missing". **(3)** The ATS score loop used `resume.toLowerCase().includes(kw)` substring matching → "AI" matched "available", "Java" matched "JavaScript" (inflated score) and it also scored user-excluded keywords. **(4)** Chip handlers + render used case-sensitive `Array.includes(kw)` → a chip whose casing differed from the stored keyword wouldn't toggle. | Inject ONLY user-selected keywords as new vocabulary (`keywordsToAdd`); treat the remaining JD keywords as emphasis-only `contextKeywords` ("do not add new — only surface if already in the resume"). Source the missing list ONLY from the generator's `keywords.missing` (filtered by excluded), never merge stale `skills.missing`. Score with a whole-token matcher (`keywordInText`, exported from `lib/gemini.ts`) over `jdKeywords` minus excluded, and reuse it in the GET route's already-have split. Do every keyword membership check case-insensitively (`.some(k => k.toLowerCase() === kw.toLowerCase())`). |
| Prompt **example text** and **context-keyword lists** leak into the resume | After session-9, Grafana/InfluxDB were STILL auto-added even when unselected. Two mechanical causes, both inside the prompt itself (not the user's selection): **(1) Example leakage** — a `KEYWORDS-TO-ADD RULES` example literally read `e.g. "Monitoring: Splunk, Dynatrace, Grafana, Prometheus"`, so the model copied "Grafana" verbatim into TECHNICAL SKILLS (and added InfluxDB as a sibling). **(2) Context priming** — the session-9 "fix" still *enumerated* every unselected JD keyword under a `CONTEXT KEYWORDS` list with a "do not add" caveat; listing them at all primes the model to weave them in (negation is a weak instruction against an explicit list). | Never put a real tool name in a prompt example. Do NOT enumerate unselected JD keywords in the prompt at all — the full JD is already there for relevance. Only list the user's `keywordsToAdd`. Keep an always-on STRICT KEYWORD SCOPE rule. Add a deterministic safety net (`stripUnauthorizedSkillKeywords` in `lib/gemini.ts`) that removes any JD keyword the model added that the user did NOT select, from TECHNICAL SKILLS lines, then re-scores. Diagnostic `console.log` of keyword inputs/outputs in `generateAtsResume` gives Vercel-log evidence. |
| ATS keyword UX was too complex (3 staging entry points, 2 colour languages, different pre/post-gen UIs) | The Skill-match panel, the KeywordPicker, and the post-gen analysis all staged keywords independently, so the same keyword could show 3 times in 2 meanings of "red". Job seekers found it confusing. | Single `KeywordManager` panel (same before/after optimize) with 4 buckets — **In your resume** (green) / **Added** (green, click to remove) / **Will be added next** (amber, pending) / **Missing** (red, click to add) — one **Optimize My Resume** CTA, a "pending changes" banner, and a live score+delta. Removed Skill-match panel, KeywordPicker, custom-keyword input, and the explicit exclude list (un-staging removes a keyword because every optimize regenerates from the MASTER resume). Client passes its `jdKeywords` to the POST so the universe stays stable across regenerations. |
| Selected keywords still missing after Optimize — esp. "prose" ones (session 11, PRs #67/#69/#70) | The prompt only *asked* the LLM to weave selected keywords in; the model non-deterministically skipped some. Tool-like keywords had a deterministic append, but **activity/metric/concept** keywords ("load testing", "stress testing", "KPI") had no guarantee — a regression pass only `console.log`'d a warning for them, so they silently vanished and stayed in "Will be added next". Re-clicking Optimize is NOT an acceptable fix (user thinks the app is broken). | A code-level guarantee runs after the LLM + the unauthorized-strip pass in `lib/gemini.ts`: `ensureSelectedKeywordsPresent()` appends missing **tool** keywords to `TECHNICAL SKILLS`; `ensureCompetencyKeywordsPresent()` guarantees **activity/metric/concept** keywords via a `CORE COMPETENCIES` section (created if absent). Re-score after inserting so the UI buckets match reality → 100% of selected keywords land in ONE Optimize. **Placement decision (tool vs activity) is LLM-driven, not hardcoded:** `extractJdKeywordsTyped()` tags each JD keyword `type: 'tool'\|'activity'` in the same extraction pass; the `keywordTypes` map is plumbed GET→client→POST→`generateAtsResume`; `isToolKeyword()` trusts the LLM type first and only falls back to the `isSkillLikeKeyword` heuristic. Hardcoded tool lists don't scale — they're last-resort only. |
| **Resume PDF: blank navy band + name & contacts stacked in the body (session 11, PR #73 — the REAL fix)** | The candidate's name renders as an empty band with the name + every contact line stacked below it in dark text. ROOT CAUSE: `parse()` ran the ALL-CAPS `isSectionHeader()` test (`^[A-Z][A-Z\s&/-]+$`) **before** capturing the name. An all-caps name like "SHASHANK SINGH" matches that pattern → it was treated as a SECTION header, so `parsed.name` was empty (band blank) and the title + contacts became that section's body bullets (stacked). NOTE: PR #71 (ASCII `" \| "` separators + auto-shrink) was a real change but a RED HERRING for this symptom — it never executed because `contactLines` was empty. | In `parse()`, capture the FIRST eligible (non-label) line as the name BEFORE the section-header test. Names are always line 1, even all-caps. Verify PDF changes by dumping the jsPDF page content stream (`doc.internal.pages[1]`) and checking draw order/fill — do NOT trust plain text extraction (it can't tell band vs body). **ATS note:** the PDF is true selectable text, single-column, Helvetica, real `- ` bullets, standard headings = no ATS blockers; `-- N of M --` lines in text dumps are the extractor's page markers, not content. |
| Owner PII pre-filled for new users (onboarding / apply profile) | `ApplyProfileForm` merged a `DEFAULTS` object (owner name, email, phone, LinkedIn, full essay answers) on first API load when `apply_profiles` row was missing — values appeared as real input text, not just placeholders. `OnboardingForm` placeholders also used owner-specific examples ("Shashank Singh", "Pune, Noida, Gurgaon"). | **PR #76:** `FORM_DEFAULTS` = non-PII only (country, notice period, etc.); generic placeholders; GET `/api/apply-profile` seeds `email`/`full_name` from signed-in `profiles` row only; strip server metadata on save. Never merge hard-coded identity into multi-tenant forms. |
| Owner contact/achievements baked into `generateAtsResume` prompt | Prompt hard-coded fallback contact (`SHASHANK SINGH`, phone, Noida, owner LinkedIn) + perf-specific summary example + JMeter/Charles Schwab achievement clause → other users' tailored resumes inherited owner details. | **PR #75:** `contactBlock` built only from `args` + resume text; `extractLinkedinFromResume()`; no hard-coded fallbacks; removed owner-specific JMeter achievement injection; never put real names in prompt examples. PDF filename fallback `"Shashank"` → `"Resume"` (`resume/route.ts`, `JobActions.tsx`). |
| **4 scans × N users ≠ N tokens** | Easy to confuse **ingest run count** with **token count**. One scan ≈ 30–80 `scoreJob` calls × ~3k tokens each. | When estimating cost or designing Phase 3, multiply **runs × jobs scored × tokens/job**, not scans alone. See `#### Phase 3 design note — shared ingest / pub-sub`. |
| **Resume parsers bundled into client** (Vercel build `Can't resolve 'fs'`) | `OnboardingForm` (client) imported `@/lib/resume`, which statically pulls `word-extractor`, `pdf-parse-fork`, and `mammoth` → webpack tries to ship Node `fs` to the browser. Broke preview deploys on `7e5cd85` and **production** on `c521b17` (PR #87 merged before the bundle split landed on `main`). | **Never import `lib/resume.ts` from client components.** Use `lib/resume-upload.ts` for `accept` / filename validation only. Keep parsers in `lib/resume.ts` (API routes + server). `next.config.mjs` → `serverExternalPackages` for those three libs. `(app)/layout.tsx` → `export const dynamic = 'force-dynamic'` so authed pages are not statically prerendered without Supabase env (local `npm run build` pitfall on `/import`). Fixed on `main` @ `26cd62d`. |
| **Legacy Word `.doc` vs `.docx`** | Users upload OLE binary `.doc` (magic `D0 CF 11 E0`); `mammoth` only reads `.docx`. Error looked like "Word doesn't work" but **only old `.doc` failed** — PDF and `.docx` were fine. | Parse `.doc` with `word-extractor` (buffer) in `lib/resume.ts`. Accept `.pdf`, `.doc`, `.docx`, `.txt` in onboarding + `/api/profile/parse`. |
| **Cerebras `llama-3.3-70b` deprecated → 35-45 ms `404 (no body)` on every call (session 16)** | Cerebras silently retired `llama-3.3-70b` ~May 27, 2026; only `gpt-oss-120b` and `zai-glm-4.7` remain (`/v1/models`). The 404 was the routing layer rejecting the model name BEFORE auth — that's why the latency was sub-50 ms with no body. The admin dashboard kept showing requests because we logged 0-token error rows. | Default Cerebras model in `lib/gemini.ts` + `PROVIDER_DEFAULTS.cerebras.model` is now `gpt-oss-120b`. Pre-existing DB rows must be migrated once: `UPDATE llm_keys SET model = 'gpt-oss-120b' WHERE provider = 'cerebras';`. **Lesson:** sub-50 ms 404 across the board → suspect model name, not auth. |
| **Free-tier RPM 429 ≠ daily exhaustion** (session 16) | All 5 Cerebras keys looked "100% used" in the admin while Cerebras Cloud reported only ~1.2 K tokens consumed. Root cause: original `chat()` ran `markKeyExhausted()` (set `tokens_used_today = daily_token_limit`) on any 429. Cerebras free tier is currently rate-limited to ~5 RPM (banner: "temporarily reduced for high-demand models"), so RPM 429s fired in seconds and false-exhausted every key, collapsing rotation to paid OpenAI. | **Cooldown ≠ exhaustion.** In-memory `KEY_COOLDOWNS` map (60-65 s) — DB token counter is left alone; the key is silently skipped for one minute. **Round-robin per-request, not per-failure** — `buildProviderChain()` returns ALL active keys for a provider; rotation index advances every call. Add `SCORE_BATCH_DELAY_MS = 3000` and `SCORE_CONCURRENCY = 5` in ingest so each key stays under its RPM ceiling. Always record token usage from `res.usage`, never from string-length guesses (avoids inflated counters). |
| **HTML markup in stored `job.description` poisons every prompt** (session 16) | `ensureFullDescription` only refetches when length < `TRUNCATED_LENGTH_THRESHOLD` (1000), so HTML-heavy long JDs (`<p>🚀 We're Hiring...</p>`) slipped through. Every AI call (`scoreJob`, `matchSkills`, `generateCoverLetter`, `generateAtsResume`, `extractJdKeywordsTyped`) read markup as prose; the detail page `<pre>` showed literal tags to the user. | Centralized helper `sanitizeJobDescriptionForAI(s)` in `lib/jd-fetcher.ts` (wraps existing `stripHtml` + `containsHtml`, idempotent). **Apply at every site that puts `args.jobDescription` into a prompt.** The `ensureFullDescription` self-heal writes the cleaned text back to the DB so the `<pre>` UI also fixes itself on next read. |
| **`scoreJob` had ZERO seniority/experience-gap rule → over-scoring** (session 16) | A 7.7-year senior IC scored **90/100** on "Director of Performance Engineering CoE, 18+ years". The testing-umbrella floor (65-80) and tool overlap drove it; nothing in the prompt compared candidate years vs JD requirement. | **Defense-in-depth (4-phase pattern):** (1) prompt has explicit YEARS GAP table (gap ≥ 11 → cap 40, ≥ 7 → 55, ≥ 4 → 65, ≥ 2 → 78) + SENIORITY-LEVEL rules (IC → director cap 50; IC → vp/exec cap 40) + 2 worked examples. (2) Response shape extended with `requiredYears` + `jdSeniority`. (3) Server-side hard cap parses those vs `insights.years_experience` + `insights.seniority`; lower of years/seniority cap wins. (4) Seniority cap only fires with real years shortfall (gap ≥ 4 or `requiredYears === 0`) so a 12y Staff IC → 12y Director isn't unfairly capped. Reason string always says "Score capped due to …" so users see why. |
| **Back-nav from job detail → 2-3 s skeleton + landed at top, not on the clicked card** (session 16) | `app/(app)/page.tsx` is `force-dynamic` and `app/(app)/loading.tsx` exists, so `router.back()` ran ~12 Supabase queries every time. Worse: infinite-scroll pages 2-N live in client state — back-nav re-rendered only the first 20 cards, so a card at position #45 wasn't in the DOM, `scrollTo(savedY)` landed wrong, `querySelector('[data-match-id="#45"]')` returned `null`, no flash. My initial `?from=matchId` Link approach inherited the same flaw. | **Two mechanisms:** (a) `next.config.mjs` `experimental.staleTimes = { dynamic: 30, static: 180 }` — Router Cache reuses the dashboard for 30 s, no server hit, no `loading.tsx`. (b) `MatchList` writes a sessionStorage snapshot on card click (`signature` + `matches[]` capped at 200 + `page` + `hasMore` + `total` + `scrollY` + `clickedId`, TTL 10 min). On mount a `useLayoutEffect` (SSR-safe via `useIsoLayoutEffect`) rehydrates the FULL list **before paint**, then a `useEffect` (post-paint, two `requestAnimationFrame` ticks) restores scroll and flashes the clicked card. Initialize `useState` with **server props** to avoid hydration mismatch — never read sessionStorage in a `useState` lazy initializer. |
| **`useState` lazy initializer reading sessionStorage = hydration mismatch** (session 16) | First snapshot-restore attempt initialized `useState(() => readSnapshot()?.matches ?? initialMatches)`. On cold loads / refreshes the server rendered 20 cards but the client init produced 80 (from a stale snapshot) → React hydration error + flash. | Initialize state with **the server data first**, then swap to the snapshot in `useLayoutEffect` (client-only, before paint). Use a `didInit` ref so the swap runs once. The `useEffect` that consumes the snapshot must also guard with a one-shot ref. |
| **Bluesminds provider added as primary — full provider chain restructured** (June 2026) | Bluesminds (`DeepSeek-V4-Flash` → `gpt-4o`) added to the LLM fallback chain. `LLM_PRIMARY` default changed from `groq` to `bluesminds`. The provider chain is now dynamically built from `PROVIDER_DEFAULTS` keys, so any new provider added to `lib/llm-keys.ts` is auto-included. Order: Bluesminds (paid primary) → Gemini (free, env-var) → Cerebras (free) → Groq (free) → OpenAI (paid, last resort). Two model-name fixes were required (`DeepSeek-V4-Flash` case-sensitive, then switched to `gpt-4o` for speed). | **Provider chain is now dynamic and configurable via `LLM_PRIMARY` env var. `buildProviderChain()` iterates `PROVIDER_ORDER` (primary first, then rest), grabs ALL DB keys per provider (round-robin with rotation index), and only falls back to env vars when a provider has ZERO DB keys (fixes the bypass bug where disabled DB keys still fell through to the env). Env-var fallback calls now get synthetic `keyId: 'env:{provider}'` so they log to `llm_usage_log` and appear in the Live Key Activity panel.** |
| **LLM hallucinated skills shown as matched/missing (session 19, PR #137)** | `scoreJob` and `matchSkills` returned skill names not physically present in the JD (e.g., `"C++"` on a Python-only role). The LLM infers related concepts from training data — the output was verbatim-trusted and stored, so phantom skills showed as green chips on the dashboard card and job detail page. | Added `isSkillPresentInJd(skill, jdText, jobTitle)` (exported from `lib/gemini.ts`) — case-insensitive whole-word regex that handles special chars (C++, .NET) and trailing plural 's'. Both `scoreJob` and `matchSkills` now filter matched/missing arrays through this function before returning. Run `scripts/clean-hallucinated-skills.ts` once to clean historical DB records. **Never trust LLM skill output verbatim; always validate against the JD text.** |
| **Seen/Unseen card visual UX (session 19, PR #137)** | After clicking a job and going back, every card looked identical — users had no cue which matches were fresh vs already viewed. | Derive `isViewed = status !== 'new'` client-side in `MatchCard.tsx`. Unseen cards: 4px primary left border, elevated shadow, bold title, `New` pill. Seen cards: transparent border, `bg-surface-container-low/40`, `opacity-75` (hover restores 100%), muted title. No new DB columns or API calls required. |
| **Vercel Hobby Serverless timeouts hard-kill scans (session 20)** | Vercel Hobby/Free tier limits serverless execution to 60s. If the fetch/embed/score pipeline exceeds 60s, Vercel hard-kills it. The `ingest_runs` status remains stuck at `'running'` with 0 counters, showing a massive false duration (e.g., `1947s`) once the stale cleanup runs. | Default `INGEST_WALL_BUDGET_MS` to `50000` (50s) in `lib/ingest.ts` so the loop checks the wall clock, halts scoring/embedding early, and calls `finalizeRun()` to cleanly commit the current progress and exit before the hard kill. |
| **HTML tags in job descriptions corrupt skills-matching (session 20)** | `isSkillPresentInJd` word-boundary checks (`\b`) were matching raw HTML description strings (e.g. `<li>JMeter</li>`). Because of this, HTML tags interfered with boundary checks, causing valid matches to fail or missing skills to be incorrectly dropped during cleanup. | Strip HTML tags via `sanitizeJobDescriptionForAI` before performing regex skill matching in `lib/gemini.ts`. Modify `cleanSkills()` to only run the JD presence filter on `matchedSkills` (LLM-returned `missingSkills` are authoritative and should not be re-verified). |
| **`ignoreDuplicates: true` hides duplicate job counts (session 20)** | Setting `ignoreDuplicates: true` on `upsertJobs` caused Supabase to ignore conflicts, returning only newly inserted job IDs. This made it look like only a couple of jobs were fetched on scans, even when the scraping fetched hundreds. | Set `ignoreDuplicates: false` to return all IDs. To prevent overwriting the original discovery time (the "today's date" issue where every job shows the scan date), omit `fetched_at` from the upsert payload so the database default `now()` only fires on brand new inserts. |
| **Tier B tested before server deploy (Jun 2026)** | User ran Supabase migration 0014 but API routes were not on `main`/Vercel → extension got 404 on `/api/extension/form-template/*`; capture never persisted; second visit looked identical to first. | **Ship order:** migration 0014 → merge API + extension PR → Vercel live (401/200, not 404) → reload extension. See `### Tier B — custom career forms (beta)`. |
| **GlobalLogic / WP custom dropdown `.trim()` crash (Jun 2026, PR #186)** | Tier B clicked visible div triggers; site `common.js` threw `Cannot read properties of undefined (reading 'trim')` — errors fire in site handlers **after** our click, so `safeFillOp` does not catch them. Gender / notice period missed. | Prefer hidden native `<select>` in field group via `findNativeSelectForControl` + `setSelectBySemantic`; discover `select` elements first in `tier-b-form.js`. Do **not** assume div-click listbox path for Tier B. |
| **Tier B skeleton is not cross-user answer memory (Jun 2026)** | Expectation that manual submit teaches the next user's values. | Skeleton stores **structure + semantic keys + option labels** only. Values always from current user's apply profile via `resolveProfileSemanticValue`. Never store filled values in `domain_form_templates`. |
| **ATS Checker JD keywords use word boundaries (PR #187)** | Substring `includes()` on tech keywords inflated JD match (`go` in "ago", `r` in "performance"). | Always use `keywordInText()` from `lib/ats-checker.ts` for keyword presence. JD compare uses `KEYWORD_EQUIVALENTS` for aliases — do not reintroduce naive substring matching. |
| **Dictionary patches for ATS spelling/skills/dates false-pass** (Aug 2026, PR **#269**) | Growing `MISSPELLINGS` / skill keyword lists / date regex “fixed” one resume and broke another (e.g. MM/YYYY marked years-only; LinkedIn missing but Contact “No issues”; QA tools under-counted as “2 skills”). | **Do not grow dictionaries as the accuracy strategy.** Use evidence-grounded pipeline: `ats-resume-parse` → `ats-fact-checks` → `ats-semantic-review` (LLM + exact quotes) → `ats-consistency` gate. Drop claims whose evidence is not a resume substring; never `pass` if any `foundItem.ok === false`. Logged-in = hybrid; public = structural. |
| **Heading synonym patches for ATS sections** (Aug 2026, PRs **#274–#275**) | Adding `Accenture Experience` / `EDUCATIONAL QUALIFICATION` / `Area of expertise` as one-off regex synonyms is an endless loop at 100 scans/hour. Preferring incomplete LLM `semantic-sections` alone wiped token-found Skills/Summary (Ankit). | **Do not grow heading synonym lists.** Short headings that *contain* canonical tokens (experience, summary, expertise…) for structural; hybrid maps odd/misspelled headings via `semantic-sections` in the **same** LLM call with exact heading quotes. Always **`mergeSectionChecks`** (LLM ∪ token facts). |
| **JobsPipe GET `/v1/jobs` returns 404** (Jun 2026, PR #222) | Hyred called GET with `?query=&country=IN` first — burned API credits, zero jobs. POST `/v1/jobs/search` works. | **POST only** in `lib/sources/jobspipe.ts`. Never re-add GET as primary. |
| **JobsPipe POST omitted `job_country_code_or`** (Jun 2026, PR #222) | Indian users got global results; credits used but wrong geography. Manual PowerShell test with `job_country_code_or: ["IN"]` worked; app batch POST did not send country. | Always build POST body via `buildSearchBody()` — include `job_country_code_or` when `buildJobCountryCodes()` returns codes. Log label: `POST titles @IN`. |
| **Hardcoded `country=IN` on JobsPipe** (Jun 2026, PR #217) | US/UK users got India-filtered jobs or empty sets. | Use `buildJobCountryCodes(preferences, insights)` everywhere for JobsPipe, JobDataLake, JSearch. Adzuna stays `adzuna_in` only. |
| **Client admin panel imported server Supabase** (Jun 2026, PR #213–#214) | `JobApiUsagePanel` → `job-api-keys.ts` → `supabase/server` → Vercel build `Can't resolve 'next/headers'`. | Client: `lib/job-api-keys.ts` + `lib/job-api-usage-types.ts` only. Server: `lib/job-api-keys-server.ts` + `import 'server-only'`. |
| **In-memory LLM cooldowns don't work on Vercel** (Jun 2026, PR #228) | Multiple serverless instances each had their own `KEY_COOLDOWNS` map → RPM 429 storms under load. | Migration **0018** + `lib/llm-key-runtime.ts` for DB-backed cooldowns; `lib/llm-concurrency.ts` for global slot cap. Run 0018 after 0009. |
| **Bluesminds free tier bills by requests/pi credits** (Jun 2026, PR #227) | `tokens_used_today` tracked LLM tokens but Bluesminds free tier is **300 req/day**, not token-based. | `PROVIDER_BUDGET.bluesminds.mode = 'requests'` in `lib/llm-keys.ts`; UI shows request budget. |

---

## Repo & deployment notes

| Item | Status (May 31, 2026) |
|---|---|
| GitHub visibility | **Private** (`shashank4910/JobRadar`, remote may show as `Hyred`) — code not public; collaborators/Vercel GitHub app need access |
| Live app | Hyred on Vercel (see env `NEXT_PUBLIC_APP_URL`) — **Production** on `main` (includes PRs #83–#87, session 14) |
| Manual Supabase migrations pending | **0008** (CASCADE delete, session 14) if not run yet; **0007** (`is_admin`) for admin portal + source UI |
| Failed deploys (resolved) | `7e5cd85` / `c521b17` — client bundle `fs` error (see pitfall above); fixed by `d08e5ca` + `26cd62d` on `cursor/legacy-doc-resume-stats-copy`, fast-forwarded to `main` |
| OpenAI usage tracking in-app | **Not yet** — only job-source logs in `api_request_logs`; token metering = Phase 3 `usage` table |

---

---

## Public SEO Pages & Free Tools (PR #143)

> Added June 15, 2026. Makes the site discoverable by Google and attracts organic traffic.

### What was built

| Page | URL | Purpose |
|---|---|---|
| Job listing | `/explore` | Public job board with search, source filters, pagination. No auth. |
| Job detail | `/explore/[id]` | Individual job page with `JobPosting` schema.org structured data for Google rich results. |
| ATS landing | `/free-tools/ats-score-checker` | Standalone free ATS resume scoring tool. Marketing page + interactive widget. No auth. |
| Sitemap | `/sitemap.xml` | Auto-generated with up to 5000 job URLs + static pages. |
| Robots | `/robots.txt` | Allows crawlers on `/explore` + `/free-tools`, blocks `/admin`, `/api`. |

### Files

| File | Role |
|---|---|
| `app/explore/page.tsx` | Job listing page — SSR, dynamic, fetches from `jobs` table |
| `app/explore/[id]/page.tsx` | Job detail page — SSR, `generateMetadata` for SEO, JobPosting schema |
| `app/free-tools/ats-score-checker/page.tsx` | ATS landing page — SSR marketing page with WebApplication schema |
| `app/free-tools/ats-score-checker/AtsCheckerWidget.tsx` | Client component — upload **or paste**, Try sample, JD match %, parse warnings (PR #187) |
| `app/sitemap.ts` | Dynamic sitemap generator (Next.js App Router convention) |
| `app/robots.ts` | Robots.txt generator (Next.js App Router convention) |
| `middleware.ts` | Added `/explore` and `/free-tools` to `PUBLIC_PATHS` (no auth required) |

### SEO strategy

- **Public job pages** rank for long-tail searches like "remote performance engineer jobs India"
- **ATS tool landing page** attracts backlinks from career blogs, LinkedIn shares, and social media
- **Schema.org structured data** enables Google rich results (job cards, application links)
- **Sitemap** ensures Google discovers all job pages quickly

---

## ATS Resume Checker

> **PR #129** — Free instant ATS checker (8 criteria).  
> **PR #187 (Jun 2026)** — v9 accuracy: word-boundary keywords, India contact, length calibration, public widget parity.  
> **PRs #266–#268 (Aug 2026)** — Scan report UX: resume evidence, full dynamic report, premium cards.  
> **PR #269 (Aug 6, 2026)** — Evidence-grounded hybrid engine (facts + LLM + quote gate). See Session **30**.  
> **PRs #271–#275 (Aug 6–7, 2026)** — Report polish + semantic section mapping (no heading-synonym loop). See Session **31**.

### What it does

Pastes or uploads a resume → score + Enhancv-style report with per-check evidence. Optional JD paste → keyword gap analysis (`jdMatch`).

| Path | Engine | LLM? |
|---|---|---|
| Logged-in `/ats-checker` | **Hybrid** — Layer A facts + Layer B semantic LLM + Layer C gate | Yes (one structured `chat` call, op `ats_semantic_review`) |
| Public `/free-tools/ats-score-checker` | **Structural** — Layer A facts + Layer C gate (legacy 8-criterion base scores) | No |

Every fail/warn on the hybrid path must carry an **exact resume substring** (or allowed absence). Ungrounded LLM claims are dropped. Contact cannot show “No issues” if LinkedIn/email/phone is missing.

### Evidence-grounded pipeline (PR #269)

```
resume text → normalize/parse → fact checks → (LLM semantic) → consistency gate → AtsReport
```

| Module | Role |
|---|---|
| `lib/ats-resume-parse.ts` | Ligatures, contact, **token section headings**, bullets, date tokens (MM/YYYY OK) |
| `lib/ats-fact-checks.ts` | Deterministic fact checks only |
| `lib/ats-semantic-review.ts` | Spelling, skills, impact, repetition, vague, template, truncated, verbs, JD, **`semantic-sections`** |
| `lib/ats-consistency.ts` | Ground quotes; demote contradictory passes |
| `lib/ats-evidence-engine.ts` | `runEvidenceGroundedAts` / `runStructuralAts`; **`mergeSectionChecks`** |

### Section mapping (PRs #274–#275, Session 31)

| Layer | Behavior |
|---|---|
| Structural / token | Short heading lines that **contain** canonical tokens (`experience`, `summary`, `expertise`, `educational`…) — not company-name synonym lists |
| Hybrid LLM | Same call returns `sections_mapped: [{ canonical, heading }]` with **exact** heading quotes; status recomputed from grounded map |
| Assemble | Prefer `mergeSectionChecks(fact-sections, semantic-sections)` — union; never let incomplete LLM wipe token-found Skills/Summary |

**Do not** ship PRs that only add one more heading string (`Accenture Experience`, etc.).

### Resume Fix Studio (logged-in)

After a score, **Open Fix Studio** on `/ats-checker` opens a three-pane workspace (weaknesses → AI patch suggest/regenerate/apply → live Original/Updated preview with instant re-score).

| Piece | Role |
|---|---|
| `app/(app)/ats-checker/AtsFixStudio.tsx` | Fix Studio UI + credit meter + hard paywall panel |
| `lib/ats-fix.ts` | Weakness list, apply/undo, snippet matching |
| `lib/ats-fix-suggest.ts` | LLM patch suggestions |
| `POST /api/ats-fix` | Auth + `resume_studio` quota (shared with job Resume Studio) |
| Public widget | Score only + **Sign in to open Fix Studio** CTA |

Credits: generate/regenerate cost 1 Resume Studio credit each; apply/undo/copy do not. Free allotment is **3 lifetime** until Stripe billing cycles exist (`quotaWindowKind('free','resume_studio') === 'lifetime'`).

### 8 criteria checked

| # | Criterion | Weight | What it checks |
|---|---|---|---|
| 1 | Section Structure | 20% | Experience, Education, Skills headers present and correctly ordered |
| 2 | Contact Info | 15% | Name, email, phone, LinkedIn, location at top (US **and** India patterns) |
| 3 | Bullet Points | 15% | Consistent formatting, sufficient detail in experience bullets |
| 4 | Quantified Impact | 15% | Numbers, percentages, metrics showing measurable results |
| 5 | Skills Optimization | 15% | Concrete technical keywords, organized and contextualized |
| 6 | Length & Density | 10% | Ideal ~350–1400 words; concise 180–349 OK when structure is strong |
| 7 | Format Cleanliness | 5% | Clean ASCII — no smart quotes, unicode bullets, multi-column hints |
| 8 | Date Formatting | 5% | Consistent month-level date ranges (Mon YYYY – Mon YYYY) |

### Key files

| File | Purpose |
|---|---|
| `lib/ats-evidence-engine.ts` | Hybrid/structural orchestrator — `result` + gated `report`; `mergeSectionChecks` |
| `lib/ats-resume-parse.ts` / `ats-fact-checks.ts` / `ats-semantic-review.ts` / `ats-consistency.ts` | Parse → facts → LLM (incl. sections) → gate |
| `lib/ats-checker.ts` | Legacy 8-criterion scores — `checkAtsCompatibility()`, JD keywords; Fix Studio re-score base |
| `lib/ats-report.ts` | `AtsReport` model + `buildAtsReport` (premium categories still use this) |
| `lib/ats-checker-samples.ts` | Shared sample resume + JD (India perf engineer) for Try sample buttons |
| `app/api/ats-checker/route.ts` | Hybrid if authenticated, else structural; body/query `engine=` override (hybrid needs auth) |
| `app/(app)/ats-checker/page.tsx` | Logged-in UI — `AtsScanReport`, history, Fix Studio entry |
| `app/_components/ats-report/AtsScanReport.tsx` | Scan report UI (KPIs, priority findings, full report cards) |
| `app/(app)/ats-checker/AtsFixStudio.tsx` | AI Fix Studio (suggest / apply / undo / paywall) |
| `app/free-tools/ats-score-checker/AtsCheckerWidget.tsx` | Public widget — upload/paste, Try sample, structural report |
| `app/free-tools/ats-score-checker/AtsPublicReport.tsx` | Public report (uses API `report` when present) |
| `app/(app)/settings/page.tsx` | Plan + Resume Studio credit meter + upgrade placeholder |
| `tests/fixtures/ats-resumes/` | Golden corpus (Akansha, clean-strong, nearly-empty, template-junk) |
| `tests/unit/ats-evidence-engine.test.ts` | Grounding, gate, hybrid fixture assertions |
| `tests/unit/ats-checker.test.ts` | Legacy engine tests |
| `tests/unit/ats-fix.test.ts` | Apply/undo + weakness list tests |

### Features (PR #129 + #187)

| Feature | Details |
|---|---|
| **Score ring** | Animated SVG ring that counts up from 0 on mount (logged-in page) |
| **Radar chart** | SVG spider chart showing all 8 criteria at a glance (logged-in page) |
| **JD comparison** | Paste a job description → matched/missing/extra keyword analysis with alias matching (postgres↔postgresql, go↔golang, k8s↔kubernetes) |
| **Sample resume** | One-click "Try sample" — India-focused perf engineer resume + JD (`ats-checker-samples.ts`) |
| **Score history** | Last 20 checks saved in localStorage (logged-in page only) |
| **Keyboard shortcuts** | Cmd+Enter to check, Esc to reset (logged-in page) |
| **Copy results** | One-click copy of full analysis to clipboard |
| **File upload** | `.pdf`, `.doc`, `.docx`, `.txt` — drag-drop or browse (app + public widget) |
| **Paste text** | JSON API + public widget tab for pasted resume text |
| **Parse quality** | `parseQuality` + `parseWarning` when PDF layout is degraded; adaptive down-weighting of layout criteria |
| **India contact** | `+91` phone, major Indian cities/states, ALL-CAPS and pipe-separated names |

### Scoring Optimization (session 18, PR #129)

Validated and tuned the scoring engine using **1,200 synthetic resumes** across 6 industries × 4 experience levels.

| Fix | Before | After | Impact |
|---|---|---|---|
| **Length bands** — added 200-300 word tier (25pts), raised 300-400 to 40pts | Entry length: ~15pts | Entry length: 25-40pts | Entry-level resumes no longer over-penalized |
| **Line density** — penalty only applies ≥400 words | -15 on short resumes | No penalty <400 words | Sparse sections expected for early-career |
| **Skills contextualization** — thresholds 0.4→0.3, 0.2→0.1 | 47% scoring <50 on skills | ~30% scoring <50 | Well-structured skills sections get proper credit |
| **Standard headers** — added Soft/Interpersonal Skills | -5 penalty on every resume | No penalty | Clean sections score correctly |
| **Density bonus** — +5 for 10+ skills + 2+ skill lines | — | +5 baseline | Rewards well-organized skills |

**Validated on 40 real resumes:** Avg 64.0 → 64.5, Max 80 → 81. Synthetic resume generator saved at `scripts/synthetic-resume-generator.ts`.

### v9 accuracy pass (PR #187, Jun 2026)

| Fix | What changed |
|---|---|
| **Word-boundary keywords** | `keywordInText()` — no false matches (`go` in "ago", `r` in "performance", `java` in "javascript") |
| **JD alias matching** | postgres↔postgresql, go↔golang, k8s↔kubernetes in `compareWithJobDescription` |
| **India contact/location** | +91 phones, Indian cities/states, ALL-CAPS names, pipe-separated contact lines |
| **Length calibration** | Concise 180–349 word resumes with 5+ bullets + 4+ sections no longer scored as "very short" |
| **Header colons** | `TECHNICAL SKILLS:` trailing colon tolerated in section detection |
| **Public widget parity** | Paste tab, Try sample, all file types, JD match display, parse warnings |

**55 unit/API tests passing.** Sample resume scores ~78 overall, ~92% JD match on bundled sample JD.

## Debugging Protocol

When a feature seems broken:

1. **Check which code is deployed** — `git log --oneline -5` on main. Compare with Actions run.
2. **Check the data** — run SQL to verify what's actually in the DB (description length, scores, timestamps).
3. **Check the API response** — browser DevTools → Network → relevant endpoint → Response tab.
4. **Only then propose a fix** — after evidence, not before.

**DO NOT** make multiple speculative prompt changes without verifying the input data first.

---

## Cost Model

> **Updated post-Bluesminds.** Bluesminds (`gpt-4o` via `api.bluesminds.com/v1`) is now the chat **primary** (paid, admin-managed via `llm_keys` table or `LLM_PRIMARY=bluesminds` env). The fallback chain is: Bluesminds → Gemini `gemini-2.5-flash-lite` (free, env-var) → Cerebras `gpt-oss-120b` (free) → Groq `llama-3.3-70b-versatile` (free) → OpenAI `gpt-4o-mini` (paid, last resort). Embeddings remain OpenAI-only (`text-embedding-3-small`).

| Operation | Cost (Bluesminds primary) | Fallback cost (any free provider) | Frequency |
|---|---|---|---|
| Generate SearchProfile | ~$0.005 (paid) | $0 (on free fallback) | Once per 7 days |
| Embed a job (OpenAI text-embedding-3-small) | ~$0.00002 | n/a (OpenAI-only) | Per new job (~$1.30/mo flat) |
| AI relevance filter (batch of 15) | ~$0.0005 | $0 on free fallback | Per cron run (2–4 batches) |
| LLM score a job | ~$0.0005 | $0 on free fallback | Per scored job (30–80/run) |
| Skill match (per job detail view) | ~$0.0009 | $0 on free fallback | On demand |
| ATS resume generation | ~$0.0024 | $0 on free fallback | Per job apply |
| Cover letter generation | ~$0.0009 | $0 on free fallback | Per job apply |
| **Per cron run, fully on Bluesminds** | **~$0.07–0.10** | — | 4×/day |
| **Per cron run, fully on free fallback** | — | **~$0** | (best case, quota permitting) |
| **Monthly estimate, Bluesminds primary** | **~$8–12** (paid) | — | |
| **Monthly estimate, all on free fallback** | — | **~$1–3** (embeddings only) | (requires Groq/Gemini/Cerebras quotas to absorb all traffic) |

**Provider chain dynamics:** `buildProviderChain()` in `lib/gemini.ts` dynamically iterates all providers from `PROVIDER_DEFAULTS`, putting `LLM_PRIMARY` first. At each provider it round-robins across ALL DB keys (spreading RPM load), with 65s in-memory cooldowns on 429s (not daily exhaustion). Env-var fallback only activates when a provider has ZERO DB keys configured — if you disabled all keys for a provider, the env var is NOT used (fixes the bypass bug). All calls (even env-var fallbacks) log to `llm_usage_log` with synthetic `env:{provider}` key IDs so they appear in the admin Live Key Activity panel.

---

## Update Protocol

**Update this file every 2-3 significant conversations.** Add:
- New bugs found and their root causes
- New features or architecture changes
- New "pitfalls" or rules learned
- Changes to the file map
- **Keep the `AGENTS.md` Index in sync** when you add/rename a `##` section here, and append new dated session logs to `docs/context/session-log.md` (not here).

**Last updated:** Aug 7, 2026 — **Session 31:** ATS report polish + semantic section mapping (PRs **#271–#275**). `AGENTS.md` Index / ATS section / Known Pitfalls / UI change log / session-log updated. See Session 31 (and Session 30 for hybrid engine).

**Last updated:** Aug 16, 2026 — **Session 33:** Hyred Lime chrome (pill header, scan HUD), `PremiumSelect`, `SpecularButton` on Run Scan, filter score slider + `fresh=` ticks, sticky Filters. Archive → `docs/context/session-log.md` Session 33. PRs **#304–#316**.

**Last updated:** Aug 10, 2026 — **Session 32:** dashboard freshness (`jobFreshnessOrFilter` + Include older jobs / `expired=1`), filter UX/perf, Optimize green/amber/red keywords, LinkedIn recruiting search. Archive → `docs/context/session-log.md` Session 32. PRs **#282–#290**.

**Last updated:** June 20, 2026 — **Doc bridge audit:** restored `## Key Architecture Decisions` heading; added `## Core App Features` (job detail, onboarding, Top MNC, import, outreach, apply profile); expanded File Map + `AGENTS.md` Index rows; fixed Tier 3 pointer to `session-log.md`; Sessions 17–18 + 26 in archive. See Session 26.

**Last updated:** June 18, 2026 — **ATS Checker v9 (PR #187)** + docs **PR #188** documented: word-boundary keywords, India contact, length calibration, public widget parity; `AGENTS.md` Index row for ATS Checker.

**Last updated:** June 20, 2026 — **Tier B custom career autofill (beta)** documented: domain form skeleton (PRs #185–#186, extension v0.16.1+, migration 0014). Partial fill on GlobalLogic-style sites; structure-only Supabase capture; `AGENTS.md` Index rows for Tier B. Workday end-to-end remains Tier A (v0.13.0+).

**Last updated:** June 18, 2026 — **Workday extension autofill end-to-end verified** (Alight, v0.13.0). Pages 1–5 documented: structured profile pipeline (PRs #168–#171, migrations 0011–0013), languages panel (#172), universal Application Questions taxonomy (#173), Voluntary Disclosures terms consent (#174). `AGENTS.md` Index split into per-page Workday rows.

**Last updated:** June 21, 2026 (session 28 — **Job APIs, worldwide location dictionary, JobsPipe country filter, Dream Company, distributed LLM**). PRs **#210–#228**. Key logic: `lib/job-country-codes.ts` + `lib/data/job-location-dictionary.ts` → `job_country_code_or` on every JobsPipe POST; POST-only JobsPipe (no GET 404); `buildJobsPipeQueries()` uses role titlePatterns; Dream Company **0016–0017**; LLM **0018** cross-instance cooldowns. Full narrative → `docs/context/session-log.md` → **Session 28**.

**Last updated:** June 14, 2026 (session 19 — **Seen/Unseen card indicators** + **Hallucinated-skills guardrail** + **Sort/filter fixes**. `MatchCard.tsx`: `isViewed = status !== 'new'` drives read-email-style styling — 4px primary border + bold title + `New` pill for unseen; muted opacity + transparent border for seen. `lib/gemini.ts`: new exported `isSkillPresentInJd(skill, jdText, jobTitle)` (whole-word regex, handles C++/.NET plurals), applied as a post-filter on `scoreJob` matched/missing and `matchSkills` matched/missing/jdRequirements — eliminates LLM hallucinated skill chips. `scripts/clean-hallucinated-skills.ts`: one-time DB cleanup script. PR **#137**.)

**Last updated:** June 2026 — **Bluesminds provider restructured** — added `bluesminds` to `PROVIDER_DEFAULTS` in `lib/llm-keys.ts` (`baseUrl: 'https://api.bluesminds.com/v1'`, model `gpt-4o`), `LLM_PRIMARY` default changed to `bluesminds`, provider chain dynamically built from `PROVIDER_DEFAULTS` keys, env-var fallback bypass fixed (ZERO DB keys gate), synthetic `env:{provider}` key IDs for activity panel logging, Bluesminds added to `LlmKeysPanel` and `LlmActivityPanel` UIs with `bg-cyan-400` dot. Commits: `a963795` (add + env-var fix), `0d5b934` (model name fix), `77fa75b` (model → gpt-4o), `f4514c6` (chain restructured), `e0ba6c8` + `09569b0` (paginated admin activity log + env-var logging).

**Last updated:** June 8, 2026 (session 18 — **ATS scoring optimized** vs 1200 synthetic resumes: Length bands, Skills contextualization, Soft Skills header fix. PR #129.)

**Last updated:** June 8, 2026 (session 17 — this entry: **ATS Checker overhaul** — JD comparison, radar chart, animated UI, sample data, keyboard shortcuts, score history, copy results. PR #129.)

**Last updated:** May 31, 2026 (session 16 — this entry: **admin-managed multi-key LLM pool** + Cerebras `llama-3.3-70b` → `gpt-oss-120b` switch + RPM-aware rotation (cooldown ≠ exhaustion, per-request round-robin, 3 s batch delay, `res.usage` tracking) + **dashboard pagination + bulletproof back-nav** (sessionStorage snapshot, `staleTimes.dynamic = 30`, `BackToMatches`) + **JD HTML stripped at all 5 AI prompt sites** via `sanitizeJobDescriptionForAI` + **`scoreJob` seniority + experience-gap cap** with prompt rules + server-side hard cap (defense-in-depth). PRs **#94**, **#110**, **#116**. Full narrative → `docs/context/session-log.md` → **Session 16**. Earlier the same day, the UI index was refreshed for PRs **#102–#106** — layout overlap (#103), Luminous page polish (#104), scan-started toast (#105), status filter grid (#106).)

_Session 6 (May 29, 2026): started the **Enterprise Multi-Tenant Transformation** initiative — added the Master Plan + Progress Tracker (Phases 0-5). Phase 0 + the Groq migration (PR #48 replaced the dead `gemini-2.0-flash` 429 fallback with Groq; PR #50 flipped Groq to FREE PRIMARY with OpenAI fallback + `LLM_PRIMARY` toggle, needs `GROQ_API_KEY`) + the Phase 3 Groq free-tier capacity analysis._

_Session 5 (May 29, 2026): OpenAI text-embedding-3-small migration shipped; matches sort dropdown bug fixed (foreignTable alias) + per-card discovery date stamp; UI UX Pro Max design skill installed for Kiro, Cursor, and Antigravity from the official `uipro-cli`. PRs #25-#28 + #29 all merged._

---

## Session Logs — archived

Detailed dated session logs (Sessions 2–5 and earlier) now live in **`docs/context/session-log.md`** to keep this file lean and cheap to load. Open that archive ONLY for historical "why did we do X" questions (Tier 3 per `AGENTS.md`). When logging a new session, append it to the archive and keep only a short pointer here.
