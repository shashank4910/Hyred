# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary:** Job seekers — especially in India — who want fewer irrelevant applications and faster, higher-quality matches.

**Situation:** They upload a resume once, set search preferences (roles, locations, remote), and return to a dashboard of AI-scored jobs instead of scrolling generic job boards.

**Secondary audiences (confirmed in product):**
- Admin/owner (ingest sources, keys, usage) — single admin today (Shashank)
- Recruiters are **not** a target user; this is candidate-side tooling

## Product Purpose

**Hyred** (hyred.in) is a multi-user AI job-search dashboard. It ingests jobs from multiple sources, scores each job against the user's resume (0–100), surfaces the best matches, and helps the user apply with tailored ATS resumes, cover letters, skill-match analysis, and a Chrome extension for autofill on ATS sites (Workday, etc.).

**Success looks like:** Users find relevant roles faster, apply with stronger materials, and spend less time on low-fit applications.

## Positioning

Unlike a generic job board, Hyred **scores every job against your actual resume**, runs a full AI pipeline (JD fetch, skill match, keyword optimization), and connects dashboard → tailored resume → browser autofill in one product. Free ATS checker and SEO tools drive acquisition; premium tiers gate Match Intelligence, Interview Prep, and Resume Studio Pro.

## Operating Context

- **Live product:** [hyred.in](https://hyred.in) on Vercel; Supabase (Postgres + Auth + Storage)
- **Repo:** `JobRadar` (folder name); brand is **Hyred**
- **Multi-user:** Per-user profiles via Supabase Auth (email/password + Google OAuth); all data scoped by `profile_id`
- **Job ingest:** Cron every ~6h from Adzuna, Remotive, RemoteOK, HackerNews, Arbeitnow, plus paid APIs (JobsPipe, JobDataLake, JSearch) when configured
- **Chrome extension:** Auto-login from hyred.in session; Workday autofill (Tier A) + custom forms beta (Tier B)
- **Auto-apply agent:** Python browser-use on Render — available but gated/secondary; not primary launch path

## Capabilities and Constraints

**Core (shipped):**
- Dashboard with match list, filters (score, city, remote, freshness), status workflow (Inbox → Saved)
- Job detail: skill match, tailored ATS resume PDF, cover letter, outreach messages, referral radar
- Onboarding: resume upload (PDF/DOC/DOCX/TXT) → AI parse → profile seed
- ATS Resume Checker (logged-in + public free tool); Fix Studio (premium credits)
- Top MNC filter, manual job import, dream company alerts, apply profile for autofill
- Premium Tier 1 entitlements (quotas in `lib/premium.ts`); Stripe checkout **not wired yet**

**Technical constraints:**
- Free infra preferred beyond API keys (owner constraint)
- LLM: OpenRouter primary (prepaid credit) with OpenAI paid fallback; embeddings via OpenRouter (`text-embedding-3-small`)
- Client bundles must not import server-only resume parser (`lib/resume.ts` → use `lib/resume-upload.ts` on client)
- Private GitHub repo; deployment via PR → merge → Vercel

**Terminology:** "Match" = scored job for current user; "Run Scan" = trigger ingest; "Luminous" = internal codename for current UI generation (Stitch, May 2026)

**Undecided / open:**
- Stripe pricing and checkout UX
- Tier 2 features (Smart Scan Plus, Autofill Pro)
- Multi-user auto-apply queue at scale

## Brand Commitments

- **Name:** Hyred (not JobRadar in user-facing copy)
- **Domain:** hyred.in
- **Voice:** Plain, helpful English — short sentences; explain what happened before jargon (internal content rule)
- **Trust:** Do not fabricate testimonials, customer logos, benchmarks, or pricing on marketing surfaces

## Evidence on Hand

| Asset | Location / notes |
|---|---|
| Product & architecture docs | `CONTEXT.md`, `AGENTS.md`, `docs/context/session-log.md` |
| Feature roadmap | `docs/features-jun26-to-be-built.md` |
| UI token source | `tailwind.config.ts`, `app/globals.css` (Luminous teal system) |
| Stitch design reference | Documented in `CONTEXT.md` → Stitch design source |
| Live production | hyred.in |

**Do not fabricate:** Customer case studies, press quotes, paid-tier pricing, or deployment stats not in repo.

## Product Principles

1. **Resume-grounded relevance** — Scores and suggestions must trace to the user's real resume and JD, not generic templates.
2. **One profile, many surfaces** — Dashboard, extension autofill, and apply profile share the same structured user data.
3. **Ship via evidence** — Debug from logs and repro steps; avoid guess-and-check on AI or ingest.
4. **Free tier honest** — Free tools and quotas are real; premium gates are explicit, not dark patterns.
5. **Multi-user by default** — Every query and mutation scoped to the authenticated profile.

## Accessibility & Inclusion

- Target standard web accessibility for forms, contrast, and keyboard use on product UI
- No product-specific WCAG certification claimed
- Job content and third-party ATS sites are outside Hyred's control
