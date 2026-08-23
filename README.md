# JobRadar

AI-curated job matches from across the web. Pulls jobs from public job APIs, scores them against your resume with OpenRouter (prepaid credit) — falling back to OpenAI — and gives you a curated dashboard plus a tailored cover letter on demand.

- **Stack**: Next.js 15 (App Router) + TypeScript + Tailwind, Supabase (Postgres), OpenRouter chat (prepaid credit) + OpenAI gpt-4o-mini (paid last resort) & `text-embedding-3-small` via OpenRouter (embeddings), GitHub Actions cron, Vercel hosting.
- **Cost**: ₹0/month using free tiers.

## Features

- 🔒 Password-protected single-user app with signed-cookie auth
- 📄 Resume upload — drop a `.pdf` or `.docx`, we parse and embed it
- 🧠 LLM-extracted resume insights (years, seniority, top skills, suggested target roles)
- 🎯 Skill-match visualization on every job — what matches, what's missing
- ✍️ One-click tailored cover letter (editable, copy, download as `.txt`)
- 📊 Stats page with ingest run history and source coverage
- 🔍 Search + filter dashboard by status, source, score, remote
- 🚫 Company blacklist — never see jobs from companies you don't want
- 📝 Notes per job — recruiter contact, interview prep, follow-ups
- 🌓 Polished dark UI with skeletons, toasts, mobile-responsive
- 🔗 **URL importer** — paste any LinkedIn/Naukri/anywhere URL → AI scores it
- 🧩 **Browser extension** (`extension/`) — autofill any application form, inject cover letter, AI-answer screening questions

## How it works

```
GitHub Actions (every 6h) -> npm run ingest:
  fetch jobs (Remotive, RemoteOK, HN Who-is-hiring, Arbeitnow)
    -> upsert into Postgres (dedup by source+source_id)
    -> embed any new jobs (OpenAI text-embedding-3-small, 1536 dims)
    -> rank by cosine similarity vs your resume embedding
    -> top 25 -> gpt-4o-mini scores 0-100 with a reason
    -> persist matches with score >= min_score (default 70)
    -> log run to ingest_runs

Web app (Next.js on Vercel):
  Dashboard with stats hero, search, filters, status tabs.
  Click match -> skill-match analysis, cover letter, notes, status tracking.
```

## One-time setup

### 1. Run Supabase migrations
- Supabase Dashboard -> SQL Editor -> New query.
- Run `supabase/migrations/0001_init.sql`.
- Run `supabase/migrations/0002_production.sql`.

### 2. Get an OpenRouter API key (chat + embeddings)
- https://openrouter.ai/settings/keys -> Create key. Add ~$10 prepaid credit; all models bill from it.

### 3. Local env
```bash
cp .env.example .env.local
# fill all values. AUTH_SECRET: openssl rand -hex 32
```

### 4. Install + run
```bash
npm install
npm run dev
# open http://localhost:3000 -> sign in with APP_PASSWORD
# go to /onboarding -> upload resume -> Save
# go to / -> click "Run scan"
```

### 5. Deploy on Vercel
- Push this repo to GitHub.
- Import into Vercel.
- Add the same env vars to **Vercel -> Project -> Settings -> Environment Variables**.
- Deploy.

### 6. Schedule the cron
- GitHub repo -> Settings -> Secrets and variables -> Actions.
- Add: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY` (required; `OPENAI_API_KEY` is the paid last resort) and `INGEST_PROFILE_EMAIL`.
- Auto-runs every 6 hours; manual trigger available in **Actions** tab.

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run ingest` — run the ingest pipeline locally (uses `.env.local`)
- `npm run typecheck` — strict TS check

## Adding a job source

Drop a new file in `lib/sources/yourSource.ts` exporting `async function fetchYourSource(): Promise<RawJob[]>`. Register it in `lib/sources/index.ts`. Done.

## Roadmap

- [ ] Adzuna source for India coverage (free tier)
- [ ] Wellfound + YC Work-at-a-Startup
- [ ] Paste-a-URL: import any LinkedIn / Naukri job by URL
- [ ] Email digest via Resend (free tier)
- [ ] Streaming cover letter generation

## Security

- The Supabase service-role key is used **only server-side** (API routes + cron) and stored as a secret in GitHub Actions and Vercel.
- RLS is enabled. The `anon` key can only read from `jobs` (public data). `profiles`, `matches`, and `ingest_runs` are server-only.
- Routes are gated by middleware: a signed JWT cookie (HS256) verifies the session.
- Login uses a constant-time password compare against `APP_PASSWORD`.
