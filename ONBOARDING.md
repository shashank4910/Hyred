# ONBOARDING.md — Start Here (New Agent)

> **Read this file FIRST.** It gives you everything you need to understand and work on Hyred.
> After reading this, use `AGENTS.md` Index to dive into specific topics.

---

## 1. What is Hyred?

**Hyred** (hyred.in) = AI-powered job search dashboard. Users upload their resume, the app fetches jobs from multiple sources, scores each job against their skills using AI, and helps them apply with tailored resumes, cover letters, and outreach messages.

**Owner:** Shashank (shashank4910 on GitHub, shashank80771@gmail.com)

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS |
| **Backend** | Next.js API routes (app router) |
| **Database** | Supabase (Postgres + Auth + Storage) |
| **AI (chat)** | OpenRouter primary (`LLM_PRIMARY=openrouter`), model: `meta-llama/llama-3.1-8b-instruct` |
| **AI (embeddings)** | OpenAI `text-embedding-3-small` |
| **AI (fallback)** | Groq (free tier, may be exhausted) |
| **Deployment** | Vercel (auto-deploy on push to `main`) |
| **Extension** | Chrome extension in `ext/` folder (auto-apply, Workday autofill) |
| **Auto-apply agent** | Python browser-use agent on Render (`browser_agent/`) |

---

## 3. Setup on New Machine

```bash
# 1. Clone
git clone https://github.com/shashank4910/Hyred
cd Hyred

# 2. Install
npm install

# 3. Copy env file (from backup folder or Vercel dashboard)
# .env.local is NOT on GitHub (contains secrets)
cp /path/to/backup/.env.local .env.local

# 4. Run locally
npm run dev

# 5. Typecheck (ALWAYS before pushing)
npm run typecheck

# 6. Build
npm run build
```

### Required Environment Variables

See `.env.example` for full list. Critical ones:

```
NEXT_PUBLIC_SUPABASE_URL=          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=         # Supabase service role (SECRET)
OPENROUTER_API_KEY=                # Primary LLM provider
OPENAI_API_KEY=                    # Embeddings
LLM_PRIMARY=openrouter             # Which provider to use
AUTH_SECRET=                       # NextAuth secret
NEXT_PUBLIC_APP_URL=https://hyred.in
```

---

## 4. CRITICAL RULES (Never Violate)

1. **LLM Provider:** OpenRouter primary. **NEVER reintroduce `gemini-2.0-flash`** (deprecated → 429 errors).
2. **Multi-user:** Always use `getCurrentProfile()` from `lib/current-user.ts` to resolve the user. Scope every query by `profile_id`. Never use the old "first profile" pattern.
3. **Typecheck before push:** Run `npm run typecheck`. Must be clean.
4. **Git workflow:** New branch → PR → merge when CI is green. Never leave PRs open.
5. **Auto-commit + push:** Committing is part of every task. Never ask "should I commit?".
6. **Free infra only:** No paid services without asking the owner.
7. **Evidence-based debugging:** Read logs first. Don't guess.
8. **Git email:** Always use `shashank80771@gmail.com` (NOT `shashank@hyred.in`).
9. **Explain simply:** Use everyday words and relatable examples when explaining to the user.

---

## 5. File Map (Where Things Live)

### Core App
```
app/(app)/                          # Main app pages (dashboard, settings, etc.)
app/(app)/jobs/[id]/                # Job detail page (skill match, tailored resume, etc.)
app/(app)/jobs/[id]/JobActions.tsx  # Job action buttons (tailor, cover letter, etc.)
app/(app)/jobs/[id]/ReadyToApply.tsx # Fit check + keyword chips
app/(app)/jobs/[id]/page.tsx        # Job detail page (server component)
app/(app)/_components/MatchFilters.tsx # Dashboard filters (city, score, freshness)
app/(app)/apply-profile/            # Apply profile form (autofill source)
app/(app)/admin/                    # Admin panels (LLM keys, job API usage)
app/(app)/dream-alerts/             # Dream company job alerts
app/(app)/onboarding/               # Resume upload + first profile
app/free-tools/ats-score-checker/   # Free ATS checker (public, no login)
app/api/                            # API routes
app/api/match/[id]/studio/route.ts  # Match Studio analysis endpoint
app/api/match/[id]/outreach/        # Outreach/referral messages
app/api/coverletter/route.ts        # Cover letter generation
app/api/ats-fix/                    # ATS Fix Studio
app/api/profile/parse/              # Resume parser
app/api/import-job/                 # Manual job URL import
```

### Libraries
```
lib/gemini.ts                       # AI chat, scoring, skill matching, outreach
lib/match-studio.ts                 # Match Studio: extraction, grading, caching
lib/jd-fetcher.ts                   # JD HTML fetching + sanitization
lib/resume-upload.ts                # Resume upload handling
lib/current-user.ts                 # getCurrentProfile() — ALWAYS use this
lib/llm-keys.ts                     # LLM key pool, rotation, daily quotas
lib/llm-key-runtime.ts              # RPM cooldown (in-memory, Vercel-safe)
lib/llm-concurrency.ts              # withLlmChatSlot — serializes LLM calls
lib/ingest.ts                       # Job ingest pipeline
lib/search-profile.ts               # User search profile
lib/top-companies.ts                # Top MNC companies
lib/match-skill-enrich.ts           # Skill enrichment for matches
lib/match-location-filter.ts        # City/location filtering
lib/match-stats.ts                  # Dashboard stats (RPC + fallback)
lib/ats-evidence-engine.ts          # ATS resume checker engine
lib/resume-document.ts              # Resume document handling
lib/premium.ts                      # Premium tier logic
lib/profile-insights.ts             # Profile insights (skills, experience)
lib/job-listing-time.ts             # Job freshness/sorting
lib/job-country-codes.ts            # Country code mapping
lib/data/job-location-dictionary.ts # Location dictionary
```

### Extensions
```
ext/                                # Chrome extension (auto-apply, Workday autofill)
ext/manifest.json                   # Extension manifest
ext/content.js                      # Content script
ext/popup.html                      # Popup UI
```

### Database
```
supabase/migrations/                # 27 SQL migrations (all on GitHub)
```

### Docs
```
CONTEXT.md                          # Full knowledge base (read by section via Index)
AGENTS.md                           # Router + index + rules
docs/context/session-log.md         # Session history (newest first)
docs/AUTH_SETUP.md                  # Auth/go-live runbook
docs/features-jun26-to-be-built.md  # Feature roadmap
```

---

## 6. Current State (August 2026)

### What's Working
- ✅ Dashboard with job matching, scoring, filtering (city, score, freshness)
- ✅ Job detail page with skill match, tailored resume, cover letter
- ✅ ATS Resume Checker (free tool + engine + scan report)
- ✅ ATS Fix Studio (suggest / apply / paywall)
- ✅ Ready-to-Apply fit check with keyword chips
- ✅ Dream Company Job Alerts
- ✅ Premium Tier 1 (Match Intelligence, Interview Prep, Resume Studio Pro)
- ✅ Chrome extension (auto-apply, Workday autofill)
- ✅ Auto-apply agent (Render, Python browser-use)
- ✅ Public SEO pages + free tools
- ✅ 594+ files on GitHub, all synced

### Known Issues
- ⚠️ **Studio timeout:** `/studio` route sometimes times out (60s limit, 3 sequential LLM phases). Fix in progress (PR #385 raised limit to 120s, added per-user caching).
- ⚠️ **8B model + large prompts:** Grading call sends 9k chars to 8B model, can take 30-50s.
- ⚠️ **Extension popup timing:** Sometimes shows on wrong pages (being fixed).
- ⚠️ **Vercel Deployment Protection:** Must be turned off in dashboard for public access.

### Active Initiatives
1. **Studio timeout fix** — PR #385 merged (120s limit + smaller grade prompt + caching)
2. **AI Auto-Apply** — Browser agent on Render, Workday autofill working
3. **Enterprise Multi-Tenant** — Phase 1 (auth) complete, Phase 2+ planning

---

## 7. Architecture Quick Reference

### AI Pipeline Flow
```
User uploads resume → Profile created → Jobs ingested (GitHub Actions cron)
→ Each job scored against profile (4-phase skill match) → Dashboard shows matches
→ User clicks job → Full analysis (extraction + grading) → Tailored resume, cover letter
```

### LLM Call Chain
```
chat() in lib/gemini.ts
  → withLlmChatSlot() (lib/llm-concurrency.ts) — serializes calls
    → acquire_llm_chat_slot() (lib/llm-key-runtime.ts) — RPM cooldown
      → Provider: OpenRouter → model: meta-llama/llama-3.1-8b-instruct
```

### Key Data Flow
```
Jobs → supabase (jobs table) → ingest pipeline → scoreJob() → matches table
User → getCurrentProfile() → profile_id → scoped queries everywhere
Resume → parse → insights (top_skills, experience) → match scoring
```

---

## 8. Known Pitfalls (Learned the Hard Way)

### AI/LLM
- **NEVER use `gemini-2.0-flash`** — deprecated, returns 429. OpenRouter is primary.
- **LLM calls are serialized** — `withLlmChatSlot` ensures one call at a time per user. Don't bypass.
- **8B model struggles with large prompts** — Keep prompts under 8k chars. Grading prompt was 9k, causing timeouts.
- **Cerebras model deprecation** — Some models get deprecated. Check provider status.

### Database
- **Use RPCs for counts** — Direct COUNT queries are slow. Use `match_stats_rpc` with fallback.
- **`posted_at` hide logic** — Jobs without `posted_at` are hidden by default. Use `expired=1` filter.
- **FK constraints on delete** — Migrations 0006/0008 handle cascade deletes for user removal.

### Resume/Parsing
- **`.doc` vs `.docx`** — Only `.docx` supported. `.doc` causes parse failures.
- **HTML in JD** — Some sources store HTML fragments. Use `stripHtml()` before rendering.
- **AI slop in prompts** — Never add generic AI language to prompts. Be specific.

### Multi-user
- **Always use `getCurrentProfile()`** — Never use "first profile" pattern.
- **Scope by `profile_id`** — Every user-data query must be scoped.
- **Owner PII** — Never put owner's personal info in prompts or forms.

### Frontend
- **Back-nav skeleton** — Use `staleTimes` to prevent skeleton flash on back navigation.
- **Hydration mismatch** — SSR and client state must match. Use `suppressHydrationWarning` sparingly.
- **Extension popup** — Only show on job application forms, not every page.

---

## 9. Useful Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run typecheck    # TypeScript check (ALWAYS before push)
npm run lint         # ESLint check

# Git
git status           # Check what's changed
git diff             # See changes
git log --oneline -5 # Recent commits

# Vercel
vercel --prod        # Deploy to production
vercel env ls        # List env vars
vercel logs          # Check deployment logs

# Supabase
npx supabase db push # Push migrations
npx supabase status  # Check local DB status
```

---

## 10. Contacts & Accounts

| Service | Account | Notes |
|---------|---------|-------|
| GitHub | `shashank4910` | Email: `shashank80771@gmail.com` |
| Vercel | `shashank4910` | Project: `job-radar` |
| Supabase | (check dashboard) | Project URL in `.env.local` |
| OpenRouter | `shashank.srmncr@gmail.com` | Primary LLM provider |
| OpenAI | (check dashboard) | Embeddings only |
| Render | (check dashboard) | Auto-apply agent |

---

## 11. Session History

For detailed session-by-session history, read `docs/context/session-log.md` (newest first).

Key sessions:
- **Sessions 46-47:** Ready-to-Apply engine, keyword chip tiers, unified extraction
- **Session 48:** JD truncation + keyword judgment lessons
- **Session 49:** OpenRouter-only chat consolidation
- **Session 50:** Studio timeout fix (120s + caching)

---

*Last updated: August 25, 2026*
* Maintained by: Buffy (Codebuff agent) + Shashank*
