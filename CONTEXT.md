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
3. Surfaces relevant matches in a polished light-themed dashboard (**Luminous** teal UI — Google Stitch, May 2026)
4. Generates tailored ATS resumes + cover letters per job
5. Provides skill-match analysis (JD requirements vs resume)

**Owner:** Shashank Singh — Senior Performance Engineer (India, 7.7 years)
**Stack:** Next.js 15, React 19, TypeScript, Supabase, Groq Llama 3.3 70B (free chat primary) + OpenAI gpt-4o-mini (paid chat fallback) & text-embedding-3-small (embeddings), Vercel, GitHub Actions, Python FastAPI + browser-use (auto-apply agent on Render)

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
| UI bugs already fixed | [UI pitfalls](#ui-pitfalls) |

### Current UI (live on hyred.in)

**As of May 31, 2026** — merged **PR #100** (Luminous redesign) + **PR #101** (scan picker overlap fix) + **PR #104** (full Luminous polish + mint background).

| Aspect | Current (Luminous Mint) | Previous (pre-#104) |
|---|---|---|
| **Codename** | Luminous Mint (Stitch + Behance wallet ref) | Luminous (blue-tinted flat bg) |
| **Primary** | Teal `#006a65` → gradient `#006a65` → `#2cc9c0` | Same |
| **Background** | Mint-green `#f0f7f6` + **organic radial-gradient blobs** (5 layered `radial-gradient` on body, `background-attachment: fixed`) | Flat blue-tinted `#f9f9ff` |
| **Surface tokens** | Green-tinted: container `#e4f0ee`, low `#eaf5f3`, high `#dceae8` | Blue-tinted: `#e7eeff`, `#f0f3ff`, `#dee8ff` |
| **Headline font** | Plus Jakarta Sans | Same |
| **Body font** | Plus Jakarta Sans | Same |
| **Desktop layout** | Fixed **260px left sidebar** + top header | Same |
| **Dashboard** | Bento grid: match list (8 col, `min-w-0`) + insights sidebar (4 col) | Same but tabs overflowed into sidebar |
| **StatusFilter tabs** | Horizontal scroll (`overflow-x-auto`, `max-w-full`) within column bounds | `inline-flex` with no width constraint — overflowed |
| **Dropdowns/selects** | Custom styled (`appearance-none` + SVG chevron, teal stroke on focus) | Browser default arrow appearance |
| **Radio/Checkbox/Range** | `accent-color: #006a65` globally via `globals.css` | Browser default blue |
| **Toasts** | Bottom-right, Luminous palette (`#bbcac7` border, teal shadow, `1rem` radius, Plus Jakarta Sans) | Hardcoded non-palette colors (`#E5E7EB` border, old shadow) |
| **Token vocabulary** | Semantic M3 everywhere: `text-on-surface`, `text-on-surface-variant`, `text-primary`, `bg-primary/10`, `border-outline-variant`, `text-error` | Mixed: legacy `text-ink`, `text-stone`, `text-amber`, `bg-off-white` on Stats, Job detail, Import, Onboarding, Legal pages |
| **Match cards** | Circular score ring, italic AI quote, skill pills | Same |
| **Run scan** | Teal gradient button in **header** (⚡ Run Scan) | Same |
| **Legal links** | Sign-up checkbox only; **none** in logged-in shell | Same |

**All pages now fully styled with Luminous tokens** — Job detail (`/jobs/[id]`), Onboarding, Stats, Admin, Import, Apply Profile, Login, Legal (Privacy/Terms), Error, Not Found. No legacy `text-ink`/`text-stone`/`text-amber` remain in core app files.

**Design inspiration:** [Behance Wallet Dashboard](https://www.behance.net/gallery/130352871/) — the mint-green background with organic soft gradient blobs creating subtle cloudy depth. Color palette + layout from Google Stitch "Luminous" screen.

### Design tokens

| Layer | File | Notes |
|---|---|---|
| Tailwind theme | `tailwind.config.ts` | Luminous Mint palette (green-tinted surfaces), `sidebar: 260px`, `shadow-card` / `shadow-elevated` / `shadow-primary-glow` |
| Global components | `app/globals.css` | `.teal-gradient`, `.btn-primary`, `.card`, `.input`, `select.input` (custom chevron), `.glass-card`, organic gradient blobs on `body` |
| Form controls | `app/globals.css` | Global `accent-color: #006a65` for radio/checkbox/range inputs |
| Toaster | `app/_components/AppToaster.tsx` | Bottom-right; Luminous palette inline styles (border `#bbcac7`, shadow teal-tinted, `1rem` radius, Plus Jakarta Sans) |
| Fonts | Google Fonts import in `globals.css` | Plus Jakarta Sans 400–800 |

**Background system:** Body uses `background-color: #f0f7f6` + `background-image` with 5 fixed radial-gradient blobs (low-opacity teal/mint) for a soft organic depth. No `bg-background` on any wrapper element — body handles it globally with `!important`. The gradient is `background-attachment: fixed` so it doesn't scroll.

**Semantic colors (common):** `primary` (`#006a65`), `primary-container` (`#2cc9c0`), `match-success` (`#2cc9c0`), `text-muted` (`#6c7a78`), `surface-container-lowest` (`#ffffff` — card bg), `outline-variant` (`#bbcac7` — borders), `surface-container` (`#e4f0ee`), `surface-container-low` (`#eaf5f3`).

**⚠️ RULE:** Never add `bg-background` or `bg-surface` (without opacity) to page wrapper divs — it creates an opaque layer that hides the body gradient blobs. The body CSS handles the background globally.

### App shell & layout

| Piece | File | Behavior |
|---|---|---|
| Shell | `app/(app)/_components/AppShell.tsx` | Sidebar nav, header, mobile bottom nav, logout |
| Header search | `app/(app)/_components/HeaderSearch.tsx` | **Dashboard (`/`) only**; flex spacer on other routes so Run Scan stays right |
| Run scan | `app/(app)/_components/RunIngestButton.tsx` | Header on desktop; duplicate on mobile dashboard body |
| Dashboard page | `app/(app)/page.tsx` | Greeting, quick stats, bento grid, success banner |
| Login | `app/login/page.tsx` | Teal gradient “H” badge, no legal footer |

**Sidebar nav (desktop):** Dashboard · My Resume · Stats · Top MNCs · Settings · (Admin if `is_admin`) · Log out. Import is desktop-only in nav config.

### UI component map

```
app/(app)/_components/
  AppShell.tsx           ← sidebar + header + mobile nav
  HeaderSearch.tsx       ← dashboard search → ?q= filter
  RunIngestButton.tsx    ← scan + admin source picker dropdown
  MatchCard.tsx          ← Luminous job card (score ring, insight quote, skills)
  MatchScoreRing.tsx     ← SVG circular match %
  StatusFilter.tsx       ← pill tabs (Inbox / Applied / Saved / …)
  MatchFilters.tsx       ← score, remote, sort (+ admin source)
  DashboardInsights.tsx  ← right column widgets on dashboard
  AppToaster.tsx         ← (via app/layout.tsx) toast placement

app/_components/
  AppToaster.tsx
  LegalConsentFields.tsx ← sign-up checkbox only
  LegalDocumentLayout.tsx / LegalFooterLinks.tsx ← public /privacy, /terms only

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
| May 31, 2026 | **#104** | **Full Luminous polish + Mint background** — migrated all legacy tokens (`text-ink`/`text-stone`/`text-amber`) to M3 semantic tokens across ALL pages; added mint-green `#f0f7f6` background with organic gradient blobs; custom `<select>` chevron styling; global radio/checkbox/range accent-color; fixed StatusFilter overflow into insights sidebar (`overflow-x-auto` + `min-w-0`); AppToaster Luminous palette; LlmKeysPanel modal click-outside-to-close |
| May 31, 2026 | **#100** | **Luminous redesign** — Stitch tokens, sidebar shell, bento dashboard, `MatchScoreRing`, `DashboardInsights`, login refresh |
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
| Stitch HTML pasted into repo pages | Don't — translate to React + existing data hooks | — |
| **StatusFilter tabs overflow into insights sidebar** | `inline-flex` -> `flex` + `overflow-x-auto` + `max-w-full`; left column gets `min-w-0` | #104 |
| **Old blue bg bleeds on load** | body gradient on `background-image` with `!important`; removed `bg-background` from wrapper divs | #104 |
| **Skeleton shimmer old blue** | `#e7eeff` -> `#dceae8` (green-tinted) | #104 |
| **Browser-default dropdowns** | `select.input`: `appearance-none` + SVG chevron, teal on focus | #104 |
| **Radio/checkbox blue** | Global `accent-color: #006a65` | #104 |
| **Toast non-palette colors** | Border/shadow/radius/font updated to Luminous palette | #104 |
| **Legacy tokens on many pages** | Full migration to M3 across 19 files | #104 |

---

## ⭐ ACTIVE INITIATIVE — Enterprise Multi-Tenant Transformation (Master Plan)

> **This is the current north-star.** JobRadar is moving from a single-user app (personalized for Shashank) to a **public, multi-tenant SaaS** where anyone can sign up, upload a resume, and get the full feature set. We execute this **one phase per chat session** — finish a phase, update this tracker, then start the next phase in a NEW chat. Do not mix phases.

### Progress Tracker (update after every phase)

| Phase | Title | Status |
|---|---|---|
| **0** | Strategic decisions (auth provider, cost model, scope) | ✅ Done |
| **1** | Real authentication & identity (Supabase Auth, replace first-profile pattern) | ✅ Done (session 7) |
| **2** | Data isolation & security (RLS, ownership checks, private resume bucket) | 🟡 Partial — per-user scoping + ownership checks + RLS shipped; **resumes bucket still public (TODO)** |
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

**Not in code yet.** Grounded in `#### OpenAI-primary cost model` + Groq overflow to OpenAI.

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
- ⚠️ **`resumes` storage bucket is still PUBLIC** (PII leak risk for a real public launch) → make private + signed URLs in Phase 2.
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
lib/ingest-runs.ts         ← Ingest run progress/finalize/stale cleanup (Stats + scan lifecycle)
lib/profile-insights.ts    ← Resume-change helpers: strip cached search_profile, refresh preferences.roles
lib/current-user.ts        ← getCurrentProfile(), isCurrentUserAdmin(), orphan purge on re-signup
lib/sources/adzuna.ts      ← Adzuna API (multi-query, pagination, dedup)
lib/sources/index.ts       ← Source dispatcher
lib/pdf-resume.ts          ← Beautiful PDF resume generator (matches Shashank's exact format)
lib/resume.ts              ← Server-only resume parsers (.pdf / .doc / .docx / .txt) — API routes only
lib/resume-upload.ts       ← Client-safe upload helpers (`RESUME_FILE_ACCEPT`, `isResumeFilename`) — use from `'use client'` forms
lib/matcher.ts             ← Cosine similarity + embedding text builder

app/(app)/jobs/[id]/        ← Job detail page + actions + AutoApplyButton
app/(app)/apply-profile/    ← Application profile form (memory store for auto-apply)
app/(app)/_components/      ← AppShell (sidebar), MatchCard, MatchScoreRing, StatusFilter, DashboardInsights, HeaderSearch, RunIngestButton
app/_components/            ← AppToaster, LegalConsentFields, LegalDocumentLayout
tailwind.config.ts          ← Luminous design tokens (Stitch)
app/globals.css             ← .teal-gradient, .btn-*, .card, .input
.stitch/                    ← Stitch reference HTML/PNG (Matches Dashboard Luminous)
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
- **Keep the `AGENTS.md` Index in sync** when you add/rename a `##` section here, and append new dated session logs to `docs/context/session-log.md` (not here).

**Last updated:** May 31, 2026 (session 15: **Luminous Mint polish PR #104** — full token migration across 19 files, mint-green `#f0f7f6` background with organic gradient blobs, custom select/radio/checkbox styling, StatusFilter overflow fix, AppToaster palette fix. Design inspiration: Behance Wallet Dashboard. All pages now use M3 semantic tokens consistently.)

_Session 6 (May 29, 2026): started the **Enterprise Multi-Tenant Transformation** initiative — added the Master Plan + Progress Tracker (Phases 0-5). Phase 0 + the Groq migration (PR #48 replaced the dead `gemini-2.0-flash` 429 fallback with Groq; PR #50 flipped Groq to FREE PRIMARY with OpenAI fallback + `LLM_PRIMARY` toggle, needs `GROQ_API_KEY`) + the Phase 3 Groq free-tier capacity analysis._

_Session 5 (May 29, 2026): OpenAI text-embedding-3-small migration shipped; matches sort dropdown bug fixed (foreignTable alias) + per-card discovery date stamp; UI UX Pro Max design skill installed for Kiro, Cursor, and Antigravity from the official `uipro-cli`. PRs #25-#28 + #29 all merged._

---

## Session Logs — archived

Detailed dated session logs (Sessions 2–5 and earlier) now live in **`docs/context/session-log.md`** to keep this file lean and cheap to load. Open that archive ONLY for historical "why did we do X" questions (Tier 3 per `AGENTS.md`). When logging a new session, append it to the archive and keep only a short pointer here.
